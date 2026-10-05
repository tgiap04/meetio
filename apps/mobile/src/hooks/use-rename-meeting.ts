import { useState } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { MeetingDetailResponse } from '@meetio/shared';
import { updateMeeting } from '../api/meetings';
import { MEETINGS_QUERY_KEY } from './use-meetings-query';
import { meetingQueryKey } from './use-meeting-detail-query';

export const RENAME_ERROR_MESSAGE = 'Không đổi được tên — kiểm tra kết nối rồi thử lại.';

export interface RenameVariables {
  id: string;
  /** Already trimmed; '' asks the server for its default title. */
  title: string;
}

type Row = { id: string; title: string };
type Snapshot = {
  lists: [readonly unknown[], unknown][];
  detail: MeetingDetailResponse | undefined;
};

function isRows(value: unknown): value is Row[] {
  return Array.isArray(value);
}

/**
 * Maps a meeting's title inside a cached list value. The `['meetings', ...]`
 * prefix holds several shapes: infinite pages (`{pages}`), a plain response
 * (`{items}`, e.g. Home's recent list) and bare arrays. Only the first two are
 * rewritten; anything else is returned untouched.
 */
function withListTitle(cache: unknown, id: string, title: string): unknown {
  const rename = (rows: Row[]) => rows.map((row) => (row.id === id ? { ...row, title } : row));
  const data = cache as { pages?: unknown; items?: unknown } | null | undefined;
  if (data && Array.isArray(data.pages)) {
    return {
      ...data,
      pages: data.pages.map((page: { items?: unknown }) =>
        page && isRows(page.items) ? { ...page, items: rename(page.items) } : page,
      ),
    };
  }
  if (data && !Array.isArray(data) && isRows(data.items)) {
    return { ...data, items: rename(data.items) };
  }
  return cache;
}

/** The title a meeting has in a cached list value, if it appears there. */
function findListTitle(cache: unknown, id: string): string | undefined {
  const data = cache as { pages?: { items?: unknown }[]; items?: unknown } | null | undefined;
  const rowSets: unknown[] = Array.isArray(data?.pages) ? data.pages.map((page) => page?.items) : [data?.items];
  for (const rows of rowSets) {
    const row = isRows(rows) ? rows.find((candidate) => candidate?.id === id) : undefined;
    if (row) {
      return row.title;
    }
  }
  return undefined;
}

function applyOptimistic(queryClient: QueryClient, { id, title }: RenameVariables): Snapshot {
  const lists = queryClient.getQueriesData<unknown>({ queryKey: MEETINGS_QUERY_KEY });
  const detail = queryClient.getQueryData<MeetingDetailResponse>(meetingQueryKey(id));
  // A blank title becomes a server-generated default we cannot predict, so the
  // old title stays on screen until the post-save refetch brings the real one.
  if (title !== '') {
    for (const [key] of lists) {
      queryClient.setQueryData<unknown>(key, (old: unknown) => withListTitle(old, id, title));
    }
    if (detail) {
      queryClient.setQueryData<MeetingDetailResponse>(meetingQueryKey(id), { ...detail, title });
    }
  }
  return { lists, detail };
}

/**
 * PATCH the title with an optimistic update of every cached meetings list and
 * the detail cache. Callers use `mutate` (never `mutateAsync`) so a failure
 * rolls back and surfaces through `isError` instead of an unhandled rejection.
 */
export function useRenameMeeting() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, RenameVariables, Snapshot>({
    mutationFn: ({ id, title }) => updateMeeting(id, { title }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: MEETINGS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: meetingQueryKey(variables.id) });
      return applyOptimistic(queryClient, variables);
    },
    onError: (_error, variables, snapshot) => {
      if (!snapshot) {
        return;
      }
      // Revert only this meeting's title, so an overlapping optimistic write
      // for another meeting (or a fresher refetch) is not clobbered.
      for (const [key, data] of snapshot.lists) {
        const original = findListTitle(data, variables.id);
        if (original !== undefined) {
          queryClient.setQueryData<unknown>(key, (current: unknown) =>
            withListTitle(current, variables.id, original),
          );
        }
      }
      if (snapshot.detail) {
        const originalTitle = snapshot.detail.title;
        queryClient.setQueryData<MeetingDetailResponse | undefined>(meetingQueryKey(variables.id), (current) =>
          current ? { ...current, title: originalTitle } : current,
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: meetingQueryKey(variables.id) });
      queryClient.invalidateQueries({ queryKey: MEETINGS_QUERY_KEY });
    },
  });
}

export interface RenameTarget {
  id: string;
  title: string;
}

/** Dialog state + mutation wiring shared by the Library and meeting-detail screens. */
export function useRenameMeetingDialog() {
  const [target, setTarget] = useState<RenameTarget | null>(null);
  const mutation = useRenameMeeting();

  function open(meeting: RenameTarget) {
    mutation.reset();
    setTarget(meeting);
  }

  function close() {
    mutation.reset();
    setTarget(null);
  }

  function save(title: string) {
    if (!target) {
      return;
    }
    mutation.mutate({ id: target.id, title }, { onSuccess: () => setTarget(null) });
  }

  return {
    open,
    dialogProps: {
      visible: target !== null,
      initialTitle: target?.title ?? '',
      saving: mutation.isPending,
      errorMessage: mutation.isError ? RENAME_ERROR_MESSAGE : null,
      onCancel: close,
      onSave: save,
    },
  };
}
