import React from 'react';
import { Drawer, Slider, InputNumber, Space, Typography, Divider, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { ModelSelector } from '../model/ModelSelector';
import { ContextEditor } from '../context/ContextEditor';
import type { ModelKey } from '../../services/LLMService';

const { Text } = Typography;

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  // Model
  currentModel: ModelKey | null;
  isModelLoading: boolean;
  loadingProgress: number;
  onModelChange: (modelKey: ModelKey) => void;
  // System prompt
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  // Generation params
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  // State
  disabled?: boolean;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  onClose,
  currentModel,
  isModelLoading,
  loadingProgress,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  disabled = false,
}) => {
  return (
    <Drawer
      title="Settings"
      placement="right"
      onClose={onClose}
      open={open}
      width={360}
      styles={{
        body: { padding: 0 },
        header: { justifyContent: 'space-between' },
      }}
    >
      <ModelSelector
        currentModel={currentModel}
        isLoading={isModelLoading}
        loadingProgress={loadingProgress}
        onModelChange={onModelChange}
      />

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ padding: '0 16px 16px' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Temperature{' '}
          <Tooltip title="Controls randomness. Lower values (0-0.3) produce focused, deterministic outputs. Higher values (0.8+) increase creativity and variation.">
            <InfoCircleOutlined style={{ cursor: 'help' }} />
          </Tooltip>
        </Text>
        <Space style={{ width: '100%' }}>
          <Slider
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={onTemperatureChange}
            disabled={disabled}
            style={{ width: 200 }}
            marks={{
              0: '0',
              0.7: '0.7',
              1: '1',
              2: '2',
            }}
          />
          <InputNumber
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(v) => v !== null && onTemperatureChange(v)}
            disabled={disabled}
            style={{ width: 70 }}
          />
        </Space>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          Lower = focused, higher = creative
        </Text>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Max Tokens{' '}
          <Tooltip title="Maximum number of tokens the model can generate in a response. Higher values allow longer responses but take more time. ~4 characters per token.">
            <InfoCircleOutlined style={{ cursor: 'help' }} />
          </Tooltip>
        </Text>
        <Space style={{ width: '100%' }}>
          <Slider
            min={64}
            max={32768}
            step={64}
            value={maxTokens}
            onChange={onMaxTokensChange}
            disabled={disabled}
            style={{ width: 200 }}
            marks={{
              2048: '2K',
              8192: '8K',
              16384: '16K',
              32768: '32K',
            }}
          />
          <InputNumber
            min={64}
            max={32768}
            step={64}
            value={maxTokens}
            onChange={(v) => v !== null && onMaxTokensChange(v)}
            disabled={disabled}
            style={{ width: 80 }}
          />
        </Space>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          Maximum response length
        </Text>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <ContextEditor
        systemPrompt={systemPrompt}
        onSystemPromptChange={onSystemPromptChange}
        disabled={disabled}
      />
    </Drawer>
  );
};
