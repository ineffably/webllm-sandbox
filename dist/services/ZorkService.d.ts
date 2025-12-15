/**
 * ZorkService - Uses tszm (TypeScript Z-Machine) for browser-based Zork
 *
 * tszm has a simple async I/O interface that's perfect for LLM control.
 */
export interface ZorkState {
    output: string;
    isWaitingForInput: boolean;
    isRunning: boolean;
    turnCount: number;
}
export declare class ZorkService {
    private vm;
    private ioDevice;
    private isInitialized;
    private turnCount;
    private gameLoopPromise;
    initialize(storyUrl: string): Promise<string>;
    private runGameLoop;
    sendCommand(command: string): Promise<string>;
    getState(): ZorkState;
    reset(): void;
}
