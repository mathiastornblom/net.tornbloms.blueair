import type { Log } from 'homey-log';

// ── Debug gate ────────────────────────────────────────────────────────────────
// Add "DEBUG_BLUEAIR": "1" to env.json to enable verbose logging locally.
// Never set this to 1 in production — it is stripped from the published build.
const DEBUG = process.env['DEBUG_BLUEAIR'] === '1';

// ── Sentry singleton ──────────────────────────────────────────────────────────
// Set once from BlueAirApp.onInit(); null until that point.
let _homeyLog: InstanceType<typeof Log> | null = null;

/** Called once from app.ts after homey-log is constructed. */
export function initSentryLog(log: InstanceType<typeof Log>): void {
  _homeyLog = log;
}

function reportToSentry(err: Error, context?: Record<string, unknown>): void {
  _homeyLog?.captureException(err, context);
}

// ── Logger ────────────────────────────────────────────────────────────────────

type LogFn = (...args: unknown[]) => void;

/**
 * Levelled diagnostic logger for drivers and devices.
 *
 * | Level    | Output          | Sentry |
 * |----------|-----------------|--------|
 * | debug    | local only*     | no     |
 * | info     | local only      | no     |
 * | warn     | local only      | no     |
 * | error    | local only      | no     |
 * | critical | local + Sentry  | YES    |
 *
 * *debug requires DEBUG_BLUEAIR=1 in env.json
 *
 * Rule of thumb: only call `critical()` for failures a developer needs to
 * investigate — things that should never happen in a healthy installation
 * (e.g. the device can't initialise at all). Transient API errors, poll
 * failures, and re-auth attempts belong at warn/error.
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

  /** Verbose tracing — only emitted when DEBUG_BLUEAIR=1 */
  debug(...args: unknown[]): void {
    if (DEBUG) this.logFn(`[DBG:${this.tag}]`, ...args);
  }

  /** Normal lifecycle events */
  info(...args: unknown[]): void {
    this.logFn(`[${this.tag}]`, ...args);
  }

  /** Recoverable issues worth noting */
  warn(...args: unknown[]): void {
    this.logFn(`[WARN:${this.tag}]`, ...args);
  }

  /** Unexpected failures that stay local */
  error(...args: unknown[]): void {
    this.errorFn(`[ERR:${this.tag}]`, ...args);
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
    reportToSentry(wrapped, { tag: this.tag, message, ...context });
  }
}
