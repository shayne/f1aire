import { describe, it, expect } from 'vitest';
import { buildPythonBridgePrelude } from './python-bridge.js';

describe('python bridge prelude', () => {
  it('defines call_tool and blocks run_py', () => {
    const code = buildPythonBridgePrelude();
    expect(code).toContain('import tool_bridge');
    expect(code).toContain('def call_tool');
    expect(code).toContain('run_py');
    expect(code).toContain('asyncio.run');
    expect(code).toContain('run_until_complete');
  });
});
