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
