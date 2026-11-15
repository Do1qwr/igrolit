const fs=require('fs');
const p='src/components/Profile.svelte';
const raw=fs.readFileSync(p,'utf8');
const lines=raw.split('\n');
const i=lines.findIndex(l=>l.includes("tab === 'privacy'"));
const j=lines.findIndex((l,k)=>k>i && l.includes("tab === 'security'"));
if(i<0||j<0){console.log('MARKERS NOT FOUND',i,j);process.exit(1);}
console.log('remove lines',i+1,'..',j,'first:',lines[i].trim(),'| last removed:',lines[j-1].trim(),'| next:',lines[j].trim());
const out=[...lines.slice(0,i),...lines.slice(j)];
fs.writeFileSync(p,out.join('\n'),'utf8');
console.log('done, lines now',out.length);
