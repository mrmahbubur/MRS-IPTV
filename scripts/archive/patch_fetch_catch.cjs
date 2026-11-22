const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/fetch\('https:\/\/go\.skym3u\.top\/ziyf\.m3u'\)\.then\(res => res\.text\(\)\),/, `fetch('https://go.skym3u.top/ziyf.m3u').then(res => res.text()).catch(e => { console.error('Failed to load first playlist', e); return ''; }),`);
fs.writeFileSync('src/App.tsx', content);
