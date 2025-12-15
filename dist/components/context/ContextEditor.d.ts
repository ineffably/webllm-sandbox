import React from 'react';
interface ContextEditorProps {
    systemPrompt: string;
    onSystemPromptChange: (prompt: string) => void;
    disabled?: boolean;
}
declare const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Be concise and informative in your responses.";
export declare const ContextEditor: React.FC<ContextEditorProps>;
export { DEFAULT_SYSTEM_PROMPT };
