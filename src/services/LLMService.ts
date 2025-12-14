import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import type { MessageStats, RawExchange } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const AVAILABLE_MODELS = {
  'smol-135m': {
    id: 'SmolLM2-135M-Instruct-q0f16-MLC',
    name: 'SmolLM2 135M',
    size: '~360MB',
  },
  'smol-360m': {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M',
    size: '~376MB',
  },
  'qwen-0.5b': {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    size: '~945MB',
  },
  'phi-3.5-mini': {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini',
    size: '~500MB',
  },
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;

export interface ChatResult {
  response: string;
  stats: MessageStats;
  rawExchange: RawExchange;
}

export class LLMService {
  private engine: WebWorkerMLCEngine | null = null;
  private onProgress: (progress: number) => void;
  private conversationHistory: ChatMessage[] = [];
  private currentModelKey: ModelKey;

  constructor(
    onProgress?: (progress: number) => void,
    modelKey: ModelKey = 'smol-135m'
  ) {
    this.onProgress = onProgress || (() => {});
    this.currentModelKey = modelKey;
  }

  async initialize(): Promise<boolean> {
    try {
      const worker = new Worker(
        new URL('../llm.worker.ts', import.meta.url),
        { type: 'module' }
      );

      const modelId = AVAILABLE_MODELS[this.currentModelKey].id;

      this.engine = await CreateWebWorkerMLCEngine(
        worker,
        modelId,
        {
          initProgressCallback: (progress) => {
            this.onProgress(progress.progress);
          },
        }
      );

      console.log(`LLM initialized: ${modelId}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
    }
  }

  async switchModel(modelKey: ModelKey): Promise<void> {
    if (modelKey === this.currentModelKey && this.engine) {
      return;
    }

    this.currentModelKey = modelKey;
    this.clearHistory();

    if (this.engine) {
      const modelId = AVAILABLE_MODELS[modelKey].id;
      await this.engine.reload(modelId);
    }
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number; maxTokens?: number } = {},
    onChunk?: (chunk: string) => void
  ): Promise<ChatResult> {
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 2048;
    if (!this.engine) {
      throw new Error('LLM not initialized');
    }

    const startTime = performance.now();

    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory.slice(-10),
    ];

    try {
      const response = await this.engine.chat.completions.create({
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullResponse = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullResponse += delta;
        if (onChunk) {
          onChunk(delta);
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      const durationMs = performance.now() - startTime;

      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse,
      });

      const stats: MessageStats = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        durationMs,
        tokensPerSecond: usage.completion_tokens / (durationMs / 1000),
      };

      const rawExchange: RawExchange = {
        request: {
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens: maxTokens,
        },
        response: {
          content: fullResponse,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          },
        },
      };

      return { response: fullResponse, stats, rawExchange };
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  /**
   * Chat with pre-built messages array (for Agent use)
   */
  async chatWithMessages(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: { temperature?: number; maxTokens?: number } = {},
    onChunk?: (chunk: string) => void
  ): Promise<ChatResult> {
    if (!this.engine) {
      throw new Error('LLM not initialized');
    }

    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 2048;
    const startTime = performance.now();

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    try {
      const response = await this.engine.chat.completions.create({
        messages: fullMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullResponse = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullResponse += delta;
        if (onChunk) {
          onChunk(delta);
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      const durationMs = performance.now() - startTime;

      const stats: MessageStats = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        durationMs,
        tokensPerSecond: usage.completion_tokens / (durationMs / 1000),
      };

      const rawExchange: RawExchange = {
        request: {
          messages: fullMessages.map(m => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens: maxTokens,
        },
        response: {
          content: fullResponse,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          },
        },
      };

      return { response: fullResponse, stats, rawExchange };
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getCurrentModelKey(): ModelKey {
    return this.currentModelKey;
  }

  getCurrentModelInfo() {
    return AVAILABLE_MODELS[this.currentModelKey];
  }
}
