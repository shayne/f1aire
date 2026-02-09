import { parse, setOptions } from 'marked';
import TerminalRenderer from 'marked-terminal';

function patchListItemInlineMarkdown(renderer: any) {
  const originalListitem = renderer.listitem?.bind(renderer);
  if (typeof originalListitem !== 'function') return;

  renderer.listitem = function patchedListitem(input: unknown) {
    if (
      !input
      || typeof input !== 'object'
      || !Array.isArray((input as any).tokens)
      || !this?.parser
      || typeof this.parser.parseInline !== 'function'
    ) {
      return originalListitem(input as any);
    }

    // marked-terminal currently renders list-item "text" tokens via token.text
    // without expanding nested inline tokens (strong/codespan). Normalize text
    // tokens to their inline-rendered value before delegating.
    const item = input as any;
    const normalizedTokens = item.tokens.map((token: any) => {
      if (token?.type !== 'text' || !Array.isArray(token.tokens)) return token;
      const expanded = this.parser.parseInline(token.tokens);
      return {
        ...token,
        raw: expanded,
        text: expanded,
        tokens: [{ type: 'text', raw: expanded, text: expanded, escaped: false }],
      };
    });

    return originalListitem({ ...item, tokens: normalizedTokens });
  };
}

export function renderMarkdownToTerminal(markdown: string, width: number): string {
  const renderer = new TerminalRenderer({
    width,
    reflowText: true,
  }) as any;
  patchListItemInlineMarkdown(renderer);

  // `marked` keeps a global renderer; set it per render since width is dynamic.
  setOptions({
    renderer,
  });
  const rendered = parse(markdown) as unknown as string;
  return rendered.trimEnd();
}
