export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

type Sink = { log(line: string): void; error(line: string): void };

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function safeStringify(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta, (_key, value: unknown) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    });
  } catch {
    return '[unserializable meta]';
  }
}

export function createConsoleLogger(level: LogLevel, sink: Sink = console): Logger {
  const write = (
    messageLevel: Exclude<LogLevel, 'silent'>,
    message: string,
    meta?: Record<string, unknown>,
  ): void => {
    if (ORDER[messageLevel] < ORDER[level]) return;
    const hasMeta = meta !== undefined && Object.keys(meta).length > 0;
    const line = hasMeta
      ? `[${messageLevel}] ${message} ${safeStringify(meta)}`
      : `[${messageLevel}] ${message}`;
    if (messageLevel === 'warn' || messageLevel === 'error') {
      sink.error(line);
    } else {
      sink.log(line);
    }
  };
  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
