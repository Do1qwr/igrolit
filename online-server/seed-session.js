const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const name = process.argv[2] || 'pilot01';
const pass = process.argv[3] || 'secret123';
const url = process.env.ONLINE_URL || 'ws://127.0.0.1:8787';

function waitFor(ws, types, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    const handler = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!types.includes(msg.type)) return;
      clearTimeout(timer);
      ws.off('message', handler);
      resolve(msg);
    };
    ws.on('message', handler);
  });
}

(async () => {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.send(JSON.stringify({ type: 'login', user: name, pass }));
  let reply = await waitFor(ws, ['auth_ok', 'auth_fail']);
  if (reply.type === 'auth_fail') {
    ws.send(JSON.stringify({ type: 'register', user: name, pass }));
    reply = await waitFor(ws, ['auth_ok', 'auth_fail']);
  }
  if (reply.type !== 'auth_ok') {
    throw new Error('auth failed: ' + reply.reason);
  }

  const session = { server: url, token: reply.token, user: reply.user };
  const dir = path.join(process.env.LOCALAPPDATA, 'game-launcher');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'online_session.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
  fs.renameSync(tmp, file);

  console.log(`session: ${reply.user} -> ${file}`);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
