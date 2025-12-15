import React, { useState } from 'react';
import { Card, Typography, Button, Tooltip } from 'antd';
import { UserOutlined, RobotOutlined, CodeOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
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
            {isUser ? (
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Text>
            ) : (
              <div className="markdown-content">
                <Markdown>{message.content}</Markdown>
              </div>
            )}
            {message.stats && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tooltip
                  title={
                    <div style={{ fontSize: 12 }}>
                      <div><strong>Speed:</strong> {message.stats.tokensPerSecond.toFixed(2)} tok/s</div>
                      <div><strong>Time:</strong> {(message.stats.durationMs / 1000).toFixed(3)}s ({message.stats.durationMs}ms)</div>
                      <div><strong>Prompt:</strong> {message.stats.promptTokens} tokens</div>
                      <div><strong>Completion:</strong> {message.stats.completionTokens} tokens</div>
                      <div><strong>Total:</strong> {message.stats.totalTokens} tokens</div>
                    </div>
                  }
                >
                  <span style={{ cursor: 'help' }}>
                    {message.stats.tokensPerSecond.toFixed(1)} tok/s · {message.stats.totalTokens} tokens · {(message.stats.durationMs / 1000).toFixed(1)}s
                  </span>
                </Tooltip>
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
