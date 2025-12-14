import React from 'react';
import Editor from '@monaco-editor/react';
import type { RawExchange } from '../../types';

interface JsonViewerProps {
  data: RawExchange;
  height?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, height = '300px' }) => {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div style={{ marginTop: 8, borderRadius: 4, overflow: 'hidden' }}>
      <Editor
        height={height}
        defaultLanguage="json"
        value={jsonString}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'off',
          folding: true,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
    </div>
  );
};
