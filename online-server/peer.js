const WebSocket = require('ws');

const name = process.argv[2] || 'bob02';
const pass = process.argv[3] || 'secret123';
const friend = process.argv[4] || 'pilot01';
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
  if (reply.type !== 'auth_ok') throw new Error('auth failed');

  ws.send(JSON.stringify({ type: 'friend_add', user: friend }));
  await waitFor(ws, ['friends']).catch(() => null);
  await new Promise((r) => setTimeout(r, 800));

  ws.send(JSON.stringify({ type: 'chat', to: friend, text: 'привет из второго клиента' }));
  console.log(`peer ${name} online, friend ${friend}, chat sent`);

  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 60000);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
