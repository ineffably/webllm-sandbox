/**
 * ZorkService - Uses tszm (TypeScript Z-Machine) for browser-based Zork
 *
 * tszm has a simple async I/O interface that's perfect for LLM control.
 */

import { ZMachine, ZMInputOutputDevice } from 'tszm';

export interface ZorkState {
  output: string;
  isWaitingForInput: boolean;
  isRunning: boolean;
  turnCount: number;
}

/**
 * Browser I/O device that buffers output and provides programmatic input
 */
class BrowserIODevice implements ZMInputOutputDevice {
  private outputBuffer: string = '';
  private inputResolver: ((value: string) => void) | null = null;
  private inputPromise: Promise<string> | null = null;
  private inEscapeSequence = false;
  private escapeBuffer = '';

  rows = 24;
  cols = 80;

  async readChar(): Promise<string> {
    // For now, just return enter - most games use readLine
    return '\n';
  }

  async readLine(): Promise<string> {
    console.log('[Zork] readLine called - waiting for input');
    // Create a promise that will be resolved when input is provided
    this.inputPromise = new Promise<string>((resolve) => {
      this.inputResolver = resolve;
    });
    const result = await this.inputPromise;
    console.log('[Zork] readLine got input:', result);
    return result;
  }

  async writeChar(char: string): Promise<void> {
    const code = char.charCodeAt(0);

    // Start of escape sequence
    if (code === 0x1b) {
      this.inEscapeSequence = true;
      this.escapeBuffer = char;
      return;
    }

    // In escape sequence - buffer until complete
    if (this.inEscapeSequence) {
      this.escapeBuffer += char;
      // Escape sequences end with a letter
      if (/[a-zA-Z]/.test(char)) {
        this.inEscapeSequence = false;
        this.escapeBuffer = '';
      }
      return;
    }

    this.outputBuffer += char;
  }

  async writeString(str: string): Promise<void> {
    // Strip ANSI escape codes for clean browser display
    const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    this.outputBuffer += clean;
  }

  close(): void {
    // Nothing to clean up
  }

  // Custom methods for programmatic control
  provideInput(input: string): void {
    console.log('[Zork] provideInput called:', input, 'hasResolver:', !!this.inputResolver);
    if (this.inputResolver) {
      this.inputResolver(input);
      this.inputResolver = null;
      this.inputPromise = null;
    } else {
      console.warn('[Zork] provideInput called but no resolver waiting!');
    }
  }

  isWaitingForInput(): boolean {
    return this.inputResolver !== null;
  }

  getAndClearOutput(): string {
    const output = this.outputBuffer;
    this.outputBuffer = '';
    return output;
  }

  peekOutput(): string {
    return this.outputBuffer;
  }
}

export class ZorkService {
  private vm: ZMachine | null = null;
  private ioDevice: BrowserIODevice | null = null;
  private isInitialized = false;
  private turnCount = 0;
  private gameLoopPromise: Promise<void> | null = null;

  async initialize(storyUrl: string): Promise<string> {
    // Create I/O device
    this.ioDevice = new BrowserIODevice();

    // Create and load the VM
    this.vm = new ZMachine(storyUrl, this.ioDevice);
    await this.vm.load();

    this.isInitialized = true;

    // Start the game loop in the background
    this.gameLoopPromise = this.runGameLoop();

    // Wait a bit for initial output, then return it
    await new Promise(r => setTimeout(r, 100));

    // Wait until the game is ready for input
    const startTime = Date.now();
    while (!this.ioDevice.isWaitingForInput()) {
      await new Promise(r => setTimeout(r, 50));
      // Safety timeout after 5 seconds
      if (Date.now() - startTime > 5000) break;
    }

    return this.ioDevice.getAndClearOutput();
  }

  private async runGameLoop(): Promise<void> {
    if (!this.vm) return;

    try {
      // Keep executing instructions
      while (this.isInitialized) {
        await this.vm.executeInstruction();
      }
    } catch (error: any) {
      if (error.message !== 'Game quit') {
        console.error('Z-Machine error:', error);
      }
    }
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.isInitialized || !this.vm || !this.ioDevice) {
      throw new Error('ZorkService not initialized');
    }

    // Clear any pending output
    this.ioDevice.getAndClearOutput();

    this.turnCount++;

    // Provide the input
    this.ioDevice.provideInput(command);

    // Wait for the game to process and request new input
    const startTime = Date.now();
    while (!this.ioDevice.isWaitingForInput()) {
      await new Promise(r => setTimeout(r, 50));
      // Safety timeout after 5 seconds
      if (Date.now() - startTime > 5000) {
        console.warn('Timeout waiting for game response');
        break;
      }
    }

    // Get the output
    return this.ioDevice.getAndClearOutput();
  }

  getState(): ZorkState {
    return {
      output: this.ioDevice?.peekOutput() || '',
      isWaitingForInput: this.ioDevice?.isWaitingForInput() || false,
      isRunning: this.isInitialized,
      turnCount: this.turnCount,
    };
  }

  reset(): void {
    this.isInitialized = false;
    if (this.vm) {
      this.vm.close();
      this.vm = null;
    }
    if (this.ioDevice) {
      this.ioDevice.close();
      this.ioDevice = null;
    }
    this.turnCount = 0;
    this.gameLoopPromise = null;
  }
}
