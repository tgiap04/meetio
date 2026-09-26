import type { EntityListResponse } from '@meetio/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { SearchResultSection } from './search-result-section';
import { LoadMoreButton } from './load-more-button';
import { EntityListRow } from '../entities/entity-list-row';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { getErrorMessage } from '../../api/error-messages';

type EntityQuery = UseInfiniteQueryResult<InfiniteData<EntityListResponse>>;

export interface EntitySearchSectionsProps {
  enabled: boolean;
  /** All-type entity search — the unhidden "Node" chip's result group (US-38). */
  entityQuery: EntityQuery;
  /** `type=person` narrowing of the same query text — the "Người" group. */
  personQuery: EntityQuery;
  onEntityPress: (id: string) => void;
}

function renderSection(
  query: EntityQuery,
  title: string,
  loadingLabel: string,
  onEntityPress: (id: string) => void,
) {
  if (query.isPending) {
    return <LoadingState label={loadingLabel} />;
  }
  if (query.isError) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />;
  }
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <SearchResultSection
      footer={query.hasNextPage ? <LoadMoreButton loading={query.isFetchingNextPage} onPress={() => query.fetchNextPage()} /> : null}
      title={`${title} (${items.length})`}
    >
      {items.map((item) => (
        <EntityListRow entity={item} key={item.id} onPress={() => onEntityPress(item.id)} />
      ))}
    </SearchResultSection>
  );
}

/** The Search tab's unhidden "Node" chip result group (US-38,
 *  clarifications.md 2026-09-26): a generic entity-name section plus a
 *  `type=person`-only "Người" section, both driven by the same debounced
 *  query text. */
export function EntitySearchSections({ enabled, entityQuery, personQuery, onEntityPress }: EntitySearchSectionsProps) {
  if (!enabled) {
    return null;
  }
  return (
    <>
      {renderSection(entityQuery, 'Thực thể', 'Đang tìm thực thể…', onEntityPress)}
      {renderSection(personQuery, 'Người', 'Đang tìm người…', onEntityPress)}
    </>
  );
}
