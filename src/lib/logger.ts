/**
 * Structured logger. In dev it prints to console; in prod it forwards to a sink
 * (wired to Sentry breadcrumbs/messages in sentry.ts) without creating an import
 * cycle. Always log objects, not string-concatenated context.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: LogLevel = typeof __DEV__ !== 'undefined' && __DEV__ ? 'debug' : 'info';

type Sink = (level: LogLevel, message: string, context?: LogContext) => void;
let sink: Sink | null = null;

/** Called by initObservability() to forward logs to Sentry. */
export function setLogSink(next: Sink | null): void {
  sink = next;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const fn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${level}] ${message}`, context ?? '');
  try {
    sink?.(level, message, context);
  } catch {
    // never let logging throw
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
