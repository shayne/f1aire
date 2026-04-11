import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('ChatGptAuthPrompt', () => {
  it('starts browser OAuth and completes with the saved ChatGPT auth payload', async () => {
    const waitForCompletion = vi.fn(async () => ({
      accessToken: 'chatgpt-access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'acct-chatgpt',
      accountEmail: 'user@example.com',
      planType: 'plus',
    }));
    const cancel = vi.fn(async () => {});
    vi.doMock('../../core/openai-auth.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../core/openai-auth.js')
      >('../../core/openai-auth.js');
      return {
        ...actual,
        startChatGptOpenAIAuth: vi.fn(async () => ({
          authUrl: 'https://auth.openai.com/oauth/authorize?state=test',
          waitForCompletion,
          cancel,
        })),
      };
    });

    const onDone = vi.fn();
    const onCancel = vi.fn();
    const [{ renderTui }, { ChatGptAuthPrompt }] = await Promise.all([
      import('#ink/testing'),
      import('./ChatGptAuthPrompt.js'),
    ]);
    const app = await renderTui(
      <ChatGptAuthPrompt onDone={onDone} onCancel={onCancel} />,
    );

    await vi.waitFor(() => {
      expect(waitForCompletion).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledWith({
        accessToken: 'chatgpt-access-token',
        refreshToken: 'refresh-token',
        expiresAt: 123456,
        accountId: 'acct-chatgpt',
        accountEmail: 'user@example.com',
        planType: 'plus',
      });
    });

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Continue in your browser');
    expect(frame).toContain('https://auth.openai.com/oauth/authorize?state=test');
    expect(onCancel).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    app.unmount();
  });

  it('cancels the active OAuth attempt on Escape', async () => {
    let rejectCompletion: ((error: Error) => void) | null = null;
    const completionPromise = new Promise<never>((_, reject) => {
      rejectCompletion = reject;
    });
    const waitForCompletion = vi.fn(() => completionPromise);
    const cancel = vi.fn(async () => {
      rejectCompletion?.(new Error('ChatGPT login was cancelled.'));
      await completionPromise.catch(() => {});
    });
    vi.doMock('../../core/openai-auth.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../core/openai-auth.js')
      >('../../core/openai-auth.js');
      return {
        ...actual,
        startChatGptOpenAIAuth: vi.fn(async () => ({
          authUrl: 'https://auth.openai.com/oauth/authorize?state=test',
          waitForCompletion,
          cancel,
        })),
      };
    });

    const onDone = vi.fn();
    const onCancel = vi.fn();
    const [{ renderTui }, { ChatGptAuthPrompt }] = await Promise.all([
      import('#ink/testing'),
      import('./ChatGptAuthPrompt.js'),
    ]);
    const app = await renderTui(
      <ChatGptAuthPrompt onDone={onDone} onCancel={onCancel} />,
    );

    await vi.waitFor(() => {
      expect(waitForCompletion).toHaveBeenCalledTimes(1);
    });

    app.stdin.write('\u001b');

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
    expect(onDone).not.toHaveBeenCalled();

    app.unmount();
  });

  it('copies the fallback auth URL when c is pressed', async () => {
    const waitForCompletion = vi.fn(
      () => new Promise<OpenAIChatGptAuthConfig>(() => {}),
    );
    const cancel = vi.fn(async () => {});
    const setClipboard = vi.fn(async () => '');
    vi.doMock('../../core/openai-auth.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../core/openai-auth.js')
      >('../../core/openai-auth.js');
      return {
        ...actual,
        startChatGptOpenAIAuth: vi.fn(async () => ({
          authUrl: 'https://auth.openai.com/oauth/authorize?state=test',
          waitForCompletion,
          cancel,
        })),
      };
    });
    vi.doMock('../../vendor/ink/termio/osc.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../vendor/ink/termio/osc.js')
      >('../../vendor/ink/termio/osc.js');
      return {
        ...actual,
        setClipboard,
      };
    });

    const onDone = vi.fn();
    const onCancel = vi.fn();
    const [{ renderTui }, { ChatGptAuthPrompt }] = await Promise.all([
      import('#ink/testing'),
      import('./ChatGptAuthPrompt.js'),
    ]);
    const app = await renderTui(
      <ChatGptAuthPrompt onDone={onDone} onCancel={onCancel} />,
    );

    await vi.waitFor(() => {
      expect(waitForCompletion).toHaveBeenCalledTimes(1);
      expect(app.lastFrame()).toContain('c copy URL');
    });

    app.stdin.write('c');

    await vi.waitFor(() => {
      expect(setClipboard).toHaveBeenCalledWith(
        'https://auth.openai.com/oauth/authorize?state=test',
      );
      expect(app.lastFrame()).toContain('Copied URL to clipboard.');
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    app.unmount();
  });
});
