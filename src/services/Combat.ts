// Combat System Types and Logic

export interface Weapon {
  name: string;
  damage: number;
  description: string;
}

export interface Potion {
  name: string;
  effect: 'heal' | 'rage';
  value: number; // HP restored or attack bonus
  description: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  class: string;
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  weapon: Weapon;
  potion: Potion;
  potionUsed: boolean;
  rageActive: boolean; // For rage potion effect
  inventory: string[];
  color: string;
}

export type CombatAction = 'attack' | 'defend' | 'potion' | 'nothing';

export interface CombatChoice {
  action: CombatAction;
  reasoning: string;
}

export interface CombatResult {
  attacker: string;
  defender: string;
  action: CombatAction;
  damage: number;
  defenderHp: number;
  narrative: string;
  isFatal: boolean;
}

// Predefined characters
export const FIGHTER: Omit<CharacterSheet, 'id'> = {
  name: 'Aldric',
  class: 'Fighter',
  maxHp: 30,
  hp: 30,
  attack: 8,
  defense: 6,
  weapon: {
    name: 'Longsword',
    damage: 6,
    description: 'A well-balanced steel longsword',
  },
  potion: {
    name: 'Health Potion',
    effect: 'heal',
    value: 15,
    description: 'Restores 15 HP when consumed',
  },
  potionUsed: false,
  rageActive: false,
  inventory: ['Shield'],
  color: '#1890ff',
};

export const BARBARIAN: Omit<CharacterSheet, 'id'> = {
  name: 'Grimjaw',
  class: 'Barbarian',
  maxHp: 40,
  hp: 40,
  attack: 10,
  defense: 3,
  weapon: {
    name: 'Greataxe',
    damage: 10,
    description: 'A massive double-headed axe',
  },
  potion: {
    name: 'Rage Potion',
    effect: 'rage',
    value: 5,
    description: 'Increases attack by 5 for the rest of combat',
  },
  potionUsed: false,
  rageActive: false,
  inventory: ['Warpaint'],
  color: '#eb2f96',
};

export const COMBAT_ACTIONS: { action: CombatAction; label: string; description: string }[] = [
  { action: 'attack', label: 'Attack', description: 'Strike your opponent with your equipped weapon' },
  { action: 'defend', label: 'Defend', description: 'Brace for impact, reducing incoming damage by half' },
  { action: 'potion', label: 'Potion', description: 'Drink your potion for its effect (one-time use)' },
  { action: 'nothing', label: 'Wait', description: 'Do nothing this turn' },
];

/**
 * Build the character prompt for the LLM
 */
export function buildCharacterPrompt(character: CharacterSheet, opponent: CharacterSheet): string {
  const potionStatus = character.potionUsed
    ? `- Potion: USED (no longer available)`
    : `- Potion: ${character.potion.name} - ${character.potion.description}`;

  const rageStatus = character.rageActive ? `\n- RAGE ACTIVE: +5 attack bonus!` : '';
  const effectiveAttack = character.attack + (character.rageActive ? 5 : 0);

  const availableActions = character.potionUsed
    ? 'ATTACK, DEFEND, or NOTHING'
    : 'ATTACK, DEFEND, POTION, or NOTHING';

  return `You are ${character.name}, a ${character.class} in combat.

YOUR CHARACTER SHEET:
- Class: ${character.class}
- HP: ${character.hp}/${character.maxHp}
- Attack: ${effectiveAttack}${rageStatus}
- Defense: ${character.defense}
- Weapon: ${character.weapon.name} (${character.weapon.damage} damage) - ${character.weapon.description}
${potionStatus}
- Inventory: ${character.inventory.join(', ') || 'Empty'}

YOUR OPPONENT:
- Name: ${opponent.name}
- Class: ${opponent.class}
- HP: ${opponent.hp}/${opponent.maxHp}

You must choose ONE action from: ${availableActions}.
${!character.potionUsed ? `\nPOTION: Drinking your ${character.potion.name} will ${character.potion.effect === 'heal' ? `restore ${character.potion.value} HP` : `boost your attack by ${character.potion.value} for the rest of combat`}. You can only use it ONCE!` : ''}

Respond with your chosen action and a brief in-character reason (1-2 sentences).
Format your response EXACTLY like this:
ACTION: [your choice]
REASON: [your reasoning]

Example:
ACTION: ATTACK
REASON: I swing my longsword at the barbarian's exposed flank!

Stay in character as a ${character.class}. Be tactical and dramatic.`;
}

/**
 * Parse the LLM response to extract action
 */
