/**
 * ZorkMemory - Structured memory system for LLM Zork play
 *
 * Based on agent scaffold pattern:
 * - Short-term: rolling window of recent actions + stuck counter
 * - Long-term: room graph, unresolved leads, objects of interest
 */
export interface RoomInfo {
    name: string;
    exits: string[];
    triedExits: Set<string>;
    objects: string[];
    examinedObjects: Set<string>;
    takenObjects: Set<string>;
    description?: string;
    visitCount: number;
}
export interface CommandResult {
    command: string;
    result: 'progress' | 'no-change' | 'failure';
    turn: number;
}
export interface UnresolvedLead {
    room: string;
    description: string;
    type: 'locked' | 'container' | 'puzzle' | 'hazard' | 'notable';
}
export interface GameState {
    currentRoom: string;
    exits: string[];
    visibleObjects: string[];
    inventory: string[];
    score?: number;
    moves?: number;
    notableClues: string[];
}
export interface ShortTermMemory {
    currentPlan: string;
    lastCommands: CommandResult[];
    stuckCount: number;
    forbiddenCommands: Map<string, number>;
    noChangeTurns: number;
    gameSummary: string;
    lastSummaryTurn: number;
}
export interface LongTermMemory {
    rooms: Map<string, RoomInfo>;
    unresolvedLeads: UnresolvedLead[];
    objectsOfInterest: Map<string, string>;
    globalInventory: Set<string>;
}
export declare class ZorkMemory {
    private shortTerm;
    private longTerm;
    private currentTurn;
    private lastGameOutput;
    private lastState;
    constructor();
    /**
     * Extract structured state from game output
     */
    extractState(gameOutput: string): GameState;
    /**
     * Update memory after a command is executed
     */
    updateAfterCommand(command: string, gameOutput: string, prevState: GameState | null): void;
    /**
     * Update room graph
     */
    private updateRoomInfo;
    /**
     * Detect and track unresolved leads
     */
    private detectLeads;
    private hasLead;
    /**
     * Mark a lead as resolved
     */
    resolveLead(room: string, type: string): void;
    /**
     * Check for loop patterns
     */
    detectLoops(): {
        isLooping: boolean;
        pattern: string | null;
        suggestion: string;
    };
    /**
     * Get untried exits in current room
     */
    getUntriedExits(): string[];
    /**
     * Get unexamined objects in current room
     */
    getUnexaminedObjects(): string[];
    /**
     * Get leads for current room
     */
    getCurrentRoomLeads(): UnresolvedLead[];
    /**
     * Get nearest room with untried exits (for backtracking)
     */
    getNearestRoomWithUntriedExits(): string | null;
    /**
     * Check if command is forbidden
     */
    isForbidden(command: string): boolean;
    /**
     * Forbid a command for N turns
     */
    forbidCommand(command: string, turns?: number): void;
    /**
     * Generate structured memory string for prompt
     */
    toPromptFormat(): string;
    /**
     * Set current plan
     */
    setPlan(plan: string): void;
    /**
     * Get the compressed game summary
     */
    getGameSummary(): string;
    /**
     * Update the game summary (called by external compressor)
     */
    setGameSummary(summary: string): void;
    /**
     * Check if summary needs refresh (every N turns)
     */
    needsSummaryRefresh(interval?: number): boolean;
    /**
     * Get current turn number
     */
    getCurrentTurn(): number;
    /**
     * Get recent game history for compression (last N command/result pairs)
     */
    getRecentHistory(count?: number): string;
    /**
     * Get exploration stats for compression context
     */
    getExplorationStats(): string;
    /**
     * Get current state
     */
    getState(): GameState | null;
    /**
     * Reset all memory
     */
    reset(): void;
}
