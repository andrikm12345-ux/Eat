/** Minimal key-value storage used by the sync endpoints (private blobs in production). */
export interface Store {
  get(path: string): Promise<string | null>;
  put(path: string, body: string): Promise<void>;
}

export type Mailer = (to: string, code: string) => Promise<void>;

export type Deps = {
  secret: string;
  store: Store;
  mail: Mailer;
  now: () => number;
  /** Optional comma-separated allowlist (ALLOWED_EMAILS). Empty = anyone. */
  allowed: string[];
  /** Milliseconds to wait before answering a failed verification (slows guessing). */
  failDelayMs?: () => number;
};
