import type { TranscriptEvent } from '../../agent/transcript-events.js';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { TimeCursor } from '../../core/time-cursor.js';
import type { ChatMessage } from '../chat-state.js';
import type { Screen } from '../navigation.js';

export type RuntimeState = {
  ready: boolean;
  message: string;
  progress: {
    phase: 'downloading' | 'extracting' | 'ready';
    downloadedBytes?: number;
    totalBytes?: number;
  } | null;
};

export type ApiKeyState = {
  storedApiKey: string | null;
  apiKeyError: string | null;
};

export type EngineerUiState = {
  messages: ChatMessage[];
  transcriptEvents: TranscriptEvent[];
  streamingText: string;
  isStreaming: boolean;
  streamStatus: string | null;
  activity: string[];
  pythonCodePreview: string;
  pythonCodeTarget: string;
  summary: SummaryData | null;
  timeCursor: TimeCursor;
};

export type AppState = {
  screen: Screen;
  runtime: RuntimeState;
  apiKey: ApiKeyState;
  engineer: EngineerUiState;
};

export function createInitialAppState(): AppState {
  return {
    screen: { name: 'season' },
    runtime: {
      ready: false,
      message: 'Checking Python runtime...',
      progress: null,
    },
    apiKey: {
      storedApiKey: null,
      apiKeyError: null,
    },
    engineer: {
      messages: [],
      transcriptEvents: [],
      streamingText: '',
      isStreaming: false,
      streamStatus: null,
      activity: [],
      pythonCodePreview: '',
      pythonCodeTarget: '',
      summary: null,
      timeCursor: { latest: true },
    },
  };
}
