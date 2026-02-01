# AI Race Engineer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Gemini-style in‑TUI AI race engineer that streams answers about the currently loaded session using raw timing data plus derived processor state, with a JS VM for bespoke analysis.

**Architecture:** Load `subscribe.json` + `live.jsonl` into a `SessionStore`, feed a `TimingService` + processors, expose tools and a `run_js` VM to the AI SDK agent, and route the TUI into a chat screen immediately after download.

**Tech Stack:** TypeScript, Ink, Vercel AI SDK (`ai`, `@ai-sdk/openai`), Node `vm`, `zod`, `esbuild` (TS transform), existing core download/parse modules.

---

### Task 1: Add dependencies + env doc

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Add deps to package.json**

Add to `dependencies`:
```json
{
  "ai": "^<latest>",
  "@ai-sdk/openai": "^<latest>",
  "zod": "^<latest>",
  "ink-text-input": "^<latest>",
  "esbuild": "^<latest>"
}
```

**Step 2: Install deps**

Run:
```bash
npm install
```
Expected: successful install with no errors.

**Step 3: Document OpenAI key + chat usage**

Update `README.md` to include:
```md
## AI Race Engineer

Set your OpenAI key:

```bash
export OPENAI_API_KEY=... 
```

After a session download finishes, the UI switches into chat mode.
```

**Step 4: Commit**

```bash
git add package.json README.md package-lock.json

git commit -m "feat: add AI SDK deps and chat setup docs"
```

---

### Task 2: SessionStore for raw data

**Files:**
- Create: `src/core/session-store.ts`
- Create: `src/core/session-store.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadSessionStore } from './session-store.js';

const base = path.join(tmpdir(), `f1aire-store-${Date.now()}`);
mkdirSync(base, { recursive: true });
writeFileSync(
  path.join(base, 'subscribe.json'),
  JSON.stringify({ SessionInfo: { Name: 'Test' }, Heartbeat: { Utc: '2025-01-01T00:00:00Z' } }),
  'utf-8',
);
writeFileSync(
  path.join(base, 'live.jsonl'),
  [
    JSON.stringify({ type: 'DriverList', json: { '4': { FullName: 'Lando Norris' } }, dateTime: '2025-01-01T00:00:01Z' }),
    JSON.stringify({ type: 'TimingData', json: { Lines: { '4': { Position: '1' } } }, dateTime: '2025-01-01T00:00:02Z' })
  ].join('\n'),
  'utf-8',
);

describe('SessionStore', () => {
  it('loads raw files and exposes topic latest + timeline', async () => {
    const store = await loadSessionStore(base);
    expect(store.raw.subscribe.SessionInfo.Name).toBe('Test');
    expect(store.topic('DriverList').latest?.json).toHaveProperty('4');
    const timeline = store.topic('TimingData').timeline();
    expect(timeline.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/core/session-store.test.ts
```
Expected: FAIL (module not found or function not implemented).

**Step 3: Write minimal implementation**

Create `src/core/session-store.ts`:
```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

type RawPoint = { type: string; json: any; dateTime: Date };

type TopicView = {
  latest: RawPoint | null;
  timeline: (from?: Date, to?: Date) => RawPoint[];
};

export type SessionStore = {
  raw: { subscribe: any; live: RawPoint[] };
  topic: (name: string) => TopicView;
};

export async function loadSessionStore(dir: string): Promise<SessionStore> {
  const subscribeRaw = JSON.parse(
    await fs.readFile(path.join(dir, 'subscribe.json'), 'utf-8'),
  );
  const liveLines = (await fs.readFile(path.join(dir, 'live.jsonl'), 'utf-8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as { type: string; json: any; dateTime: string };
      return { ...parsed, dateTime: new Date(parsed.dateTime) } as RawPoint;
    });

  const byTopic = new Map<string, RawPoint[]>();
  for (const p of liveLines) {
    const arr = byTopic.get(p.type) ?? [];
    arr.push(p);
    byTopic.set(p.type, arr);
  }
  for (const arr of byTopic.values()) {
    arr.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }

  return {
    raw: { subscribe: subscribeRaw, live: liveLines },
    topic: (name: string) => {
      const arr = byTopic.get(name) ?? [];
      return {
        latest: arr.length > 0 ? arr[arr.length - 1] : null,
        timeline: (from?: Date, to?: Date) =>
          arr.filter((p) => (!from || p.dateTime >= from) && (!to || p.dateTime <= to)),
      };
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
mise run test -- src/core/session-store.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/session-store.ts src/core/session-store.test.ts

git commit -m "feat: add SessionStore for raw timing data"
```

