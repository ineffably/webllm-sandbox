import React, { useState } from 'react';
import { Input, Button, Space } from 'antd';
import { SendOutlined, ClearOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface InputBarProps {
  onSend: (message: string) => void;
  onClear: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSend,
  onClear,
  disabled = false,
  isGenerating = false,
}) => {
  const [input, setInput] = useState('');

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed && !disabled && !isGenerating) {
      onSend(trimmed);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="input-area">
      <Space.Compact style={{ width: '100%' }}>
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Load a model to start chatting...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
          disabled={disabled || isGenerating}
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={disabled || isGenerating || !input.trim()}
          loading={isGenerating}
        />
        <Button
          icon={<ClearOutlined />}
          onClick={onClear}
          disabled={disabled}
          title="Clear conversation"
        />
      </Space.Compact>
    </div>
  );
};
