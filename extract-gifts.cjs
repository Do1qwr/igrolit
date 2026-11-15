const fs = require('fs');
const s = fs.readFileSync('online-server/server.js', 'utf8');
const start = s.indexOf('const GIFT_CATEGORIES = [');
const end = s.indexOf('];', start) + 2;
let block = s.slice(start, end).replace('const GIFT_CATEGORIES', 'global.cats');
eval(block);
let total = 0;
const all = [];
for (const c of global.cats) {
  c.items.forEach((it, i) => {
    all.push({ cat: c.id, id: c.id + '-' + i, emoji: it[0], name: it[1], rarity: it[2] });
  });
  total += c.items.length;
  console.log(c.id + ' (' + c.items.length + '): ' + c.items.map(x => x[1]).join(', '));
}
console.log('TOTAL:', total);
fs.writeFileSync(process.argv[2] || 'gifts-list.json', JSON.stringify(all, null, 1));