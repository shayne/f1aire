import { parse, setOptions } from 'marked';
import TerminalRenderer from 'marked-terminal';

export function renderMarkdownToTerminal(markdown: string, width: number): string {
  // `marked` keeps a global renderer; set it per render since width is dynamic.
  setOptions({
    renderer: new TerminalRenderer({
      width,
      reflowText: true,
    }) as any,
  });
  const rendered = parse(markdown) as unknown as string;
  return rendered.trimEnd();
}
