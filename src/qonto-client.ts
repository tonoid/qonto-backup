import { log } from "./logger.ts";

export interface QontoClientOptions {
  login: string;
  secretKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface PageMeta {
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  total_pages: number;
  total_count: number;
  per_page: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PageMeta;
  raw: Record<string, unknown>;
}

export class QontoApiError extends Error {
  status: number;
  bodySnippet: string;
  url: string;
  constructor(status: number, bodySnippet: string, url: string) {
    super(`Qonto API ${status} on ${url}: ${bodySnippet.slice(0, 200)}`);
    this.name = "QontoApiError";
    this.status = status;
    this.bodySnippet = bodySnippet;
    this.url = url;
  }
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

export class QontoClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(opts: QontoClientOptions) {
    this.authHeader = `${opts.login}:${opts.secretKey}`;
    this.baseUrl = opts.baseUrl.replace(/\/?$/, "/");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  async getJson<T = unknown>(
    pathname: string,
    query?: Record<string, string | string[] | number | undefined>,
  ): Promise<T> {
    const url = this.buildUrl(pathname, query);
    const response = await this.fetchWithRetry(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new QontoApiError(response.status, text, url);
    }
  }

  async *paginate<T>(
    pathname: string,
    query: Record<string, string | string[] | number | undefined>,
    itemsKey: string,
  ): AsyncGenerator<PaginatedResponse<T>, void, void> {
    let page = 1;
    while (true) {
      const data = await this.getJson<Record<string, unknown>>(pathname, {
        ...query,
        page,
        per_page: query.per_page ?? 100,
      });
      const meta = data["meta"] as PageMeta | undefined;
      const items = (data[itemsKey] ?? []) as T[];
      if (!meta) {
        yield { items, meta: synthMeta(items.length, page), raw: data };
        return;
      }
      yield { items, meta, raw: data };
      if (!meta.next_page || meta.next_page <= page) return;
      page = meta.next_page;
    }
  }

  private buildUrl(
    pathname: string,
    query?: Record<string, string | string[] | number | undefined>,
  ): string {
    const url = new URL(pathname.replace(/^\//, ""), this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, init);
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        const delay = this.backoff(attempt);
        log.warn("qonto.network_error", { url, attempt, delay_ms: delay, err: String(err) });
        await sleep(delay);
        attempt += 1;
        continue;
      }

      if (response.status === 401) {
        const body = await safeText(response);
        throw new QontoApiError(401, body, url);
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= this.maxRetries) {
          const body = await safeText(response);
          throw new QontoApiError(response.status, body, url);
        }
        const delay = this.backoff(attempt);
        log.warn("qonto.retry", { url, status: response.status, attempt, delay_ms: delay });
        await sleep(delay);
        attempt += 1;
        continue;
      }

      if (!response.ok) {
        const body = await safeText(response);
        throw new QontoApiError(response.status, body, url);
      }

      return response;
    }
  }

  private backoff(attempt: number): number {
    return Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** attempt);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function synthMeta(count: number, page: number): PageMeta {
  return {
    current_page: page,
    next_page: null,
    prev_page: page > 1 ? page - 1 : null,
    total_pages: page,
    total_count: count,
    per_page: count,
  };
}
