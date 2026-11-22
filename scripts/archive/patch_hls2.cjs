const fs = require('fs');
let content = fs.readFileSync('src/components/HlsPlayer.tsx', 'utf8');

content = content.replace(/useEffect\(\(\) => \{\n    if \(videoRef\.current\) \{\n      if \(isPlaying\) \{\n        videoRef\.current\.play\(\)\.catch\(\(\) => \{\}\);\n      \}\n      if \(volume !== undefined && videoRef\.current\.volume !== volume\) \{\n        videoRef\.current\.volume = volume;\n      \} else \{\n        videoRef\.current\.pause\(\);\n      \}\n    \}\n  \}, \[isPlaying\]\);/, `useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
      if (volume !== undefined && videoRef.current.volume !== volume) {
        videoRef.current.volume = volume;
      }
    }
  }, [isPlaying, volume]);`);

fs.writeFileSync('src/components/HlsPlayer.tsx', content);
