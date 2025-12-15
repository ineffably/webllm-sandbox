import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Space, Typography, Tag, Input, Switch, Collapse } from 'antd';
import {
  PlayCircleOutlined,
  PauseOutlined,
  StepForwardOutlined,
  ReloadOutlined,
  RobotOutlined,
  UserOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Agent } from '../../services/Agent';
import { ZorkService } from '../../services/ZorkService';
import { ZorkMemory } from '../../services/ZorkMemory';
import { ZorkPolicy } from '../../services/ZorkPolicy';
import type { LLMService } from '../../services/LLMService';

const { Text, Title } = Typography;

interface ZorkPlayerProps {
  llmService: LLMService | null;
  temperature: number;
  maxTokens: number;
  isModelReady: boolean;
}

interface GameLogEntry {
  id: string;
  type: 'game' | 'command' | 'thinking';
  content: string;
  turn: number;
}

const ZORK_PLAYER_PROMPT = `
You are an adventurer in an unknown area and each place is labeled and described and you have simple commands to 
move around and interact with the environment and most environment has a set of objects that can be interacted with.

RULES:
1. explore and be curious, if a mailbox is closed, try OPEN MAILBOX
2. Prioritize: unresolved leads > new objects > untried exits > backtrack.
3. Never repeat a command that failed or produced no change.
4. PAY ATTENTION TO YOUR LOCATION ie: (7 West of House)
5. ALL text you see from the game could be a clue, make a note of it.

VALID COMMANDS:
- Movement: N, S, E, W, NE, NW, SE, SW, UP, DOWN
- Info: LOOK, INVENTORY, EXAMINE [noun]
- Actions: TAKE [x], DROP [x], OPEN [x], CLOSE [x], READ [x], MOVE [x], PUSH [x], PULL [x]
- Combinations: PUT [x] IN [y], UNLOCK [x] WITH [y]

ZORK TIPS:
- New room? Always LOOK first.
- be curious, if a mailbox is closed, try OPEN MAILBOX
- Pay attention to LOOK and other descriptions; all nouns could be a clue.
- example: "There is a small mailbox here." you could OPEN MAILBOX
- OPEN container, then EXAMINE, then TAKE.
- If blocked: try OPEN DOOR, UNLOCK WITH KEY, CLIMB, ENTER.

Output a single Zork command, nothing else.`;

const REASONER_PROMPT = `You are a guide helping a Zork player. Give ONE brief strategy tip (under 20 words).

PRIORITIES:
- Loop detected? Suggest breaking the pattern with a new direction.
- Stuck? Suggest: LOOK, INVENTORY, or try an untried exit.
- Pay attention to room descriptions; all nouns could be a clue.
- explore and be curious, if a mailbox is closed, try OPEN MAILBOX
- Unresolved lead (locked door, closed container)? Address it.
- New objects? Suggest OPEN, EXAMINE or TAKE.
- Making progress? Say "Good."

Output just the tip.`;

const ZORK_COMMANDS = {
  movement: ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'UP', 'DOWN', 'ENTER', 'EXIT', 'CLIMB'],
  actions: ['TAKE', 'DROP', 'OPEN', 'CLOSE', 'READ', 'MOVE', 'PUSH', 'PULL', 'TURN', 'ATTACK', 'THROW', 'TIE', 'LIGHT', 'DIG', 'FILL', 'POUR', 'WAVE', 'INFLATE', 'DEFLATE', 'RING', 'BREAK', 'BURN', 'CUT', 'EAT', 'DRINK'],
  info: ['LOOK', 'INVENTORY', 'EXAMINE [x]', 'SCORE', 'WAIT', 'DIAGNOSE'],
  interact: ['PUT [x] IN [y]', 'GIVE [x] TO [y]', 'UNLOCK [x] WITH [y]', 'ATTACK [x] WITH [y]'],
  system: ['SAVE', 'RESTORE', 'RESTART', 'QUIT', 'VERBOSE', 'BRIEF'],
};

