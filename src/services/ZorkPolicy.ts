/**
 * ZorkPolicy - Exploration policy and candidate action generation
 *
 * Implements deterministic preference order:
 * 1. Unresolved leads in current room
 * 2. New objects to examine/take
 * 3. Untried exits
 * 4. Backtrack to nearest room with untried exits
 */

import type { ZorkMemory, GameState, UnresolvedLead } from './ZorkMemory';

export interface ActionCandidate {
  command: string;
  score: number;
  reason: string;
}

const MOVEMENT = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'UP', 'DOWN'];

export class ZorkPolicy {
  private memory: ZorkMemory;

  constructor(memory: ZorkMemory) {
    this.memory = memory;
  }

  /**
   * Generate scored candidate actions based on current state
   */
  generateCandidates(): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const state = this.memory.getState();
    if (!state) return candidates;

    const leads = this.memory.getCurrentRoomLeads();
    const untriedExits = this.memory.getUntriedExits();
    const unexamined = this.memory.getUnexaminedObjects();
    const loop = this.memory.detectLoops();

    // 1. Unresolved leads in current room (+3)
    for (const lead of leads) {
      const actions = this.actionsForLead(lead, state);
      for (const action of actions) {
        if (!this.memory.isForbidden(action)) {
          candidates.push({
            command: action,
            score: 3,
            reason: `Unresolved lead: ${lead.description}`,
          });
        }
      }
    }

    // 2. New objects to examine/take (+2)
    for (const obj of unexamined) {
      const examineCmd = `EXAMINE ${obj}`;
      const takeCmd = `TAKE ${obj}`;

      if (!this.memory.isForbidden(examineCmd)) {
        candidates.push({
          command: examineCmd,
          score: 2,
          reason: `Unexamined object: ${obj}`,
        });
      }
      if (!this.memory.isForbidden(takeCmd)) {
        candidates.push({
          command: takeCmd,
          score: 2,
          reason: `Object to collect: ${obj}`,
        });
      }
    }

    // 3. Untried exits (+2)
    for (const exit of untriedExits) {
      if (!this.memory.isForbidden(exit)) {
        candidates.push({
          command: exit,
          score: 2,
          reason: `Untried exit: ${exit}`,
        });
      }
    }

    // 4. Info gathering (always useful, +1)
    if (!this.memory.isForbidden('LOOK')) {
      candidates.push({
        command: 'LOOK',
        score: 1,
        reason: 'Gather information about surroundings',
      });
    }
    if (!this.memory.isForbidden('INVENTORY')) {
      candidates.push({
        command: 'INVENTORY',
        score: 1,
        reason: 'Check what you are carrying',
      });
    }

    // 5. Tried exits (fallback, +0)
    for (const exit of MOVEMENT) {
      if (!untriedExits.includes(exit) && !this.memory.isForbidden(exit)) {
        candidates.push({
          command: exit,
          score: 0,
          reason: `Previously tried exit: ${exit}`,
        });
      }
    }

    // Apply penalties
    for (const candidate of candidates) {
      // -5 if forbidden (shouldn't happen due to filter, but safety)
      if (this.memory.isForbidden(candidate.command)) {
        candidate.score -= 5;
      }
    }

    // If stuck, boost info-gathering and untried exits
    if (loop.isLooping) {
      for (const candidate of candidates) {
        if (candidate.command === 'LOOK' || candidate.command === 'INVENTORY') {
          candidate.score += 2;
        }
        if (untriedExits.includes(candidate.command)) {
          candidate.score += 1;
        }
      }
    }

    // Sort by score descending
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the best action according to policy
   */
  getBestAction(): ActionCandidate | null {
    const candidates = this.generateCandidates();
    if (candidates.length === 0) return null;

    // Return highest scored candidate
    return candidates[0];
  }

  /**
   * Get top N candidates for LLM to choose from
   */
  getTopCandidates(n: number = 5): ActionCandidate[] {
    const candidates = this.generateCandidates();
    return candidates.slice(0, n);
  }

