const fs = require('fs');
let content = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

content = content.replace(
  /interface VideoPlayerProps \{/,
  `interface VideoPlayerProps {
  onNext?: () => void;
  onPrev?: () => void;
  onStop?: () => void;`
);

content = content.replace(
  /export default function VideoPlayer\(\{([^}]*)\}: VideoPlayerProps\) \{/m,
  `export default function VideoPlayer({\n  channel,\n  floatingReactions,\n  onAddReaction,\n  onNext,\n  onPrev,\n  onStop\n}: VideoPlayerProps) {`
);

content = content.replace(
  /const \[hasError, setHasError\] = useState\(false\);/,
  `const [hasError, setHasError] = useState(false);\n  const [retryKey, setRetryKey] = useState(0);\n\n  // Auto-retry mechanism\n  useEffect(() => {\n    let timeout: NodeJS.Timeout;\n    if (hasError) {\n      timeout = setTimeout(() => {\n        setHasError(false);\n        setRetryKey(k => k + 1);\n      }, 3000);\n    }\n    return () => clearTimeout(timeout);\n  }, [hasError]);`
);

content = content.replace(
  /setHasError\(false\);\n  \}, \[channel.m3u8Url\]\);/,
  `setHasError(false);\n    setRetryKey(k => k + 1);\n  }, [channel.m3u8Url]);`
);

content = content.replace(
  /experimentalBufferBasedABR: true/,
  `experimentalBufferBasedABR: true,\n        limitRenditionByPlayerDimensions: false`
);

content = content.replace(
  /\{activePlayer === 'videojs' \? \(/,
  `{activePlayer === 'videojs' ? (`
);

content = content.replace(
  /<VideoJS options=\{videoJsOptions\} onReady=\{handlePlayerReady\} \/>/,
  `<VideoJS key={retryKey} options={videoJsOptions} onReady={handlePlayerReady} />`
);

content = content.replace(
  /<HlsPlayer src=\{channel\.m3u8Url\} onError=\{[^}]*\} \/>/,
  `<HlsPlayer key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} />`
);

content = content.replace(
  /\{activePlayer === 'videojs' \? \([\s\S]*?<HlsPlayer[^>]*\/>\n\s*\)}/,
  `{activePlayer === 'videojs' ? (
            <VideoJS key={retryKey} options={videoJsOptions} onReady={handlePlayerReady} />
          ) : (
            <HlsPlayer key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} />
          )}`
);

// Add controls
content = content.replace(
  /\{\/\* Player Switcher \*\/\}/,
  `{/* Navigation Controls */}
        <div className="absolute top-4 right-4 z-30 flex gap-2">
          {onPrev && (
            <button onClick={onPrev} className="px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs font-bold transition-colors">
              Prev
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs font-bold transition-colors">
              Next
            </button>
          )}
          {onStop && (
            <button onClick={onStop} className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors">
              Stop
            </button>
          )}
        </div>

        {/* Player Switcher */}`
);

fs.writeFileSync('src/components/VideoPlayer.tsx', content);
