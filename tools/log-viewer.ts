#!/usr/bin/env tsx
/**
 * Log Viewer - View and format JSONL logs
 *
 * Usage:
 *   npx tsx tools/log-viewer.ts                    # View latest session
 *   npx tsx tools/log-viewer.ts --list             # List all sessions
 *   npx tsx tools/log-viewer.ts --session <id>    # View specific session
 *   npx tsx tools/log-viewer.ts --tail             # Follow latest session
 *   npx tsx tools/log-viewer.ts --filter llm       # Filter by system
 *   npx tsx tools/log-viewer.ts --html             # Output as HTML
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');

interface LogEntry {
  ts: number;
  lvl: string;
  sys: string;
  msg: string;
  data?: unknown;
}

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const levelColors: Record<string, string> = {
  debug: colors.dim,
  info: colors.green,
  warn: colors.yellow,
  error: colors.red,
};

const systemColors: Record<string, string> = {
  llm: colors.magenta,
  app: colors.blue,
  model: colors.cyan,
  chat: colors.green,
  zork: colors.yellow,
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatEntry(entry: LogEntry, useColors = true): string {
  const c = useColors ? colors : { reset: '', dim: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '' };
  const lvlColor = useColors ? (levelColors[entry.lvl] || '') : '';
  const sysColor = useColors ? (systemColors[entry.sys] || colors.dim) : '';

  const time = formatTime(entry.ts);
  const lvl = entry.lvl.toUpperCase().padEnd(5);
  const sys = entry.sys.padEnd(6);

  let output = `${c.dim}${time}${c.reset} ${lvlColor}${lvl}${c.reset} ${sysColor}[${sys}]${c.reset} ${entry.msg}`;

  if (entry.data) {
    const dataStr = JSON.stringify(entry.data, null, 2);
    // For terminal, indent and dim the data
    if (useColors) {
      output += `\n${c.dim}${dataStr.split('\n').map(l => '  ' + l).join('\n')}${c.reset}`;
    } else {
      output += `\n${dataStr}`;
    }
  }

  return output;
}

function formatEntryHTML(entry: LogEntry): string {
  const time = formatTime(entry.ts);
  const lvlClass = entry.lvl;
  const sysClass = entry.sys;

  let html = `<div class="log-entry ${lvlClass}">`;
  html += `<span class="time">${time}</span>`;
  html += `<span class="level ${lvlClass}">${entry.lvl.toUpperCase()}</span>`;
  html += `<span class="system ${sysClass}">[${entry.sys}]</span>`;
  html += `<span class="message">${escapeHtml(entry.msg)}</span>`;

  if (entry.data) {
    html += `<pre class="data">${escapeHtml(JSON.stringify(entry.data, null, 2))}</pre>`;
  }

  html += '</div>';
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSessions(): string[] {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs.readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse(); // Most recent first
}

function getSessionFiles(sessionId: string): string[] {
  const sessionDir = path.join(LOGS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) return [];
  return fs.readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort();
}

function readLogFile(filePath: string): LogEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);
}

function readSession(sessionId: string, filter?: string): LogEntry[] {
  const files = getSessionFiles(sessionId);
  let entries: LogEntry[] = [];

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, sessionId, file);
    entries = entries.concat(readLogFile(filePath));
  }

  if (filter) {
    entries = entries.filter(e =>
      e.sys.toLowerCase().includes(filter.toLowerCase()) ||
      e.msg.toLowerCase().includes(filter.toLowerCase())
    );
  }

  return entries;
}

function generateHTML(entries: LogEntry[], sessionId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Logs - ${sessionId}</title>
  <style>
    body {
      background: #1a1a1a;
      color: #e0e0e0;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      padding: 20px;
      margin: 0;
    }
    h1 {
      color: #52c41a;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .log-entry {
      margin-bottom: 8px;
      padding: 4px 8px;
      border-left: 3px solid #333;
      background: #252525;
    }
    .log-entry.error {
      border-left-color: #ff4d4f;
      background: #2a1f1f;
    }
    .log-entry.warn {
      border-left-color: #faad14;
    }
    .log-entry.debug {
      opacity: 0.7;
    }
    .time {
      color: #666;
      margin-right: 8px;
    }
    .level {
      display: inline-block;
      width: 50px;
      font-weight: bold;
    }
    .level.error { color: #ff4d4f; }
    .level.warn { color: #faad14; }
    .level.info { color: #52c41a; }
    .level.debug { color: #666; }
    .system {
      margin-right: 8px;
    }
    .system.llm { color: #b37feb; }
    .system.app { color: #69c0ff; }
    .system.model { color: #5cdbd3; }
    .system.chat { color: #95de64; }
    .system.zork { color: #ffd666; }
    .message {
      color: #e0e0e0;
    }
    .data {
      background: #1a1a1a;
      padding: 8px;
      margin: 8px 0 0 60px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 11px;
      color: #888;
      max-height: 300px;
      overflow-y: auto;
    }
    .filters {
      margin-bottom: 20px;
      padding: 10px;
      background: #252525;
      border-radius: 4px;
    }
    .filters button {
      background: #333;
      color: #e0e0e0;
      border: 1px solid #444;
      padding: 4px 12px;
      margin-right: 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .filters button:hover {
      background: #444;
    }
    .filters button.active {
      background: #52c41a;
      color: #000;
      border-color: #52c41a;
    }
    .stats {
      color: #666;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <h1>Log Viewer - ${sessionId}</h1>
  <div class="stats">${entries.length} entries</div>
  <div class="filters">
    <button onclick="filterLogs('')" class="active">All</button>
    <button onclick="filterLogs('llm')">LLM</button>
    <button onclick="filterLogs('chat')">Chat</button>
    <button onclick="filterLogs('model')">Model</button>
    <button onclick="filterLogs('app')">App</button>
    <button onclick="filterLogs('zork')">Zork</button>
    <button onclick="filterLogs('error')">Errors</button>
  </div>
  <div id="logs">
    ${entries.map(e => formatEntryHTML(e)).join('\n')}
  </div>
  <script>
    function filterLogs(filter) {
      const entries = document.querySelectorAll('.log-entry');
      document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      entries.forEach(entry => {
        if (!filter) {
          entry.style.display = 'block';
        } else if (filter === 'error') {
          entry.style.display = entry.classList.contains('error') ? 'block' : 'none';
        } else {
          const sys = entry.querySelector('.system')?.textContent || '';
          entry.style.display = sys.toLowerCase().includes(filter) ? 'block' : 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

async function tailSession(sessionId: string, filter?: string): Promise<void> {
  console.log(`Tailing session: ${sessionId} (Ctrl+C to stop)\n`);

  const files = getSessionFiles(sessionId);
  let lastFile = files[files.length - 1];
  let lastSize = 0;

  if (lastFile) {
    const filePath = path.join(LOGS_DIR, sessionId, lastFile);
    lastSize = fs.statSync(filePath).size;

    // Print existing entries
    const entries = readSession(sessionId, filter);
    for (const entry of entries.slice(-50)) {
      console.log(formatEntry(entry));
    }
    console.log('\n--- Waiting for new entries ---\n');
  }

  // Poll for new entries
  const interval = setInterval(() => {
    const currentFiles = getSessionFiles(sessionId);
    const currentFile = currentFiles[currentFiles.length - 1];

    if (!currentFile) return;

    const filePath = path.join(LOGS_DIR, sessionId, currentFile);
    const stat = fs.statSync(filePath);

    if (currentFile !== lastFile || stat.size > lastSize) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      // If new file, print all; if same file, print from last position
      const startIdx = currentFile === lastFile ? Math.floor(lastSize / 100) : 0;

      for (let i = startIdx; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]) as LogEntry;
          if (!filter || entry.sys.includes(filter) || entry.msg.includes(filter)) {
            console.log(formatEntry(entry));
          }
        } catch {
          // Skip invalid lines
        }
      }

      lastFile = currentFile;
      lastSize = stat.size;
    }
  }, 500);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\nStopped tailing.');
    process.exit(0);
  });
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Log Viewer - View and format JSONL logs

Usage:
  npx tsx tools/log-viewer.ts                    View latest session
  npx tsx tools/log-viewer.ts --list             List all sessions
  npx tsx tools/log-viewer.ts --session <id>     View specific session
  npx tsx tools/log-viewer.ts --tail             Follow latest session
  npx tsx tools/log-viewer.ts --filter <sys>     Filter by system (llm, chat, etc)
  npx tsx tools/log-viewer.ts --html > out.html  Output as HTML
`);
    return;
  }

  const sessions = getSessions();

  if (sessions.length === 0) {
    console.log('No log sessions found. Enable Remote Logging in Settings and run `npm run logs`.');
    return;
  }

  // List sessions
  if (args.includes('--list') || args.includes('-l')) {
    console.log('Available sessions:\n');
    for (const session of sessions) {
      const files = getSessionFiles(session);
      const entries = readSession(session);
      console.log(`  ${session}  (${files.length} files, ${entries.length} entries)`);
    }
    return;
  }

  // Get session
  let sessionId = sessions[0]; // Default to latest
  const sessionIdx = args.indexOf('--session');
  if (sessionIdx !== -1 && args[sessionIdx + 1]) {
    sessionId = args[sessionIdx + 1];
    // Support partial match
    const match = sessions.find(s => s.includes(sessionId));
    if (match) sessionId = match;
  }

  // Get filter
  let filter: string | undefined;
  const filterIdx = args.indexOf('--filter');
  if (filterIdx !== -1 && args[filterIdx + 1]) {
    filter = args[filterIdx + 1];
  }

  // Tail mode
  if (args.includes('--tail') || args.includes('-f')) {
    await tailSession(sessionId, filter);
    return;
  }

  // Read entries
  const entries = readSession(sessionId, filter);

  // HTML output
  if (args.includes('--html')) {
    console.log(generateHTML(entries, sessionId));
    return;
  }

  // Terminal output
  console.log(`Session: ${sessionId} (${entries.length} entries)\n`);
  for (const entry of entries) {
    console.log(formatEntry(entry));
  }
}

main().catch(console.error);
