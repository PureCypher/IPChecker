import { config } from './env.js';

let sentryInitialized = false;
let SentryModule: typeof import('@sentry/node') | null = null;

/**
 * Initialize Sentry error tracking.
 *
 * Only initializes if `config.sentryDsn` is a non-empty string.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initSentry(): Promise<void> {
  if (sentryInitialized) return;
  if (!config.sentryDsn) return;

  try {
    SentryModule = await import('@sentry/node');

    SentryModule.init({
      dsn: config.sentryDsn,
      environment: config.sentryEnvironment,
      release: `ipintel-backend@${config.appVersion}`,
      tracesSampleRate: 0.1,
    });

    sentryInitialized = true;
  } catch (err) {
    // If @sentry/node is not installed or fails, silently degrade
    console.warn('[sentry] Failed to initialise Sentry:', err);
    SentryModule = null;
  }
}

/**
 * Capture an exception to Sentry.
 *
 * No-op when Sentry is not configured or failed to initialise.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!SentryModule) return;

  if (context) {
    SentryModule.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      SentryModule!.captureException(error);
    });
  } else {
    SentryModule.captureException(error);
  }
}

/**
 * Add a breadcrumb to the current Sentry scope.
 *
 * No-op when Sentry is not configured.
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
}): void {
  if (!SentryModule) return;
  SentryModule.addBreadcrumb(breadcrumb);
}
