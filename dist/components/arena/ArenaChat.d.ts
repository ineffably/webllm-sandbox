import React from 'react';
import type { LLMService } from '../../services/LLMService';
interface ArenaChatProps {
    llmService: LLMService | null;
    temperature: number;
    maxTokens: number;
    isModelReady: boolean;
}
export declare const ArenaChat: React.FC<ArenaChatProps>;
export {};
