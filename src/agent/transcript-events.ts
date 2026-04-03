export type UserMessageEvent = {
  id: string;
  type: 'user-message';
  text: string;
};

export type AssistantMessageEvent = {
  id: string;
  type: 'assistant-message';
  text: string;
  streaming: boolean;
};

export type ToolCallEvent = {
  id: string;
  type: 'tool-call';
  toolName: string;
  label: string;
};

export type ToolResultEvent = {
  id: string;
  type: 'tool-result';
  toolName: string;
  label: string;
  error?: string;
};

export type TranscriptEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolCallEvent
  | ToolResultEvent;
