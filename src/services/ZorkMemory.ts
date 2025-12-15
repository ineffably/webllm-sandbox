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
  forbiddenCommands: Map<string, number>; // command -> turns until allowed
  noChangeTurns: number;
  gameSummary: string; // Compressed summary of game progress
  lastSummaryTurn: number;
}

export interface LongTermMemory {
  rooms: Map<string, RoomInfo>;
  unresolvedLeads: UnresolvedLead[];
  objectsOfInterest: Map<string, string>; // object -> last seen room
  globalInventory: Set<string>;
}

const DIRECTION_MAP: Record<string, string> = {
  'N': 'north', 'NORTH': 'north',
  'S': 'south', 'SOUTH': 'south',
  'E': 'east', 'EAST': 'east',
  'W': 'west', 'WEST': 'west',
  'NE': 'northeast', 'NORTHEAST': 'northeast',
  'NW': 'northwest', 'NORTHWEST': 'northwest',
  'SE': 'southeast', 'SOUTHEAST': 'southeast',
  'SW': 'southwest', 'SOUTHWEST': 'southwest',
  'UP': 'up', 'U': 'up',
  'DOWN': 'down', 'D': 'down',
  'ENTER': 'enter', 'IN': 'enter',
  'EXIT': 'exit', 'OUT': 'exit',
};

const MOVEMENT_COMMANDS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'UP', 'DOWN', 'U', 'D', 'ENTER', 'EXIT', 'IN', 'OUT', 'CLIMB']);

export class ZorkMemory {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private currentTurn: number = 0;
  private lastGameOutput: string = '';
  private lastState: GameState | null = null;

  constructor() {
    this.shortTerm = {
      currentPlan: 'Explore the starting area',
      lastCommands: [],
      stuckCount: 0,
      forbiddenCommands: new Map(),
      noChangeTurns: 0,
      gameSummary: '',
      lastSummaryTurn: 0,
    };

    this.longTerm = {
      rooms: new Map(),
      unresolvedLeads: [],
      objectsOfInterest: new Map(),
      globalInventory: new Set(),
    };
  }

