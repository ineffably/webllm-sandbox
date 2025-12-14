# WebLLM Sandbox - Implementation Plan

## Overview

A React-based sandbox for experimenting with browser-based LLMs using WebLLM. Focus on extensible prompt contexts, data-driven experimentation, and LLM-to-LLM conversations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React App (Ant Design)                 │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│  ChatPanel  │ ModelPanel  │ ContextPanel│   StatsPanel      │
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬──────────┘
       │             │             │               │
       └─────────────┴──────┬──────┴───────────────┘
                            │
                    ┌───────▼───────┐
                    │  LLMService   │ (Web Worker)
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │   WebLLM      │
                    │  (MLC Engine) │
                    └───────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   ┌───▼───┐           ┌────▼────┐          ┌────▼────┐
   │SmolLM │           │  Qwen   │          │  Phi    │
   └───────┘           └─────────┘          └─────────┘
```

---

## Core Components

### 1. Chat System
- **ChatPanel** - Main conversation view with message history
- **MessageBubble** - Individual message display (user/assistant/system)
- **InputBar** - Text input with send button, supports multiline

### 2. Model Management
- **ModelSelector** - Dropdown to pick from available models
- **ModelStatus** - Loading progress, current model info
- **ModelConfig** - Temperature, max tokens, etc.

### 3. Context System (the extensible part)
- **ContextEditor** - JSON/text editor for injecting context
- **ContextTemplates** - Predefined templates (persona, knowledge base, etc.)
- **ContextPreview** - Shows final assembled prompt

### 4. Logging & Stats
- **StatsPanel** - Tokens/sec, latency, token counts
- **LogClient** - Sends logs to log-server.ts via WebSocket
- **SessionViewer** - Review past sessions (reads from logs/)

---

## Data Structures

### Context Template
```typescript
interface ContextTemplate {
  id: string;
  name: string;
  type: 'system' | 'prefix' | 'suffix';
  content: string;           // Can contain {{variables}}
  variables?: Record<string, string>;
}
```

### Chat Session
```typescript
interface ChatSession {
  id: string;
  modelId: string;
  createdAt: number;
  contexts: ContextTemplate[];
  messages: ChatMessage[];
  stats: SessionStats;
}
```

### Chat Message
```typescript
interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  stats?: MessageStats;  // tokens, duration for assistant msgs
}
```

---

## Available Models

| Key | Model ID | Size | Notes |
|-----|----------|------|-------|
| smol-135m | SmolLM2-135M-Instruct-q0f16-MLC | ~360MB | Fastest, basic |
| smol-360m | SmolLM2-360M-Instruct-q4f16_1-MLC | ~376MB | Better quality |
| qwen-0.5b | Qwen2.5-0.5B-Instruct-q4f16_1-MLC | ~945MB | Good quality |
| phi-3.5-mini | Phi-3.5-mini-instruct-q4f16_1-MLC | ~500MB | Best for dialogue |

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Webpack + TypeScript + React setup
- [ ] Ant Design integration
- [ ] Basic layout shell (sidebar + main area)
- [ ] LLMService integration (from example)
- [ ] Web Worker setup for non-blocking inference

### Phase 2: Basic Chat
- [ ] ChatPanel with message history
- [ ] InputBar with send functionality
- [ ] Model selector + loading progress
- [ ] Basic streaming response display

### Phase 3: Context System
- [ ] ContextEditor component (JSON mode + text mode)
- [ ] System prompt customization
- [ ] Template system with variables
- [ ] Context preview before sending

### Phase 4: Logging & Stats
- [ ] LogClient WebSocket connection
- [ ] Real-time stats display (tokens/sec, latency)
- [ ] Session logging to log-server
- [ ] Basic session history viewer

### Phase 5: Polish
- [ ] Persist sessions to localStorage
- [ ] Export/import sessions as JSON
- [ ] Keyboard shortcuts
- [ ] Dark/light theme

---

## File Structure

```
src/
├── index.tsx                 # Entry point
├── App.tsx                   # Main layout
├── llm.worker.ts             # Web Worker for LLM
├── services/
│   ├── LLMService.ts         # LLM wrapper
│   ├── LogClient.ts          # WebSocket to log-server
│   └── SessionStore.ts       # localStorage persistence
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── MessageBubble.tsx
│   │   └── InputBar.tsx
│   ├── model/
│   │   ├── ModelSelector.tsx
│   │   └── ModelStatus.tsx
│   ├── context/
│   │   ├── ContextEditor.tsx
│   │   └── ContextPreview.tsx
│   └── stats/
│       └── StatsPanel.tsx
├── types/
│   └── index.ts
└── styles/
    └── main.css
tools/
└── log-server.ts             # Already exists
```

---

## Dev Commands

```bash
# Start dev server (webpack-dev-server)
npm run dev

# Start log server (separate terminal)
npm run logs

# Build for production
npm run build
```

Using `concurrently` to run both:
```bash
npm run start  # Runs both dev + log-server
```

---

## Open Questions

1. **Model caching** - WebLLM caches models in IndexedDB. Show cache status? Allow clearing?
2. **Context size limits** - Display token count for context? Warn when approaching model limits?
3. **Export formats** - JSON, Markdown, or both for conversation exports?

---

## Future Implementations

### Dual-LLM Mode
- DualChatPanel - Side-by-side or turn-based LLM conversation
- ConversationOrchestrator - Manages turn-taking between models
- Load two models (or same model, two instances)
- Configurable turn limits and stop conditions
- Export conversation transcripts

---

## Dependencies

```json
{
  "dependencies": {
    "@mlc-ai/web-llm": "^0.2.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "antd": "^5.x",
    "@ant-design/icons": "^5.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "webpack": "^5.x",
    "webpack-cli": "^5.x",
    "webpack-dev-server": "^5.x",
    "ts-loader": "^9.x",
    "html-webpack-plugin": "^5.x",
    "css-loader": "^6.x",
    "style-loader": "^3.x",
    "ws": "^8.x",
    "concurrently": "^8.x"
  }
}
```
