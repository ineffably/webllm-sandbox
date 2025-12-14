import React from 'react';
import { Input, Typography, Collapse } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

interface ContextEditorProps {
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  disabled?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise and informative in your responses.`;

export const ContextEditor: React.FC<ContextEditorProps> = ({
  systemPrompt,
  onSystemPromptChange,
  disabled = false,
}) => {
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid #303030' }}>
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'system',
            label: (
              <Text type="secondary">
                <SettingOutlined /> System Prompt
              </Text>
            ),
            children: (
              <TextArea
                value={systemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                placeholder={DEFAULT_SYSTEM_PROMPT}
                autoSize={{ minRows: 4, maxRows: 12 }}
                disabled={disabled}
                style={{
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: 12,
                }}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export { DEFAULT_SYSTEM_PROMPT };
