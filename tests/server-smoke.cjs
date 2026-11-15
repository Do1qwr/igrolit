const assert = require('assert');
const http = require('http');

const WS = globalThis.WebSocket || require('ws');

const PORT = Number(process.env.PORT || 8787);

function req(path, options = {}) {
  const { method = 'GET', headers = {}, body = null } = options;
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: '127.0.0.1', port: PORT, path, method, headers, timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    r.on('error', reject);
    r.on('timeout', () => {
      r.destroy();
      reject(new Error('timeout'));
    });
    if (body) r.end(body);
    else r.end();
  });
}

function login(user = 'admin1', pass = 'AdminLauncher2026') {
  return new Promise((resolve, reject) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}`);
    const timer = setTimeout(() => reject(new Error('login timeout')), 8000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'login', user, pass }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_ok') {
        clearTimeout(timer);
        ws.close();
        resolve(m.token);
      }
      if (m.type === 'auth_fail') {
        clearTimeout(timer);
        ws.close();
        reject(new Error('auth_fail: ' + m.reason));
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
  });
}

const ADMIN = { user: 'admin1', pass: 'AdminLauncher2026' };

function ensureAdmin() {
  return new Promise((resolve, reject) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}`);
    const timer = setTimeout(() => reject(new Error('register timeout')), 8000);
    const done = (err) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      if (err) reject(err);
      else resolve();
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'register', ...ADMIN, consent: true }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_ok') return done();
      if (m.type === 'auth_fail' && m.reason === 'exists') return done();
      done(new Error('register: ' + (m.reason || m.type)));
    };
    ws.onerror = () => done(new Error('ws error'));
  });
}

function consent() {
  return new Promise((resolve, reject) => {
    const ws = new WS(`ws://127.0.0.1:${PORT}`);
    const timer = setTimeout(() => reject(new Error('consent timeout')), 8000);
    const done = (err, token) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      if (err) reject(err);
      else resolve(token);
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'login', ...ADMIN }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_ok') ws.send(JSON.stringify({ type: 'publish_consent', pass: ADMIN.pass }));
      else if (m.type === 'publish_consent_ok') done(null, m.token);
      else if (m.type === 'publish_consent_fail' || m.type === 'auth_fail' || m.type === 'error') {
        done(new Error('consent: ' + (m.reason || m.type)));
      }
    };
    ws.onerror = () => done(new Error('ws error'));
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('/health отвечает ok', async () => {
  const r = await req('/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.trim(), 'ok');
});

test('/status отдаёт флаг техработ', async () => {
  const r = await req('/status');
  assert.strictEqual(r.status, 200);
  const data = JSON.parse(r.body);
  assert.strictEqual(data.ok, true);
  assert.ok(data.maintenance, 'нет блока maintenance');
  assert.strictEqual(typeof data.maintenance.on, 'boolean');
});

test('неизвестный путь — 404', async () => {
  const r = await req('/no-such-endpoint');
  assert.strictEqual(r.status, 404);
});

test('учётная запись администратора доступна', async () => {
  await ensureAdmin();
});

test('вход администратора выдаёт токен', async () => {
  const token = await login();
  assert.ok(typeof token === 'string' && token.length > 10, 'токен пустой');
});

test('неверный пароль отклоняется', async () => {
  await assert.rejects(() => login('admin1', 'wrong-pass-1'), /auth_fail/);
});

test('публикация без согласия владельца — 403', async () => {
  const token = await login();
  const r = await req('/app/publish?version=9.9.9&notes=smoke', {
    method: 'POST',
    headers: {
      'x-token': token,
      'content-type': 'application/octet-stream',
      'content-length': 4,
    },
    body: Buffer.from('fake'),
  });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.trim(), 'consent_required');
});

test('публикация без подписи отклоняется', async () => {
  const token = await login();
  const confirm = await consent();
  const r = await req('/app/publish?version=9.9.9&notes=smoke', {
    method: 'POST',
    headers: {
      'x-token': token,
      'x-confirm': confirm,
      'content-type': 'application/octet-stream',
      'content-length': 4,
    },
    body: Buffer.from('fake'),
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.trim(), 'bad_signature');
});

test('публикация без токена — 403', async () => {
  const r = await req('/app/publish?version=9.9.9&notes=smoke', {
    method: 'POST',
    headers: { 'content-length': 4 },
    body: Buffer.from('fake'),
  });
  assert.strictEqual(r.status, 403);
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log('  OK   ' + t.name);
    } catch (e) {
      failed += 1;
      console.log('  FAIL ' + t.name + ' → ' + e.message);
    }
  }
  console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
  process.exit(failed === 0 ? 0 : 1);
})();
