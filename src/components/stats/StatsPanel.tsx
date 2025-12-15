import React from 'react';
import { Space, Statistic, Divider, Tooltip } from 'antd';
import { ThunderboltOutlined, FieldTimeOutlined, NumberOutlined } from '@ant-design/icons';
import type { MessageStats } from '../../types';

interface StatsPanelProps {
  lastStats: MessageStats | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ lastStats }) => {
  if (!lastStats) {
    return null;
  }

  const tooltipContent = (
    <div style={{ fontSize: 12 }}>
      <div><strong>Generation Speed:</strong> {lastStats.tokensPerSecond.toFixed(2)} tokens/sec</div>
      <div><strong>Total Time:</strong> {(lastStats.durationMs / 1000).toFixed(3)}s ({lastStats.durationMs}ms)</div>
      <div><strong>Prompt Tokens:</strong> {lastStats.promptTokens}</div>
      <div><strong>Completion Tokens:</strong> {lastStats.completionTokens}</div>
      <div><strong>Total Tokens:</strong> {lastStats.totalTokens}</div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top">
      <div className="stats-panel" style={{ whiteSpace: 'nowrap', cursor: 'help' }}>
        <Space split={<Divider type="vertical" />} size="large" wrap={false}>
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
        </Space>
      </div>
    </Tooltip>
  );
};
