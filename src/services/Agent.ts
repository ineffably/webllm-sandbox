import type { LLMService } from './LLMService';
import type { RawExchange } from '../types';

export interface AgentConfig {
  id: string;
  name: string;
  persona: string;
  color?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  fromAgent?: string;
}

export interface AgentResponse {
  content: string;
  rawExchange: RawExchange;
}

export class Agent {
  readonly id: string;
  readonly name: string;
  readonly persona: string;
  readonly color: string;

  private conversationHistory: AgentMessage[] = [];
  private llmService: LLMService | null = null;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.persona = config.persona;
    this.color = config.color || '#1890ff';
  }

  /**
   * Attach an LLM service to this agent
   */
  attachLLM(service: LLMService): void {
    this.llmService = service;
  }

  /**
   * Detach the LLM service
   */
  detachLLM(): void {
    this.llmService = null;
  }

  /**
   * Check if agent has an LLM attached
   */
  isReady(): boolean {
    return this.llmService !== null;
  }

  /**
   * Receive a message from another agent (or user)
   * This becomes a "user" message from this agent's perspective
   */
  receiveMessage(content: string, fromAgent?: string): void {
    this.conversationHistory.push({
      role: 'user',
      content,
      fromAgent,
    });
  }

  /**
   * Generate a response based on conversation history
   */
  async speak(
    options: { temperature?: number; maxTokens?: number } = {},
    onChunk?: (chunk: string) => void
  ): Promise<AgentResponse> {
    if (!this.llmService) {
      throw new Error(`Agent "${this.name}" has no LLM service attached`);
    }

    const systemPrompt = this.buildSystemPrompt();
    const messages = this.buildMessages();

    // Use the LLM service directly with our constructed messages
    const result = await this.llmService.chatWithMessages(
      systemPrompt,
      messages,
      options,
      onChunk
    );

    // Record our own response as "assistant" in history
    this.conversationHistory.push({
      role: 'assistant',
      content: result.response,
      fromAgent: this.name,
    });

    return {
      content: result.response,
      rawExchange: result.rawExchange,
    };
  }

  /**
   * Build the system prompt with persona
   */
  private buildSystemPrompt(): string {
    return `${this.persona}

You are ${this.name}. Always respond in character. Speak naturally and engage with what others say.`;
  }

  /**
   * Build messages array for the LLM
   * No prefixes - just clean user/assistant turns
   */
  private buildMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory(): AgentMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get the full context that would be sent to the LLM
   */
  getDebugContext(): { systemPrompt: string; messages: Array<{ role: string; content: string }> } {
    return {
      systemPrompt: this.buildSystemPrompt(),
      messages: this.buildMessages(),
    };
  }
}
