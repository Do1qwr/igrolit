const modules = import.meta.glob<string>('../assets/gift3d-all/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const giftImgMap: Record<string, string> = {};
for (const [file, url] of Object.entries(modules)) {
  const name = file.split('/').pop()!.replace(/\.jpg$/, '');
  giftImgMap[name] = url;
}

export function gift3dUrl(catId: string, idx: number): string {
  return giftImgMap[`${catId}-${idx}`] || '';
}

export function gift3dUrlById(giftId: string): string {
  return giftImgMap[giftId] || '';
}

export const gift3dCount = Object.keys(giftImgMap).length;

const achImgMap: Record<string, string> = {
  medal: giftImgMap['victory-0'] || giftImgMap['defender-1'] || '',
  trophy: giftImgMap['gaming-7'] || '',
  star: giftImgMap['victory-1'] || giftImgMap['defender-2'] || '',
  cup: giftImgMap['gaming-7'] || '',
  shield: giftImgMap['weapons-6'] || giftImgMap['defender-4'] || '',
  order: giftImgMap['victory-3'] || '',
};

export function ach3dUrl(key: string): string {
  const k = key.toLowerCase();
  if (/medal|медал/.test(k)) return achImgMap.medal;
  if (/cup|кубок|трофей|trophy/.test(k)) return achImgMap.cup;
  if (/star|звезд/.test(k)) return achImgMap.star;
  if (/shield|щит/.test(k)) return achImgMap.shield;
  if (/order|орден/.test(k)) return achImgMap.order;
  return '';
}