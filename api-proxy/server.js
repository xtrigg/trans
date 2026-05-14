const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const path = require('path');
const { Readable } = require('stream');
const { buildRealtimeTranslationSessionPayload } = require('../lib/realtime-session-payload');

function createApp(options = {}) {
  const app = express();

  const openaiApiKey = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
  const azureTtsKey = options.azureTtsKey ?? process.env.AZURE_TTS_KEY;
  const azureSpeechKey = options.azureSpeechKey ?? process.env.AZURE_SPEECH_KEY ?? azureTtsKey;
  const azureSpeechRegion = options.azureSpeechRegion ?? process.env.AZURE_SPEECH_REGION ?? 'westus';
  const httpClient = options.httpClient ?? axios;

  function trimContext(value) {
    return String(value || '').trim().slice(-2000);
  }

  function buildReplyTranslationPayload({
    text,
    contextSource = '',
    contextTranslation = ''
  }) {
    return {
      model: process.env.OPENAI_REPLY_MODEL || 'gpt-5.2',
      max_output_tokens: 500,
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
        trimContext(contextSource) || '(none)',
        '',
        'Meeting context Chinese translation:',
        trimContext(contextTranslation) || '(none)',
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

  function buildReplySpeechPayload({
    text,
    voice = 'coral'
  } = {}) {
    return {
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice,
      input: String(text || '').trim(),
      response_format: 'mp3',
      instructions: 'Clear, calm spoken English for a live school or business meeting. Natural pace, easy for a non-native speaker to shadow.'
    };
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(cors());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.post('/api/openai/chat', async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置' });
      }

      const response = await httpClient.post('https://api.openai.com/v1/chat/completions', req.body, {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      res.json(response.data);
    } catch (error) {
      console.error('OpenAI Chat API错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/openai/detect-language', async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置' });
      }

      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: '缺少文本参数' });
      }

      const response = await httpClient.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: "You are a language detection tool. Analyze the text and return ONLY the language code of the dominant language (the language with most characters). Return only the short code like 'zh', 'en', 'fr', 'es', 'ko', etc. No explanation."
          },
          { role: 'user', content: text }
        ],
        temperature: 0
      }, {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      res.json({ language: response.data.choices[0].message.content.trim() });
    } catch (error) {
      console.error('语言检测错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/openai/whisper', async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置' });
      }

      const { audio, model, language, prompt } = req.body;
      if (!audio) {
        return res.status(400).json({ error: '缺少音频数据' });
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      const formData = new FormData();
      const stream = new Readable();
      stream.push(audioBuffer);
      stream.push(null);

      formData.append('file', stream, { filename: 'audio.wav', contentType: 'audio/wav' });
      formData.append('model', model || 'whisper-1');
      if (language) formData.append('language', language);
      if (prompt) formData.append('prompt', prompt);

      const response = await httpClient.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          ...formData.getHeaders()
        },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      res.json(response.data);
    } catch (error) {
      console.error('OpenAI Whisper API错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
  });

  app.post('/api/openai/tts', async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置' });
      }

      const { text, voice } = req.body;
      if (!text) {
        return res.status(400).json({ error: '缺少文本参数' });
      }

      const response = await httpClient.post('https://api.openai.com/v1/audio/speech', {
        model: 'tts-1',
        input: text,
        voice: voice || 'shimmer'
      }, {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      });

      res.set('Content-Type', 'audio/mp3');
      res.send(Buffer.from(response.data));
    } catch (error) {
      console.error('OpenAI TTS API错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post([
    '/api/openai/realtime-translation/session',
    '/api-proxy/api/openai/realtime-translation/session'
  ], async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置，无法创建 realtime translation session' });
      }

      const payload = buildRealtimeTranslationSessionPayload(req.body || {});
      const response = await httpClient.post(
        'https://api.openai.com/v1/realtime/translations/client_secrets',
        payload,
        {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Safety-Identifier': req.get('X-User-Id') || 'local-translation-demo'
          },
          timeout: 30000
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error('OpenAI Realtime Translation session错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
  });

  app.post([
    '/api/openai/reply-translation',
    '/api-proxy/api/openai/reply-translation'
  ], async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置，无法生成英文回复' });
      }

      const text = String(req.body?.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: '请先输入或说出中文回复内容' });
      }

      const response = await httpClient.post(
        'https://api.openai.com/v1/responses',
        buildReplyTranslationPayload({
          text,
          contextSource: req.body?.contextSource,
          contextTranslation: req.body?.contextTranslation
        }),
        {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      res.json(normalizeReplyOutput(response.data));
    } catch (error) {
      console.error('OpenAI reply translation错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
  });

  app.post([
    '/api/openai/reply-speech',
    '/api-proxy/api/openai/reply-speech'
  ], async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(500).json({ error: 'OpenAI API密钥未配置，无法生成英文语音' });
      }

      const text = String(req.body?.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: '请先生成或输入英文文本' });
      }

      const response = await httpClient.post(
        'https://api.openai.com/v1/audio/speech',
        buildReplySpeechPayload({ text, voice: req.body?.voice }),
        {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(response.data));
    } catch (error) {
      console.error('OpenAI reply speech错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
  });

  app.post('/api/azure/tts', async (req, res) => {
    try {
      if (!azureTtsKey) {
        return res.status(500).json({ error: 'Azure TTS密钥未配置' });
      }

      const { ssml } = req.body;
      if (!ssml) {
        return res.status(400).json({ error: '缺少SSML参数' });
      }

      const response = await httpClient.post(
        `https://${azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        ssml,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': azureTtsKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
          },
          responseType: 'arraybuffer'
        }
      );

      res.set('Content-Type', 'audio/mp3');
      res.send(Buffer.from(response.data));
    } catch (error) {
      console.error('Azure TTS API错误:', error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/azure/speech-config', (req, res) => {
    if (!azureSpeechKey) {
      return res.status(500).json({ error: 'Azure Speech密钥未配置' });
    }

    res.json({
      key: azureSpeechKey,
      region: azureSpeechRegion
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      openaiApiKey: openaiApiKey ? '已配置' : '未配置',
      azureTtsKey: azureTtsKey ? '已配置' : '未配置',
      azureSpeechKey: azureSpeechKey ? '已配置' : '未配置',
      azureRegion: azureSpeechRegion,
      realtimeTranslation: openaiApiKey ? '可创建session' : '未配置'
    });
  });

  return app;
}

function startServer() {
  const app = createApp();
  const port = process.env.PORT || 3010;

  console.log('API代理服务初始化中...');
  console.log(`Azure语音区域: ${process.env.AZURE_SPEECH_REGION || 'westus'}`);
  console.log(`OpenAI API密钥: ${process.env.OPENAI_API_KEY ? '已设置' : '未设置'}`);
  console.log(`Azure TTS密钥: ${process.env.AZURE_TTS_KEY ? '已设置' : '未设置'}`);
  console.log(`Azure Speech密钥: ${(process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_KEY) ? '已设置' : '未设置'}`);

  app.listen(port, () => {
    console.log(`API代理服务器运行在端口 ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildRealtimeTranslationSessionPayload,
  createApp,
  startServer
};
