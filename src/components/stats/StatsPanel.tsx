import React from 'react';
import { Space, Statistic, Divider } from 'antd';
import { ThunderboltOutlined, FieldTimeOutlined, NumberOutlined } from '@ant-design/icons';
import type { MessageStats } from '../../types';

interface StatsPanelProps {
  lastStats: MessageStats | null;
  totalMessages: number;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ lastStats, totalMessages }) => {
  if (!lastStats && totalMessages === 0) {
    return null;
  }

  return (
    <div className="stats-panel">
      <Space split={<Divider type="vertical" />} size="large">
        {lastStats && (
          <>
            <Statistic
              title={<><ThunderboltOutlined /> Speed</>}
              value={lastStats.tokensPerSecond.toFixed(1)}
              suffix="tok/s"
              valueStyle={{ fontSize: 14, color: '#52c41a' }}
            />
            <Statistic
              title={<><FieldTimeOutlined /> Latency</>}
              value={(lastStats.durationMs / 1000).toFixed(2)}
              suffix="s"
              valueStyle={{ fontSize: 14 }}
            />
            <Statistic
              title={<><NumberOutlined /> Tokens</>}
              value={lastStats.totalTokens}
              valueStyle={{ fontSize: 14 }}
            />
          </>
        )}
        <Statistic
          title="Messages"
          value={totalMessages}
          valueStyle={{ fontSize: 14 }}
        />
      </Space>
    </div>
  );
};
