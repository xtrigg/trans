# Cloudflare Pages 部署记录

日期：2026-05-14

## 目标

把实时语音翻译工具从本机 Docker/nginx/Cloudflare Tunnel 依赖中拆出来，部署到 Cloudflare Pages + Pages Function，并尽量保留原入口：

- 原入口：`https://xcu.ai/trans/`
- Cloudflare Pages 入口：`https://trans-c2s.pages.dev/`

## 已完成

1. 创建 Cloudflare Pages 项目：`trans`
2. 部署静态目录：`public/`
3. 新增 Cloudflare Pages Function：
   - `/api/openai/realtime-translation/session`
   - `/api-proxy/api/openai/realtime-translation/session`
4. 在 Cloudflare Pages production 环境设置 secret：
   - `OPENAI_API_KEY`
5. 新增 Pages redirects：
   - `/` -> `/realtime-translation-poc`
   - `/trans` -> `/realtime-translation-poc`
   - `/trans/` -> `/realtime-translation-poc`
6. 新增 Cloudflare Worker：`xcu-trans-router`
7. Worker 路由：
   - `xcu.ai/trans*`
   - `xcu.ai/api-proxy/api/openai/realtime-translation/session`

## 部署结果

Cloudflare Pages production 域名：

- `https://trans-c2s.pages.dev/`

最新部署预览：

- `https://30df569d.trans-c2s.pages.dev`

原入口已通过 Worker 路由到 Pages：

- `https://xcu.ai/trans/`

## 验证记录

测试：

- 前端静态测试：4/4 通过
- realtime translation module 测试：3/3 通过
- Cloudflare Pages Function 测试：3/3 通过
- Cloudflare router Worker 测试：4/4 通过
- api-proxy 测试：5/5 通过

线上验证：

- `https://trans-c2s.pages.dev/` 返回 200，并跳转到实时翻译页面
- `https://trans-c2s.pages.dev/trans/` 返回 200，并跳转到实时翻译页面
- `https://trans-c2s.pages.dev/api-proxy/api/openai/realtime-translation/session` 返回 200
- 强制走 Cloudflare 公网 IP 验证 `https://xcu.ai/trans/` 返回 200
- 强制走 Cloudflare 公网 IP 验证 `https://xcu.ai/trans/realtime-translation.mjs` 返回 200
- 强制走 Cloudflare 公网 IP 验证 session API 返回 200

## 当前架构

浏览器访问 `xcu.ai/trans/` 时：

1. Cloudflare Worker `xcu-trans-router` 拦截 `/trans*`
2. Worker 从 `https://trans-c2s.pages.dev` 取静态页面和 JS
3. 页面点击开始录音后，请求 `/api-proxy/api/openai/realtime-translation/session`
4. Worker 把该 API 请求转发到 Cloudflare Pages Function
5. Pages Function 使用 Cloudflare secret 中的 `OPENAI_API_KEY` 创建 OpenAI realtime translation client secret
6. 浏览器用临时 client secret 通过 WebRTC 连接 OpenAI

## 影响

`https://xcu.ai/trans/` 不再依赖本机 Docker Desktop、nginx 或 Cloudflare Tunnel 来提供翻译页面和 session API。即使本机 Docker 停止，Cloudflare Worker + Pages 仍应能提供实时翻译入口。

注意：`xcu.ai` 的其他路径仍可能继续走既有 Tunnel 或原有配置；本次只接管实时翻译相关路径。

