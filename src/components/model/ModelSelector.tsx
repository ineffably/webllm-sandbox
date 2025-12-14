import React from 'react';
import { Select, Progress, Space, Typography, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { AVAILABLE_MODELS, type ModelKey } from '../../services/LLMService';

const { Text } = Typography;

interface ModelSelectorProps {
  currentModel: ModelKey | null;
  isLoading: boolean;
  loadingProgress: number;
  onModelChange: (modelKey: ModelKey) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  isLoading,
  loadingProgress,
  onModelChange,
}) => {
  const modelOptions = Object.entries(AVAILABLE_MODELS).map(([key, info]) => ({
    value: key,
    label: (
      <Space>
        <span>{info.name}</span>
        <Tag color="blue">{info.size}</Tag>
      </Space>
    ),
  }));

  return (
    <div style={{ padding: 16 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Model
      </Text>
      <Select
        style={{ width: '100%' }}
        value={currentModel}
        onChange={onModelChange}
        options={modelOptions}
        placeholder="Select a model"
        disabled={isLoading}
      />

      {isLoading && currentModel && (
        <div className="model-loading">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <LoadingOutlined spin />
              <Text>Loading {AVAILABLE_MODELS[currentModel].name}...</Text>
            </Space>
            <Progress
              percent={Math.round(loadingProgress * 100)}
              size="small"
              status="active"
            />
          </Space>
        </div>
      )}

      {!isLoading && currentModel && (
        <div className="model-status">
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text type="secondary">
              {AVAILABLE_MODELS[currentModel].name} ready
            </Text>
          </Space>
        </div>
      )}
    </div>
  );
};
