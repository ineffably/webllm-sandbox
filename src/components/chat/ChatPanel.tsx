import React, { useRef, useEffect } from 'react';
import { Card, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../types';

const { Text } = Typography;

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, streamingContent }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streamingContent && (
        <div className="message-bubble assistant">
          <Card
            size="small"
            style={{ background: '#2a2a2a', border: 'none' }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <RobotOutlined style={{ color: '#52c41a', marginTop: 4 }} />
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>
                {streamingContent}
                <span className="cursor">▊</span>
              </Text>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