export const ZorkPlayer: React.FC<ZorkPlayerProps> = ({
  llmService,
  temperature,
  maxTokens,
  isModelReady,
}) => {
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentTurn, setCurrentTurn] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [manualCommand, setManualCommand] = useState('');
  const [isLLMMode, setIsLLMMode] = useState(true);

  const zorkRef = useRef<ZorkService | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const reasonerRef = useRef<Agent | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const memoryRef = useRef<ZorkMemory>(new ZorkMemory());
  const policyRef = useRef<ZorkPolicy>(new ZorkPolicy(memoryRef.current));

  // Initialize Zork and Agents
  useEffect(() => {
    if (!zorkRef.current) {
      zorkRef.current = new ZorkService();
    }

    // Adventurer agent
    agentRef.current = new Agent({
      id: 'adventurer-001',
      name: 'Explorer',
      persona: ZORK_PLAYER_PROMPT,
      color: '#52c41a',
    });

    // Reasoner agent (coach)
    reasonerRef.current = new Agent({
      id: 'reasoner-001',
      name: 'Guide',
      persona: REASONER_PROMPT,
      color: '#1890ff',
    });

    if (llmService) {
      agentRef.current.attachLLM(llmService);
      reasonerRef.current.attachLLM(llmService);
    }
  }, [llmService]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [gameLog, streamingContent]);

  const addLogEntry = useCallback((type: GameLogEntry['type'], content: string, turn: number) => {
    setGameLog(prev => [...prev, {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      turn,
    }]);
  }, []);

  const initializeGame = useCallback(async () => {
    if (!zorkRef.current) return;

    try {
      const initialOutput = await zorkRef.current.initialize('/games/zork1.z3');
      setIsInitialized(true);
      setCurrentTurn(0);
      addLogEntry('game', initialOutput, 0);
    } catch (error) {
      console.error('Failed to initialize Zork:', error);
      addLogEntry('game', `Error initializing game: ${error}`, 0);
    }
  }, [addLogEntry]);

  const sendCommand = useCallback(async (command: string): Promise<string> => {
    if (!zorkRef.current || !isInitialized) {
      throw new Error('Game not initialized');
    }

    addLogEntry('command', command, currentTurn + 1);
    const response = await zorkRef.current.sendCommand(command);
    setCurrentTurn(prev => prev + 1);
    addLogEntry('game', response, currentTurn + 1);
    return response;
  }, [isInitialized, currentTurn, addLogEntry]);

  // Compress game history into a summary using LLM
  const compressGameHistory = useCallback(async (): Promise<void> => {
    if (!reasonerRef.current || !llmService) return;

    const memory = memoryRef.current;
    const recentHistory = memory.getRecentHistory(10);
    const explorationStats = memory.getExplorationStats();
    const currentSummary = memory.getGameSummary();

    if (!recentHistory && !explorationStats) return;

    const compressionPrompt = `Summarize this Zork game progress in 2-3 sentences. Focus on: where the player has been, what they collected, and what obstacles remain.

${currentSummary ? `Previous summary: ${currentSummary}\n\n` : ''}${explorationStats ? `Stats:\n${explorationStats}\n\n` : ''}${recentHistory ? `Recent actions:\n${recentHistory}` : ''}

Write a brief summary:`;

    reasonerRef.current.clearHistory();
    reasonerRef.current.receiveMessage(compressionPrompt, 'System');

    try {
      const result = await reasonerRef.current.speak(
        { temperature: 0.3, maxTokens: 100 },
        () => {}
      );

      const summary = result.content.trim();
      if (summary && summary.length > 10) {
        memory.setGameSummary(summary);
        console.log('[Zork] Updated game summary:', summary);
      }
    } catch (error) {
      console.warn('[Zork] Failed to compress history:', error);
    }
  }, [llmService]);

  // Get advice from the reasoner using structured memory
  const getReasoning = useCallback(async (gameOutput: string): Promise<string> => {
    if (!reasonerRef.current || !llmService) return '';

    const memory = memoryRef.current;
    const loop = memory.detectLoops();

    // Compact context for reasoner
    const context = `${memory.toPromptFormat()}
${loop.isLooping ? `LOOP: ${loop.pattern}` : ''}
Output: ${gameOutput.slice(0, 200).replace(/\n+/g, ' ')}`;

    reasonerRef.current.clearHistory();
    reasonerRef.current.receiveMessage(context, 'Game');

    const result = await reasonerRef.current.speak(
      { temperature: 0.2, maxTokens: 20 },
      () => {} // No streaming for reasoner
    );

    return result.content.trim();
  }, [llmService]);

  const getLLMCommand = useCallback(async (gameOutput: string): Promise<string> => {
    if (!agentRef.current || !llmService) {
      throw new Error('LLM not available');
    }

    const memory = memoryRef.current;
    const policy = policyRef.current;

    // Get previous state before updating
    const prevState = memory.getState();

    // Extract state from game output
    const state = memory.extractState(gameOutput);
    console.log('[Zork] State:', state.currentRoom, '| Exits:', state.exits.join(','), '| Objects:', state.visibleObjects.join(','));

    // Update memory with the last command result (if we have a previous state)
    const lastCommands = memory['shortTerm'].lastCommands;
    const lastCmd = lastCommands.length > 0 ? lastCommands[lastCommands.length - 1]?.command : null;

    // Check for loop patterns
    const loop = memory.detectLoops();
    if (loop.isLooping) {
      console.log('[Zork] Loop detected:', loop.pattern, '-', loop.suggestion);
      // Forbid commands involved in the loop
      if (loop.pattern === 'repeat' && lastCmd) {
        memory.forbidCommand(lastCmd, 10);
      }
      if (loop.pattern === 'alternation') {
        const recent = lastCommands.slice(-4);
        if (recent.length >= 2) {
          memory.forbidCommand(recent[recent.length - 1].command, 6);
          memory.forbidCommand(recent[recent.length - 2].command, 6);
        }
      }
    }

    // Detect new location
    const isNewLocation = prevState && state.currentRoom !== prevState.currentRoom;
    if (isNewLocation) {
      console.log('[Zork] New location:', state.currentRoom);
    }

    // Compress game history every 5 turns to maintain context
    if (memory.needsSummaryRefresh(5)) {
      console.log('[Zork] Compressing game history...');
      await compressGameHistory();
    }

    // Get top candidates with reasoning
    const candidates = policy.getTopCandidates(5);
    const candidateList = candidates.map(c => `- ${c.command} (${c.reason})`).join('\n');

    console.log('[Zork] Top candidates:', candidates.slice(0, 3).map(c => c.command).join(', '));

    // Get advice from reasoner (but not every turn)
    let advice = '';
    if (isNewLocation) {
      advice = 'New area - use LOOK to explore.';
    } else if (loop.isLooping) {
      advice = loop.suggestion;
    } else if (lastCommands.length > 2 && lastCommands.length % 3 === 0) {
      // Get reasoner advice every 3 turns
      advice = await getReasoning(gameOutput);
      if (advice && !advice.toLowerCase().includes('good')) {
        console.log('[Zork] Reasoner advice:', advice);
      }
    }

    // Build structured prompt for the actor
    const gameSummary = memory.getGameSummary();
    const promptContext = `${gameSummary ? `PROGRESS SO FAR:\n${gameSummary}\n\n` : ''}${memory.toPromptFormat()}

GAME OUTPUT:
${gameOutput.slice(0, 500)}

SUGGESTED ACTIONS:
${candidateList}
${advice ? `\n[GUIDE]: ${advice}` : ''}

Choose the best command:`;

    // Clear history each turn - we use structured memory instead of conversation history
    agentRef.current.clearHistory();
    agentRef.current.receiveMessage(promptContext, 'Game');

    setStreamingContent('');

    const result = await agentRef.current.speak(
      { temperature: 0.2, maxTokens: 20 },  // Lower temp for more deterministic choices
      (chunk) => {
        if (!stopRef.current) {
          setStreamingContent(prev => prev + chunk);
        }
      }
    );

    setStreamingContent('');

    // Extract and clean the command
    let command = result.content.trim().split('\n')[0].trim().toUpperCase();
    command = command
      .replace(/^["'>:\-\.\s]+/, '')
      .replace(/["'<\.\s]+$/, '')
      .replace(/^(I |YOU |THE |MY |LETS? |OKAY |OK |SURE |NOW |COMMAND:?\s*)/i, '')
      .trim();

    // Validate command through policy
    const validation = policy.validateCommand(command);
    if (!validation.valid) {
      console.warn('[Zork] Policy rejected:', command, '->', validation.adjusted, '|', validation.reason);
      command = validation.adjusted;
    }

    // Additional format validation
    if (command.length > 40 || command.split(' ').length > 6 || !/^[A-Z\s]+$/.test(command)) {
      console.warn('[Zork] Invalid format, using policy suggestion:', command);
      const best = policy.getBestAction();
      command = best?.command || 'LOOK';
    }

    // Update memory with the command we're about to send
    // (result tracking happens on next turn when we see the output)
    memory.updateAfterCommand(command, gameOutput, prevState);

    console.log('[Zork] Final command:', command);
    return command;
  }, [llmService, getReasoning, compressGameHistory]);

  const playTurn = useCallback(async () => {
    if (!isInitialized || stopRef.current) return false;

    try {
      // Get the last game output
      const lastGameEntry = [...gameLog].reverse().find(e => e.type === 'game');
      const gameOutput = lastGameEntry?.content || '';

      if (isLLMMode && llmService && isModelReady) {
        // Get command from LLM
        addLogEntry('thinking', 'Thinking...', currentTurn + 1);
        const command = await getLLMCommand(gameOutput);

        // Remove the "thinking" entry and add the actual command
        setGameLog(prev => prev.filter(e => e.content !== 'Thinking...'));

        if (stopRef.current) return false;

        // Send command to game
        await sendCommand(command);
      }

      return !stopRef.current;
    } catch (error) {
      console.error('Turn error:', error);
      addLogEntry('game', `Error: ${error}`, currentTurn);
      return false;
    }
  }, [isInitialized, gameLog, isLLMMode, llmService, isModelReady, currentTurn, getLLMCommand, sendCommand, addLogEntry]);

  const handleStart = useCallback(async () => {
    if (!isInitialized) {
      await initializeGame();
    }

    stopRef.current = false;
    setIsRunning(true);

    while (!stopRef.current && autoPlay) {
      const continueGame = await playTurn();
      if (!continueGame || stopRef.current) break;
      await new Promise(r => setTimeout(r, 2000)); // Delay between turns
    }

    setIsRunning(false);
  }, [isInitialized, initializeGame, playTurn, autoPlay]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
  }, []);

  const handleStep = useCallback(async () => {
    if (!isInitialized) {
      await initializeGame();
      return;
    }

    setIsRunning(true);
    await playTurn();
    setIsRunning(false);
  }, [isInitialized, initializeGame, playTurn]);

  const handleReset = useCallback(async () => {
    stopRef.current = true;
    setIsRunning(false);
    setGameLog([]);
    setCurrentTurn(0);
    setIsInitialized(false);
    setStreamingContent('');

    // Reset memory and policy
    memoryRef.current.reset();
    policyRef.current = new ZorkPolicy(memoryRef.current);

    if (zorkRef.current) {
      zorkRef.current.reset();
    }
    if (agentRef.current) {
      agentRef.current.clearHistory();
    }
    if (reasonerRef.current) {
      reasonerRef.current.clearHistory();
    }
  }, []);

  const handleManualCommand = useCallback(async () => {
    if (!manualCommand.trim() || !isInitialized) return;

    setIsRunning(true);
    await sendCommand(manualCommand.trim().toUpperCase());
    setManualCommand('');
    setIsRunning(false);
  }, [manualCommand, isInitialized, sendCommand]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #303030', background: '#1f1f1f' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5} style={{ margin: 0, color: '#52c41a' }}>
            🎮 ZORK I
          </Title>
          <Space size="middle">
            <Tag color={isInitialized ? 'green' : 'default'}>
              {isInitialized ? `Turn ${currentTurn}` : 'Ready'}
            </Tag>
            {isLLMMode && (
              <Tag color={isModelReady ? 'blue' : 'orange'}>
                {isModelReady ? 'LLM Ready' : 'Load Model'}
              </Tag>
            )}
            <Space size="small">
              <Text type="secondary">LLM:</Text>
              <Switch
                checked={isLLMMode}
                onChange={setIsLLMMode}
                checkedChildren={<RobotOutlined />}
                unCheckedChildren={<UserOutlined />}
                size="small"
              />
            </Space>
          </Space>
        </div>
      </div>

      {/* Command Reference */}
      <Collapse
        size="small"
        style={{ background: '#1a1a1a', borderRadius: 0, border: 'none', borderBottom: '1px solid #303030' }}
        items={[{
          key: 'help',
          label: <span style={{ color: '#888' }}><QuestionCircleOutlined style={{ marginRight: 8 }} />Command Reference</span>,
          children: (
            <div style={{ fontSize: 12, color: '#aaa', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <Text strong style={{ color: '#52c41a', fontSize: 11 }}>MOVEMENT</Text>
                <div style={{ color: '#888', marginTop: 4 }}>{ZORK_COMMANDS.movement.join(', ')}</div>
              </div>
              <div>
                <Text strong style={{ color: '#52c41a', fontSize: 11 }}>INFO</Text>
                <div style={{ color: '#888', marginTop: 4 }}>{ZORK_COMMANDS.info.join(', ')}</div>
              </div>
              <div>
                <Text strong style={{ color: '#52c41a', fontSize: 11 }}>ACTIONS</Text>
                <div style={{ color: '#888', marginTop: 4 }}>{ZORK_COMMANDS.actions.join(', ')}</div>
              </div>
              <div>
                <Text strong style={{ color: '#52c41a', fontSize: 11 }}>COMBINATIONS</Text>
                <div style={{ color: '#888', marginTop: 4 }}>{ZORK_COMMANDS.interact.join(', ')}</div>
              </div>
            </div>
          ),
        }]}
      />

      {/* Game Log */}
      <div
        className="message-list"
        ref={logRef}
        style={{
          flex: 1,
          fontFamily: 'monospace',
          fontSize: 14,
          background: '#0a0a0a',
        }}
      >
        {gameLog.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 8 }}>
            {entry.type === 'game' && (
              <div style={{ color: '#52c41a', whiteSpace: 'pre-wrap' }}>
                {entry.content}
              </div>
            )}
            {entry.type === 'command' && (
              <div style={{ color: '#faad14', marginTop: 8 }}>
                <Tag color="gold" style={{ marginRight: 8 }}>
                  {isLLMMode ? <RobotOutlined /> : <UserOutlined />}
                </Tag>
                &gt; {entry.content}
              </div>
            )}
            {entry.type === 'thinking' && (
              <div style={{ color: '#888', fontStyle: 'italic' }}>
                <RobotOutlined style={{ marginRight: 8 }} />
                {entry.content}
              </div>
            )}
          </div>
        ))}
        {streamingContent && (
          <div style={{ color: '#888', fontStyle: 'italic' }}>
            <RobotOutlined style={{ marginRight: 8 }} />
            {streamingContent}
            <span className="cursor">▊</span>
          </div>
        )}
      </div>

      {/* Manual Input (when not in LLM mode) */}
      {!isLLMMode && isInitialized && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #303030', background: '#1a1a1a' }}>
          <Input.Search
            value={manualCommand}
            onChange={(e) => setManualCommand(e.target.value.toUpperCase())}
            onSearch={handleManualCommand}
            placeholder="Enter command (e.g., GO NORTH, TAKE LAMP)"
            enterButton="Send"
            disabled={isRunning}
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: 16, borderTop: '1px solid #303030', background: '#1f1f1f' }}>
        <Space>
          {!isRunning ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              disabled={isInitialized && isLLMMode && !isModelReady}
            >
              {isInitialized ? 'Continue' : 'Start Game'}
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
            disabled={isRunning || (isInitialized && isLLMMode && !isModelReady)}
          >
            {isInitialized ? 'Step' : 'Initialize'}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={isRunning}
          >
            Reset
          </Button>
          {isLLMMode && (
            <Space style={{ marginLeft: 16 }}>
              <Text type="secondary">Auto-play:</Text>
              <Switch
                checked={autoPlay}
                onChange={setAutoPlay}
                disabled={isRunning}
              />
            </Space>
          )}
        </Space>
        {isLLMMode && !isModelReady && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Load a model to enable LLM play
          </Text>
        )}
      </div>
    </div>
  );
};