  /**
   * Extract structured state from game output
   */
  extractState(gameOutput: string): GameState {
    const lines = gameOutput.trim().split('\n').filter(l => l.trim());

    // First line is usually room name (unless it's a failure message)
    const failurePatterns = /don't know|can't|cannot|won't|isn't|aren't|impossible|already|nothing|no verb|what do you want|which|you see|you are|there is/i;

    let currentRoom = this.lastState?.currentRoom || 'Unknown';
    let startIdx = 0;

    // Detect room name (capitalized, short line at start)
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length < 50 &&
          !failurePatterns.test(firstLine) &&
          !firstLine.startsWith('>') &&
          /^[A-Z]/.test(firstLine)) {
        currentRoom = firstLine;
        startIdx = 1;
      }
    }

    // Parse rest of output for objects, exits, clues
    const fullText = lines.slice(startIdx).join(' ').toLowerCase();

    // Extract exits mentioned
    const exits: string[] = [];
    const exitPatterns = [
      /(?:to the |)(north|south|east|west|northeast|northwest|southeast|southwest|up|down)/gi,
      /path leads (north|south|east|west)/gi,
      /door to the (north|south|east|west)/gi,
      /exit (?:to the )?(north|south|east|west|up|down)/gi,
    ];

    for (const pattern of exitPatterns) {
      let match;
      while ((match = pattern.exec(fullText)) !== null) {
        const dir = match[1].toUpperCase().charAt(0);
        if (!exits.includes(dir)) exits.push(dir);
      }
    }

    // Extract visible objects
    const visibleObjects: string[] = [];
    const objectPatterns = [
      /(?:there is |you see |here is )(?:a |an |the |some )?([a-z]+(?: [a-z]+)?)/gi,
      /(?:a |an |the )([a-z]+ (?:mailbox|door|house|window|mat|lamp|sword|knife|bag|bottle|key|rope|lantern|egg|nest|painting|trophy|chalice|bar|torch|candle|coffin|book|scroll|leaflet|sack|jewels|treasure|coin|diamond|emerald|ruby|sapphire|pearl|figurine|trident|crystal|jade|ivory|gold|silver|brass|bronze|platinum|scarab|bauble|pot|vase|chest|box|case|pile|stack|bundle|heap|crown|scepter|ring|bracelet|necklace|pendant|amulet|talisman))/gi,
    ];

    for (const pattern of objectPatterns) {
      let match;
      while ((match = pattern.exec(fullText)) !== null) {
        const obj = match[1].toUpperCase().trim();
        if (obj.length > 2 && !visibleObjects.includes(obj)) {
          visibleObjects.push(obj);
        }
      }
    }

    // Extract notable clues
    const notableClues: string[] = [];
    if (/locked/i.test(fullText)) notableClues.push('locked door or container');
    if (/closed/i.test(fullText)) notableClues.push('closed container');
    if (/dark|darkness/i.test(fullText)) notableClues.push('area is dark - need light');
    if (/dangerous|grue|eaten/i.test(fullText)) notableClues.push('danger nearby');
    if (/treasure|valuable|precious|jewel/i.test(fullText)) notableClues.push('treasure nearby');
    if (/inscription|writing|carved|engraved|written/i.test(fullText)) notableClues.push('something to read');

    // Extract score if present
    let score: number | undefined;
    let moves: number | undefined;
    const scoreMatch = fullText.match(/score:\s*(\d+)/i) || fullText.match(/(\d+)\s*(?:points|score)/i);
    if (scoreMatch) score = parseInt(scoreMatch[1]);
    const movesMatch = fullText.match(/moves?:\s*(\d+)/i) || fullText.match(/(\d+)\s*moves?/i);
    if (movesMatch) moves = parseInt(movesMatch[1]);

    const state: GameState = {
      currentRoom,
      exits: exits.length > 0 ? exits : ['N', 'S', 'E', 'W'], // Default if none detected
      visibleObjects,
      inventory: this.lastState?.inventory || [],
      score,
      moves,
      notableClues,
    };

    this.lastState = state;
    this.lastGameOutput = gameOutput;

    return state;
  }

  /**
   * Update memory after a command is executed
   */
  updateAfterCommand(command: string, gameOutput: string, prevState: GameState | null): void {
    this.currentTurn++;
    const newState = this.extractState(gameOutput);

    // Determine result type
    let result: 'progress' | 'no-change' | 'failure' = 'no-change';

    const failurePatterns = /don't know|can't|cannot|won't|isn't|aren't|impossible|already|nothing|no verb|what do you want|which do you mean/i;

    if (failurePatterns.test(gameOutput)) {
      result = 'failure';
    } else if (prevState && newState.currentRoom !== prevState.currentRoom) {
      result = 'progress'; // Moved to new room
    } else if (command.startsWith('TAKE') && /taken|you have/i.test(gameOutput)) {
      result = 'progress';
    } else if (command.startsWith('OPEN') && /opens|opened|opening/i.test(gameOutput)) {
      result = 'progress';
    } else if (command === 'LOOK' || command === 'INVENTORY' || command.startsWith('EXAMINE')) {
      result = 'progress'; // Info gathering is always useful
    }

    // Track command result
    this.shortTerm.lastCommands.push({ command, result, turn: this.currentTurn });
    if (this.shortTerm.lastCommands.length > 10) {
      this.shortTerm.lastCommands.shift();
    }

    // Update stuck counter
    if (result === 'no-change' || result === 'failure') {
      this.shortTerm.noChangeTurns++;
      if (this.shortTerm.noChangeTurns >= 3) {
        this.shortTerm.stuckCount++;
      }
    } else {
      this.shortTerm.noChangeTurns = 0;
    }

    // Update forbidden commands
    if (result === 'failure') {
      this.shortTerm.forbiddenCommands.set(command, 10); // Forbid for 10 turns
    }

    // Decay forbidden commands
    for (const [cmd, turns] of this.shortTerm.forbiddenCommands) {
      if (turns <= 1) {
        this.shortTerm.forbiddenCommands.delete(cmd);
      } else {
        this.shortTerm.forbiddenCommands.set(cmd, turns - 1);
      }
    }

    // Update room info
    this.updateRoomInfo(newState, command);

    // Update inventory if changed
    if (command.startsWith('TAKE') && result === 'progress') {
      const item = command.replace('TAKE ', '').trim();
      this.longTerm.globalInventory.add(item);
      newState.inventory = [...this.longTerm.globalInventory];
    }
    if (command.startsWith('DROP') && result === 'progress') {
      const item = command.replace('DROP ', '').trim();
      this.longTerm.globalInventory.delete(item);
      newState.inventory = [...this.longTerm.globalInventory];
    }

    // Detect unresolved leads
    this.detectLeads(newState, gameOutput);

    this.lastState = newState;
  }

  /**
   * Update room graph
   */
  private updateRoomInfo(state: GameState, lastCommand: string): void {
    let room = this.longTerm.rooms.get(state.currentRoom);

    if (!room) {
      room = {
        name: state.currentRoom,
        exits: state.exits,
        triedExits: new Set(),
        objects: state.visibleObjects,
        examinedObjects: new Set(),
        takenObjects: new Set(),
        visitCount: 0,
      };
      this.longTerm.rooms.set(state.currentRoom, room);
    }

    room.visitCount++;

    // Merge exits
    for (const exit of state.exits) {
      if (!room.exits.includes(exit)) {
        room.exits.push(exit);
      }
    }

    // Merge objects
    for (const obj of state.visibleObjects) {
      if (!room.objects.includes(obj)) {
        room.objects.push(obj);
      }
      this.longTerm.objectsOfInterest.set(obj, state.currentRoom);
    }

    // Track tried exits
    const cmdUpper = lastCommand.toUpperCase();
    if (MOVEMENT_COMMANDS.has(cmdUpper) || DIRECTION_MAP[cmdUpper]) {
      const dir = cmdUpper.charAt(0);
      room.triedExits.add(dir);
    }

    // Track examined objects
    if (cmdUpper.startsWith('EXAMINE ') || cmdUpper.startsWith('X ')) {
      const obj = cmdUpper.replace(/^(EXAMINE |X )/, '').trim();
      room.examinedObjects.add(obj);
    }

    // Track taken objects
    if (cmdUpper.startsWith('TAKE ')) {
      const obj = cmdUpper.replace('TAKE ', '').trim();
      room.takenObjects.add(obj);
    }
  }

  /**
   * Detect and track unresolved leads
   */
  private detectLeads(state: GameState, gameOutput: string): void {
    const text = gameOutput.toLowerCase();

    if (/locked/i.test(text) && !this.hasLead(state.currentRoom, 'locked')) {
      this.longTerm.unresolvedLeads.push({
        room: state.currentRoom,
        description: 'Locked door or container',
        type: 'locked',
      });
    }

    if (/closed (mailbox|chest|box|door|case|container)/i.test(text) && !this.hasLead(state.currentRoom, 'container')) {
      this.longTerm.unresolvedLeads.push({
        room: state.currentRoom,
        description: 'Closed container to open',
        type: 'container',
      });
    }

    if (/(puzzle|mechanism|lever|button|switch)/i.test(text) && !this.hasLead(state.currentRoom, 'puzzle')) {
      this.longTerm.unresolvedLeads.push({
        room: state.currentRoom,
        description: 'Puzzle or mechanism to solve',
        type: 'puzzle',
      });
    }
  }

  private hasLead(room: string, type: string): boolean {
    return this.longTerm.unresolvedLeads.some(l => l.room === room && l.type === type);
  }

  /**
   * Mark a lead as resolved
   */
  resolveLead(room: string, type: string): void {
    this.longTerm.unresolvedLeads = this.longTerm.unresolvedLeads.filter(
      l => !(l.room === room && l.type === type)
    );
  }

  /**
   * Check for loop patterns
   */
  detectLoops(): { isLooping: boolean; pattern: string | null; suggestion: string } {
    const cmds = this.shortTerm.lastCommands.slice(-6);

    // Check exact repeat (same command 2x in last 6)
    for (let i = cmds.length - 1; i > 0; i--) {
      if (cmds[i].command === cmds[i - 1].command) {
        return {
          isLooping: true,
          pattern: 'repeat',
          suggestion: `Command "${cmds[i].command}" repeated - try something different`,
        };
      }
    }

    // Check A/B/A/B alternation
    if (cmds.length >= 4) {
      const last4 = cmds.slice(-4);
      if (last4[0].command === last4[2].command &&
          last4[1].command === last4[3].command &&
          last4[0].command !== last4[1].command) {
        return {
          isLooping: true,
          pattern: 'alternation',
          suggestion: `Alternating ${last4[0].command}/${last4[1].command} - break the pattern`,
        };
      }
    }

    // Check consecutive no-change
    if (this.shortTerm.noChangeTurns >= 3) {
      return {
        isLooping: true,
        pattern: 'stuck',
        suggestion: 'Multiple turns with no progress - try LOOK, INVENTORY, or explore new exit',
      };
    }

    return { isLooping: false, pattern: null, suggestion: '' };
  }

  /**
   * Get untried exits in current room
   */
  getUntriedExits(): string[] {
    if (!this.lastState) return [];

    const room = this.longTerm.rooms.get(this.lastState.currentRoom);
    if (!room) return this.lastState.exits;

    return room.exits.filter(e => !room.triedExits.has(e));
  }

  /**
   * Get unexamined objects in current room
   */
  getUnexaminedObjects(): string[] {
    if (!this.lastState) return [];

    const room = this.longTerm.rooms.get(this.lastState.currentRoom);
    if (!room) return this.lastState.visibleObjects;

    return room.objects.filter(o => !room.examinedObjects.has(o) && !room.takenObjects.has(o));
  }

  /**
   * Get leads for current room
   */
  getCurrentRoomLeads(): UnresolvedLead[] {
    if (!this.lastState) return [];
    return this.longTerm.unresolvedLeads.filter(l => l.room === this.lastState!.currentRoom);
  }

  /**
   * Get nearest room with untried exits (for backtracking)
   */
  getNearestRoomWithUntriedExits(): string | null {
    for (const [name, room] of this.longTerm.rooms) {
      const untried = room.exits.filter(e => !room.triedExits.has(e));
      if (untried.length > 0 && name !== this.lastState?.currentRoom) {
        return name;
      }
    }
    return null;
  }

  /**
   * Check if command is forbidden
   */
  isForbidden(command: string): boolean {
    return this.shortTerm.forbiddenCommands.has(command);
  }

  /**
   * Forbid a command for N turns
   */
  forbidCommand(command: string, turns: number = 6): void {
    this.shortTerm.forbiddenCommands.set(command, turns);
  }

  /**
   * Generate structured memory string for prompt
   */
  toPromptFormat(): string {
    const state = this.lastState;
    if (!state) return 'No state available';

    const untriedExits = this.getUntriedExits();
    const unexamined = this.getUnexaminedObjects();
    const leads = this.getCurrentRoomLeads();
    const loop = this.detectLoops();
    const forbidden = [...this.shortTerm.forbiddenCommands.keys()];

    // Recent commands with results
    const recentCmds = this.shortTerm.lastCommands.slice(-5)
      .map(c => `${c.command}(${c.result === 'progress' ? '+' : c.result === 'failure' ? 'X' : '-'})`)
      .join(', ');

    const parts: string[] = [
      `CURRENT STATE:`,
      `Room: ${state.currentRoom}`,
      `Exits: ${state.exits.join(', ')}`,
    ];

    if (untriedExits.length > 0) {
      parts.push(`Untried exits: ${untriedExits.join(', ')}`);
    }
    if (state.visibleObjects.length > 0) {
      parts.push(`Objects here: ${state.visibleObjects.join(', ')}`);
    }
    if (unexamined.length > 0) {
      parts.push(`Not yet examined: ${unexamined.join(', ')}`);
    }
    if (this.longTerm.globalInventory.size > 0) {
      parts.push(`Inventory: ${[...this.longTerm.globalInventory].join(', ')}`);
    }
    if (state.notableClues.length > 0) {
      parts.push(`Clues: ${state.notableClues.join('; ')}`);
    }

    parts.push('');
    parts.push('MEMORY:');
    if (recentCmds) {
      parts.push(`Recent commands: ${recentCmds}`);
    }
    if (forbidden.length > 0) {
      parts.push(`Forbidden (failed): ${forbidden.join(', ')}`);
    }
    if (loop.isLooping) {
      parts.push(`WARNING: ${loop.suggestion}`);
    }
    if (leads.length > 0) {
      parts.push(`Unresolved leads: ${leads.map(l => l.description).join('; ')}`);
    }
    parts.push(`Rooms explored: ${this.longTerm.rooms.size}`);

    return parts.join('\n');
  }

  /**
   * Set current plan
   */
  setPlan(plan: string): void {
    this.shortTerm.currentPlan = plan;
  }

  /**
   * Get the compressed game summary
   */
  getGameSummary(): string {
    return this.shortTerm.gameSummary;
  }

  /**
   * Update the game summary (called by external compressor)
   */
  setGameSummary(summary: string): void {
    this.shortTerm.gameSummary = summary;
    this.shortTerm.lastSummaryTurn = this.currentTurn;
  }

  /**
   * Check if summary needs refresh (every N turns)
   */
  needsSummaryRefresh(interval: number = 5): boolean {
    return this.currentTurn - this.shortTerm.lastSummaryTurn >= interval;
  }

  /**
   * Get current turn number
   */
  getCurrentTurn(): number {
    return this.currentTurn;
  }

  /**
   * Get recent game history for compression (last N command/result pairs)
   */
  getRecentHistory(count: number = 10): string {
    const history = this.shortTerm.lastCommands.slice(-count);
    if (history.length === 0) return '';

    const lines = history.map(c => {
      const resultSymbol = c.result === 'progress' ? '✓' : c.result === 'failure' ? '✗' : '—';
      return `Turn ${c.turn}: ${c.command} ${resultSymbol}`;
    });

    return lines.join('\n');
  }

  /**
   * Get exploration stats for compression context
   */
  getExplorationStats(): string {
    const rooms = [...this.longTerm.rooms.values()];
    const totalRooms = rooms.length;
    const inventory = [...this.longTerm.globalInventory];
    const leads = this.longTerm.unresolvedLeads;

    const parts: string[] = [];
    if (totalRooms > 0) {
      const roomNames = rooms.map(r => r.name).slice(-5);
      parts.push(`Rooms visited (${totalRooms}): ${roomNames.join(', ')}`);
    }
    if (inventory.length > 0) {
      parts.push(`Collected: ${inventory.join(', ')}`);
    }
    if (leads.length > 0) {
      parts.push(`Unresolved: ${leads.map(l => `${l.type} in ${l.room}`).join('; ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Get current state
   */
  getState(): GameState | null {
    return this.lastState;
  }

  /**
   * Reset all memory
   */
  reset(): void {
    this.shortTerm = {
      currentPlan: 'Explore the starting area',
      lastCommands: [],
      stuckCount: 0,
      forbiddenCommands: new Map(),
      noChangeTurns: 0,
      gameSummary: '',
      lastSummaryTurn: 0,
    };

    this.longTerm = {
      rooms: new Map(),
      unresolvedLeads: [],
      objectsOfInterest: new Map(),
      globalInventory: new Set(),
    };

    this.currentTurn = 0;
    this.lastGameOutput = '';
    this.lastState = null;
  }
}
