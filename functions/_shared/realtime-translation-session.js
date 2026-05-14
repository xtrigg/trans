const OPENAI_REALTIME_TRANSLATION_SECRET_URL = 'https://api.openai.com/v1/realtime/translations/client_secrets';

function normalizeRealtimeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    chinese: 'zh',
    'zh-cn': 'zh',
    'zh-hans': 'zh',
    mandarin: 'zh',
    english: 'en',
    japanese: 'ja',
    korean: 'ko',
    spanish: 'es',
    french: 'fr'
  };

  return map[normalized] || normalized || 'zh';
}

export function buildRealtimeTranslationSessionPayload({
  targetLanguage = 'zh'
} = {}) {
  const session = {
    model: 'gpt-realtime-translate',
    audio: {
      output: {
        language: normalizeRealtimeLanguage(targetLanguage)
      }
    }
  };

  return { session };
}

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

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const openaiApiKey = env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return jsonResponse({
      error: 'OpenAI API密钥未配置，无法创建 realtime translation session'
    }, 500);
  }

  const body = await readJson(request);
  const payload = buildRealtimeTranslationSessionPayload(body);
  const safetyIdentifier = request.headers.get('X-User-Id') || 'cloudflare-pages-translation-demo';

  try {
    const response = await fetch(OPENAI_REALTIME_TRANSLATION_SECRET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }

    if (!response.ok) {
      return jsonResponse({
        error: data?.error?.message || data?.error || `OpenAI realtime session failed: ${response.status}`
      }, 500);
    }

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({
      error: error?.message || String(error)
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}
