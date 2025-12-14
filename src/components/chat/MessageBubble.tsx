import React, { useState } from 'react';
import { Card, Typography, Button } from 'antd';
import { UserOutlined, RobotOutlined, CodeOutlined } from '@ant-design/icons';
import { JsonViewer } from './JsonViewer';
import type { ChatMessage } from '../../types';

const { Text } = Typography;

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [showJson, setShowJson] = useState(false);
  const isUser = message.role === 'user';
  const hasRawData = !!message.rawExchange;

  return (
    <div className={`message-bubble ${message.role}`}>
      <Card
        size="small"
        style={{
          background: isUser ? '#1890ff' : '#2a2a2a',
          border: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {isUser ? (
            <UserOutlined style={{ color: '#fff', marginTop: 4 }} />
          ) : (
            <RobotOutlined style={{ color: '#52c41a', marginTop: 4 }} />
          )}
          <div style={{ flex: 1 }}>
            <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Text>
            {message.stats && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>
                  {message.stats.tokensPerSecond.toFixed(1)} tok/s · {message.stats.totalTokens} tokens · {(message.stats.durationMs / 1000).toFixed(1)}s
                </span>
                {hasRawData && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CodeOutlined />}
                    onClick={() => setShowJson(!showJson)}
                    style={{ color: showJson ? '#1890ff' : '#888', padding: '0 4px', height: 'auto' }}
                  >
                    {showJson ? 'Hide JSON' : 'Show JSON'}
                  </Button>
                )}
              </div>
            )}
            {showJson && message.rawExchange && (
              <JsonViewer data={message.rawExchange} />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
