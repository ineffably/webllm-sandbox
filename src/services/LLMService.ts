import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import type { MessageStats, RawExchange } from '../types';
import { logClient } from './LogClient';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Model info derived from WebLLM's prebuilt config
export interface ModelInfo {
  id: string;
  name: string;
  sizeMB: number;
  contextSize?: number;
}

// Build model list from WebLLM's prebuiltAppConfig
export const AVAILABLE_MODELS: ModelInfo[] = prebuiltAppConfig.model_list
  .filter(m => {
    const id = m.model_id.toLowerCase();
    // Filter to chat/instruct models
    const isChat = id.includes('instruct') || id.includes('chat') || id.includes('-it-');
    // Exclude problematic models
    const isTooSmall = id.includes('-1k');  // Context too small
    const isVision = id.includes('vision');  // Vision models need special GPU features
    const isEmbedding = id.includes('embed');  // Embedding models aren't for chat
    return isChat && !isTooSmall && !isVision && !isEmbedding;
  })
  .map(m => ({
    id: m.model_id,
    name: m.model_id
      .replace(/-MLC.*$/, '')
      .replace(/-q[0-9]f[0-9]+.*$/, '')
      .replace(/-Instruct/, '')
      .replace(/-Chat/, '')
      .replace(/-it/, ''),
    sizeMB: m.vram_required_MB || 0,
    contextSize: (m.overrides as { context_window_size?: number })?.context_window_size,
  }))
  .sort((a, b) => a.sizeMB - b.sizeMB);

// Helper to find model by ID
export function getModelById(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

// Get raw model record from WebLLM config (has all metadata)
export function getRawModelRecord(modelId: string) {
  return prebuiltAppConfig.model_list.find(m => m.model_id === modelId);
}

// Default model
export const DEFAULT_MODEL_ID = 'SmolLM2-135M-Instruct-q0f16-MLC';

export interface ChatResult {
  response: string;
  stats: MessageStats;
  rawExchange: RawExchange;
}

export class LLMService {
  private engine: WebWorkerMLCEngine | null = null;
  private onProgress: (progress: number) => void;
  private conversationHistory: ChatMessage[] = [];
  private currentModelId: string;

  constructor(
    onProgress?: (progress: number) => void,
    modelId: string = DEFAULT_MODEL_ID
  ) {
    this.onProgress = onProgress || (() => {});
    this.currentModelId = modelId;
  }

  async initialize(): Promise<boolean> {
    try {
      const worker = new Worker(
        new URL('../llm.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.engine = await CreateWebWorkerMLCEngine(
        worker,
        this.currentModelId,
        {
          initProgressCallback: (progress) => {
            this.onProgress(progress.progress);
          },
        }
      );

      console.log(`LLM initialized: ${this.currentModelId}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
    }
  }

  async switchModel(modelId: string): Promise<void> {
    if (modelId === this.currentModelId && this.engine) {
      return;
    }

    this.currentModelId = modelId;
    this.clearHistory();

    if (this.engine) {
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

    // Log the request
    logClient.debug('llm', 'request', {
      model: this.currentModelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

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

      // Log the full exchange
      logClient.debug('llm', 'response', {
        model: this.currentModelId,
        rawExchange,
        stats,
      });

      return { response: fullResponse, stats, rawExchange };
    } catch (error) {
      console.error('Chat error:', error);
      logClient.error('llm', 'chat error', { error: String(error), model: this.currentModelId });
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

    // Log the request
    logClient.debug('llm', 'request', {
      model: this.currentModelId,
      messages: fullMessages,
      temperature,
      max_tokens: maxTokens,
    });

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

      // Log the full exchange
      logClient.debug('llm', 'response', {
        model: this.currentModelId,
        rawExchange,
        stats,
      });

      return { response: fullResponse, stats, rawExchange };
    } catch (error) {
      console.error('Chat error:', error);
      logClient.error('llm', 'chat error', { error: String(error), model: this.currentModelId });
      throw error;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getCurrentModelId(): string {
    return this.currentModelId;
  }

  getCurrentModelInfo(): ModelInfo | undefined {
    return getModelById(this.currentModelId);
  }
}
