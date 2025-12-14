```Typescript

import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import type { NPCCharacter } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Available models in order of size (smallest first) for testing
export const AVAILABLE_MODELS = {
  'smol-135m': 'SmolLM2-135M-Instruct-q0f16-MLC',       // ~360MB - fastest, basic
  'smol-360m': 'SmolLM2-360M-Instruct-q4f16_1-MLC',     // ~376MB - better quality
  'qwen-0.5b': 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',     // ~945MB - good quality
  'phi-3.5-mini': 'Phi-3.5-mini-instruct-q4f16_1-MLC'   // ~500MB - best for dialogue
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;

export interface ChatStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  tokensPerSecond: number;
}

export interface ChatResult {
  response: string;
  stats: ChatStats;
}

export class LLMService {
  private engine: WebWorkerMLCEngine | null = null;
  private onProgress: (progress: number) => void;
  private conversationHistory: ChatMessage[] = [];
  private currentModel: string;

  constructor(
    onProgress?: (progress: number) => void,
    modelKey: ModelKey = 'smol-135m'
  ) {
    this.onProgress = onProgress || (() => {});
    this.currentModel = AVAILABLE_MODELS[modelKey];
  }

  async initialize(): Promise<boolean> {
    try {
      // Create worker for non-blocking inference
      const worker = new Worker(
        new URL('../llm.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.engine = await CreateWebWorkerMLCEngine(
        worker,
        this.currentModel,
        {
          initProgressCallback: (progress) => {
            this.onProgress(progress.progress);
          }
        }
      );

      console.log(`LLM initialized successfully: ${this.currentModel}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
    }
  }

  async switchModel(modelKey: ModelKey): Promise<void> {
    const newModel = AVAILABLE_MODELS[modelKey];
    if (newModel === this.currentModel && this.engine) {
      return; // Already loaded
    }

    this.currentModel = newModel;
    this.clearHistory();

    if (this.engine) {
      await this.engine.reload(newModel);
    }
  }

  private buildSystemPrompt(characterData: NPCCharacter): string {
    const knowledge = characterData.knowledge.join(', ');

    // Map chattiness level to response length guidance
    const chattinessGuide: Record<number, string> = {
      1: 'Keep responses to exactly 1 short sentence.',
      2: 'Keep responses to 1-2 short sentences.',
      3: 'Keep responses to 2-3 sentences.',
      4: 'Responses can be 3-4 sentences, feel free to elaborate.',
      5: 'Be verbose and detailed in your responses.'
    };
    const lengthGuide = chattinessGuide[characterData.chattiness] || chattinessGuide[3];

    return `You are ${characterData.name}, ${characterData.role} in a cozy village.

Personality: ${characterData.personality}
Background: ${characterData.backstory}
You know about: ${knowledge}
Speech style: ${characterData.speech_style}

${lengthGuide}
Stay in character at all times.
React naturally and warmly to what the player says.
You are having a face-to-face conversation with a traveler who just arrived.`;
  }

async chat(
    characterData: NPCCharacter,
    playerMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<ChatResult> {
    if (!this.engine) {
      throw new Error('LLM not initialized');
    }

    const startTime = performance.now();

    // Add player message to history
    this.conversationHistory.push({
      role: 'user',
      content: playerMessage
    });

    // Build messages array with system prompt and history
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(characterData) },
      ...this.conversationHistory.slice(-10) // Keep last 5 exchanges (10 messages)
    ];

    try {
      // Use streaming for real-time response display
      const response = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 150,
        stream: true,
        stream_options: { include_usage: true }
      });

      let fullResponse = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullResponse += delta;
        if (onChunk) {
          onChunk(delta);
        }
        // Usage only appears in final chunk
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      const durationMs = performance.now() - startTime;

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse
      });

      const stats: ChatStats = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        durationMs,
        tokensPerSecond: usage.completion_tokens / (durationMs / 1000)
      };


      return { response: fullResponse, stats };
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getCurrentModel(): string {
    return this.currentModel;
  }
}
```
