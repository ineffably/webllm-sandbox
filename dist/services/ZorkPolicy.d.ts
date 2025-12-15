/**
 * ZorkPolicy - Exploration policy and candidate action generation
 *
 * Implements deterministic preference order:
 * 1. Unresolved leads in current room
 * 2. New objects to examine/take
 * 3. Untried exits
 * 4. Backtrack to nearest room with untried exits
 */
import type { ZorkMemory } from './ZorkMemory';
export interface ActionCandidate {
    command: string;
    score: number;
    reason: string;
}
export declare class ZorkPolicy {
    private memory;
    constructor(memory: ZorkMemory);
    /**
     * Generate scored candidate actions based on current state
     */
    generateCandidates(): ActionCandidate[];
    /**
     * Get the best action according to policy
     */
    getBestAction(): ActionCandidate | null;
    /**
     * Get top N candidates for LLM to choose from
     */
    getTopCandidates(n?: number): ActionCandidate[];
    /**
     * Generate actions for a specific lead type
     */
    private actionsForLead;
    /**
     * Validate a command against the policy
     * Returns adjusted command or null if invalid
     */
    validateCommand(command: string): {
        valid: boolean;
        adjusted: string;
        reason: string;
    };
    /**
     * Get exploration status summary
     */
    getExplorationSummary(): string;
}
