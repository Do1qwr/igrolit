const WebSocket = require('ws');

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:8787');
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function once(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + type)), timeout);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

(async () => {
  const suffix = Math.random().toString(36).slice(2, 7);
  const aliceName = 'alice_' + suffix;
  const bobName = 'bob_' + suffix;

  const alice = await open();
  const bob = await open();

  alice.send(JSON.stringify({ type: 'register', user: aliceName, pass: 'secret123' }));
  const aOk = await once(alice, 'auth_ok');
  bob.send(JSON.stringify({ type: 'register', user: bobName, pass: 'secret123' }));
  const bOk = await once(bob, 'auth_ok');
  console.log('register:', aOk.type, bOk.type);

  alice.send(JSON.stringify({ type: 'friend_add', user: bobName }));
  const aFriends = await once(alice, 'friends');
  const bFriends = await once(bob, 'friends');
  console.log(
    'alice friends:',
    aFriends.friends.map((f) => `${f.name}:${f.online ? 'online' : 'offline'}`).join(', '),
  );
  console.log(
    'bob friends:',
    bFriends.friends.map((f) => `${f.name}:${f.online ? 'online' : 'offline'}`).join(', '),
  );

  bob.send(JSON.stringify({ type: 'chat', to: aliceName, text: 'привет' }));
  const incoming = await once(alice, 'chat');
  console.log('alice got chat:', incoming.from, incoming.text);

  alice.send(JSON.stringify({ type: 'status', game: 'Battlefield 6' }));
  const presence = await once(bob, 'presence');
  console.log('bob sees presence:', presence.user, presence.online, presence.game);

  alice.close();
  bob.close();
  console.log('OK');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
