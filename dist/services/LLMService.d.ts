import type { MessageStats, RawExchange } from '../types';
export interface ModelInfo {
    id: string;
    name: string;
    sizeMB: number;
    contextSize?: number;
}
export declare const AVAILABLE_MODELS: ModelInfo[];
export declare function getModelById(modelId: string): ModelInfo | undefined;
export declare function getRawModelRecord(modelId: string): import("@mlc-ai/web-llm").ModelRecord | undefined;
export declare const DEFAULT_MODEL_ID = "SmolLM2-135M-Instruct-q0f16-MLC";
export interface ChatResult {
    response: string;
    stats: MessageStats;
    rawExchange: RawExchange;
}
export interface LoadProgress {
    progress: number;
    text: string;
    loadedMB?: number;
    totalMB?: number;
    speedMBps?: number;
}
export declare class LLMService {
    private engine;
    private onProgress;
    private conversationHistory;
    private currentModelId;
    constructor(onProgress?: (progress: LoadProgress) => void, modelId?: string);
    initialize(): Promise<boolean>;
    switchModel(modelId: string): Promise<void>;
    chat(systemPrompt: string, userMessage: string, options?: {
        temperature?: number;
        maxTokens?: number;
    }, onChunk?: (chunk: string) => void): Promise<ChatResult>;
    /**
     * Chat with pre-built messages array (for Agent use)
     */
    chatWithMessages(systemPrompt: string, messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, options?: {
        temperature?: number;
        maxTokens?: number;
    }, onChunk?: (chunk: string) => void): Promise<ChatResult>;
    clearHistory(): void;
    getCurrentModelId(): string;
    getCurrentModelInfo(): ModelInfo | undefined;
}
