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

const ZORK_PLAYER_PROMPT = `You are an explorer trapped in a mysterious realm. Your goal: discover treasures and find the exit in the fewest moves possible.

COMMANDS:
- Travel to another location: N, S, E, W, UP, DOWN (single letter directions)
- See: LOOK, INVENTORY, EXAMINE [object]
- Act: TAKE [x], OPEN [x], READ [x], MOVE (object not self) [x]

BE CURIOUS: anything new like anything the look response points out or is peculiar
Common Cycle: LOOK, (read description to find clues), LOOK {clue}, repeat and travel.
New to an area? Say: "LOOK" to get a description of the area
ANYTHING mentioned in the look description could be a clue. Use known words first.
GOOD: N, OPEN MAILBOX, EXAMINE HOUSE, TAKE LEAFLET, MOVE RUG
BAD: LOOK UP, GO WEST, MOVE NORTH (see travel)

STRATEGY:
- Explore: try all directions (N, S, E, W)
- EXAMINE and OPEN interesting objects
- TAKE useful items

Output ONE command:`;

const REASONER_PROMPT = `You are a guide helping an explorer. Give ONE brief tip (under 15 words).

PRIORITIES:
1. New area entered? Say: "LOOK" to get a description of the area
2. BE CURIOUS anything new like anything the look response points out or is peculiar
3. Stuck in loop? Suggest a different direction (N, S, E, W)
4. Command failed? Suggest alternative
5. Doing well? Say "Good."

Respond with ONLY the tip.`;

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
  const recentCommandsRef = useRef<string[]>([]);
  const failedCommandsRef = useRef<Set<string>>(new Set());
  const gameHistoryRef = useRef<Array<{ cmd: string; result: string }>>([]);
  const lastLocationRef = useRef<string>('');

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

  // Get advice from the reasoner
  const getReasoning = useCallback(async (gameOutput: string): Promise<string> => {
    if (!reasonerRef.current || !llmService) return '';

    const recentCmds = recentCommandsRef.current.slice(-5).join(', ') || 'none yet';
    const history = gameHistoryRef.current.slice(-3)
      .map(h => `> ${h.cmd}\n${h.result.slice(0, 100)}...`)
      .join('\n\n');

    const context = `Recent commands: ${recentCmds}

${history ? `History:\n${history}\n\n` : ''}Current output:
${gameOutput.slice(0, 300)}`;

    reasonerRef.current.clearHistory();
    reasonerRef.current.receiveMessage(context, 'Game');

    const result = await reasonerRef.current.speak(
      { temperature: 0.2, maxTokens: 30 },
      () => {} // No streaming for reasoner
    );

    return result.content.trim();
  }, [llmService]);

  const getLLMCommand = useCallback(async (gameOutput: string): Promise<string> => {
    if (!agentRef.current || !llmService) {
      throw new Error('LLM not available');
    }

    // Check if last command failed
    const failurePatterns = /don't know|can't|cannot|won't|isn't|aren't|impossible|securely|already|nothing|no verb/i;
    const lastCmd = recentCommandsRef.current[recentCommandsRef.current.length - 1];
    if (lastCmd && failurePatterns.test(gameOutput)) {
      failedCommandsRef.current.add(lastCmd);
      console.log('[Zork] Marked as failed:', lastCmd);
    }

    // Track game history
    if (lastCmd) {
      gameHistoryRef.current.push({ cmd: lastCmd, result: gameOutput });
      if (gameHistoryRef.current.length > 10) {
        gameHistoryRef.current.shift();
      }
    }

    // Detect new location (first line of output is usually location name)
    const firstLine = gameOutput.trim().split('\n')[0];
    const isNewLocation = firstLine !== lastLocationRef.current &&
                          !firstLine.includes('>') &&
                          !failurePatterns.test(firstLine) &&
                          firstLine.length < 50;
    if (isNewLocation) {
      lastLocationRef.current = firstLine;
      console.log('[Zork] New location:', firstLine);
    }

    // Get advice from reasoner (only if we have some history)
    let advice = '';
    if (isNewLocation && lastCmd !== 'LOOK') {
      // Strong suggestion to LOOK in new areas
      advice = 'New area! Use LOOK to see what is here.';
      console.log('[Zork] Auto-advice:', advice);
    } else if (recentCommandsRef.current.length > 0) {
      advice = await getReasoning(gameOutput);
      if (advice && advice.toLowerCase() !== 'good.') {
        console.log('[Zork] Reasoner advice:', advice);
      }
    }

    // Build context with advice and failed commands
    const failedInfo = failedCommandsRef.current.size > 0
      ? `\nFailed commands: ${[...failedCommandsRef.current].slice(-5).join(', ')}`
      : '';

    const adviceInfo = advice && advice.toLowerCase() !== 'good.'
      ? `\n[Guide]: ${advice}`
      : '';

    agentRef.current.receiveMessage(
      `Game:\n${gameOutput}${failedInfo}${adviceInfo}\n\nYour command:`,
      'Game'
    );

    setStreamingContent('');

    const result = await agentRef.current.speak(
      { temperature: 0.3, maxTokens: 20 },  // Slightly higher temp for variety
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
      .replace(/^(I |YOU |THE |MY |LETS? |OKAY |OK |SURE |NOW )/i, '')
      .trim();

    // Block known bad patterns
    const badPatterns = /^(LOOK\s+(UP|DOWN|NORTH|SOUTH|EAST|WEST|N|S|E|W)|GO\s|WEST OF|NORTH OF|SOUTH OF|EAST OF)/i;
    if (badPatterns.test(command)) {
      console.warn('[Zork] Bad pattern detected:', command);
      command = 'OPEN MAILBOX';  // Default to something useful at start
    }

    // Validate command format
    if (command.length > 30 || command.split(' ').length > 5 || !/^[A-Z\s]+$/.test(command)) {
      console.warn('[Zork] Invalid command, trying fallback:', command);
      command = 'LOOK';
    }

    // Check if we're repeating the last command
    if (command === lastCmd) {
      console.warn('[Zork] Repeated command detected:', command);
      const fallbacks = ['N', 'S', 'E', 'W', 'OPEN MAILBOX', 'EXAMINE MAILBOX', 'INVENTORY', 'LOOK'];
      const unused = fallbacks.find(f => f !== lastCmd && !failedCommandsRef.current.has(f));
      if (unused) {
        command = unused;
      }
    }

    // If command was recently failed, try alternatives
    if (failedCommandsRef.current.has(command)) {
      const fallbacks = ['N', 'S', 'E', 'W', 'OPEN MAILBOX', 'EXAMINE MAILBOX', 'INVENTORY', 'LOOK'];
      const unused = fallbacks.find(f => !failedCommandsRef.current.has(f) && !recentCommandsRef.current.includes(f));
      if (unused) {
        console.log('[Zork] Avoiding failed command, using:', unused);
        command = unused;
      }
    }

    // Track recent commands
    recentCommandsRef.current.push(command);
    if (recentCommandsRef.current.length > 10) {
      recentCommandsRef.current.shift();
    }

    return command;
  }, [llmService]);

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

    // Clear command tracking
    recentCommandsRef.current = [];
    failedCommandsRef.current.clear();
    gameHistoryRef.current = [];
    lastLocationRef.current = '';

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
