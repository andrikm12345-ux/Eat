/** Minimal key-value storage (private blobs in production). */
export interface Store {
  get(path: string): Promise<string | null>;
  put(path: string, body: string): Promise<void>;
  /** Paths that start with `prefix` (optional: only the admin view needs it). */
  list?(prefix: string): Promise<string[]>;
  /** Deletes every file whose path starts with `prefix` (only the admin clean-up needs it). */
  remove?(prefix: string): Promise<number>;
}

export type Deps = {
  secret: string;
  store: Store;
  now: () => number;
  /** false (SIGNUP_DISABLED=1) closes registration; existing accounts keep working. */
  signupOpen: boolean;
  /** Milliseconds to wait before answering a failed login (slows guessing). */
  failDelayMs?: () => number;
  /** Shared AI (server-side key). Absent = the feature is off. */
  ai?: SharedAiEnv;
  /** Web search for the AI (server-side key). Absent = the feature is off. */
  search?: { apiKey: string; dailyLimit: number };
  /** Logins of administrators (they edit the shared AI settings). */
  adminLogins?: string[];
  /** Logins of people who used the app before a storage move (KNOWN_LOGINS): the administrator sees who has not come back yet. */
  knownLogins?: string[];
  /** Personal button texts set by the administrator: login → { key: text } (USER_LABELS). */
  userLabels?: Record<string, Record<string, string>>;
  /**
   * After the storage was replaced, an account that is missing there is recreated (without a
   * password) from a valid signed token until this moment (ms). Absent = never.
   */
  restoreUntil?: number;
  /** For tests: replaces fetch when calling the AI service. */
  fetchImpl?: typeof fetch;
};

export type SharedAiEnv = {
  /** Never leaves the server. */
  apiKey?: string;
  baseUrl: string;
  modelText: string;
  modelVision: string;
  /** Requests per user per day (administrators are not limited). */
  dailyLimit: number;
};
