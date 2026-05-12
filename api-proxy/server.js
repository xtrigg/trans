const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const path = require('path');
const { Readable } = require('stream');

function buildRealtimeTranslationSessionPayload({
  targetLanguage = 'zh'
} = {}) {
  const session = {
    model: 'gpt-realtime-translate',
    audio: {
      output: {
        language: targetLanguage
      }
    }
  };

  return { session };
}

function createApp(options = {}) {
  const app = express();

  const openaiApiKey = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
  const azureTtsKey = options.azureTtsKey ?? process.env.AZURE_TTS_KEY;
  const azureSpeechKey = options.azureSpeechKey ?? process.env.AZURE_SPEECH_KEY ?? azureTtsKey;
  const azureSpeechRegion = options.azureSpeechRegion ?? process.env.AZURE_SPEECH_REGION ?? 'westus';
  const httpClient = options.httpClient ?? axios;

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
