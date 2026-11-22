const fs = require('fs');
let content = fs.readFileSync('src/components/HlsPlayer.tsx', 'utf8');

content = content.replace(/export const HlsPlayer: React\.FC<HlsPlayerProps> = \(\{ src, onError, isPlaying = true \}\) => \{/, `export const HlsPlayer = React.forwardRef<HTMLVideoElement, HlsPlayerProps>(({ src, onError, isPlaying = true, volume = 1, onVolumeChange }, ref) => {`);

content = content.replace(/const videoRef = useRef<HTMLVideoElement>\(null\);/, `const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = (ref as React.MutableRefObject<HTMLVideoElement>) || internalRef;`);

content = content.replace(/interface HlsPlayerProps \{/, `interface HlsPlayerProps {\n  volume?: number;\n  onVolumeChange?: (v: number) => void;`);

content = content.replace(/<video\n      ref=\{videoRef\}/, `<video\n      ref={videoRef}\n      onVolumeChange={(e) => onVolumeChange && onVolumeChange((e.target as HTMLVideoElement).volume)}`);

content = content.replace(/videoRef\.current\.play\(\)\.catch\(\(\) => \{\}\);/g, `videoRef.current.play().catch(() => {});
      }
      if (volume !== undefined && videoRef.current.volume !== volume) {
        videoRef.current.volume = volume;`);

content = content.replace(/\}\);\n\n  return \(/, `}, [isPlaying, volume]);\n\n  return (`);

content += `\nHlsPlayer.displayName = 'HlsPlayer';\n`;

fs.writeFileSync('src/components/HlsPlayer.tsx', content);
