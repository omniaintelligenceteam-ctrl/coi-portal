/**
 * Structured logger. Emits JSON lines to stdout/stderr so Vercel log drains
 * and any future APM (Sentry, Datadog, etc.) can parse events without regex.
 *
 * Usage:
 *   log.info('cert.submitted', { certNumber, clientId, durationMs: 120 });
 *   log.error('pdf.render.failed', { certNumber, error: err.message });
 */

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = {
  event: string;
  certNumber?: string;
  requestId?: string;
  clientId?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...fields,
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (event: string, fields: Omit<LogFields, 'event'> = {}) =>
    emit('info', { event, ...fields }),
  warn: (event: string, fields: Omit<LogFields, 'event'> = {}) =>
    emit('warn', { event, ...fields }),
  error: (event: string, fields: Omit<LogFields, 'event'> = {}) =>
    emit('error', { event, ...fields }),
};
