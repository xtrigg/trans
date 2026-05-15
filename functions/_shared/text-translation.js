const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
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

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isRecoverableTranscriptionError(message) {
  const normalized = String(message || '').toLowerCase();
  return [
    'corrupted',
    'unsupported',
    'could not be decoded',
    'invalid file format',
    'audio file'
  ].some((signal) => normalized.includes(signal));
}

export function buildTextTranslationPrompt({
  transcript,
  targetLanguage = 'zh'
} = {}) {
  return {
    model: 'gpt-5.2',
    max_output_tokens: 600,
    instructions: [
      'You are a professional live meeting interpreter.',
      'Translate the transcript into clear Simplified Chinese for a parent or business user reading live captions.',
      'Preserve names, numbers, dates, school terms, action items, and tone.',
      'Do not add facts. If the transcript is fragmentary, translate only what is present.',
      'Return JSON with translation and summary.'
    ].join('\n'),
    input: [
      `Target language: ${targetLanguage}`,
      '',
      'Transcript:',
      String(transcript || '').trim()
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'economical_text_translation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            translation: { type: 'string' },
            summary: { type: 'string' }
          },
          required: ['translation', 'summary']
        }
      }
    }
  };
}

function normalizeTranslationOutput(data) {
  const raw = data?.output_text
    || data?.output?.flatMap((item) => item?.content || [])
      .map((content) => content?.text || '')
      .join('')
    || '';
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      targetText: String(parsed.translation || '').trim(),
      summary: String(parsed.summary || '').trim()
    };
  } catch {
    return {
      targetText: String(raw || '').trim(),
      summary: ''
    };
  }
}

async function transcribeAudio({ openaiApiKey, audioBase64, mimeType, previousTranscript }) {
  const bytes = bytesFromBase64(audioBase64);
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), 'meeting-audio.webm');
  formData.append('model', 'gpt-4o-mini-transcribe');
  if (previousTranscript) {
    formData.append('prompt', String(previousTranscript).slice(-1600));
  }

  const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `OpenAI transcription failed: ${response.status}`;
    const error = new Error(message);
    error.recoverable = isRecoverableTranscriptionError(message);
    throw error;
  }
  return String(data.text || '').trim();
}

async function translateTranscript({ openaiApiKey, transcript, targetLanguage }) {
  const payload = buildTextTranslationPrompt({ transcript, targetLanguage });
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `OpenAI translation failed: ${response.status}`);
  }
  return normalizeTranslationOutput(data);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return jsonResponse({ error: 'OpenAI API密钥未配置，无法使用省钱文字模式' }, 500);
  }

  const body = await readJson(request);
  const audioBase64 = String(body.audioBase64 || '').trim();
  if (!audioBase64) {
    return jsonResponse({ error: '缺少音频数据，无法转写' }, 400);
  }

  try {
    const sourceText = await transcribeAudio({
      openaiApiKey,
      audioBase64,
      mimeType: body.mimeType,
      previousTranscript: body.previousTranscript
    });
    if (!sourceText) {
      return jsonResponse({ sourceText: '', targetText: '', summary: '' });
    }
    const translated = await translateTranscript({
      openaiApiKey,
      transcript: sourceText,
      targetLanguage: body.targetLanguage || 'zh'
    });
    return jsonResponse({ sourceText, ...translated });
  } catch (error) {
    if (error?.recoverable) {
      return jsonResponse({
        skipped: true,
        sourceText: '',
        targetText: '',
        summary: '',
        warning: '音频片段无法识别，已跳过。请继续说话，或切换到实时译声模式。'
      });
    }
    return jsonResponse({ error: error?.message || String(error) }, 500);
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

export async function onRequest() {
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}
