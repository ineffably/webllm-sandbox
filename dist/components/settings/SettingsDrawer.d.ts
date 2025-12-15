import React from 'react';
import type { LoadProgress } from '../../services/LLMService';
interface SettingsDrawerProps {
    open: boolean;
    onClose: () => void;
    currentModel: string | null;
    isModelLoading: boolean;
    loadingProgress: LoadProgress;
    onModelChange: (modelId: string) => void;
    onCancelLoad?: () => void;
    temperature: number;
    onTemperatureChange: (value: number) => void;
    maxTokens: number;
    onMaxTokensChange: (value: number) => void;
    disabled?: boolean;
}
export declare const SettingsDrawer: React.FC<SettingsDrawerProps>;
export {};
