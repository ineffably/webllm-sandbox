import React from 'react';
import type { ChatMessage } from '../../types';
interface ChatPanelProps {
    messages: ChatMessage[];
    streamingContent?: string;
}
export declare const ChatPanel: React.FC<ChatPanelProps>;
export {};
