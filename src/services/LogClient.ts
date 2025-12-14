/**
 * Log Client - WebSocket client for streaming logs to the log server
 *
 * Fire-and-forget design - logs are sent without waiting for acknowledgment.
 * Queues messages when disconnected, with a max buffer size.
 */

export interface LogEntry {
  ts: number;
  lvl: 'debug' | 'info' | 'warn' | 'error';
  sys: string;
  msg: string;
  data?: unknown;
}

const MAX_QUEUE_SIZE = 1000;
const RECONNECT_DELAY = 2000;

class LogClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private queue: string[] = [];
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private enabled = false;

  constructor() {
    // Generate session ID with date-first format for chronological sorting
    // Format: YYYYMMDD-HHMMSS-xxxx (e.g., 20251213-143052-a7f2)
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const rand = Math.random().toString(36).slice(2, 6);
    this.sessionId = `${date}-${time}-${rand}`;

    // Use proxied path through webpack dev server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/logs`;
  }

  connect(): void {
    // Check if enabled in localStorage
    this.enabled = localStorage.getItem('enableRemoteLogging') === 'true';
    if (!this.enabled) return;
    if (this.ws) return;

    console.log('[LogClient] Connecting to', this.url);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        console.log('[LogClient] Connected');
        this.ws?.send(JSON.stringify({ type: 'init', sessionId: this.sessionId }));
        this.flushQueue();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        if (this.enabled) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Error will trigger onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private send(entry: LogEntry): void {
    const msg = JSON.stringify({ type: 'log', entry });

    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else if (this.enabled) {
      this.queue.push(msg);
      if (this.queue.length > MAX_QUEUE_SIZE) {
        this.queue.shift();
      }
      if (!this.ws && !this.reconnectTimer) {
        this.connect();
      }
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.connected && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.queue.shift();
      if (msg) this.ws.send(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY);
  }

  private toConsole(level: LogEntry['lvl'], system: string, message: string, data?: unknown): void {
    const prefix = `[${system}]`;
    const method = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;

    if (data !== undefined) {
      method(prefix, message, data);
    } else {
      method(prefix, message);
    }
  }

  log(level: LogEntry['lvl'], system: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      ts: Date.now(),
      lvl: level,
      sys: system,
      msg: message,
      data,
    };

    this.send(entry);
    this.toConsole(level, system, message, data);
  }

  debug(system: string, message: string, data?: unknown): void {
    this.log('debug', system, message, data);
  }

  info(system: string, message: string, data?: unknown): void {
    this.log('info', system, message, data);
  }

  warn(system: string, message: string, data?: unknown): void {
    this.log('warn', system, message, data);
  }

  error(system: string, message: string, data?: unknown): void {
    this.log('error', system, message, data);
  }

  disconnect(): void {
    this.enabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// Global singleton
export const logClient = new LogClient();
