export function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];

  if (!globalThis.MediaRecorder?.isTypeSupported) {
    return '';
  }
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function buildTextTranslationRequestBody({
  audioBlob,
  targetLanguage = 'zh',
  previousTranscript = ''
}) {
  return {
    audioBase64: await blobToBase64(audioBlob),
    mimeType: audioBlob.type || 'audio/webm',
    targetLanguage,
    previousTranscript
  };
}

export function appendSegmentText(state, segment) {
  const source = String(segment?.sourceText || '').trim();
  const target = String(segment?.targetText || '').trim();
  if (source) {
    state.sourceText = state.sourceText ? `${state.sourceText}\n${source}` : source;
  }
  if (target) {
    state.targetText = state.targetText ? `${state.targetText}\n${target}` : target;
  }
  return state;
}

export class EconomicalTextTranslator {
  constructor({
    endpoint = '/api-proxy/api/openai/text-translation',
    chunkMs = 8000,
    onStatus = () => {},
    onSegment = () => {},
    onError = () => {}
  } = {}) {
    this.endpoint = endpoint;
    this.chunkMs = chunkMs;
    this.onStatus = onStatus;
    this.onSegment = onSegment;
    this.onError = onError;
    this.stream = null;
    this.recorder = null;
    this.running = false;
    this.previousTranscript = '';
    this.processing = Promise.resolve();
  }

  async start({ targetLanguage = 'zh' } = {}) {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音。请用最新版 Chrome、Edge 或 Safari，并通过 HTTPS 打开页面。');
    }
    if (!globalThis.MediaRecorder) {
      throw new Error('当前浏览器不支持 MediaRecorder，无法使用省钱文字模式。');
    }

    this.onStatus('正在申请麦克风权限...');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.running = true;
    this.previousTranscript = '';
    const mimeType = getSupportedMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0 || !this.running) return;
      this.processing = this.processing
        .then(() => this.processChunk(event.data, targetLanguage))
        .catch((error) => this.onError(error));
    };
    this.recorder.start(this.chunkMs);
    this.onStatus('省钱文字模式已开始。页面会分段转写并翻译，不生成中文译声。');
  }

  async processChunk(audioBlob, targetLanguage) {
    const body = await buildTextTranslationRequestBody({
      audioBlob,
      targetLanguage,
      previousTranscript: this.previousTranscript
    });
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `文字翻译失败：${response.status}`);
    }
    if (data.sourceText) {
      this.previousTranscript = `${this.previousTranscript} ${data.sourceText}`.trim().slice(-1600);
    }
    this.onSegment(data);
  }

  stop() {
    this.running = false;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
