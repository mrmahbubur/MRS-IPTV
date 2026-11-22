const fs = require('fs');

const hlsContent = `import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  src: string;
  onError?: () => void;
  isPlaying?: boolean;
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({ src, onError, isPlaying = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let hls: Hls;
    if (videoRef.current) {
      const video = videoRef.current;
      
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDuration: 3,
          liveMaxLatencyDuration: 10,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 90,
          manifestLoadingTimeOut: 20000,
          manifestLoadingMaxRetry: 5,
          levelLoadingTimeOut: 20000,
          levelLoadingMaxRetry: 5,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 5,
          abrEwmaDefaultEstimate: 500000,
          testBandwidth: true,
        });

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                if (onError) onError();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('error', () => {
          if (onError) onError();
        });
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src, onError]);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full bg-black object-contain"
      autoPlay
      playsInline
    />
  );
};
`;

fs.writeFileSync('src/components/HlsPlayer.tsx', hlsContent);
