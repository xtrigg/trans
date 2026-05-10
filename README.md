# Realtime Translation Demo

Standalone backup of the browser translation demo previously embedded in `C:\n8n\mdemos\ngnix\html`.

## Contents

- `public/trans.html`: legacy browser translation UI.
- `api-proxy/`: Node/Express API proxy for OpenAI and Azure speech APIs.
- `deploy/nginx.translation.locations.conf`: extracted nginx location snippets used by the original deployment.
- `docs/`: inspection report and OpenAI realtime translation migration plan.

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

