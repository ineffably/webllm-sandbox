/**
 * Logger - Unified logging utility with dual output
 *
 * - Sends ALL logs to the log server (when connected)
 * - Browser console is quiet by default (only errors/warns)
 * - Enable verbose console with: window.logVerbose = true or ?verbose=true
 */

import { getLogClient, LogEntry } from './log-client';

// Extend Window interface for verbose flag
declare global {
  interface Window {
    logVerbose?: boolean;
  }
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Current frame number (set by engine tick)
let currentFrame = 0;

// Check URL params for verbose flag
function checkVerboseParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('verbose') === 'true';
}

// Initialize verbose from URL param
if (typeof window !== 'undefined' && checkVerboseParam()) {
  window.logVerbose = true;
}

function shouldLogToConsole(level: LogLevel): boolean {
  // Always log errors and warnings to console
  if (level === 'error' || level === 'warn') {
    return true;
  }

  // Check verbose flag for debug/info
  if (typeof window !== 'undefined' && window.logVerbose) {
    return true;
  }

  return false;
}

function formatConsoleMessage(sys: string, msg: string): string {
  return `[${sys}] ${msg}`;
}

function log(level: LogLevel, sys: string, msg: string, data?: unknown): void {
  const entry: LogEntry = {
    ts: Date.now(),
    frame: currentFrame,
    lvl: level,
    sys,
    msg,
    data,
  };

  // Always send to log server
  try {
    getLogClient().send(entry);
  } catch {
    // Silently fail if log client isn't available
  }

  // Conditionally log to console
  if (shouldLogToConsole(level)) {
    const formatted = formatConsoleMessage(sys, msg);

    switch (level) {
      case 'debug':
        if (data !== undefined) {
          console.debug(formatted, data);
        } else {
          console.debug(formatted);
        }
        break;
      case 'info':
        if (data !== undefined) {
          console.log(formatted, data);
        } else {
          console.log(formatted);
        }
        break;
      case 'warn':
        if (data !== undefined) {
          console.warn(formatted, data);
        } else {
          console.warn(formatted);
        }
        break;
      case 'error':
        if (data !== undefined) {
          console.error(formatted, data);
        } else {
          console.error(formatted);
        }
        break;
    }
  }
}

/**
 * Logger instance with level-specific methods
 */
export const logger = {
  /**
   * Debug level - verbose information for debugging
   */
  debug(sys: string, msg: string, data?: unknown): void {
    log('debug', sys, msg, data);
  },

  /**
   * Info level - general information
   */
  info(sys: string, msg: string, data?: unknown): void {
    log('info', sys, msg, data);
  },

  /**
   * Warn level - warning conditions (always shows in console)
   */
  warn(sys: string, msg: string, data?: unknown): void {
    log('warn', sys, msg, data);
  },

  /**
   * Error level - error conditions (always shows in console)
   */
  error(sys: string, msg: string, data?: unknown): void {
    log('error', sys, msg, data);
  },

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return getLogClient().getSessionId();
  },

  /**
   * Enable verbose console output
   */
  setVerbose(enabled: boolean): void {
    if (typeof window !== 'undefined') {
      window.logVerbose = enabled;
    }
  },

  /**
   * Set the current frame number (call this from tick event)
   */
  setFrame(frame: number): void {
    currentFrame = frame;
  },

  /**
   * Get the current frame number
   */
  getFrame(): number {
    return currentFrame;
  },
};
