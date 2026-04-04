import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import instances from '../../vendor/ink/instances.js';
import type { DOMElement } from '../../vendor/ink/dom.js';
import { darkTheme } from '../theme/tokens.js';
import { MenuList } from './MenuList.js';

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));
const lockPath = path.join(tmpdir(), 'f1aire-terminal-widget-tests.lock');

type InkInstanceWithRootNode = {
  rootNode: DOMElement;
};

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

function readMenuRows(stdout: NodeJS.WriteStream) {
  const instance = instances.get(stdout) as InkInstanceWithRootNode | undefined;
  const rootNode = instance?.rootNode;
  const listNode = rootNode?.childNodes[0];

  if (!listNode || listNode.nodeName === '#text') {
    return [];
  }

  return listNode.childNodes.map((rowNode) => {
    if (rowNode.nodeName === '#text') {
      return { label: rowNode.nodeValue, textStyles: {} };
    }

    const textNode = rowNode.childNodes[0];
    if (!textNode || textNode.nodeName === '#text') {
      return { label: '', textStyles: {} };
    }

    const label = textNode.childNodes
      .map((child) => (child.nodeName === '#text' ? child.nodeValue : ''))
      .join('');

    return {
      label,
      textStyles: textNode.textStyles ?? {},
    };
  });
}

describe('MenuList', () => {
  beforeAll(async () => {
    await acquireLock();
  });

  afterAll(async () => {
    await releaseLock();
  });

  it('moves the highlight with arrow keys and submits on enter', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
        ]}
        onSelect={onSelect}
      />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[B');
    ui.stdin.write('\r');
    await waitForTick();

    expect(onSelect).toHaveBeenCalledWith(2025);
    ui.unmount();
  });

  it('supports vim keys with wrap-around navigation', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
          { label: '2024', value: 2024 },
        ]}
        onSelect={onSelect}
      />,
    );

    await waitForTick();
    ui.stdin.write('k');
    ui.stdin.write('\r');
    await waitForTick();

    expect(onSelect).toHaveBeenCalledWith(2024);
    ui.unmount();
  });

  it('supports direct digit selection and submission', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
          { label: '2024', value: 2024 },
        ]}
        onSelect={onSelect}
      />,
    );

    await waitForTick();
    ui.stdin.write('2');
    await waitForTick();

    expect(onSelect).toHaveBeenCalledWith(2025);
    ui.unmount();
  });

  it('treats CRLF as a single submit', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
        ]}
        onSelect={onSelect}
      />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[B');
    ui.stdin.write('\r\n');
    await waitForTick();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2025);
    ui.unmount();
  });

  it('ignores input while unfocused', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
        ]}
        onSelect={onSelect}
        isFocused={false}
      />,
    );

    await waitForTick();
    ui.stdin.write('\u001b[B');
    ui.stdin.write('2');
    ui.stdin.write('\r');
    await waitForTick();

    expect(onSelect).not.toHaveBeenCalled();
    expect(ui.lastFrame()).toContain('› 2026');
    ui.unmount();
  });

  it('renders a clean list without a surrounding box frame', async () => {
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
        ]}
        onSelect={() => {}}
      />,
    );

    await waitForTick();

    expect(ui.lastFrame()).toContain('› 2026');
    expect(ui.lastFrame()).not.toContain('╭');
    expect(ui.lastFrame()).not.toContain('╰');
    ui.unmount();
  });

  it('moves selected and dim styling with the highlighted row', async () => {
    const ui = await renderTui(
      <MenuList
        items={[
          { label: 'Resume chat', value: 'resume' },
          { label: 'New conversation', value: 'fresh' },
        ]}
        onSelect={() => {}}
      />,
    );

    await waitForTick();
    expect(readMenuRows(ui.stdout)).toEqual([
      {
        label: '› Resume chat',
        textStyles: { color: darkTheme.chrome.selected },
      },
      {
        label: '  New conversation',
        textStyles: { color: darkTheme.chrome.subtle, dim: true },
      },
    ]);

    ui.stdin.write('\u001b[B');
    await waitForTick();

    expect(ui.lastFrame()).toContain('› New conversation');
    expect(readMenuRows(ui.stdout)).toEqual([
      {
        label: '  Resume chat',
        textStyles: { color: darkTheme.chrome.subtle, dim: true },
      },
      {
        label: '› New conversation',
        textStyles: { color: darkTheme.chrome.selected },
      },
    ]);
    ui.unmount();
  });
});
