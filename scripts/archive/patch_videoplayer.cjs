const fs = require('fs');
let content = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');
content = content.replace(
  /<HlsPlayer key=\{retryKey\} src=\{channel.m3u8Url\} onError=\{\(\) => setHasError\(true\)\} \/>/,
  `<HlsPlayer key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} isPlaying={isPlaying} />`
);
fs.writeFileSync('src/components/VideoPlayer.tsx', content);
