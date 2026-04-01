import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { SecretTextInput } from './SecretTextInput.js';

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));
const lockPath = path.join(tmpdir(), 'f1aire-terminal-widget-tests.lock');

async function acquireLock() {
  for (;;) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      throw error;
    }
  }
}

async function releaseLock() {
  await rm(lockPath, { recursive: true, force: true });
}

function ControlledHarness({
  initialValue = '',
  onSubmit,
}: {
  initialValue?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <SecretTextInput value={value} onChange={setValue} onSubmit={onSubmit} />
  );
}

function RejectingHarness({
  initialValue = '',
  onSubmit,
}: {
  initialValue?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <SecretTextInput
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue.replaceAll('X', ''));
      }}
      onSubmit={onSubmit}
    />
  );
}

describe('SecretTextInput', () => {
  beforeAll(async () => {
    await acquireLock();
  });

  afterAll(async () => {
    await releaseLock();
  });

  it('masks text and submits the trimmed value on enter', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(<ControlledHarness onSubmit={onSubmit} />);

    await waitForTick();
    ui.stdin.write('s');
    ui.stdin.write('k');
    ui.stdin.write('-');
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('***');
    expect(onSubmit).toHaveBeenCalledWith('sk-');
    ui.unmount();
  });

  it('treats CRLF as a single submit', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(<ControlledHarness onSubmit={onSubmit} />);

    await waitForTick();
    ui.stdin.write('s');
    ui.stdin.write('k');
    ui.stdin.write('-');
    ui.stdin.write('\r\n');
    await waitForTick();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('sk-');
    ui.unmount();
  });

  it('ignores tab-family input', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <SecretTextInput value="" onChange={() => {}} onSubmit={onSubmit} />,
    );

    await waitForTick();
    ui.stdin.write('\t');
    ui.stdin.write('\u001b[Z');
    await waitForTick();

    expect(ui.lastFrame()).toContain('sk-...');
    expect(onSubmit).not.toHaveBeenCalled();
    ui.unmount();
  });

  it('supports left-arrow insertion in the middle of the draft', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(<ControlledHarness onSubmit={onSubmit} />);

    await waitForTick();
    ui.stdin.write('a');
    ui.stdin.write('b');
    ui.stdin.write('c');
    ui.stdin.write('d');
    await waitForTick();
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\u001b[D');
    await waitForTick();
    ui.stdin.write('X');
    await waitForTick();
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('***▌**');
    expect(onSubmit).toHaveBeenCalledWith('abXcd');
    ui.unmount();
  });

  it('supports right-arrow movement for mid-string insertion', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <ControlledHarness initialValue="abcd" onSubmit={onSubmit} />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\u001b[C');
    ui.stdin.write('X');
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('***▌**');
    expect(onSubmit).toHaveBeenCalledWith('abXcd');
    ui.unmount();
  });

  it('supports mid-string backspace', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <ControlledHarness initialValue="abcd" onSubmit={onSubmit} />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\u001b[D');
    await waitForTick();
    ui.stdin.write('X');
    await waitForTick();
    expect(ui.lastFrame()).toContain('***▌**');
    ui.stdin.write('\u001b[D');
    await waitForTick();
    ui.stdin.write('\x7f');
    await waitForTick();
    await waitForTick();
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toMatch(/\*+▌\*+/);
    expect(onSubmit).toHaveBeenCalledWith('aXcd');
    ui.unmount();
  });

  it('preserves the cursor during parent-controlled rerenders', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(<ControlledHarness onSubmit={onSubmit} />);

    await waitForTick();
    ui.stdin.write('a');
    ui.stdin.write('b');
    ui.stdin.write('c');
    ui.stdin.write('d');
    await waitForTick();
    ui.stdin.write('\u001b[D');
    await waitForTick();
    ui.stdin.write('X');
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('****▌*');
    expect(onSubmit).toHaveBeenCalledWith('abcXd');
    ui.unmount();
  });

  it('reconciles to a parent-controlled value without leaving stale local text', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <RejectingHarness initialValue="abcd" onSubmit={onSubmit} />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[D');
    await waitForTick();
    ui.stdin.write('X');
    await waitForTick();
    await waitForTick();
    expect(ui.lastFrame()).toContain('***▌*');
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('***▌*');
    expect(onSubmit).toHaveBeenCalledWith('abcd');
    ui.unmount();
  });

  it('ignores input while unfocused', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <SecretTextInput
        value=""
        onChange={() => {}}
        onSubmit={onSubmit}
        isFocused={false}
      />,
    );

    await waitForTick();
    ui.stdin.write('s');
    ui.stdin.write('\u001b[D');
    ui.stdin.write('\r');
    await waitForTick();

    expect(ui.lastFrame()).toContain('sk-...');
    expect(onSubmit).not.toHaveBeenCalled();
    ui.unmount();
  });
});
