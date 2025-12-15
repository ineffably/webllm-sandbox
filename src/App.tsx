import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Layout, Button, Tabs, Tooltip, Select, Space } from 'antd';
import { SettingOutlined, ExperimentOutlined, MessageOutlined, TeamOutlined, TrophyOutlined, RocketOutlined, ThunderboltOutlined, PlusOutlined, DeleteOutlined, GithubOutlined } from '@ant-design/icons';
import { ChatPanel } from './components/chat/ChatPanel';
import { InputBar } from './components/chat/InputBar';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import { StatsPanel } from './components/stats/StatsPanel';
import { GroupChat } from './components/groupchat/GroupChat';
import { ArenaChat } from './components/arena/ArenaChat';
import { ZorkPlayer } from './components/zork/ZorkPlayer';
import { LLMService, AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById, getRawModelRecord, type LoadProgress } from './services/LLMService';
import { ContextEditor, DEFAULT_SYSTEM_PROMPT } from './components/context/ContextEditor';
import { logClient } from './services/LogClient';
import type { ChatMessage, ChatSession, MessageStats } from './types';

const { Header, Content } = Layout;

const STORAGE_KEYS = {
  MODEL: 'webllm-sandbox:model',
  SYSTEM_PROMPT: 'webllm-sandbox:system-prompt',
  TEMPERATURE: 'webllm-sandbox:temperature',
  MAX_TOKENS: 'webllm-sandbox:max-tokens',
  ACTIVE_TAB: 'webllm-sandbox:active-tab',
  SESSIONS: 'webllm-sandbox:sessions',
  CURRENT_SESSION: 'webllm-sandbox:current-session',
};

function loadStoredModel(): string | null {
  const stored = localStorage.getItem(STORAGE_KEYS.MODEL);
  if (stored && AVAILABLE_MODELS.some(m => m.id === stored)) {
    return stored;
  }
  return null;
}

function loadStoredSystemPrompt(): string {
  return localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || DEFAULT_SYSTEM_PROMPT;
}

function loadStoredNumber(key: string, defaultVal: number): number {
  const stored = localStorage.getItem(key);
  if (stored) {
    const num = parseFloat(stored);
    if (!isNaN(num)) return num;
  }
  return defaultVal;
}

const ADJECTIVES = [
  'Cosmic', 'Quantum', 'Spicy', 'Wobbly', 'Mystic', 'Crispy', 'Turbo',
  'Sneaky', 'Bouncy', 'Grumpy', 'Sleepy', 'Zesty', 'Chunky', 'Sparkly', 'Dizzy',
  'Funky', 'Jolly', 'Nerdy', 'Sassy', 'Wonky', 'Zippy', 'Goofy', 'Peppy',
];

const NOUNS = [
  'Penguin', 'Waffle', 'Narwhal', 'Taco', 'Platypus', 'Noodle', 'Cactus', 
  'Llama', 'Pretzel', 'Goblin', 'Wizard', 'Potato', 'Toaster',
  'Nugget', 'Badger', 'Walrus', 'Pancake', 'Donut', 'Yeti', 'Kraken', 'Wombat',
];

function generateSessionName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

