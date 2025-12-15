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
export declare class Agent {
    readonly id: string;
    readonly name: string;
    readonly persona: string;
    readonly color: string;
    private conversationHistory;
    private llmService;
    constructor(config: AgentConfig);
    /**
     * Attach an LLM service to this agent
     */
    attachLLM(service: LLMService): void;
    /**
     * Detach the LLM service
     */
    detachLLM(): void;
    /**
     * Check if agent has an LLM attached
     */
    isReady(): boolean;
    /**
     * Receive a message from another agent (or user)
     * This becomes a "user" message from this agent's perspective
     */
    receiveMessage(content: string, fromAgent?: string): void;
    /**
     * Generate a response based on conversation history
     */
    speak(options?: {
        temperature?: number;
        maxTokens?: number;
    }, onChunk?: (chunk: string) => void): Promise<AgentResponse>;
    /**
     * Build the system prompt with persona
     */
    private buildSystemPrompt;
    /**
     * Build messages array for the LLM
     * No prefixes - just clean user/assistant turns
     */
    private buildMessages;
    /**
     * Clear conversation history
     */
    clearHistory(): void;
    /**
     * Get conversation history
     */
    getHistory(): AgentMessage[];
    /**
     * Get the full context that would be sent to the LLM
     */
    getDebugContext(): {
        systemPrompt: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
    };
}
