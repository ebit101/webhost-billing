import { AsyncLocalStorage } from 'node:async_hooks';

export interface StructuredLogContext {
  requestId?: string;
  correlationId?: string;
  jobId?: string;
  queueName?: string;
}

export interface StructuredLoggerOptions {
  service: string;
  environment?: string;
  write?: (line: string, level: StructuredLogLevel) => void;
  now?: () => Date;
}

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const logContext = new AsyncLocalStorage<StructuredLogContext>();
const sensitiveKey =
  /(?:password|passphrase|secret|token|api.?key|private.?key|access.?hash|authorization|cookie|signature|credential|raw.?body|request.?body|payload|headers|proof)/i;
const sensitiveText =
  /\b(password|passphrase|secret|token|api[-_ ]?key|cookie|signature|credential)\b(\s*[:=]\s*)([^\s,;]+)/gi;

export function runWithStructuredLogContext<T>(
  context: StructuredLogContext,
  callback: () => T,
): T {
  return logContext.run(context, callback);
}

export function currentStructuredLogContext(): StructuredLogContext {
  return logContext.getStore() ?? {};
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizeLogText(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeLogText(value.message) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redactLogValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, entry]) => [
          key,
          sensitiveKey.test(key)
            ? '[REDACTED]'
            : redactLogValue(entry, depth + 1),
        ]),
    );
  }
  return String(value);
}

export function sanitizeLogText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(
      /\b(authorization)\b(\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(sensitiveText, '$1$2[REDACTED]')
    .slice(0, 2_048);
}

export class StructuredLogger {
  private readonly write: NonNullable<StructuredLoggerOptions['write']>;
  private readonly now: NonNullable<StructuredLoggerOptions['now']>;

  constructor(private readonly options: StructuredLoggerOptions) {
    this.write =
      options.write ??
      ((line, level) => {
        const stream =
          level === 'error' || level === 'fatal'
            ? process.stderr
            : process.stdout;
        stream.write(`${line}\n`);
      });
    this.now = options.now ?? (() => new Date());
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('fatal', message, optionalParams);
  }

  private emit(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const record = logRecord(message);
    const context = optionalParams
      .toReversed()
      .find((entry): entry is string => typeof entry === 'string');
    const redacted = redactLogValue(record.fields) as Record<string, unknown>;
    delete redacted.timestamp;
    delete redacted.level;
    delete redacted.service;
    this.write(
      JSON.stringify({
        timestamp: this.now().toISOString(),
        level,
        service: this.options.service,
        ...(this.options.environment
          ? { environment: this.options.environment }
          : {}),
        event: record.event,
        ...currentStructuredLogContext(),
        ...(context ? { context: sanitizeLogText(context) } : {}),
        ...redacted,
      }),
      level,
    );
  }
}

function logRecord(message: unknown): {
  event: string;
  fields: Record<string, unknown>;
} {
  const value = parseRecord(message);
  if (value) {
    const event =
      typeof value.event === 'string'
        ? sanitizeLogText(value.event).slice(0, 120)
        : 'application_log';
    const fields = { ...value };
    delete fields.event;
    return { event, fields };
  }
  return {
    event: 'application_log',
    fields: { message: redactLogValue(message) },
  };
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
