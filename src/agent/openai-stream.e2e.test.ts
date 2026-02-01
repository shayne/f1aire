import { describe, it, expect } from 'vitest';
import { openai } from '@ai-sdk/openai';
import { createEngineerSession } from './engineer.js';
import { systemPrompt } from './prompt.js';

const runE2E = process.env.F1AIRE_E2E === '1';
const apiKey = process.env.OPENAI_API_KEY;

if (runE2E && !apiKey) {
  throw new Error('F1AIRE_E2E=1 requires OPENAI_API_KEY');
}

const modelId = process.env.OPENAI_API_MODEL ?? 'gpt-5.2-codex';

describe.runIf(runE2E && !!apiKey)('openai streaming e2e', () => {
  it('streams a response from the model', async () => {
    const model = openai(modelId);
    const session = createEngineerSession({
      model,
      tools: {},
      system: systemPrompt,
    });

    let text = '';
    let chunks = 0;
    for await (const chunk of session.send('Reply with the single word: pong')) {
      chunks += 1;
      text += chunk;
    }

    expect(chunks).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain('pong');
  }, 20000);
});
