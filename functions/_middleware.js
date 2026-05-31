const COOKIE_NAME = 'xcu_trans_auth';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_PATH = '/trans-login';
const LOGOUT_PATH = '/trans-logout';
const ACCESS_USERNAME = 'ai';

const PROTECTED_PREFIXES = [
  '/trans',
  '/realtime-translation-poc',
  '/realtime-translation-poc.html',
  '/realtime-translation.mjs',
  '/text-translation.mjs',
  '/api/openai/',
  '/api-proxy/api/openai/'
];

function isProtectedPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(signature);
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ''));
  const right = new TextEncoder().encode(String(b || ''));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

async function isTrustedBrowser(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token || !env.TRANS_ACCESS_SECRET) return false;

  const [issuedAtText, signature] = token.split('.');
  const issuedAt = Number(issuedAtText);
  if (!Number.isFinite(issuedAt)) return false;

  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSeconds < 0 || ageSeconds > MAX_AGE_SECONDS) return false;

  const expected = await sign(issuedAtText, env.TRANS_ACCESS_SECRET);
  return timingSafeEqual(signature, expected);
}

function loginPage(error = '') {
  return htmlResponse(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>翻译工具访问验证</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: "Microsoft YaHei", Arial, sans-serif; background: #eef3f8; color: #182230; }
    main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid #d7dde8; border-radius: 8px; background: #fff; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
    h1 { margin: 0 0 12px; font-size: 1.35rem; }
    p { margin: 0 0 18px; color: #526071; line-height: 1.5; }
    label { display: block; margin-bottom: 8px; color: #344054; font-weight: 700; }
    input { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #c8d0dc; border-radius: 6px; font: inherit; }
    button { width: 100%; min-height: 44px; margin-top: 14px; border: 1px solid #2563eb; border-radius: 6px; background: #2563eb; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .error { margin-top: 12px; color: #842029; }
  </style>
</head>
<body>
  <main>
    <h1>翻译工具访问验证</h1>
    <p>输入用户名和访问密码后，这台浏览器会被信任 30 天。</p>
    <form method="post" action="${LOGIN_PATH}">
      <input type="hidden" name="next" value="/trans/">
      <label for="username">用户名</label>
      <input id="username" name="username" type="text" value="${ACCESS_USERNAME}" autocomplete="username" required>
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">进入翻译工具</button>
      ${error ? `<div class="error">${error}</div>` : ''}
    </form>
  </main>
</body>
</html>`);
}

async function parseForm(request) {
  const formData = await request.formData();
  return {
    username: String(formData.get('username') || ''),
    password: String(formData.get('password') || ''),
    next: String(formData.get('next') || '/trans/')
  };
}

function safeNextPath(value) {
  const next = String(value || '/trans/');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/trans/';
}

async function createAuthCookie(env) {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const signature = await sign(issuedAt, env.TRANS_ACCESS_SECRET);
  return `${COOKIE_NAME}=${issuedAt}.${signature}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === LOGIN_PATH && request.method === 'GET') {
    return loginPage();
  }

  if (url.pathname === LOGIN_PATH && request.method === 'POST') {
    if (!env.TRANS_ACCESS_PASSWORD || !env.TRANS_ACCESS_SECRET) {
      return textResponse('Access password is not configured.', 500);
    }
    const form = await parseForm(request);
    if (!timingSafeEqual(form.username, ACCESS_USERNAME) || !timingSafeEqual(form.password, env.TRANS_ACCESS_PASSWORD)) {
      return loginPage('用户名或密码不正确。');
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: safeNextPath(form.next),
        'Set-Cookie': await createAuthCookie(env),
        'Cache-Control': 'no-store'
      }
    });
  }

  if (url.pathname === LOGOUT_PATH) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: LOGIN_PATH,
        'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store'
      }
    });
  }

  if (!isProtectedPath(url.pathname)) {
    return next();
  }

  if (await isTrustedBrowser(request, env)) {
    return next();
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api-proxy/')) {
    return textResponse('Unauthorized', 401);
  }

  return loginPage();
}
