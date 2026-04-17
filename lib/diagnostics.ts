import type { Log } from 'homey-log';

// ── Debug gate ────────────────────────────────────────────────────────────────
// Add "DEBUG_BLUEAIR": "1" to env.json to enable verbose logging locally.
// Never set this to 1 in production — it is stripped from the published build.
const DEBUG = process.env['DEBUG_BLUEAIR'] === '1';

// ── Sentry singleton ──────────────────────────────────────────────────────────
let _homeyLog: InstanceType<typeof Log> | null = null;

/** Called once from app.ts after homey-log is constructed. */
export function initSentryLog(log: InstanceType<typeof Log>): void {
  _homeyLog = log;
}

function reportToSentry(err: Error, context?: Record<string, unknown>): void {
  _homeyLog?.captureException(err, context);
}

// ── In-memory log buffer ──────────────────────────────────────────────────────

const MAX_BUFFER = 150;

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  tag: string;
  msg: string;
}

const _buffer: LogEntry[] = [];
let _verbose = false;

/** Called from app.ts whenever the verboseLogging setting changes. */
export function setVerboseLogging(enabled: boolean): void {
  _verbose = enabled;
}

export function getVerboseLogging(): boolean {
  return _verbose;
}

export function getLogBuffer(): LogEntry[] {
  return [..._buffer];
}

export function clearLogBuffer(): void {
  _buffer.length = 0;
}

function pushEntry(level: LogEntry['level'], tag: string, args: unknown[]): void {
  const msg = args
    .map(a => (a instanceof Error ? (a.stack ?? a.message) : String(a)))
    .join(' ');
  _buffer.push({ ts: new Date().toISOString(), level, tag, msg });
  if (_buffer.length > MAX_BUFFER) _buffer.shift();
}

// ── Logger ────────────────────────────────────────────────────────────────────

type LogFn = (...args: unknown[]) => void;

/**
 * Levelled diagnostic logger for drivers and devices.
 *
 * | Level    | Buffer          | Local stdout | Sentry |
 * |----------|-----------------|--------------|--------|
 * | debug    | if verbose on   | if DEBUG env | no     |
 * | info     | always          | always       | no     |
 * | warn     | always          | always       | no     |
 * | error    | always          | always       | no     |
 * | critical | always          | always       | YES    |
 *
 * Enable verbose (debug) buffering via the app's Settings page toggle,
 * or set DEBUG_BLUEAIR=1 in env.json for local development.
 */
export class DiagnosticLogger {
  private readonly tag: string;
  private readonly logFn: LogFn;
  private readonly errorFn: LogFn;

  constructor(tag: string, logFn: LogFn, errorFn: LogFn) {
    this.tag = tag;
    this.logFn = logFn;
    this.errorFn = errorFn;
  }

  /** Verbose tracing — buffered only when verbose logging is enabled */
  debug(...args: unknown[]): void {
    if (DEBUG) this.logFn(`[DBG:${this.tag}]`, ...args);
    if (_verbose || DEBUG) pushEntry('debug', this.tag, args);
  }

  /** Normal lifecycle events */
  info(...args: unknown[]): void {
    this.logFn(`[${this.tag}]`, ...args);
    pushEntry('info', this.tag, args);
  }

  /** Recoverable issues worth noting */
  warn(...args: unknown[]): void {
    this.logFn(`[WARN:${this.tag}]`, ...args);
    pushEntry('warn', this.tag, args);
  }

  /** Unexpected failures that stay local */
  error(...args: unknown[]): void {
    this.errorFn(`[ERR:${this.tag}]`, ...args);
    pushEntry('error', this.tag, args);
  }

  /**
   * Failures that require developer attention.
   * Logs locally AND forwards to Sentry via homey-log.
   *
   * Use sparingly — only when something that should never happen does happen.
   */
  critical(message: string, err: unknown, context?: Record<string, unknown>): void {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    this.errorFn(`[CRIT:${this.tag}] ${message}`, wrapped);
    pushEntry('critical', this.tag, [message, wrapped]);
    reportToSentry(wrapped, { tag: this.tag, message, ...context });
  }
}
