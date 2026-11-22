const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/fetch\('https:\/\/go\.skym3u\.top\/ziyf\.m3u'\)\s*\n\s*\.then\(res => res\.text\(\)\)\s*\n\s*\.then\(data => {/, `Promise.all([
      fetch('https://go.skym3u.top/ziyf.m3u').then(res => res.text()),
      fetch('https://raw.githubusercontent.com/ahan443/FAST-IPTV/refs/heads/main/elite.m3u8').then(res => res.text()).catch(() => '')
    ]).then(([data1, data2]) => {
      let data = data1 + '\\n' + data2;`);
fs.writeFileSync('src/App.tsx', content);
