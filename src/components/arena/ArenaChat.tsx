import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Button, Space, Typography, Tag, Progress, Badge } from 'antd';
import { PlayCircleOutlined, PauseOutlined, StepForwardOutlined, ReloadOutlined, ThunderboltOutlined, SafetyOutlined, ClockCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { Agent } from '../../services/Agent';
import {
  CharacterSheet,
  CombatAction,
  FIGHTER,
  BARBARIAN,
  createCharacter,
  buildCharacterPrompt,
  parseAction,
  resolveCombat,
  applyDamage,
  applyPotion,
} from '../../services/Combat';
import type { LLMService } from '../../services/LLMService';

const { Text, Title } = Typography;

interface CombatLogEntry {
  id: string;
  round: number;
  characterName: string;
  characterColor: string;
  action: CombatAction;
  reasoning: string;
  narrative?: string;
  damage?: number;
}

interface ArenaChatProps {
  llmService: LLMService | null;
  temperature: number;
  maxTokens: number;
  isModelReady: boolean;
}

const ACTION_ICONS: Record<CombatAction, React.ReactNode> = {
  attack: <ThunderboltOutlined style={{ color: '#ff4d4f' }} />,
  defend: <SafetyOutlined style={{ color: '#52c41a' }} />,
  potion: <ExperimentOutlined style={{ color: '#722ed1' }} />,
  nothing: <ClockCircleOutlined style={{ color: '#888' }} />,
};

const CharacterCard: React.FC<{ character: CharacterSheet; isActive: boolean }> = ({ character, isActive }) => {
  const hpPercent = (character.hp / character.maxHp) * 100;
  const hpStatus: 'success' | 'exception' | 'normal' | 'active' = hpPercent > 50 ? 'success' : hpPercent > 25 ? 'normal' : 'exception';

  return (
    <Card
      size="small"
      style={{
        background: '#1f1f1f',
        border: isActive ? `2px solid ${character.color}` : '1px solid #303030',
        opacity: character.hp <= 0 ? 0.5 : 1,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <Badge status={character.hp > 0 ? 'success' : 'error'} />
        <Text strong style={{ color: character.color, fontSize: 16, marginLeft: 8 }}>
          {character.name}
        </Text>
        <Tag style={{ marginLeft: 8 }}>{character.class}</Tag>
      </div>

      <Progress
        percent={hpPercent}
        status={hpStatus}
        format={() => `${character.hp}/${character.maxHp} HP`}
        size="small"
      />

      <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>Attack: {character.attack}{character.rageActive ? <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>+5 RAGE</Tag> : ''}</span>
          <span>Defense: {character.defense}</span>
        </div>
        <div style={{ marginBottom: 4 }}>
          <ThunderboltOutlined /> {character.weapon.name} (+{character.weapon.damage} dmg)
        </div>
        <div style={{ marginBottom: 4 }}>
          <ExperimentOutlined style={{ color: character.potionUsed ? '#666' : '#722ed1' }} />{' '}
          {character.potion.name}
          {character.potionUsed ? <Tag color="default" style={{ marginLeft: 4, fontSize: 10 }}>USED</Tag> : <Tag color="purple" style={{ marginLeft: 4, fontSize: 10 }}>READY</Tag>}
        </div>
        <div style={{ color: '#666' }}>
          Inventory: {character.inventory.join(', ') || 'Empty'}
        </div>
      </div>

      {character.hp <= 0 && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Text type="danger" strong>DEFEATED</Text>
        </div>
      )}
    </Card>
  );
};

export const ArenaChat: React.FC<ArenaChatProps> = ({
  llmService,
  temperature,
  maxTokens,
  isModelReady,
}) => {
  const [fighter, setFighter] = useState<CharacterSheet>(() => createCharacter(FIGHTER));
  const [barbarian, setBarbarian] = useState<CharacterSheet>(() => createCharacter(BARBARIAN));
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [showJson, setShowJson] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const agentsRef = useRef<{ fighter: Agent | null; barbarian: Agent | null }>({
    fighter: null,
    barbarian: null,
  });
  const logRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);

  // Use refs to track current character state for async loops
  const fighterRef = useRef(fighter);
  const barbarianRef = useRef(barbarian);
  const currentRoundRef = useRef(currentRound);

  // Keep refs in sync with state
  useEffect(() => { fighterRef.current = fighter; }, [fighter]);
  useEffect(() => { barbarianRef.current = barbarian; }, [barbarian]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  // Initialize agents
  useEffect(() => {
    agentsRef.current.fighter = new Agent({
      id: 'fighter',
      name: fighter.name,
      persona: `You are ${fighter.name}, a disciplined ${fighter.class}. You fight with honor and tactical precision.`,
      color: fighter.color,
    });

    agentsRef.current.barbarian = new Agent({
      id: 'barbarian',
      name: barbarian.name,
      persona: `You are ${barbarian.name}, a fierce ${barbarian.class}. You fight with raw fury and brute strength.`,
      color: barbarian.color,
    });

    if (llmService) {
      agentsRef.current.fighter.attachLLM(llmService);
      agentsRef.current.barbarian.attachLLM(llmService);
    }
  }, [fighter.name, fighter.color, barbarian.name, barbarian.color, llmService]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [combatLog, streamingContent]);

  const getCharacterAction = useCallback(async (
    character: CharacterSheet,
    opponent: CharacterSheet,
    agent: Agent
  ): Promise<{ action: CombatAction; reasoning: string }> => {
    const prompt = buildCharacterPrompt(character, opponent);

    // Clear agent history and give combat context
    agent.clearHistory();
    agent.receiveMessage(prompt, 'Game Master');

    const result = await agent.speak(
      { temperature, maxTokens: 150 },
      (chunk) => {
        if (!stopRef.current) {
          setStreamingContent(prev => prev + chunk);
        }
      }
    );

    return parseAction(result.content);
  }, [temperature]);

  const runRound = useCallback(async () => {
    if (!llmService || !isModelReady || stopRef.current || winner) return false;

    const fighterAgent = agentsRef.current.fighter;
    const barbarianAgent = agentsRef.current.barbarian;

    if (!fighterAgent || !barbarianAgent) return false;

    // Use refs to get current state (not stale closure values)
    const currentFighter = fighterRef.current;
    const currentBarbarian = barbarianRef.current;
    const round = currentRoundRef.current;

    // Fighter's turn
    setActiveCharacter(currentFighter.id);
    setStreamingContent('');

    let fighterChoice: { action: CombatAction; reasoning: string };
    try {
      fighterChoice = await getCharacterAction(currentFighter, currentBarbarian, fighterAgent);
    } catch (e) {
      console.error('Fighter action error:', e);
      fighterChoice = { action: 'attack', reasoning: 'Attacks instinctively!' };
    }

    if (stopRef.current) return false;

    setCombatLog(prev => [...prev, {
      id: `log-${Date.now()}-f`,
      round,
      characterName: currentFighter.name,
      characterColor: currentFighter.color,
      action: fighterChoice.action,
      reasoning: fighterChoice.reasoning,
    }]);

    // Barbarian's turn
    setActiveCharacter(currentBarbarian.id);
    setStreamingContent('');

    let barbarianChoice: { action: CombatAction; reasoning: string };
    try {
      barbarianChoice = await getCharacterAction(currentBarbarian, currentFighter, barbarianAgent);
    } catch (e) {
      console.error('Barbarian action error:', e);
      barbarianChoice = { action: 'attack', reasoning: 'RAAAGE!' };
    }

    if (stopRef.current) return false;

    setCombatLog(prev => [...prev, {
      id: `log-${Date.now()}-b`,
      round,
      characterName: currentBarbarian.name,
      characterColor: currentBarbarian.color,
      action: barbarianChoice.action,
      reasoning: barbarianChoice.reasoning,
    }]);

    setStreamingContent('');
    setActiveCharacter(null);

    // Track working copies that may be modified by potions
    let workingFighter = { ...currentFighter };
    let workingBarbarian = { ...currentBarbarian };

    // Handle potion usage first (before combat resolution)
    if (fighterChoice.action === 'potion' && !currentFighter.potionUsed) {
      const potionResult = applyPotion(workingFighter);
      workingFighter = potionResult.updatedCharacter;
      setCombatLog(prev => [...prev, {
        id: `log-${Date.now()}-fp`,
        round,
        characterName: 'Narrator',
        characterColor: '#722ed1',
        action: 'potion',
        reasoning: potionResult.narrative,
        damage: potionResult.hpHealed ? -potionResult.hpHealed : undefined, // Negative = healing
      }]);
    }

    if (barbarianChoice.action === 'potion' && !currentBarbarian.potionUsed) {
      const potionResult = applyPotion(workingBarbarian);
      workingBarbarian = potionResult.updatedCharacter;
      setCombatLog(prev => [...prev, {
        id: `log-${Date.now()}-bp`,
        round,
        characterName: 'Narrator',
        characterColor: '#722ed1',
        action: 'potion',
        reasoning: potionResult.narrative,
        damage: potionResult.hpHealed ? -potionResult.hpHealed : undefined,
      }]);
    }

    // Resolve combat - both attacks happen simultaneously (using working copies with rage bonus)
    const fighterResult = resolveCombat(workingFighter, workingBarbarian, fighterChoice.action, barbarianChoice.action);
    const barbarianResult = resolveCombat(workingBarbarian, workingFighter, barbarianChoice.action, fighterChoice.action);

    // Apply damage
    const newBarbarianHp = applyDamage(workingBarbarian, fighterResult.damage);
    const newFighterHp = applyDamage(workingFighter, barbarianResult.damage);

    // Update HP state and refs immediately (preserve potion state)
    const updatedFighter = { ...workingFighter, hp: newFighterHp.newHp };
    const updatedBarbarian = { ...workingBarbarian, hp: newBarbarianHp.newHp };
    fighterRef.current = updatedFighter;
    barbarianRef.current = updatedBarbarian;
    setFighter(updatedFighter);
    setBarbarian(updatedBarbarian);

    // Add combat narratives to log (skip if potion action - already logged)
    if (fighterChoice.action !== 'potion' && (fighterResult.damage > 0 || fighterChoice.action !== 'nothing')) {
      setCombatLog(prev => [...prev, {
        id: `log-${Date.now()}-fn`,
        round,
        characterName: 'Narrator',
        characterColor: '#faad14',
        action: 'nothing',
        reasoning: fighterResult.narrative,
        damage: fighterResult.damage,
      }]);
    }

    if (barbarianChoice.action !== 'potion' && (barbarianResult.damage > 0 || barbarianChoice.action !== 'nothing')) {
      setCombatLog(prev => [...prev, {
        id: `log-${Date.now()}-bn`,
        round,
        characterName: 'Narrator',
        characterColor: '#faad14',
        action: 'nothing',
        reasoning: barbarianResult.narrative,
        damage: barbarianResult.damage,
      }]);
    }

    // Check for death
    if (newBarbarianHp.isDead && newFighterHp.isDead) {
      setWinner('Draw - Both combatants have fallen!');
      return false;
    } else if (newBarbarianHp.isDead) {
      setWinner(`${updatedFighter.name} is victorious!`);
      return false;
    } else if (newFighterHp.isDead) {
      setWinner(`${updatedBarbarian.name} is victorious!`);
      return false;
    }

    // Update round state and ref
    const nextRound = round + 1;
    currentRoundRef.current = nextRound;
    setCurrentRound(nextRound);
    return true;
  }, [llmService, isModelReady, getCharacterAction, winner]);

  const handleStart = useCallback(async () => {
    stopRef.current = false;
    setIsRunning(true);

    while (!stopRef.current && !winner) {
      const continueGame = await runRound();
      if (!continueGame || stopRef.current) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    setIsRunning(false);
  }, [runRound, winner]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
  }, []);

  const handleStep = useCallback(async () => {
    setIsRunning(true);
    await runRound();
    setIsRunning(false);
  }, [runRound]);

  const handleReset = useCallback(() => {
    const newFighter = createCharacter(FIGHTER);
    const newBarbarian = createCharacter(BARBARIAN);

    // Reset state
    setFighter(newFighter);
    setBarbarian(newBarbarian);
    setCombatLog([]);
    setCurrentRound(1);
    setWinner(null);
    setStreamingContent('');
    setActiveCharacter(null);

    // Reset refs to match new state
    fighterRef.current = newFighter;
    barbarianRef.current = newBarbarian;
    currentRoundRef.current = 1;

    agentsRef.current.fighter?.clearHistory();
    agentsRef.current.barbarian?.clearHistory();
  }, []);

  const combatJson = {
    round: currentRound,
    winner,
    characters: {
      fighter: { name: fighter.name, hp: fighter.hp, maxHp: fighter.maxHp },
      barbarian: { name: barbarian.name, hp: barbarian.hp, maxHp: barbarian.maxHp },
    },
    log: combatLog.map(l => ({
      round: l.round,
      character: l.characterName,
      action: l.action,
      reasoning: l.reasoning,
      damage: l.damage,
    })),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Character Cards */}
      <div style={{ padding: 16, borderBottom: '1px solid #303030', background: '#1f1f1f' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <CharacterCard character={fighter} isActive={activeCharacter === fighter.id} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>VS</Title>
          </div>
          <div style={{ flex: 1 }}>
            <CharacterCard character={barbarian} isActive={activeCharacter === barbarian.id} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Tag color="gold">Round {currentRound}</Tag>
          {winner && <Tag color="green">{winner}</Tag>}
        </div>
      </div>

      {/* Combat Log */}
      <div className="message-list" ref={logRef} style={{ flex: 1 }}>
        {combatLog.map((entry) => (
          <div key={entry.id} className="message-bubble assistant">
            <Card size="small" style={{ background: '#2a2a2a', border: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {entry.characterName !== 'Narrator' && (
                  <Tag color={entry.characterColor}>
                    {ACTION_ICONS[entry.action]} {entry.characterName}
                  </Tag>
                )}
                {entry.characterName === 'Narrator' && entry.action === 'potion' && (
                  <Tag color={entry.characterColor}><ExperimentOutlined /> Potion</Tag>
                )}
                {entry.characterName === 'Narrator' && entry.action !== 'potion' && (
                  <Tag color={entry.characterColor}>⚔️ Combat</Tag>
                )}
                <Text style={{ color: '#fff', whiteSpace: 'pre-wrap', flex: 1 }}>
                  {entry.characterName !== 'Narrator' && (
                    <><strong>{entry.action.toUpperCase()}</strong>: </>
                  )}
                  {entry.reasoning}
                  {entry.damage !== undefined && entry.damage > 0 && (
                    <Tag color="red" style={{ marginLeft: 8 }}>-{entry.damage} HP</Tag>
                  )}
                  {entry.damage !== undefined && entry.damage < 0 && (
                    <Tag color="green" style={{ marginLeft: 8 }}>+{Math.abs(entry.damage)} HP</Tag>
                  )}
                </Text>
              </div>
            </Card>
          </div>
        ))}
        {streamingContent && activeCharacter && (
          <div className="message-bubble assistant">
            <Card size="small" style={{ background: '#2a2a2a', border: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Tag color={activeCharacter === fighter.id ? fighter.color : barbarian.color}>
                  {activeCharacter === fighter.id ? fighter.name : barbarian.name}
                </Tag>
                <Text style={{ color: '#fff', whiteSpace: 'pre-wrap', flex: 1 }}>
                  {streamingContent}
                  <span className="cursor">▊</span>
                </Text>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: 16, borderTop: '1px solid #303030', background: '#1f1f1f' }}>
        <Space>
          {!isRunning ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              disabled={!isModelReady || !!winner}
            >
              Fight
            </Button>
          ) : (
            <Button
              danger
              icon={<PauseOutlined />}
              onClick={handleStop}
            >
              Stop
            </Button>
          )}
          <Button
            icon={<StepForwardOutlined />}
            onClick={handleStep}
            disabled={!isModelReady || isRunning || !!winner}
          >
            Step
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={isRunning}
          >
            Reset
          </Button>
          <Button onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide' : 'Show'} JSON
          </Button>
        </Space>
        {!isModelReady && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Load a model to start combat
          </Text>
        )}
      </div>

      {/* JSON Viewer */}
      {showJson && (
        <div style={{ height: 200, borderTop: '1px solid #303030' }}>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={JSON.stringify(combatJson, null, 2)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: 'off',
              folding: true,
              wordWrap: 'on',
            }}
          />
        </div>
      )}
    </div>
  );
};
