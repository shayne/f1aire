export type InitMessage = { type: 'init'; indexURL: string; packageCacheDir: string };
export type RunMessage = { type: 'run'; id: string; code: string; context?: unknown };
export type ResetMessage = { type: 'reset' };
export type ShutdownMessage = { type: 'shutdown' };

export type WorkerMessage = InitMessage | RunMessage | ResetMessage | ShutdownMessage;

export type InitResult = { type: 'init-result'; ok: boolean; error?: string };
export type RunResult = { type: 'run-result'; id: string; ok: boolean; value?: unknown; error?: string };

export type WorkerResponse = InitResult | RunResult;
