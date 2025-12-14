#!/usr/bin/env tsx
/**
 * Log Server - WebSocket-based logging service for development
 *
 * Receives log entries from the browser and writes them to JSONL files.
 * Session-based directories with automatic file rotation.
 *
 * Usage: npx tsx tools/log-server.ts [port]
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.argv[2] || '9100', 10);
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const MAX_LINES_PER_FILE = 2000;

interface LogEntry {
  ts: number;
  lvl: string;
  sys: string;
  msg: string;
  data?: unknown;
}

interface SessionState {
  dir: string;
  fileNum: number;
  lineCount: number;
  stream: fs.WriteStream | null;
}

interface InitMessage {
  type: 'init';
  sessionId: string;
}

interface LogMessage {
  type: 'log';
  entry: LogEntry;
}

type ClientMessage = InitMessage | LogMessage;

// Session state
const sessions = new Map<string, SessionState>();

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSessionState(sessionId: string): SessionState {
  if (!sessions.has(sessionId)) {
    const dir = path.join(LOGS_DIR, sessionId);
    ensureDir(dir);

    const state: SessionState = {
      dir,
      fileNum: 1,
      lineCount: 0,
      stream: null,
    };

    // Open first file
    state.stream = fs.createWriteStream(
      path.join(dir, `${String(state.fileNum).padStart(4, '0')}.jsonl`),
      { flags: 'a' }
    );

    sessions.set(sessionId, state);
    console.log(`[LogServer] New session: ${sessionId}`);
  }
  return sessions.get(sessionId)!;
}

function rotateFile(state: SessionState): void {
  if (state.stream) {
    state.stream.end();
  }

  state.fileNum++;
  state.lineCount = 0;
  state.stream = fs.createWriteStream(
    path.join(state.dir, `${String(state.fileNum).padStart(4, '0')}.jsonl`),
    { flags: 'a' }
  );

  console.log(`[LogServer] Rotated to file ${state.fileNum}`);
}

function writeLog(sessionId: string, entry: LogEntry): void {
  const state = getSessionState(sessionId);

  // Rotate if needed
  if (state.lineCount >= MAX_LINES_PER_FILE) {
    rotateFile(state);
  }

  // Write the log entry as a single line of JSON
  const line = JSON.stringify(entry) + '\n';
  state.stream?.write(line);
  state.lineCount++;
}

// Ensure logs directory exists
ensureDir(LOGS_DIR);

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

wss.on('error', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[LogServer] Port ${PORT} is already in use. Kill the existing process or use a different port.`);
    console.error(`[LogServer] Try: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  }
  console.error('[LogServer] Server error:', err.message);
});

wss.on('connection', (ws: WebSocket) => {
  let clientSession: string | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;

      // First message should contain session ID
      if (msg.type === 'init') {
        clientSession = msg.sessionId;
        console.log(`[LogServer] Client connected: ${clientSession}`);
        return;
      }

      // Log entry
      if (msg.type === 'log' && clientSession) {
        writeLog(clientSession, msg.entry);
      }
    } catch (e) {
      console.error('[LogServer] Failed to parse message:', (e as Error).message);
    }
  });

  ws.on('close', () => {
    if (clientSession) {
      console.log(`[LogServer] Client disconnected: ${clientSession}`);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('[LogServer] WebSocket error:', err.message);
  });
});

console.log(`[LogServer] Listening on ws://localhost:${PORT}`);
console.log(`[LogServer] Logs will be written to: ${LOGS_DIR}`);

// Graceful shutdown
function shutdown(): void {
  console.log('\n[LogServer] Shutting down...');

  // Close all file streams
  for (const [sessionId, state] of sessions) {
    if (state.stream) {
      state.stream.end();
      console.log(`[LogServer] Closed session: ${sessionId}`);
    }
  }

  wss.close(() => {
    console.log('[LogServer] Stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