---

### Task 3: Base64 deflate decompression

**Files:**
- Create: `src/core/decompress.ts`
- Create: `src/core/decompress.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { inflateBase64 } from './decompress.js';

describe('inflateBase64', () => {
  it('inflates base64 deflateRaw payloads', async () => {
    const input = JSON.stringify({ a: 1, b: 'ok' });
    const encoded = deflateRawSync(Buffer.from(input)).toString('base64');
    const output = await inflateBase64(encoded);
    expect(output).toBe(input);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/core/decompress.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
import { inflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const inflateRawAsync = promisify(inflateRaw);

export async function inflateBase64(payload: string): Promise<string> {
  const buf = Buffer.from(payload, 'base64');
  const inflated = await inflateRawAsync(buf);
  return inflated.toString('utf-8');
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
mise run test -- src/core/decompress.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/decompress.ts src/core/decompress.test.ts

git commit -m "feat: add base64 deflate decompression"
```

---

### Task 4: TimingService + processors (minimal parity)

**Files:**
- Create: `src/core/processors/types.ts`
- Create: `src/core/processors/driver-list.ts`
- Create: `src/core/processors/timing-data.ts`
- Create: `src/core/timing-service.ts`
- Create: `src/core/timing-service.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TimingService } from './timing-service.js';

const points = [
  { type: 'DriverList', json: { '1': { FullName: 'Max Verstappen' } }, dateTime: new Date('2025-01-01T00:00:01Z') },
  { type: 'TimingData', json: { Lines: { '1': { BestLapTime: { Value: '1:20.000' } } } }, dateTime: new Date('2025-01-01T00:00:02Z') },
];

describe('TimingService', () => {
  it('routes points to processors and tracks best laps', () => {
    const service = new TimingService();
    points.forEach((p) => service.enqueue(p));
    expect(service.processors.driverList.latest?.json['1'].FullName).toBe('Max Verstappen');
    expect(service.processors.timingData.bestLaps.get('1')?.time).toBe('1:20.000');
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/core/timing-service.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

`src/core/processors/types.ts`:
```ts
export type RawPoint = { type: string; json: any; dateTime: Date };

export interface Processor<T = any> {
  latest: T | null;
  process: (point: RawPoint) => void;
}
```

`src/core/processors/driver-list.ts`:
```ts
import type { Processor, RawPoint } from './types.js';

export class DriverListProcessor implements Processor<RawPoint> {
  latest: RawPoint | null = null;
  process(point: RawPoint) {
    if (point.type === 'DriverList') this.latest = point;
  }
}
```

`src/core/processors/timing-data.ts`:
```ts
import type { Processor, RawPoint } from './types.js';
import { parseLapTimeMs } from '../summary.js';

type BestLap = { time: string; timeMs: number };

export class TimingDataProcessor implements Processor<RawPoint> {
  latest: RawPoint | null = null;
  bestLaps = new Map<string, BestLap>();

  process(point: RawPoint) {
    if (point.type !== 'TimingData') return;
    this.latest = point;
    const lines = point.json?.Lines ?? {};
    for (const [num, driver] of Object.entries(lines)) {
      const time = (driver as any).BestLapTime?.Value;
      if (!time) continue;
      const ms = parseLapTimeMs(time);
      if (ms === null) continue;
      const current = this.bestLaps.get(num);
      if (!current || ms < current.timeMs) this.bestLaps.set(num, { time, timeMs: ms });
    }
  }
}
```

`src/core/timing-service.ts`:
```ts
import type { RawPoint } from './processors/types.js';
import { DriverListProcessor } from './processors/driver-list.js';
import { TimingDataProcessor } from './processors/timing-data.js';

export class TimingService {
  processors = {
    driverList: new DriverListProcessor(),
    timingData: new TimingDataProcessor(),
  };

