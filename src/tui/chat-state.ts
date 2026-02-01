export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function appendUserMessage(
  history: ChatMessage[],
  content: string,
): ChatMessage[] {
  return [...history, { role: 'user', content }];
}
