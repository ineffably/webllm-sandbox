import React from 'react';
import { Select, Progress, Space, Typography, Tag, Tooltip, Button } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, ThunderboltOutlined, CloseOutlined } from '@ant-design/icons';
import { AVAILABLE_MODELS, getModelById, getRawModelRecord } from '../../services/LLMService';

const { Text } = Typography;

interface ModelSelectorProps {
  currentModel: string | null;
  isLoading: boolean;
  loadingProgress: number;
  onModelChange: (modelId: string) => void;
  onCancelLoad?: () => void;
}

function formatSize(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)}GB`;
  }
  return `${mb}MB`;
}

function formatContext(size?: number): string {
  if (!size) return '';
  if (size >= 1000) {
    return `${Math.round(size / 1000)}K`;
  }
  return `${size}`;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  isLoading,
  loadingProgress,
  onModelChange,
  onCancelLoad,
}) => {
  const modelOptions = AVAILABLE_MODELS.map((model) => {
    const rawRecord = getRawModelRecord(model.id);
    const isLowResource = rawRecord?.low_resource_required;
    return {
      value: model.id,
      label: (
        <Space>
          {isLowResource && (
            <Tooltip title="Lightweight - runs on low-resource devices">
              <ThunderboltOutlined style={{ color: '#52c41a' }} />
            </Tooltip>
          )}
          <span>{model.name}</span>
          <Tag color={model.sizeMB < 1000 ? 'green' : model.sizeMB < 3000 ? 'blue' : 'orange'}>
            {formatSize(model.sizeMB)}
          </Tag>
          {model.contextSize && (
            <Tag color="purple">{formatContext(model.contextSize)} ctx</Tag>
          )}
        </Space>
      ),
    };
  });

  const currentModelInfo = currentModel ? getModelById(currentModel) : null;

  return (
    <div style={{ padding: 16 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Model ({AVAILABLE_MODELS.length} available)
      </Text>
      <Select
        style={{ width: '100%' }}
        value={currentModel}
        onChange={onModelChange}
        options={modelOptions}
        placeholder="Select a model"
        disabled={isLoading}
        showSearch
        filterOption={(input, option) =>
          (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
        }
      />

      {isLoading && currentModel && (
        <div className="model-loading">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <LoadingOutlined spin />
                <Text>Loading {currentModelInfo?.name || currentModel}...</Text>
              </Space>
              {onCancelLoad && (
                <Tooltip title="Cancel loading">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<CloseOutlined />}
                    onClick={onCancelLoad}
                  />
                </Tooltip>
              )}
            </div>
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
              {currentModelInfo?.name || currentModel} ready
            </Text>
          </Space>
        </div>
      )}
    </div>
  );
};
