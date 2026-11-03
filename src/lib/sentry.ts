/**
 * Observability. Initialise once at app start (App.tsx). No-ops cleanly when no DSN
 * is configured (e.g. local dev). Routes logger output into Sentry as
 * breadcrumbs (debug/info/warn) and captured messages (error).
 */
import * as Sentry from '@sentry/react-native';
import { env } from './env';
import { logger, setLogSink } from './logger';

export function initObservability(): void {
  if (!env.sentryDsn) {
    logger.info('Observability: Sentry disabled (no DSN configured)');
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.appVariant,
    tracesSampleRate: env.appVariant === 'production' ? 0.2 : 1.0,
    // Avoid leaking sensitive journal content into breadcrumbs by default.
    sendDefaultPii: false,
  });

  setLogSink((level, message, context) => {
    if (level === 'error') {
      Sentry.captureMessage(message, { level: 'error', extra: context });
    } else {
      Sentry.addBreadcrumb({
        level: level === 'warn' ? 'warning' : level,
        message,
        data: context,
      });
    }
  });
}

export { Sentry };
