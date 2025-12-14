export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  stats?: MessageStats;
  rawExchange?: RawExchange;
}

export interface RawExchange {
  request: {
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    max_tokens: number;
  };
  response: {
    content: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

export interface MessageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  tokensPerSecond: number;
}

export interface ChatSession {
  id: string;
  modelId: string;
  createdAt: number;
  contexts: ContextTemplate[];
  messages: ChatMessage[];
}

export interface ContextTemplate {
  id: string;
  name: string;
  type: 'system' | 'prefix' | 'suffix';
  content: string;
  variables?: Record<string, string>;
}

export interface ModelInfo {
  key: string;
  id: string;
  name: string;
  size: string;
}

export interface AppState {
  currentModel: string | null;
  isModelLoading: boolean;
  loadingProgress: number;
  messages: ChatMessage[];
  systemPrompt: string;
  isGenerating: boolean;
}
