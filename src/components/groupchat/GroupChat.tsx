import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Button, Input, Space, Typography, Tag, Popover, Form } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseOutlined, StepForwardOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { Agent, type AgentConfig } from '../../services/Agent';
import type { LLMService } from '../../services/LLMService';
import type { RawExchange } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;

interface GroupMessage {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
  color: string;
  rawExchange?: RawExchange;
  debugContext?: { systemPrompt: string; messages: Array<{ role: string; content: string }> };
}

interface GroupChatProps {
  llmService: LLMService | null;
  temperature: number;
  maxTokens: number;
  isModelReady: boolean;
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2'];

const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'alice',
    name: 'Alice',
    persona: 'You are Alice, a curious and optimistic scientist. You ask thoughtful questions and love exploring ideas. Keep responses to 2-3 sentences.',
    color: COLORS[0],
  },
  {
    id: 'bob',
    name: 'Bob',
    persona: 'You are Bob, a pragmatic engineer who focuses on practical solutions. You sometimes play devil\'s advocate. Keep responses to 2-3 sentences.',
    color: COLORS[1],
  },
];

export const GroupChat: React.FC<GroupChatProps> = ({
  llmService,
  temperature,
  maxTokens,
  isModelReady,
}) => {
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(DEFAULT_AGENT_CONFIGS);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [topic, setTopic] = useState('Discuss the future of artificial intelligence');
  const [showJson, setShowJson] = useState(false);
  const [maxTurns, setMaxTurns] = useState(10);

  const agentsRef = useRef<Map<string, Agent>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const turnRef = useRef(0);

  // Sync agents with configs
  useEffect(() => {
    const newAgents = new Map<string, Agent>();

    agentConfigs.forEach(config => {
      // Reuse existing agent if same ID, otherwise create new
      const existing = agentsRef.current.get(config.id);
      if (existing && existing.name === config.name && existing.persona === config.persona) {
        newAgents.set(config.id, existing);
      } else {
        const agent = new Agent(config);
        if (llmService) {
          agent.attachLLM(llmService);
        }
        newAgents.set(config.id, agent);
      }
    });

    agentsRef.current = newAgents;
  }, [agentConfigs, llmService]);

  // Attach LLM to all agents when service changes
  useEffect(() => {
    agentsRef.current.forEach(agent => {
      if (llmService) {
        agent.attachLLM(llmService);
      } else {
        agent.detachLLM();
      }
    });
  }, [llmService]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const getAgentOrder = useCallback(() => {
    return agentConfigs.map(c => agentsRef.current.get(c.id)!).filter(Boolean);
  }, [agentConfigs]);

  const runTurn = useCallback(async () => {
    if (!llmService || !isModelReady || stopRef.current) return false;

    const agents = getAgentOrder();
    const currentAgent = agents[turnRef.current % agents.length];
    const config = agentConfigs.find(c => c.id === currentAgent.id)!;

    // For first message, give opening context
    if (messages.length === 0) {
      const otherNames = agents.filter(a => a.id !== currentAgent.id).map(a => a.name).join(', ');
      currentAgent.receiveMessage(
        `Start a conversation about: "${topic}". You are talking with ${otherNames}.`,
        'System'
      );
    }

    setStreamingContent('');

    // Capture debug context before speaking
    const debugContext = currentAgent.getDebugContext();

    try {
      const result = await currentAgent.speak(
        { temperature, maxTokens },
        (chunk) => {
          if (stopRef.current) return; // Stop streaming if stopped
          setStreamingContent((prev) => prev + chunk);
        }
      );

      // Check if stopped during generation
      if (stopRef.current) {
        setStreamingContent('');
        return false;
      }

      const newMessage: GroupMessage = {
        id: `msg-${Date.now()}`,
        agentId: currentAgent.id,
        agentName: currentAgent.name,
        content: result.content,
        timestamp: Date.now(),
        color: config.color || COLORS[0],
        rawExchange: result.rawExchange,
        debugContext,
      };

      setMessages((prev) => [...prev, newMessage]);
      setStreamingContent('');

      // Broadcast this message to all OTHER agents as a "user" message
      agents.forEach(agent => {
        if (agent.id !== currentAgent.id) {
          agent.receiveMessage(result.content, currentAgent.name);
        }
      });

      turnRef.current += 1;
      return true;
    } catch (error) {
      console.error('Group chat error:', error);
      return false;
    }
  }, [llmService, isModelReady, agentConfigs, getAgentOrder, messages.length, topic, temperature, maxTokens]);

  const handleStart = useCallback(async () => {
    stopRef.current = false;
    setIsRunning(true);
    let turns = 0;

    while (!stopRef.current && turns < maxTurns) {
      const success = await runTurn();
      if (!success || stopRef.current) break;
      turns++;
      await new Promise(r => setTimeout(r, 500));
    }

    setIsRunning(false);
  }, [runTurn, maxTurns]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
  }, []);

  const handleStep = useCallback(async () => {
    setIsRunning(true);
    await runTurn();
    setIsRunning(false);
  }, [runTurn]);

  const handleClear = useCallback(() => {
    setMessages([]);
    turnRef.current = 0;
    setStreamingContent('');
    // Clear all agent histories
    agentsRef.current.forEach(agent => agent.clearHistory());
  }, []);

  const updateAgentConfig = (id: string, updates: Partial<AgentConfig>) => {
    setAgentConfigs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addAgent = () => {
    const newId = `agent-${Date.now()}`;
    const colorIndex = agentConfigs.length % COLORS.length;
    setAgentConfigs(prev => [...prev, {
      id: newId,
      name: `Agent ${agentConfigs.length + 1}`,
      persona: 'You are a helpful participant in a group discussion. Keep responses to 2-3 sentences.',
      color: COLORS[colorIndex],
    }]);
  };

  const removeAgent = (id: string) => {
    if (agentConfigs.length > 2) {
      setAgentConfigs(prev => prev.filter(c => c.id !== id));
      agentsRef.current.delete(id);
    }
  };

  const agents = getAgentOrder();
  const currentAgent = agents[turnRef.current % agents.length];
  const currentConfig = currentAgent ? agentConfigs.find(c => c.id === currentAgent.id) : null;

  const conversationJson = {
    topic,
    agents: agentConfigs.map(c => ({ id: c.id, name: c.name, persona: c.persona })),
    messages: messages.map(m => ({
      agent: m.agentName,
      content: m.content,
      rawExchange: m.rawExchange,
      debugContext: m.debugContext,
    })),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Topic & Agents */}
      <div style={{ padding: 16, borderBottom: '1px solid #303030', background: '#1f1f1f' }}>
        <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Topic</Text>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should they discuss?"
              disabled={isRunning}
            />
          </div>
          <div style={{ width: 100 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Max Turns</Text>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value) || 10)}
              disabled={isRunning}
            />
          </div>
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Agents</Text>
          <Space wrap>
            {agentConfigs.map((config) => (
              <Popover
                key={config.id}
                trigger="click"
                placement="bottom"
                content={
                  <div style={{ width: 300 }}>
                    <Form layout="vertical" size="small">
                      <Form.Item label="Name">
                        <Input
                          value={config.name}
                          onChange={(e) => updateAgentConfig(config.id, { name: e.target.value })}
                        />
                      </Form.Item>
                      <Form.Item label="Persona">
                        <TextArea
                          value={config.persona}
                          onChange={(e) => updateAgentConfig(config.id, { persona: e.target.value })}
                          rows={4}
                        />
                      </Form.Item>
                      {agentConfigs.length > 2 && (
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => removeAgent(config.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </Form>
                  </div>
                }
              >
                <Tag
                  color={config.color}
                  style={{ cursor: 'pointer' }}
                  icon={<EditOutlined />}
                >
                  {config.name}
                </Tag>
              </Popover>
            ))}
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={addAgent}
              disabled={isRunning}
            >
              Add
            </Button>
          </Space>
        </div>
      </div>

      {/* Messages */}
      <div className="message-list" ref={listRef} style={{ flex: 1 }}>
        {messages.map((msg) => (
          <div key={msg.id} className="message-bubble assistant">
            <Card size="small" style={{ background: '#2a2a2a', border: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Tag color={msg.color} style={{ marginTop: 2 }}>{msg.agentName}</Tag>
                <Text style={{ color: '#fff', whiteSpace: 'pre-wrap', flex: 1 }}>
                  {msg.content}
                </Text>
              </div>
            </Card>
          </div>
        ))}
        {streamingContent && currentConfig && (
          <div className="message-bubble assistant">
            <Card size="small" style={{ background: '#2a2a2a', border: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Tag color={currentConfig.color} style={{ marginTop: 2 }}>
                  {currentConfig.name}
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
              disabled={!isModelReady}
            >
              Start
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
            disabled={!isModelReady || isRunning}
          >
            Step
          </Button>
          <Button onClick={handleClear} disabled={isRunning}>
            Clear
          </Button>
          <Button onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide' : 'Show'} JSON
          </Button>
        </Space>
        {!isModelReady && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Load a model to start the conversation
          </Text>
        )}
      </div>

      {/* JSON Viewer */}
      {showJson && (
        <div style={{ height: 300, borderTop: '1px solid #303030' }}>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={JSON.stringify(conversationJson, null, 2)}
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
