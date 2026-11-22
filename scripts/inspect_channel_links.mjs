import fs from 'fs';
import path from 'path';

const files = [
  { file: 'tiw4.m3u', source: 'https://go.skym3u.dev/tiw4.m3u?s=dd89', title: 'TIW4 - Entertainment & Live HD' },
  { file: 'e5dp.m3u', source: 'https://go.skym3u.dev/e5dp.m3u?s=7bd4', title: 'E5DP - Cinema & Movies Central HD' },
  { file: 'qz8o.m3u', source: 'https://go.skym3u.dev/qz8o.m3u?s=65d0', title: 'QZ8O - Movies & Kids Network HD' },
  { file: 'xsjs.m3u', source: 'https://go.skym3u.dev/xsjs.m3u?s=63ee', title: 'XSJS - Global & Euro HD' },
  { file: '4cxy.m3u', source: 'https://go.skym3u.dev/4cxy.m3u?s=5bb1', title: '4CXY - Asian & World News HD' },
  { file: 'ryzj.m3u', source: 'https://go.skym3u.dev/ryzj.m3u?s=387e', title: 'RYZJ - Sports Arena & Live Games HD' },
  { file: 'qm49.m3u', source: 'https://go.skym3u.dev/qm49.m3u?s=a0d1', title: 'QM49 - Bangla TV & Regional HD' },
  { file: '64yc.m3u', source: 'https://go.skym3u.dev/64yc.m3u?s=53a5', title: '64YC - Bangladesh Mega TV & News Vault HD' },
  { file: 'avbe.m3u', source: 'https://go.skym3u.dev/avbe.m3u?s=8aad', title: 'AVBE - World Sports & News Ultra HD' },
  { file: '9csf.m3u', source: 'https://go.skym3u.dev/9csf.m3u?s=327f', title: '9CSF - Star Sports & Indian Live Hub HD' },
  { file: 'sftq.m3u', source: 'https://go.skym3u.dev/sftq.m3u?s=6f75', title: 'SFTQ - Eurasian & Regional HD' },
  { file: 'vuqc.m3u', source: 'https://go.skym3u.dev/vuqc.m3u?s=1524', title: 'VUQC - Cricket & Sports Super HD' },
  { file: 'gpst.m3u', source: 'https://go.skym3u.dev/gpst.m3u?s=419c', title: 'GPST - Bangladesh National & News Stream HD' }
];

let totalAll = 0;
const results = [];

for (const item of files) {
  const filePath = path.join(process.cwd(), 'data', item.file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const chs = [];
  let name = '';
  let group = '';
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('#EXTINF:')) {
      const mName = l.match(/tvg-name="([^"]*)"/);
      const mGroup = l.match(/group-title="([^"]*)"/);
      name = mName ? mName[1] : l.split(',').pop()?.trim() || 'Channel';
      group = mGroup ? mGroup[1] : '';
    } else if (l.startsWith('http')) {
      if (name && !name.toLowerCase().includes('skym3u') && !name.toLowerCase().includes('visit')) {
        chs.push({ name, group, url: l });
      }
      name = '';
      group = '';
    }
  }
  totalAll += chs.length;
  results.push({
    file: item.file,
    source: item.source,
    title: item.title,
    count: chs.length,
    sample: chs.slice(0, 10)
  });
}

console.log('TOTAL CHANNELS EXTRACTED:', totalAll);
for (const r of results) {
  console.log(`\n### ${r.title} (${r.file}) - ${r.count} channels`);
  console.log(`M3U Source: ${r.source}`);
  r.sample.forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.name} [${c.group || 'General'}] -> ${c.url}`);
  });
}
