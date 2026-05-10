const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const { Readable } = require('stream');

const app = express();

// 支持较大的JSON请求体（用于音频数据）
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// 从环境变量读取API密钥
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY;
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_KEY; // Speech Key，如果未设置则使用TTS Key
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'westus';

// 验证API密钥
if (!OPENAI_API_KEY) {
  console.error('错误: 未设置OPENAI_API_KEY环境变量');
}
if (!AZURE_TTS_KEY) {
  console.error('错误: 未设置AZURE_TTS_KEY环境变量');
}
if (!AZURE_SPEECH_KEY) {
  console.error('错误: 未设置AZURE_SPEECH_KEY环境变量');
}

console.log('API代理服务初始化中...');
console.log(`Azure语音区域: ${AZURE_SPEECH_REGION}`);
console.log(`OpenAI API密钥: ${OPENAI_API_KEY ? '已设置' : '未设置'}`);
console.log(`Azure TTS密钥: ${AZURE_TTS_KEY ? '已设置' : '未设置'}`);
console.log(`Azure Speech密钥: ${AZURE_SPEECH_KEY ? '已设置' : '未设置'}`);

// OpenAI Chat API代理
app.post('/api/openai/chat', async (req, res) => {
  try {
    console.log('处理OpenAI Chat API请求');
    
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API密钥未配置' });
    }
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', req.body, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
    console.log('OpenAI Chat API请求成功');
  } catch (error) {
    console.error('OpenAI Chat API错误:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// 语言检测API代理
app.post('/api/openai/detect-language', async (req, res) => {
  try {
    console.log('处理语言检测请求');
    
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API密钥未配置' });
    }
    
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: '缺少文本参数' });
    }
    
    const msgs = [
      {
        role: "system",
        content: "You are a language detection tool. Analyze the text and return ONLY the language code of the dominant language (the language with most characters). Return only the short code like 'zh', 'en', 'fr', 'es', 'ko', etc. No explanation."
      },
      { role: "user", content: text }
    ];
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: msgs,
      temperature: 0
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const detectedLang = response.data.choices[0].message.content.trim();
    res.json({ language: detectedLang });
    console.log(`检测到语言: ${detectedLang}`);
  } catch (error) {
    console.error('语言检测错误:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// OpenAI Whisper API代理
app.post('/api/openai/whisper', async (req, res) => {
  try {
    console.log('处理OpenAI Whisper API请求');

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API密钥未配置' });
    }

    const { audio, model, language, prompt } = req.body;

    if (!audio) {
      return res.status(400).json({ error: '缺少音频数据' });
    }

    // 将Base64转换为Buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log(`音频数据大小: ${audioBuffer.length} bytes (${(audioBuffer.length / 1024).toFixed(2)} KB)`);

    // 创建FormData
    const formData = new FormData();

    // 创建可读流从Buffer
    const stream = new Readable();
    stream.push(audioBuffer);
    stream.push(null);

    // 添加到FormData
    formData.append('file', stream, { filename: 'audio.wav', contentType: 'audio/wav' });
    formData.append('model', model || 'whisper-1');

    // 添加可选参数 - 减少幻觉
    if (language) {
      formData.append('language', language);
    }
    if (prompt) {
      formData.append('prompt', prompt);
    }

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 60000, // 60秒超时
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    res.json(response.data);
    console.log('OpenAI Whisper API请求成功，转写结果:', response.data.text?.substring(0, 100));
  } catch (error) {
    console.error('OpenAI Whisper API错误:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// OpenAI TTS API代理
app.post('/api/openai/tts', async (req, res) => {
  try {
    console.log('处理OpenAI TTS API请求');
    
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API密钥未配置' });
    }
    
    const { text, voice } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: '缺少文本参数' });
    }
    
    const response = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1',
      input: text,
      voice: voice || 'shimmer'
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    
    res.set('Content-Type', 'audio/mp3');
    res.send(Buffer.from(response.data));
    console.log('OpenAI TTS API请求成功');
  } catch (error) {
    console.error('OpenAI TTS API错误:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// Azure TTS API代理
app.post('/api/azure/tts', async (req, res) => {
  try {
    console.log('处理Azure TTS API请求');
    
    if (!AZURE_TTS_KEY) {
      return res.status(500).json({ error: 'Azure TTS密钥未配置' });
    }
    
    const { ssml, voice } = req.body;
    
    if (!ssml) {
      return res.status(400).json({ error: '缺少SSML参数' });
    }
    
    const response = await axios.post(
      `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      ssml,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
        },
        responseType: 'arraybuffer'
      }
    );
    
    res.set('Content-Type', 'audio/mp3');
    res.send(Buffer.from(response.data));
    console.log('Azure TTS API请求成功');
  } catch (error) {
    console.error('Azure TTS API错误:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// Azure Speech 配置获取端点（用于前端 SDK）
app.get('/api/azure/speech-config', (req, res) => {
  if (!AZURE_SPEECH_KEY) {
    return res.status(500).json({ error: 'Azure Speech密钥未配置' });
  }

  res.json({
    key: AZURE_SPEECH_KEY,
    region: AZURE_SPEECH_REGION
  });
  console.log('Azure Speech配置已提供给前端');
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    openaiApiKey: OPENAI_API_KEY ? '已配置' : '未配置',
    azureTtsKey: AZURE_TTS_KEY ? '已配置' : '未配置',
    azureSpeechKey: AZURE_SPEECH_KEY ? '已配置' : '未配置',
    azureRegion: AZURE_SPEECH_REGION
  });
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
  console.log(`API代理服务器运行在端口 ${PORT}`);
}); 