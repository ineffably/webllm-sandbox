export interface Weapon {
    name: string;
    damage: number;
    description: string;
}
export interface Potion {
    name: string;
    effect: 'heal' | 'rage';
    value: number;
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
    rageActive: boolean;
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
export declare const FIGHTER: Omit<CharacterSheet, 'id'>;
export declare const BARBARIAN: Omit<CharacterSheet, 'id'>;
export declare const COMBAT_ACTIONS: {
    action: CombatAction;
    label: string;
    description: string;
}[];
/**
 * Build the character prompt for the LLM
 */
export declare function buildCharacterPrompt(character: CharacterSheet, opponent: CharacterSheet): string;
/**
 * Parse the LLM response to extract action
 */
export declare function parseAction(response: string): CombatChoice;
/**
 * Calculate combat result
 */
export declare function resolveCombat(attacker: CharacterSheet, defender: CharacterSheet, attackerAction: CombatAction, defenderAction: CombatAction): {
    damage: number;
    narrative: string;
};
/**
 * Apply potion effect to character
 */
export declare function applyPotion(character: CharacterSheet): {
    updatedCharacter: CharacterSheet;
    narrative: string;
    hpHealed?: number;
};
/**
 * Apply damage and check for death
 */
export declare function applyDamage(character: CharacterSheet, damage: number): {
    newHp: number;
    isDead: boolean;
};
/**
 * Create a character with unique ID
 */
export declare function createCharacter(template: Omit<CharacterSheet, 'id'>): CharacterSheet;
