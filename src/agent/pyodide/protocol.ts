export type InitMessage = { type: 'init'; indexURL: string; packageCacheDir: string };
export type RunMessage = { type: 'run'; id: string; code: string; context?: unknown };
export type ToolCallMessage = { type: 'tool-call'; id: string; name: string; args: unknown };
export type ResetMessage = { type: 'reset' };
export type ShutdownMessage = { type: 'shutdown' };

export type WorkerMessage = InitMessage | RunMessage | ToolCallMessage | ResetMessage | ShutdownMessage;

export type InitResult = { type: 'init-result'; ok: boolean; error?: string };
export type RunResult = { type: 'run-result'; id: string; ok: boolean; value?: unknown; error?: string };
export type ToolResultMessage = { type: 'tool-result'; id: string; ok: boolean; value?: unknown; error?: string };

export type WorkerResponse = InitResult | RunResult | ToolResultMessage;
