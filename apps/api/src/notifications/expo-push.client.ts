import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
}

export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

const DEFAULT_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
const BATCH = 100;

/**
 * Thin client for Expo's push API. Returns one ticket per message, in order,
 * so the caller can drop tokens Expo reports as `DeviceNotRegistered`.
 * `EXPO_PUSH_URL` exists so tests can point it at a local capture server.
 */
@Injectable()
export class ExpoPushClient {
  private readonly logger = new Logger(ExpoPushClient.name);
  private readonly url: string;
  private readonly accessToken: string | undefined;
  private readonly retryBaseMs: number;

  constructor(config: ConfigService) {
    this.url = config.get<string>('EXPO_PUSH_URL') || DEFAULT_URL;
    this.accessToken = config.get<string>('EXPO_ACCESS_TOKEN') || undefined;
    this.retryBaseMs = Number(config.get<string>('EXPO_PUSH_RETRY_BASE_MS')) || 1000;
  }

  async send(messages: ExpoPushMessage[]): Promise<ExpoTicket[]> {
    const tickets: ExpoTicket[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const response = await this.post(batch);
      if (!response?.ok) {
        this.logger.warn(`Expo push request failed (${response ? `HTTP ${response.status}` : 'network'}) after retries`);
        tickets.push(...batch.map((): ExpoTicket => ({ status: 'error', message: response ? `HTTP ${response.status}` : 'network' })));
        continue;
      }
      const { data } = (await response.json()) as { data: ExpoTicket[] };
      tickets.push(...data);
    }
    return tickets;
  }

  /**
   * The ready push is claimed before sending (never twice), so a throttled or
   * briefly failing Expo must be retried here — otherwise "never twice" quietly
   * becomes "sometimes never". 429 / 5xx / network: up to 3 tries, 1s then 4s apart.
   */
  private async post(batch: ExpoPushMessage[]): Promise<Response | null> {
    let last: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryBaseMs * 4 ** (attempt - 1)));
      try {
        last = await fetch(this.url, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
        });
        if (last.ok || (last.status < 500 && last.status !== 429)) return last;
      } catch {
        last = null;
      }
    }
    return last;
  }
}
