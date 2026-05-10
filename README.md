# Realtime Translation Demo

Standalone backup of the browser translation demo previously embedded in `C:\n8n\mdemos\ngnix\html`.

## Contents

- `public/trans.html`: legacy browser translation UI.
- `api-proxy/`: Node/Express API proxy for OpenAI and Azure speech APIs.
- `deploy/nginx.translation.locations.conf`: extracted nginx location snippets used by the original deployment.
- `docs/`: inspection report and OpenAI realtime translation migration plan.
- `public/realtime-translation-poc.html`: Phase 1 WebRTC POC for OpenAI Realtime Translation.
- `public/realtime-translation.mjs`: browser module for the POC session and transcript state.

## Security Notes

The standalone copy intentionally removes hardcoded Deepgram and Fish.audio API keys from `public/trans.html`. Standard provider API keys must stay on the server side and be loaded from environment variables or a secrets manager.

The legacy page still contains old direct-client code paths for Deepgram and Fish.audio, but those paths are disabled in this backup until they are replaced with server-side proxy endpoints.

## Local API Proxy

```powershell
cd C:\n8n\realtime-translation-demo\api-proxy
copy ..\.env.example ..\.env
npm install
npm start
```

The API proxy listens on `PORT`, defaulting to `3010`.

## Static Page Preview

For UI-only preview:

```powershell
cd C:\n8n\realtime-translation-demo\public
python -m http.server 8181
```

Open `http://localhost:8181/trans.html`.

UI-only preview does not provide `/api-proxy`, `/local-llm`, `/funasr`, or `/fish-tts` routes. Use nginx or a matching dev proxy for full integration testing.

## Next Migration Direction

See `docs/OpenAI实时翻译流程改造计划_20260510.md`.

Recommended next step: implement Phase 0 and Phase 1 from the plan, using `gpt-realtime-translate` as a system-microphone POC while preserving the legacy Whisper/local-LLM fallback path.

## Phase 0 + Phase 1 Status

Implemented on branch `feature/realtime-phase-0-1`:

- Fixed the legacy `initializeDefaults()` crash caused by removed manual language controls.
- Added visible legacy-page status/error messaging for STT, translation, and TTS failures.
- Added `/api/openai/realtime-translation/session` to `api-proxy`.
- Added a standalone OpenAI Realtime Translation POC page.
- Added Node tests for the proxy endpoint payloads and frontend static/module behavior.

Run tests:

```powershell
cd C:\n8n\realtime-translation-demo\api-proxy
npm test

cd C:\n8n\realtime-translation-demo
node --test test/*.test.js test/*.test.mjs
```

For local POC testing, start `api-proxy` and open:

```text
http://127.0.0.1:3010/realtime-translation-poc.html
```

The proxy serves `public/` in local development and also accepts the `/api-proxy/api/openai/realtime-translation/session` prefix used by the nginx deployment.

