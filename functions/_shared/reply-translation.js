const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

async function readJson(request) {
  if (!request.body) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function trimContext(value) {
  return String(value || '').trim().slice(-2000);
}

export function buildReplyTranslationPrompt(input) {
  const {
    text,
    contextSource = '',
    contextTranslation = ''
  } = typeof input === 'string' ? { text: input } : (input || {});
  const sourceContext = trimContext(contextSource);
  const translationContext = trimContext(contextTranslation);

  return {
    instructions: [
      'You help a Chinese-speaking parent or business user reply in spoken English during live meetings.',
      'Convert the Chinese input into natural, polite, easy-to-read spoken English.',
      'Use the meeting context when it is provided, especially to preserve names, times, and what the other person just said.',
      'Keep the meaning faithful. Do not add facts.',
      'Return JSON with english, short_version, and notes.',
      'english should be the recommended full reply.',
      'short_version should be a shorter sentence the user can read aloud if they are nervous.',
      'notes should be brief Chinese guidance about tone or pronunciation, or an empty string.'
    ].join('\n'),
    input: [
      'Meeting context source transcript:',
      sourceContext || '(none)',
      '',
      'Meeting context Chinese translation:',
      translationContext || '(none)',
      '',
      'Chinese reply draft:',
      text
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'meeting_reply_translation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            english: { type: 'string' },
            short_version: { type: 'string' },
            notes: { type: 'string' }
          },
          required: ['english', 'short_version', 'notes']
        }
      }
    }
  };
}

function normalizeReplyOutput(data) {
  const raw = data?.output_text
    || data?.output?.flatMap((item) => item?.content || [])
      .map((content) => content?.text || '')
      .join('')
    || '';

  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { english: raw, short_version: '', notes: '' };
  }

  return {
    english: String(parsed.english || '').trim(),
    shortVersion: String(parsed.short_version || parsed.shortVersion || '').trim(),
    notes: String(parsed.notes || '').trim()
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const openaiApiKey = env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return jsonResponse({ error: 'OpenAI API密钥未配置，无法生成英文回复' }, 500);
  }

  const body = await readJson(request);
  const text = String(body.text || '').trim();
  if (!text) {
    return jsonResponse({ error: '请先输入或说出中文回复内容' }, 400);
  }

  const prompt = buildReplyTranslationPrompt({
    text,
    contextSource: body.contextSource,
    contextTranslation: body.contextTranslation
  });
  const payload = {
    model: env.OPENAI_REPLY_MODEL || 'gpt-5.2',
    max_output_tokens: 500,
    ...prompt
  };

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { error: responseText };
    }

    if (!response.ok) {
      return jsonResponse({
        error: data?.error?.message || data?.error || `OpenAI reply translation failed: ${response.status}`
      }, 500);
    }

    return jsonResponse(normalizeReplyOutput(data));
  } catch (error) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}
