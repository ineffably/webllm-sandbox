import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Layout, Button, Tabs } from 'antd';
import { SettingOutlined, ExperimentOutlined, MessageOutlined, TeamOutlined } from '@ant-design/icons';
import { ChatPanel } from './components/chat/ChatPanel';
import { InputBar } from './components/chat/InputBar';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import { StatsPanel } from './components/stats/StatsPanel';
import { GroupChat } from './components/groupchat/GroupChat';
import { LLMService, AVAILABLE_MODELS, type ModelKey } from './services/LLMService';
import { DEFAULT_SYSTEM_PROMPT } from './components/context/ContextEditor';
import { logClient } from './services/LogClient';
import type { ChatMessage, MessageStats } from './types';

const { Header, Content } = Layout;

const STORAGE_KEYS = {
  MODEL: 'webllm-sandbox:model',
  SYSTEM_PROMPT: 'webllm-sandbox:system-prompt',
  TEMPERATURE: 'webllm-sandbox:temperature',
  MAX_TOKENS: 'webllm-sandbox:max-tokens',
};

function loadStoredModel(): ModelKey | null {
  const stored = localStorage.getItem(STORAGE_KEYS.MODEL);
  if (stored && stored in AVAILABLE_MODELS) {
    return stored as ModelKey;
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

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelKey | null>(null);
  const [loadingModel, setLoadingModel] = useState<ModelKey | null>(loadStoredModel);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(loadStoredSystemPrompt);
  const [lastStats, setLastStats] = useState<MessageStats | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [temperature, setTemperature] = useState(() => loadStoredNumber(STORAGE_KEYS.TEMPERATURE, 0.7));
  const [maxTokens, setMaxTokens] = useState(() => loadStoredNumber(STORAGE_KEYS.MAX_TOKENS, 2048));

  const llmServiceRef = useRef<LLMService | null>(null);

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

  const handleModelChange = useCallback(async (modelKey: ModelKey) => {
    setLoadingModel(modelKey);
    setIsModelLoading(true);
    setLoadingProgress(0);
    logClient.info('model', `Loading model: ${modelKey}`);

    try {
      const service = new LLMService(
        (progress) => setLoadingProgress(progress),
        modelKey
      );
      await service.initialize();
      llmServiceRef.current = service;
      setCurrentModel(modelKey);
      localStorage.setItem(STORAGE_KEYS.MODEL, modelKey);
      logClient.info('model', `Model loaded: ${modelKey}`);
    } catch (error) {
      console.error('Failed to load model:', error);
      logClient.error('model', `Failed to load model: ${modelKey}`, { error: String(error) });
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

    setMessages((prev) => [...prev, userMessage]);
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

      setMessages((prev) => [...prev, assistantMessage]);
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
  }, [systemPrompt, temperature, maxTokens, isGenerating]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setLastStats(null);
    llmServiceRef.current?.clearHistory();
    logClient.info('chat', 'Conversation cleared');
  }, []);

  const isReady = currentModel !== null && !isModelLoading;

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div className="header-left">
          <ExperimentOutlined style={{ marginRight: 8 }} />
          <span>WebLLM Sandbox</span>
        </div>
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={() => setDrawerOpen(true)}
          style={{ color: '#fff' }}
        >
          Settings
        </Button>
      </Header>
      <Content className="app-content">
        <Tabs
          defaultActiveKey="chat"
          style={{ height: '100%' }}
          className="chat-tabs"
          items={[
            {
              key: 'chat',
              label: <span><MessageOutlined /> Chat</span>,
              children: (
                <div className="chat-container">
                  <ChatPanel
                    messages={messages}
                    streamingContent={isGenerating ? streamingContent : undefined}
                  />
                  <StatsPanel
                    lastStats={lastStats}
                    totalMessages={messages.length}
                  />
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
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
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
