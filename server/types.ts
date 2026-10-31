/** Minimal key-value storage (private blobs in production). */
export interface Store {
  get(path: string): Promise<string | null>;
  put(path: string, body: string): Promise<void>;
}

export type Deps = {
  secret: string;
  store: Store;
  now: () => number;
  /** false (SIGNUP_DISABLED=1) closes registration; existing accounts keep working. */
  signupOpen: boolean;
  /** Temporary owner key (ADMIN_RESET_KEY). Unset = the admin endpoint does not exist. */
  adminKey?: string;
  /** Milliseconds to wait before answering a failed login (slows guessing). */
  failDelayMs?: () => number;
};
