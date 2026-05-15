export function getRealtimeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    chinese: 'zh',
    'zh-cn': 'zh',
    中文: 'zh',
    汉语: 'zh',
    mandarin: 'zh',
    english: 'en',
    英文: 'en',
    英语: 'en',
    japanese: 'ja',
    日文: 'ja',
    korean: 'ko',
    韩文: 'ko',
    spanish: 'es',
    西班牙语: 'es',
    french: 'fr',
    法语: 'fr'
  };
  return map[normalized] || normalized || 'auto';
}

export function buildSessionRequestBody({ targetLanguage = 'zh' } = {}) {
  return {
    targetLanguage: getRealtimeLanguage(targetLanguage)
  };
}

export function collectRealtimeEventText(state, event) {
  const type = String(event?.type || '');
  const text = event?.delta || event?.text || event?.transcript || '';
  if (!text) return state;

  if (type.includes('input') || type.includes('source')) {
    state.sourceText += text;
  } else if (type.includes('output') || type.includes('translation') || type.includes('target')) {
    state.targetText += text;
  }

  return state;
}

export class OpenAIRealtimeTranslator {
  constructor({
    sessionUrl = '/api-proxy/api/openai/realtime-translation/session',
    callsUrl = 'https://api.openai.com/v1/realtime/translations/calls',
    remoteAudio,
    onStatus = () => {},
    onError = () => {},
    onTranscript = () => {}
  } = {}) {
    this.sessionUrl = sessionUrl;
    this.callsUrl = callsUrl;
    this.remoteAudio = remoteAudio;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onTranscript = onTranscript;
    this.pc = null;
    this.channel = null;
    this.localStream = null;
    this.metrics = {};
    this.transcriptState = { sourceText: '', targetText: '' };
    this.playTranslatedAudio = true;
  }

  async start(options) {
    this.stop();
    this.setOutputAudioEnabled(options?.playTranslatedAudio !== false);
    this.metrics = { startedAt: performance.now(), firstAudioAt: null, lastEventAt: null };
    this.transcriptState = { sourceText: '', targetText: '' };
    this.onStatus('正在申请麦克风权限...');

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音。请用最新版 Chrome、Edge 或 Safari，并通过 HTTPS 打开页面。');
    }

    try {
      const audioConstraints = options?.deviceId ? { deviceId: { exact: options.deviceId } } : true;
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        throw new Error('麦克风权限被拒绝。请在浏览器地址栏允许麦克风后再开始。');
      }
      throw new Error(`无法打开麦克风：${error?.message || String(error)}`);
    }

    this.onStatus('麦克风已开启，正在创建实时翻译连接...');
    this.pc = new RTCPeerConnection();

    this.pc.ontrack = (event) => {
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = event.streams[0];
        this.remoteAudio.muted = !this.playTranslatedAudio;
        if (this.playTranslatedAudio && typeof this.remoteAudio.play === 'function') {
          this.remoteAudio.play().catch(() => {});
        }
      }
      if (!this.metrics.firstAudioAt) {
        this.metrics.firstAudioAt = performance.now();
        this.onStatus(`已收到译声，首包延迟 ${Math.round(this.metrics.firstAudioAt - this.metrics.startedAt)}ms`);
      }
    };

    this.localStream.getTracks().forEach((track) => this.pc.addTrack(track, this.localStream));
    this.channel = this.pc.createDataChannel('oai-events');
    this.channel.onmessage = (event) => this.handleRealtimeEvent(event.data);

    const clientSecret = await this.createClientSecret(options);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.onStatus('正在连接 OpenAI 实时翻译...');
    const sdpResponse = await fetch(this.callsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp'
      },
      body: offer.sdp
    });

    if (!sdpResponse.ok) {
      throw new Error(await sdpResponse.text());
    }

    await this.pc.setRemoteDescription({
      type: 'answer',
      sdp: await sdpResponse.text()
    });
    this.onStatus('实时翻译已连接。正在听，请直接说话。');
  }

  setOutputAudioEnabled(enabled) {
    this.playTranslatedAudio = Boolean(enabled);
    if (!this.remoteAudio) return;

    this.remoteAudio.muted = !this.playTranslatedAudio;
    if (!this.playTranslatedAudio && typeof this.remoteAudio.pause === 'function') {
      this.remoteAudio.pause();
      return;
    }
    if (this.playTranslatedAudio && this.remoteAudio.srcObject && typeof this.remoteAudio.play === 'function') {
      this.remoteAudio.play().catch(() => {});
    }
  }

  async createClientSecret(options) {
    const response = await fetch(this.sessionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSessionRequestBody(options))
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Session request failed: ${response.status}`);
    }

    const data = await response.json();
    const value = data?.client_secret?.value || data?.value || data?.secret || data?.client_secret;
    if (!value) {
      throw new Error('Realtime session response did not include a client secret.');
    }
    return value;
  }

  handleRealtimeEvent(raw) {
    try {
      const event = JSON.parse(raw);
      this.metrics.lastEventAt = performance.now();
      collectRealtimeEventText(this.transcriptState, event);
      this.onTranscript({ ...this.transcriptState, event, metrics: { ...this.metrics } });
    } catch (error) {
      this.onError(error);
    }
  }

  stop() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}
