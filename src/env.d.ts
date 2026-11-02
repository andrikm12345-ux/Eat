/** Injected at build time (package version + short build date). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Sentry project key for crash reports; absent = reporting is off. */
  readonly VITE_SENTRY_DSN?: string;
}
