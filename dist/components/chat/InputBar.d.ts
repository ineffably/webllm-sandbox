import React from 'react';
interface InputBarProps {
    onSend: (message: string) => void;
    onClear: () => void;
    disabled?: boolean;
    isGenerating?: boolean;
}
export declare const InputBar: React.FC<InputBarProps>;
export {};