function createNewSession(): ChatSession {
  const now = Date.now();
  return {
    id: `session-${now}`,
    name: generateSessionName(),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function loadStoredSessions(): { sessions: ChatSession[]; currentId: string } {
  try {
    const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const storedCurrentId = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);

    if (storedSessions) {
      let sessions: ChatSession[] = JSON.parse(storedSessions);
      if (sessions.length > 0) {
        // Migrate old "New Chat" names to fun names
        sessions = sessions.map(s =>
          s.name === 'New Chat' ? { ...s, name: generateSessionName() } : s
        );
        const currentId = storedCurrentId && sessions.some(s => s.id === storedCurrentId)
          ? storedCurrentId
          : sessions[0].id;
        return { sessions, currentId };
      }
    }
  } catch (e) {
    console.warn('Failed to load stored sessions:', e);
  }

  // Create initial session if none exist
  const initial = createNewSession();
  return { sessions: [initial], currentId: initial.id };
}

function getSessionName(session: ChatSession): string {
  return session.name;
}

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadStoredSessions().sessions);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => loadStoredSessions().currentId);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(loadStoredModel);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<LoadProgress>({ progress: 0, text: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(loadStoredSystemPrompt);
  const [lastStats, setLastStats] = useState<MessageStats | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [temperature, setTemperature] = useState(() => loadStoredNumber(STORAGE_KEYS.TEMPERATURE, 0.7));
  const [maxTokens, setMaxTokens] = useState(() => loadStoredNumber(STORAGE_KEYS.MAX_TOKENS, 2048));
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'chat');

  const llmServiceRef = useRef<LLMService | null>(null);

  // Derive current session and messages
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  // Session management functions
  const updateCurrentSessionMessages = useCallback((newMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s =>
      s.id === currentSessionId
        ? { ...s, messages: newMessages, updatedAt: Date.now() }
        : s
    ));
  }, [currentSessionId]);

  const handleNewSession = useCallback(() => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setLastStats(null);
    llmServiceRef.current?.clearHistory();
    logClient.info('session', 'New session created');
  }, []);

  const handleSwitchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setLastStats(null);
    llmServiceRef.current?.clearHistory();
    logClient.info('session', `Switched to session: ${sessionId}`);
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const isLastSession = sessions.length === 1;
    const newSession = isLastSession ? createNewSession() : null;

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      // If deleting last session, add a fresh one
      if (filtered.length === 0 && newSession) {
        return [newSession];
      }
      return filtered;
    });

    // Switch to new session or first remaining
    if (sessionId === currentSessionId) {
      if (newSession) {
        setCurrentSessionId(newSession.id);
      } else {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          setCurrentSessionId(remaining[0].id);
        }
      }
    }

    setLastStats(null);
    llmServiceRef.current?.clearHistory();
    logClient.info('session', `Deleted session: ${sessionId}`);
  }, [currentSessionId, sessions]);

  // Connect to log server on mount
  useEffect(() => {
    logClient.connect();
    logClient.info('app', 'WebLLM Sandbox started');
    return () => {
      logClient.disconnect();
    };
  }, []);

  // Auto-load stored model on mount
  useEffect(() => {
    if (autoLoadTriggered) return;
    const storedModel = loadStoredModel();
    if (storedModel) {
      setAutoLoadTriggered(true);
      logClient.info('app', `Auto-loading stored model: ${storedModel}`);
      handleModelChange(storedModel);
    }
  }, [autoLoadTriggered]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEMPERATURE, String(temperature));
  }, [temperature]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MAX_TOKENS, String(maxTokens));
  }, [maxTokens]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, currentSessionId);
  }, [currentSessionId]);

  const handleModelChange = useCallback(async (modelId: string) => {
    setLoadingModel(modelId);
    setIsModelLoading(true);
    setLoadingProgress({ progress: 0, text: 'Starting...' });
    logClient.info('model', `Loading model: ${modelId}`);

    try {
      const service = new LLMService(
        (progress) => setLoadingProgress(progress),
        modelId
      );
      await service.initialize();
      llmServiceRef.current = service;
      setCurrentModel(modelId);
      localStorage.setItem(STORAGE_KEYS.MODEL, modelId);
      logClient.info('model', `Model loaded: ${modelId}`);
    } catch (error) {
      console.error('Failed to load model:', error);
      logClient.error('model', `Failed to load model: ${modelId}`, { error: String(error) });
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  const handleSend = useCallback(async (message: string) => {
    if (!llmServiceRef.current || isGenerating) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    updateCurrentSessionMessages([...messages, userMessage]);
    setIsGenerating(true);
    setStreamingContent('');

    logClient.info('chat', 'User message', { message });

    try {
      const result = await llmServiceRef.current.chat(
        systemPrompt,
        message,
        { temperature, maxTokens },
        (chunk) => {
          setStreamingContent((prev) => prev + chunk);
        }
      );

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: Date.now(),
        stats: result.stats,
        rawExchange: result.rawExchange,
      };

      updateCurrentSessionMessages([...messages, userMessage, assistantMessage]);
      setLastStats(result.stats);
      setStreamingContent('');

      logClient.info('chat', 'Assistant response', {
        response: result.response,
        stats: result.stats,
      });
    } catch (error) {
      console.error('Chat error:', error);
      logClient.error('chat', 'Chat failed', { error: String(error) });
    } finally {
      setIsGenerating(false);
    }
  }, [systemPrompt, temperature, maxTokens, isGenerating, messages, updateCurrentSessionMessages]);

  const handleClear = useCallback(() => {
    updateCurrentSessionMessages([]);
    setLastStats(null);
    llmServiceRef.current?.clearHistory();
    logClient.info('chat', 'Conversation cleared');
  }, [updateCurrentSessionMessages]);

  const handleCancelLoad = useCallback(() => {
    setIsModelLoading(false);
    setLoadingModel(null);
    setLoadingProgress({ progress: 0, text: '' });
    llmServiceRef.current = null;
    logClient.info('model', 'Model loading cancelled');
  }, []);

  const isReady = currentModel !== null && !isModelLoading;

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div className="header-left">
          <ExperimentOutlined style={{ marginRight: 8 }} />
          <span>WebLLM Sandbox</span>
          <Tooltip title="View on GitHub">
            <a
              href="https://github.com/ineffably/webllm-sandbox"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#fff', marginLeft: 12, fontSize: 18 }}
            >
              <GithubOutlined />
            </a>
          </Tooltip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(loadingModel || currentModel) && (() => {
            const modelId = loadingModel || currentModel || '';
            const rawRecord = getRawModelRecord(modelId);
            const modelInfo = getModelById(modelId);
            const contextSize = modelInfo?.contextSize;
            const tooltipContent = rawRecord ? (
              <div style={{ fontSize: 12 }}>
                <div><strong>ID:</strong> {rawRecord.model_id}</div>
                <div><strong>VRAM:</strong> {rawRecord.vram_required_MB ? `${rawRecord.vram_required_MB} MB` : 'Unknown'}</div>
                {contextSize && <div><strong>Context:</strong> {contextSize >= 1000 ? `${Math.round(contextSize / 1000)}K` : contextSize} tokens</div>}
                {rawRecord.low_resource_required && <div><strong>Lightweight</strong> <ThunderboltOutlined style={{ color: '#52c41a' }} /></div>}
                {rawRecord.required_features?.length && (
                  <div><strong>Features:</strong> {rawRecord.required_features.join(', ')}</div>
                )}
              </div>
            ) : modelId;
            // Format progress display
            const progressDisplay = isModelLoading ? (() => {
              const pct = Math.round(loadingProgress.progress * 100);
              if (loadingProgress.loadedMB) {
                const loaded = loadingProgress.loadedMB.toFixed(0);
                const speed = loadingProgress.speedMBps ? ` ${loadingProgress.speedMBps.toFixed(1)}MB/s` : '';
                return `[${pct}% ${loaded}MB${speed}] `;
              }
              return `[${pct}%] `;
            })() : '';

            return (
              <Tooltip title={tooltipContent} placement="bottomRight">
                <span style={{ color: isReady ? '#52c41a' : '#faad14', fontSize: 13, cursor: 'help' }}>
                  {progressDisplay}
                  {modelInfo?.name || modelId}
                </span>
              </Tooltip>
            );
          })()}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isReady ? '#52c41a' : isModelLoading ? '#faad14' : '#ff4d4f',
              boxShadow: isReady ? '0 0 6px #52c41a' : isModelLoading ? '0 0 6px #faad14' : 'none',
            }}
            title={isReady ? 'Model loaded' : isModelLoading ? 'Loading model...' : 'No model loaded'}
          />
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ color: '#fff' }}
          >
            Settings
          </Button>
        </div>
      </Header>
      <Content className="app-content">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ height: '100%' }}
          className="chat-tabs"
          items={[
            {
              key: 'chat',
              label: <span><MessageOutlined /> Chat</span>,
              children: (
                <div className="chat-container">
                  <div className="session-bar">
                    <Space>
                      <span style={{ color: '#888', fontSize: 12 }}>Session:</span>
                      <Select
                        size="small"
                        value={currentSessionId}
                        onChange={handleSwitchSession}
                        style={{ width: 200 }}
                        options={sessions.map(s => ({
                          value: s.id,
                          label: getSessionName(s),
                        }))}
                      />
                      <Tooltip title="New session">
                        <Button
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={handleNewSession}
                        />
                      </Tooltip>
                      <Tooltip title="Delete session">
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteSession(currentSessionId)}
                        />
                      </Tooltip>
                    </Space>
                    <span style={{ color: '#666', fontSize: 12 }}>
                      {messages.length} message{messages.length !== 1 ? 's' : ''} · {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ContextEditor
                    systemPrompt={systemPrompt}
                    onSystemPromptChange={setSystemPrompt}
                    disabled={isGenerating}
                  />
                  <ChatPanel
                    messages={messages}
                    streamingContent={isGenerating ? streamingContent : undefined}
                  />
                  <StatsPanel lastStats={lastStats} />
                  <InputBar
                    onSend={handleSend}
                    onClear={handleClear}
                    disabled={!isReady}
                    isGenerating={isGenerating}
                  />
                </div>
              ),
            },
            {
              key: 'group',
              label: <span><TeamOutlined /> Group Chat</span>,
              children: (
                <GroupChat
                  llmService={llmServiceRef.current}
                  temperature={temperature}
                  maxTokens={maxTokens}
                  isModelReady={isReady}
                />
              ),
            },
            {
              key: 'arena',
              label: <span><TrophyOutlined /> Arena</span>,
              children: (
                <ArenaChat
                  llmService={llmServiceRef.current}
                  temperature={temperature}
                  maxTokens={maxTokens}
                  isModelReady={isReady}
                />
              ),
            },
            {
              key: 'zork',
              label: <span><RocketOutlined /> Zork</span>,
              children: (
                <ZorkPlayer
                  llmService={llmServiceRef.current}
                  temperature={temperature}
                  maxTokens={maxTokens}
                  isModelReady={isReady}
                />
              ),
            },
          ]}
        />
      </Content>
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentModel={loadingModel || currentModel}
        isModelLoading={isModelLoading}
        loadingProgress={loadingProgress}
        onModelChange={handleModelChange}
        onCancelLoad={handleCancelLoad}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
        disabled={isGenerating}
      />
    </Layout>
  );
};

export default App;
