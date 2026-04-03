export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function appendUserMessage(
  history: ChatMessage[],
  content: string,
): ChatMessage[] {
  const prompt = content.trim();
  if (!prompt) return history;
  return [...history, { role: 'user', content: prompt }];
}