  enqueue(point: RawPoint) {
    this.processors.driverList.process(point);
    this.processors.timingData.process(point);
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
mise run test -- src/core/timing-service.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/processors src/core/timing-service.ts src/core/timing-service.test.ts

git commit -m "feat: add timing service and basic processors"
```

---

### Task 5: JS VM runner (Turing-complete, raw access)

**Files:**
- Create: `src/agent/run-js.ts`
- Create: `src/agent/run-js.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runJs } from './run-js.js';

const store = {
  topic: () => ({ latest: { json: { Lines: { '4': { Position: '2' } } } } }),
};
const processors = { timingData: { bestLaps: new Map([['4', { time: '1:20.000' }]]) } };


describe('runJs', () => {
  it('can access store and processors', async () => {
    const code = `return { pos: store.topic('TimingData').latest.json.Lines['4'].Position, lap: processors.timingData.bestLaps.get('4').time };`;
    const result = await runJs({ code, context: { store, processors } });
    expect(result).toEqual({ pos: '2', lap: '1:20.000' });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/agent/run-js.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
import vm from 'node:vm';
import { transform } from 'esbuild';

export async function runJs({ code, context }: { code: string; context: Record<string, unknown> }) {
  const transformed = await transform(code, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const sandbox = { ...context, console, require, fetch, module: {}, exports: {} } as any;
  const script = new vm.Script(`(async () => { ${transformed.code}\n })()`);
  const ctx = vm.createContext(sandbox);
  return await script.runInContext(ctx);
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
mise run test -- src/agent/run-js.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/agent/run-js.ts src/agent/run-js.test.ts

git commit -m "feat: add JS VM runner with store access"
```

---

### Task 6: Prompt + tools (Engineer JS Skill)

**Files:**
- Create: `src/agent/prompt.ts`
- Create: `src/agent/tools.ts`
- Create: `src/agent/prompt.test.ts`
- Create: `src/agent/tools.test.ts`

**Step 1: Write failing tests**

`src/agent/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { systemPrompt } from './prompt.js';

describe('systemPrompt', () => {
  it('includes Engineer JS Skill section', () => {
    expect(systemPrompt).toContain('Engineer JS Skill');
    expect(systemPrompt).toContain('store');
    expect(systemPrompt).toContain('processors');
  });
});
```

`src/agent/tools.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { makeTools } from './tools.js';

const store = { topic: () => ({ latest: { json: { Lines: {} } } }) };
const processors = { timingData: { bestLaps: new Map() }, driverList: { latest: { json: {} } } };

describe('tools', () => {
  it('exposes run_js tool', () => {
    const tools = makeTools({ store, processors });
    expect(tools).toHaveProperty('run_js');
  });
});
```

**Step 2: Run tests to verify failures**

Run:
```bash
mise run test -- src/agent/prompt.test.ts
```
Expected: FAIL.

**Step 3: Implement prompt + tools**

`src/agent/prompt.ts`:
```ts
export const systemPrompt = `You are a virtual F1 race engineer. Be concise, evidence-first, and explain uncertainty.

Engineer JS Skill:
You can run JS/TS via the run_js tool. Globals:
- store: SessionStore (topic(name).latest/timeline)
- processors: timingData, driverList, timingApp, timingStats, etc.
- raw: { subscribe, live }
- require, fetch, console

Examples:
// best lap vs rival
const max = processors.timingData.bestLaps.get('1');
const lando = processors.timingData.bestLaps.get('4');
return { deltaMs: lando.timeMs - max.timeMs };

// latest positions
return store.topic('TimingData').latest.json.Lines;
`;
```

`src/agent/tools.ts`:
```ts
import { tool } from 'ai';
import { z } from 'zod';
import { runJs } from './run-js.js';

export function makeTools({ store, processors }: { store: any; processors: any }) {
  return {
    get_latest: tool({
      description: 'Get latest snapshot for a topic',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => store.topic(topic).latest,
    }),
    get_driver_list: tool({
      description: 'Get latest DriverList',
      inputSchema: z.object({}),
      execute: async () => processors.driverList.latest,
    }),
    run_js: tool({
      description: 'Run JS/TS using store/processors/raw. See Engineer JS Skill in system prompt.',
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }) => runJs({ code, context: { store, processors, raw: store.raw } }),
    }),
  };
}
```

**Step 4: Run tests to verify pass**

Run:
```bash
mise run test -- src/agent/prompt.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/agent/prompt.ts src/agent/tools.ts src/agent/prompt.test.ts src/agent/tools.test.ts

git commit -m "feat: add engineer prompt and tool set"
```

---

### Task 7: Engineer agent orchestrator

**Files:**
- Create: `src/agent/engineer.ts`
- Create: `src/agent/engineer.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createEngineerSession } from './engineer.js';

describe('engineer session', () => {
  it('returns a session with send()', async () => {
    const session = createEngineerSession({ model: {} as any, tools: {} as any, system: 'x', streamTextFn: async () => ({ textStream: async function*(){ yield 'ok'; }() }) as any });
    const stream = session.send('hello');
    const parts = [] as string[];
    for await (const t of stream) parts.push(t);
    expect(parts.join('')).toBe('ok');
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/agent/engineer.test.ts
```
Expected: FAIL.

**Step 3: Implement minimal session**

```ts
import { streamText, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';

export function createEngineerSession({ model, tools, system, streamTextFn = streamText }: {
  model: LanguageModel;
  tools: ToolSet;
  system: string;
  streamTextFn?: typeof streamText;
}) {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  return {
    async *send(input: string) {
      messages.push({ role: 'user', content: input });
      const result = await streamTextFn({ model, system, messages, tools });
      for await (const chunk of result.textStream) {
        yield chunk;
      }
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
mise run test -- src/agent/engineer.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/agent/engineer.ts src/agent/engineer.test.ts

git commit -m "feat: add engineer session orchestrator"
```

---

### Task 8: Chat UI + app integration

**Files:**
- Create: `src/tui/screens/EngineerChat.tsx`
- Create: `src/tui/chat-state.ts`
- Create: `src/tui/chat-state.test.ts`
- Modify: `src/tui/navigation.ts`
- Modify: `src/app.tsx`

**Step 1: Write failing test for chat state**

```ts
import { describe, it, expect } from 'vitest';
import { appendUserMessage } from './chat-state.js';

describe('chat-state', () => {
  it('appends user messages', () => {
    const next = appendUserMessage([], 'why was lando slower?');
    expect(next[0].role).toBe('user');
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
mise run test -- src/tui/chat-state.test.ts
```
Expected: FAIL.

**Step 3: Implement chat state + screen**

`src/tui/chat-state.ts`:
```ts
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function appendUserMessage(history: ChatMessage[], content: string): ChatMessage[] {
  return [...history, { role: 'user', content }];
}
```

`src/tui/screens/EngineerChat.tsx` (Gemini‑style list + input):
```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ChatMessage } from '../chat-state.js';

export function EngineerChat({
  messages,
  onSend,
  streamingText,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  streamingText: string;
}) {
  const [input, setInput] = useState('');
  useInput((_, key) => {
    if (key.return && input.trim().length > 0) {
      onSend(input.trim());
      setInput('');
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" gap={1}>
        {messages.map((m, i) => (
          <Box key={i} flexDirection="column">
            <Text color={m.role === 'assistant' ? 'cyan' : 'green'}>
              {m.role === 'assistant' ? 'Engineer' : 'You'}
            </Text>
            <Text>{m.content}</Text>
          </Box>
        ))}
        {streamingText ? (
          <Box flexDirection="column">
            <Text color="cyan">Engineer</Text>
            <Text>{streamingText}</Text>
          </Box>
        ) : null}
      </Box>
      <Box>
        <Text color="gray">› </Text>
        <TextInput value={input} onChange={setInput} />
      </Box>
    </Box>
  );
}
```

Update `src/tui/navigation.ts` to add `engineer` screen.

Update `src/app.tsx` to:
- After `downloadSession` completes, load `SessionStore` and `TimingService`.
- Build tools + prompt + agent session.
- Route to `EngineerChat` screen and stream tokens into state.

**Step 4: Run tests to verify pass**

Run:
```bash
mise run test -- src/tui/chat-state.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/screens/EngineerChat.tsx src/tui/chat-state.ts src/tui/chat-state.test.ts src/tui/navigation.ts src/app.tsx

git commit -m "feat: add engineer chat UI and route after download"
```

---

### Task 9: End-to-end smoke test

**Files:**
- Modify: `README.md` (if needed)

**Step 1: Run full test suite**

Run:
```bash
mise run test
```
Expected: PASS.

**Step 2: Manual smoke test**

Run:
```bash
mise run dev
```
Expected: download a session → chat screen appears → send prompt → streaming reply.

**Step 3: Commit any doc tweaks**

```bash
git add README.md

git commit -m "docs: update AI engineer usage notes"
```

---

Plan complete and saved to `docs/plans/2026-02-01-ai-race-engineer-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