export function parseAction(response: string): CombatChoice {
  const upperResponse = response.toUpperCase();

  let action: CombatAction = 'nothing';

  if (upperResponse.includes('ACTION: ATTACK') || upperResponse.includes('ACTION:ATTACK')) {
    action = 'attack';
  } else if (upperResponse.includes('ACTION: DEFEND') || upperResponse.includes('ACTION:DEFEND')) {
    action = 'defend';
  } else if (upperResponse.includes('ACTION: POTION') || upperResponse.includes('ACTION:POTION')) {
    action = 'potion';
  } else if (upperResponse.includes('ACTION: NOTHING') || upperResponse.includes('ACTION:NOTHING') || upperResponse.includes('ACTION: WAIT')) {
    action = 'nothing';
  } else {
    // Fallback: look for keywords
    if (upperResponse.includes('ATTACK') || upperResponse.includes('STRIKE') || upperResponse.includes('SWING')) {
      action = 'attack';
    } else if (upperResponse.includes('DEFEND') || upperResponse.includes('BLOCK') || upperResponse.includes('BRACE')) {
      action = 'defend';
    } else if (upperResponse.includes('POTION') || upperResponse.includes('DRINK') || upperResponse.includes('QUAFF')) {
      action = 'potion';
    }
  }

  // Extract reasoning
  const reasonMatch = response.match(/REASON:\s*(.+)/i);
  const reasoning = reasonMatch ? reasonMatch[1].trim() : response.slice(0, 200);

  return { action, reasoning };
}

/**
 * Calculate combat result
 */
export function resolveCombat(
  attacker: CharacterSheet,
  defender: CharacterSheet,
  attackerAction: CombatAction,
  defenderAction: CombatAction
): { damage: number; narrative: string } {
  if (attackerAction === 'nothing') {
    return {
      damage: 0,
      narrative: `${attacker.name} waits, watching ${defender.name} carefully.`,
    };
  }

  if (attackerAction === 'defend') {
    return {
      damage: 0,
      narrative: `${attacker.name} raises their guard, preparing for an attack.`,
    };
  }

  if (attackerAction === 'potion') {
    // Potion usage is handled separately in applyPotion
    return {
      damage: 0,
      narrative: '', // Will be set by applyPotion
    };
  }

  // Attack action - include rage bonus if active
  const rageBonus = attacker.rageActive ? 5 : 0;
  const baseDamage = attacker.attack + attacker.weapon.damage + rageBonus;
  let defense = defender.defense;

  // Defending doubles defense
  if (defenderAction === 'defend') {
    defense *= 2;
  }

  const damage = Math.max(0, baseDamage - defense);

  let narrative: string;
  if (damage === 0) {
    narrative = `${attacker.name} swings their ${attacker.weapon.name} at ${defender.name}, but the attack is completely blocked!`;
  } else if (defenderAction === 'defend') {
    narrative = `${attacker.name} strikes with their ${attacker.weapon.name}! ${defender.name} partially blocks, taking ${damage} damage.`;
  } else {
    const rageText = attacker.rageActive ? ' with furious rage' : '';
    narrative = `${attacker.name} lands a solid hit${rageText} with their ${attacker.weapon.name}, dealing ${damage} damage to ${defender.name}!`;
  }

  return { damage, narrative };
}

/**
 * Apply potion effect to character
 */
export function applyPotion(character: CharacterSheet): {
  updatedCharacter: CharacterSheet;
  narrative: string;
  hpHealed?: number;
} {
  if (character.potionUsed) {
    return {
      updatedCharacter: character,
      narrative: `${character.name} reaches for a potion but finds none remaining!`,
    };
  }

  const potion = character.potion;

  if (potion.effect === 'heal') {
    const hpBefore = character.hp;
    const newHp = Math.min(character.maxHp, character.hp + potion.value);
    const healed = newHp - hpBefore;

    return {
      updatedCharacter: {
        ...character,
        hp: newHp,
        potionUsed: true,
      },
      narrative: `${character.name} drinks the ${potion.name} and recovers ${healed} HP!`,
      hpHealed: healed,
    };
  } else if (potion.effect === 'rage') {
    return {
      updatedCharacter: {
        ...character,
        potionUsed: true,
        rageActive: true,
      },
      narrative: `${character.name} drinks the ${potion.name}! Their eyes glow red as their attack increases by ${potion.value}!`,
    };
  }

  return {
    updatedCharacter: { ...character, potionUsed: true },
    narrative: `${character.name} drinks the ${potion.name}.`,
  };
}

/**
 * Apply damage and check for death
 */
export function applyDamage(character: CharacterSheet, damage: number): { newHp: number; isDead: boolean } {
  const newHp = Math.max(0, character.hp - damage);
  return {
    newHp,
    isDead: newHp <= 0,
  };
}

/**
 * Create a character with unique ID
 */
export function createCharacter(template: Omit<CharacterSheet, 'id'>): CharacterSheet {
  return {
    ...template,
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
}