  /**
   * Generate actions for a specific lead type
   */
  private actionsForLead(lead: UnresolvedLead, state: GameState): string[] {
    const actions: string[] = [];

    switch (lead.type) {
      case 'locked':
        // Try to unlock with inventory items
        for (const item of state.inventory) {
          if (item.toLowerCase().includes('key')) {
            actions.push(`UNLOCK DOOR WITH ${item}`);
          }
        }
        actions.push('OPEN DOOR');
        break;

      case 'container':
        // Try to open containers
        for (const obj of state.visibleObjects) {
          if (/mailbox|chest|box|case|bag|sack/i.test(obj)) {
            actions.push(`OPEN ${obj}`);
            actions.push(`EXAMINE ${obj}`);
          }
        }
        break;

      case 'puzzle':
        // Try various interactions
        for (const obj of state.visibleObjects) {
          actions.push(`EXAMINE ${obj}`);
          actions.push(`PUSH ${obj}`);
          actions.push(`PULL ${obj}`);
          actions.push(`MOVE ${obj}`);
        }
        break;

      case 'hazard':
        // Be careful, maybe look for light or weapon
        actions.push('LOOK');
        for (const item of state.inventory) {
          if (/lamp|lantern|torch|light/i.test(item)) {
            actions.push(`TURN ON ${item}`);
          }
        }
        break;

      case 'notable':
        // Examine anything notable
        for (const obj of state.visibleObjects) {
          actions.push(`EXAMINE ${obj}`);
          actions.push(`READ ${obj}`);
        }
        break;
    }

    return actions;
  }

  /**
   * Validate a command against the policy
   * Returns adjusted command or null if invalid
   */
  validateCommand(command: string): { valid: boolean; adjusted: string; reason: string } {
    const upperCmd = command.toUpperCase().trim();

    // Check if forbidden
    if (this.memory.isForbidden(upperCmd)) {
      const best = this.getBestAction();
      return {
        valid: false,
        adjusted: best?.command || 'LOOK',
        reason: `"${upperCmd}" is forbidden, using ${best?.command || 'LOOK'} instead`,
      };
    }

    // Check for bad patterns
    const badPatterns = /^(LOOK\s+(UP|DOWN|NORTH|SOUTH|EAST|WEST|N|S|E|W)|GO\s|WEST OF|NORTH OF|SOUTH OF|EAST OF|MOVE (NORTH|SOUTH|EAST|WEST|N|S|E|W))/i;
    if (badPatterns.test(upperCmd)) {
      const best = this.getBestAction();
      return {
        valid: false,
        adjusted: best?.command || 'LOOK',
        reason: `"${upperCmd}" is an invalid pattern, using ${best?.command || 'LOOK'} instead`,
      };
    }

    // Validate format
    if (upperCmd.length > 50 || upperCmd.split(' ').length > 6) {
      const best = this.getBestAction();
      return {
        valid: false,
        adjusted: best?.command || 'LOOK',
        reason: 'Command too long or complex',
      };
    }

    return { valid: true, adjusted: upperCmd, reason: 'Valid command' };
  }

  /**
   * Get exploration status summary
   */
  getExplorationSummary(): string {
    const state = this.memory.getState();
    if (!state) return 'No exploration data';

    const untriedExits = this.memory.getUntriedExits();
    const unexamined = this.memory.getUnexaminedObjects();
    const leads = this.memory.getCurrentRoomLeads();

    const parts: string[] = [];

    if (leads.length > 0) {
      parts.push(`${leads.length} unresolved lead(s) here`);
    }
    if (unexamined.length > 0) {
      parts.push(`${unexamined.length} object(s) to examine`);
    }
    if (untriedExits.length > 0) {
      parts.push(`${untriedExits.length} untried exit(s): ${untriedExits.join(', ')}`);
    }
    if (parts.length === 0) {
      parts.push('Room fully explored - backtrack to find new areas');
    }

    return parts.join('; ');
  }
}
