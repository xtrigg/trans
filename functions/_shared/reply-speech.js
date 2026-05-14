const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';

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

export function buildReplySpeechPayload({
  text,
  voice = 'coral',
  model = 'gpt-4o-mini-tts'
} = {}) {
  return {
    model,
    voice,
    input: String(text || '').trim(),
    response_format: 'mp3',
    instructions: 'Clear, calm spoken English for a live school or business meeting. Natural pace, easy for a non-native speaker to shadow.'
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
    return jsonResponse({ error: 'OpenAI API密钥未配置，无法生成英文语音' }, 500);
  }

  const body = await readJson(request);
  const text = String(body.text || '').trim();
  if (!text) {
    return jsonResponse({ error: '请先生成或输入英文文本' }, 400);
  }

  const payload = buildReplySpeechPayload({
    text,
    voice: body.voice || 'coral',
    model: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  });

  try {
    const response = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse({ error: errorText || `OpenAI speech failed: ${response.status}` }, 500);
    }

    const audio = await response.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}
