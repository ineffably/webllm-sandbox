import React from 'react';
import type { LLMService } from '../../services/LLMService';
interface GroupChatProps {
    llmService: LLMService | null;
    temperature: number;
    maxTokens: number;
    isModelReady: boolean;
}
export declare const GroupChat: React.FC<GroupChatProps>;
export {};
