import React from 'react';
import { type LoadProgress } from '../../services/LLMService';
interface ModelSelectorProps {
    currentModel: string | null;
    isLoading: boolean;
    loadingProgress: LoadProgress;
    onModelChange: (modelId: string) => void;
    onCancelLoad?: () => void;
}
export declare const ModelSelector: React.FC<ModelSelectorProps>;
export {};
