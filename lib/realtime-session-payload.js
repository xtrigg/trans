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

function buildRealtimeTranslationSessionPayload({
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

if (typeof module !== 'undefined') {
  module.exports = {
    buildRealtimeTranslationSessionPayload,
    normalizeRealtimeLanguage
  };
}
