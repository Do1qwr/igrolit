const net = require('net');
const dgram = require('dgram');

function varint(value) {
  const bytes = [];
  let v = value;
  while (true) {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
    if (v === 0) break;
  }
  return Buffer.from(bytes);
}

function readVarint(buf, offset) {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos];
    value += (byte & 0x7f) << shift;
    pos += 1;
    if ((byte & 0x80) === 0) return { value, size: pos - offset };
    shift += 7;
    if (shift > 35) break;
  }
  return null;
}

function mcString(text) {
  const data = Buffer.from(text, 'utf8');
  return Buffer.concat([varint(data.length), data]);
}

// --- Minecraft Server List Ping (1.7+) ---
function queryMinecraft(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (e) {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ online: false, error: 'timeout' }), timeout);

    socket.on('connect', () => {
      const payload = Buffer.concat([
        varint(0x00),
        varint(47),
        mcString(host),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        varint(1),
      ]);
      socket.write(Buffer.concat([varint(payload.length), payload]));
      socket.write(Buffer.concat([varint(1), Buffer.from([0x00])]));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const lengthInfo = readVarint(buffer, 0);
      if (!lengthInfo) return;
      if (buffer.length < lengthInfo.size + lengthInfo.value) return;
      const body = buffer.slice(lengthInfo.size, lengthInfo.size + lengthInfo.value);
      let offset = 0;
      const idInfo = readVarint(body, 0);
      if (!idInfo) return finish({ online: false, error: 'bad_packet' });
      offset = idInfo.size;
      const strInfo = readVarint(body, offset);
      if (!strInfo) return finish({ online: false, error: 'bad_packet' });
      offset += strInfo.size;
      const json = body.slice(offset, offset + strInfo.value).toString('utf8');
      clearTimeout(timer);
      try {
        const data = JSON.parse(json);
        const description =
          typeof data.description === 'string'
            ? data.description
            : plainText(data.description);
        finish({
          online: true,
          players: Number(data.players?.online) || 0,
          maxPlayers: Number(data.players?.max) || 0,
          version: String(data.version?.name || ''),
          map: '',
          motd: description || '',
          ping: Date.now() - started,
          game: 'Minecraft',
        });
      } catch (e) {
        finish({ online: false, error: 'bad_json' });
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      finish({ online: false, error: String(error.code || error.message) });
    });
  });
}

function plainText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const extra = Array.isArray(node.extra) ? node.extra.map(plainText).join('') : '';
  return `${node.text || ''}${extra}`;
}

// --- Valve A2S_INFO (Source и GoldSrc) ---
function queryA2S(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch (e) {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ online: false, error: 'timeout' }), timeout);

    socket.on('error', (error) => finish({ online: false, error: String(error.code || error.message) }));
    socket.on('message', (msg) => {
      if (msg.length < 6 || msg.readUInt32LE(0) !== 0xffffffff) return;
      const type = msg[4];
      if (type === 0x41) {
        // challenge: повторяем запрос с полученным кодом
        const again = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from('Source Engine Query\0'), msg.slice(5, 9)]);
        try { socket.send(again, port, host); } catch (e) {}
        return;
      }
      if (type !== 0x49 && type !== 0x6d) return;
      try {
        const parsed = type === 0x49 ? parseSourceInfo(msg) : parseGoldSrcInfo(msg);
        finish({ ...parsed, ping: Date.now() - started });
      } catch (e) {
        finish({ online: false, error: 'bad_packet' });
      }
    });

    const packet = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
      Buffer.from('Source Engine Query\0', 'utf8'),
    ]);
    socket.send(packet, port, host);
  });
}

function readCString(buf, offset) {
  const end = buf.indexOf(0, offset);
  if (end < 0) return { value: '', next: buf.length };
  return { value: buf.slice(offset, end).toString('utf8'), next: end + 1 };
}

const FOLDER_GAMES = {
  cstrike: 'Counter-Strike 1.6',
  cstrike_russian: 'Counter-Strike 1.6',
  csgo: 'Counter-Strike: Global Offensive',
  cs2: 'Counter-Strike 2',
  rust: 'Rust',
  garrysmod: "Garry's Mod",
  dayz: 'DayZ',
  hl2mp: 'Half-Life 2 Deathmatch',
  tf: 'Team Fortress Classic',
  tf2: 'Team Fortress 2',
  l4d2: 'Left 4 Dead 2',
  dod: 'Day of Defeat',
  svencoop: 'Sven Co-op',
};

