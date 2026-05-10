# trans.html 翻译页面检查报告

检查日期：2026-05-10  
检查对象：`C:\n8n\mdemos\ngnix\html\trans.html`  
访问方式：本地临时静态服务 `http://localhost:8181/trans.html`，以及 nginx 本地 Host/SNI 校验 `https://xcu.ai/trans.html -> 127.0.0.1`

## 结论

页面主体可以渲染，文本框、语言切换、历史记录展开等基础 UI 可见。但当前版本存在一个会中断初始化的前端错误、一个高风险凭据暴露问题，以及翻译失败时无前台错误提示的问题。真实 nginx 路由下，`xcu.ai/trans.html` 静态文件和 `/api-proxy`、`/local-llm`、`/funasr` 后端代理可连通；直接访问 `localhost:8080/trans.html` 不是此页面，而是 TalentChat 容器页面。

## 验证摘要

- `https://xcu.ai/trans.html` 通过本机 nginx Host/SNI 指向 `127.0.0.1` 校验返回 `200`，大小 `170058` 字节。
- `https://xcu.ai/api-proxy/health` 返回 `200`，OpenAI/Azure 代理显示已配置。
- `https://xcu.ai/local-llm/v1/chat/completions` POST 测试返回 `200`，本地模型响应正常。
- `https://xcu.ai/funasr/health` 返回 `200`。
- 页面浏览器加载时控制台有初始化错误。

## 主要问题

### 1. 页面初始化被不存在的 DOM 元素打断

严重级别：高  
位置：`trans.html:4558-4568`、`trans.html:4626-4655`

`initializeDefaults()` 中访问了 `manualMainLang` 和 `manualTargetLang`：

```js
document.getElementById("manualMainLang").value = "zh";
document.getElementById("manualTargetLang").value = "en";
```

但当前 HTML 已经没有这两个下拉框，只有 `spanMainLang` 和 `spanTargetLang`。浏览器报错：

```text
TypeError: Cannot set properties of null (setting 'value')
```

影响：

- `DOMContentLoaded` 回调后续代码不会继续执行。
- `initStreamingController()`、`initSegmentProcessor()`、`initDeviceId()`、`loadHistoryFromStorage()` 可能不执行。
- `exportSelectedBtn`、`selectAllCheckbox` 的事件绑定可能不执行。
- 保存的播放速度恢复逻辑可能不执行。

建议：

- 删除对 `manualMainLang`、`manualTargetLang` 的访问，或改为判断元素存在后再写。
- 同步 `mainLanguage`、`targetLanguage` 与页面初始显示。目前 HTML 显示 EN -> ZH，但 `initializeDefaults()` 试图强制设为 ZH -> EN。

### 2. Deepgram 和 Fish.audio API Key 明文写在前端

严重级别：高  
位置：`trans.html:636`、`trans.html:645`、`trans.html:1233`、`trans.html:2903`、`trans.html:3452`

页面里存在前端可读的 Deepgram API Key 和 Fish.audio API Key，并在浏览器侧直接用于 WebSocket 或 HTTP Authorization。任何访问页面的人都可以从源码或 DevTools 中拿到这些机器凭据。

建议立即处理：

- 在 Deepgram Console 轮换项目 API Key，并检查近期调用量、项目成员。
- 在 Fish Audio 工作区轮换 API Key，并检查 voice 资源、工作区成员。
- 前端不要保存或发送供应商 API Key。改为走后端代理，由后端从环境变量注入 Authorization。
- nginx `/fish-tts/` 目前只是转发请求，建议不要让浏览器提供 `Authorization`，而是在服务端代理中加认证头。

### 3. 翻译失败时页面没有可见错误提示，还会写入空译文历史

严重级别：中  
位置：`trans.html:3208-3288`、`trans.html:3341-3358`、`trans.html:2599-2771`

在临时静态服务下点击 `Send Text`，由于没有 `/local-llm` 代理，浏览器报：

```text
Local LLM error: 501 Unsupported method ('POST')
```

`translateByChatGPT()` 捕获错误后返回空字符串，`handleInput()` 仍然调用 `appendLog()`，导致历史记录出现原文存在、译文为空的记录。真实 nginx 下 `/local-llm` 可用，但一旦服务不可达、超时或模型报错，用户仍只会看到空白译文。

建议：

- `translateByChatGPT()` 失败时返回结构化错误，而不是空字符串。
- `handleInput()` 检测翻译失败后，在 `outputText` 显示明确错误，例如“翻译服务不可用，请检查 local-llm”。
- 不要把失败请求作为正常翻译历史保存，或将其标记为失败状态。

### 4. 本机端口入口容易误判

严重级别：中

`localhost:8080/trans.html` 当前由 `talentchat-frontend` 容器占用，实际打开的是 TalentChat，不是这个翻译页。此翻译页在当前 nginx 配置里应通过 `xcu.ai/trans.html` 访问，或使用带 Host/SNI 的本地校验方式。

建议：

- README 或运维文档中明确本页面的访问入口：`https://xcu.ai/trans.html`。
- 如需本机调试，使用临时静态服务只适合看 UI，不适合验证 `/api-proxy`、`/local-llm` 等相对路径后端。

### 5. 第三方 CDN 字体图标依赖会影响按钮图标显示

严重级别：低  
位置：`trans.html:7-10`

页面依赖 Cloudflare CDN 的 Font Awesome。若网络或 CSP 阻断，按钮图标会显示为方块或乱码。当前浏览器快照中蓝牙、麦克风图标显示为字体私有码字符，说明图标字体可能没有按预期加载。

建议：

- 将 Font Awesome 静态资源本地化，或改为内联 SVG / 本地 icon font。

## 凭据处置清单

| Vendor | 用途 | 凭据类型 | 严重级别 | 立即动作 | 状态 |
| --- | --- | --- | --- | --- | --- |
| Deepgram | 实时英文 STT WebSocket | API Key | 高 | 轮换 Key，检查项目成员和近期调用量；改为后端签发或代理 | 待处理 |
| Fish Audio | TTS | API Key、voice id | 高 | 轮换 Key，检查工作区成员；由后端代理注入 Authorization | 待处理 |

## 推荐修复顺序

1. 先轮换 Deepgram 和 Fish Audio 密钥，避免已经暴露的前端 Key 继续有效。
2. 修复 `initializeDefaults()` 空 DOM 访问，确保页面初始化完整执行。
3. 增加翻译失败的用户可见错误状态，避免空译文进入历史。
4. 把 Fish/Deepgram 调用迁移到后端代理，前端只调用相对路径。
5. 明确本机调试入口和线上入口，避免误用 `localhost:8080`。

## 已执行检查命令/动作

- 浏览器打开 `http://localhost:8181/trans.html`，检查 DOM、控制台错误和交互。
- 点击 `Send Text`、语言切换、历史记录展开。
- `curl --resolve xcu.ai:443:127.0.0.1 https://xcu.ai/trans.html`
- `curl --resolve xcu.ai:443:127.0.0.1 https://xcu.ai/api-proxy/health`
- `curl --resolve xcu.ai:443:127.0.0.1 https://xcu.ai/local-llm/v1/chat/completions`
- `curl --resolve xcu.ai:443:127.0.0.1 https://xcu.ai/funasr/health`
- `docker ps`、`docker exec api-proxy`、`docker exec me-nginx nginx -T`
