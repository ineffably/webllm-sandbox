import React from 'react';
import type { LLMService } from '../../services/LLMService';
interface ZorkPlayerProps {
    llmService: LLMService | null;
    temperature: number;
    maxTokens: number;
    isModelReady: boolean;
}
export declare const ZorkPlayer: React.FC<ZorkPlayerProps>;
export {};
