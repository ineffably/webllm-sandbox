interface LogEntry {
  ts: number;
  lvl: 'debug' | 'info' | 'warn' | 'error';
  sys: string;
  msg: string;
  data?: unknown;
}

export class LogClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private url: string;
  private connected = false;
  private serverAvailable = false;
  private connectionAttempted = false;

  constructor(url = 'ws://localhost:9100') {
    this.url = url;
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const rand = Math.random().toString(36).substring(2, 6);
    return `${date}_${time}_${rand}`;
  }

  connect(): void {
    if (this.connectionAttempted) return;
    this.connectionAttempted = true;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.serverAvailable = true;
        console.log(`[LogClient] Connected to ${this.url}`);

        this.ws?.send(JSON.stringify({
          type: 'init',
          sessionId: this.sessionId,
        }));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        // Don't reconnect - just fall back to console
      };

      this.ws.onerror = () => {
        // Server not running - silently fall back to console
        this.connected = false;
        this.serverAvailable = false;
        this.ws = null;
      };
    } catch {
      // WebSocket failed - fall back to console
      this.serverAvailable = false;
    }
  }

  private send(entry: LogEntry): void {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'log',
        entry,
      }));
    }
  }

  private toConsole(level: LogEntry['lvl'], system: string, message: string, data?: unknown): void {
    const prefix = `[${system}]`;
    const consoleMethod = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;

    if (data !== undefined) {
      consoleMethod(prefix, message, data);
    } else {
      consoleMethod(prefix, message);
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

    // Always send to WebSocket if connected
    this.send(entry);

    // Always log to console as fallback/mirror
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
