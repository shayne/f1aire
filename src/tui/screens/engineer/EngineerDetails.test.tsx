import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { EngineerDetails } from './EngineerDetails.js';

describe('EngineerDetails', () => {
  it('renders a compact status strip and keeps expanded details hidden by default', () => {
    const { lastFrame } = render(
      <EngineerDetails
        year={2025}
        meetingName="Test GP"
        sessionName="Race"
        sessionType="Race"
        summary={null}
        asOfLabel="Latest"
        activity={['Thinking']}
        pythonCode={'print("hi")\n2 + 2'}
        isExpanded={false}
      />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Test GP');
    expect(frame).toContain('Thinking');
    expect(frame).not.toContain('Details');
    expect(frame).not.toContain('print("hi")');
  });

  it('renders the expanded panel with recent activity and python preview when requested', () => {
    const { lastFrame } = render(
      <EngineerDetails
        year={2025}
        meetingName="Test GP"
        sessionName="Race"
        sessionType="Race"
        summary={null}
        asOfLabel="Latest"
        activity={['Thinking', 'Running tool']}
        pythonCode={'import math\nprint("hi")\n2 + 2'}
        isExpanded
      />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Details');
    expect(frame).toContain('Running tool');
    expect(frame).toContain('Python');
    expect(frame).toContain('print("hi")');
  });
});
