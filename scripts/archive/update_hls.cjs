const fs = require('fs');
let content = fs.readFileSync('src/components/HlsPlayer.tsx', 'utf8');

content = content.replace(
  /hls = new Hls\(\{[\s\S]*?abrEwmaDefaultEstimate: 5000000, \/\/ Hint adaptive bitrate for 5Mbps initially\n        \}\);/,
  `hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          // Latency and Buffering metrics based on streaming standards
          liveSyncDuration: 3,         // Target latency under 3 seconds
          liveMaxLatencyDuration: 10,   // Maximum allowed latency before hard sync
          maxBufferLength: 30,          // generous buffering for stability
          maxMaxBufferLength: 60,
          backBufferLength: 90,
          manifestLoadingTimeOut: 20000,
          manifestLoadingMaxRetry: 5,
          levelLoadingTimeOut: 20000,
          levelLoadingMaxRetry: 5,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 5,
          abrEwmaDefaultEstimate: 500000, // lower default estimate for low-end connections
          testBandwidth: true, // test bandwidth to find best quality fast
        });`
);

fs.writeFileSync('src/components/HlsPlayer.tsx', content);
