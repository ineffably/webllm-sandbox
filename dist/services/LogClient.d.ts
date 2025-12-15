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
declare class LogClient {
    private ws;
    private sessionId;
    private queue;
    private connected;
    private reconnectTimer;
    private url;
    private enabled;
    constructor();
    connect(): void;
    private send;
    private flushQueue;
    private scheduleReconnect;
    private toConsole;
    log(level: LogEntry['lvl'], system: string, message: string, data?: unknown): void;
    debug(system: string, message: string, data?: unknown): void;
    info(system: string, message: string, data?: unknown): void;
    warn(system: string, message: string, data?: unknown): void;
    error(system: string, message: string, data?: unknown): void;
    disconnect(): void;
    getSessionId(): string;
}
export declare const logClient: LogClient;
export {};
