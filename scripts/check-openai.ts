const apiBase = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1';
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(1);
}

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const modelArg = getArg('--model') ?? 'gpt-5.2-codex';

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
}

function truncate(input: string, max = 4000) {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}\n...truncated...`;
}

function extractOutputText(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload.output)) {
    const parts: string[] = [];
    for (const item of payload.output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string') parts.push(c.text);
        }
      }
    }
    if (parts.length > 0) return parts.join('');
  }
  return null;
}

async function main() {
  console.log(`API base: ${apiBase}`);
  console.log('Listing models...');
  const { res: listRes, text: listText, json: listJson } = await request('/models');
  if (!listRes.ok) {
    console.error(`Models list failed: ${listRes.status} ${listRes.statusText}`);
    console.error(truncate(listText));
    process.exit(1);
  }
  const ids = Array.isArray(listJson?.data)
    ? listJson.data.map((m: any) => m.id).filter(Boolean)
    : [];
  console.log(`Models found: ${ids.length}`);
  const matches = ids.filter((id: string) => id.includes('gpt-5') || id.includes('codex'));
  if (matches.length > 0) {
    console.log('Matching models:');
    for (const id of matches) console.log(`- ${id}`);
  }
  if (!ids.includes(modelArg)) {
    console.warn(`Model not found in list: ${modelArg}`);
  }

  if (!probe) return;

  console.log(`\nProbing responses with model: ${modelArg}`);
  const payload = {
    model: modelArg,
    input: 'ping',
    max_output_tokens: 32,
  };
  const { res: probeRes, text: probeText, json: probeJson } = await request(
    '/responses',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (!probeRes.ok) {
    console.error(`Responses probe failed: ${probeRes.status} ${probeRes.statusText}`);
    console.error(truncate(probeText));
    process.exit(1);
  }
  const outputText = extractOutputText(probeJson);
  console.log('Responses probe OK.');
  if (outputText) {
    console.log(`Output: ${outputText}`);
  } else {
    console.log('No output_text in response. Raw payload:');
    console.log(truncate(JSON.stringify(probeJson, null, 2)));
  }
}

void main();
