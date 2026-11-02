/** Minimal key-value storage (private blobs in production). */
export interface Store {
  get(path: string): Promise<string | null>;
  put(path: string, body: string): Promise<void>;
  /** Paths that start with `prefix` (optional: only the admin view needs it). */
  list?(prefix: string): Promise<string[]>;
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