function cleanLabel(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\^x[0-9a-fA-F]{6}/g, ' ')
    .replace(/\^\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function gameLabel(folder, game) {
  const key = String(folder || '').trim().toLowerCase();
  if (FOLDER_GAMES[key]) return FOLDER_GAMES[key];
  const text = cleanLabel(game);
  // Рекламный слоган вместо названия игры — не считаем определением.
  if (!text || text.length > 32 || /[!|]/.test(text)) return '';
  return text;
}

function parseSourceInfo(msg) {
  let p = 5;
  p += 1; // protocol
  const name = readCString(msg, p); p = name.next;
  const map = readCString(msg, p); p = map.next;
  const folder = readCString(msg, p); p = folder.next;
  const game = readCString(msg, p); p = game.next;
  p += 2; // appid
  const players = msg[p] || 0; p += 1;
  const maxPlayers = msg[p] || 0; p += 1;
  return {
    online: true,
    players,
    maxPlayers,
    version: game.value || folder.value || '',
    map: map.value || '',
    motd: name.value || '',
    folder: folder.value || '',
    game: gameLabel(folder.value, game.value),
  };
}

function parseGoldSrcInfo(msg) {
  let p = 5;
  const address = readCString(msg, p); p = address.next;
  const name = readCString(msg, p); p = name.next;
  const map = readCString(msg, p); p = map.next;
  const folder = readCString(msg, p); p = folder.next;
  const game = readCString(msg, p); p = game.next;
  const players = msg[p] || 0; p += 1;
  const maxPlayers = msg[p] || 0; p += 1;
  return {
    online: true,
    players,
    maxPlayers,
    version: game.value || folder.value || '',
    map: map.value || '',
    motd: name.value || '',
    folder: folder.value || '',
    game: gameLabel(folder.value, game.value),
  };
}

// --- SA-MP query ---
function querySamp(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch (e) {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ online: false, error: 'timeout' }), timeout);

    const octets = host.split('.').map((part) => Number(part) & 0xff);
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) {
      finish({ online: false, error: 'bad_host' });
      return;
    }
    const packet = Buffer.from([
      0x53, 0x41, 0x4d, 0x50,
      octets[0], octets[1], octets[2], octets[3],
      port & 0xff, (port >> 8) & 0xff,
      0x69,
    ]);

    socket.on('error', (error) => finish({ online: false, error: String(error.code || error.message) }));
    socket.on('message', (msg) => {
      if (msg.length < 11 || msg.slice(0, 4).toString() !== 'SAMP') return;
      if (msg[10] !== 0x69) return;
      try {
        let p = 11;
        p += 1; // password flag
        const players = msg.readUInt16LE(p); p += 2;
        const maxPlayers = msg.readUInt16LE(p); p += 2;
        const len = msg.readUInt32LE(p); p += 4;
        const hostname = msg.slice(p, p + len).toString('utf8'); p += len;
        const gmLen = msg.readUInt32LE(p); p += 4;
        const gamemode = msg.slice(p, p + gmLen).toString('utf8');
        finish({
          online: true,
          players,
          maxPlayers,
          version: '',
          map: gamemode || '',
          motd: hostname || '',
          ping: Date.now() - started,
          game: 'GTA / SA-MP',
        });
      } catch (e) {
        finish({ online: false, error: 'bad_packet' });
      }
    });
    socket.send(packet, port, host);
  });
}

function detectProtocol(game) {
  const name = String(game || '').toLowerCase();
  if (/minecraft|mine ?craft/.test(name)) return 'minecraft';
  if (/samp|sa-mp|sa:mp/.test(name)) return 'samp';
  return 'a2s';
}

async function queryServer(address, game) {
  const [host, portText] = String(address || '').split(':');
  const port = Number(portText) || defaultPort(game);
  if (!host) return { online: false, error: 'bad_address' };
  const protocol = detectProtocol(game);
  if (protocol === 'minecraft') return queryMinecraft(host, port);
  if (protocol === 'samp') return querySamp(host, port);
  return queryA2S(host, port);
}

function defaultPort(game) {
  const name = String(game || '').toLowerCase();
  if (/minecraft/.test(name)) return 25565;
  if (/samp/.test(name)) return 7777;
  return 27015;
}

module.exports = { queryServer, queryMinecraft, queryA2S, querySamp, detectProtocol };
