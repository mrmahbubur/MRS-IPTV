const fs = require('fs');

const videoContent = `import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { Channel } from '../types';
import { ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay } from 'lucide-react';
import { HlsPlayer } from './HlsPlayer';
import { AnimatePresence, motion } from 'framer-motion';

const VideoJS = ({ options, onReady }: any) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement("video-js");
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);
      const player = playerRef.current = videojs(videoElement, options, () => {
        onReady && onReady(player);
      });
    } else {
      const player = playerRef.current;
      if (player) {
        player.autoplay(options.autoplay);
        player.src(options.sources);
      }
    }
  }, [options, videoRef, onReady]);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return <div data-vjs-player ref={videoRef} className="w-full h-full" />;
};

interface VideoPlayerProps {
  channel: Channel;
  onNext?: () => void;
  onPrev?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export default function VideoPlayer({ channel, onNext, onPrev, onToggleSidebar, isSidebarOpen }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [activePlayer, setActivePlayer] = useState<'videojs' | 'hlsjs'>('hlsjs');
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setHasError(false);
    setRetryCount(0);
    setRetryKey(k => k + 1);
  }, [channel.m3u8Url]);

  useEffect(() => {
    if (hasError && retryCount < 5) {
      const timer = setTimeout(() => {
        setHasError(false);
        setRetryCount(c => c + 1);
        setRetryKey(k => k + 1);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [hasError, retryCount]);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [channel]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const videoJsOptions = {
    autoplay: true,
    controls: false,
    responsive: true,
    fluid: false,
    html5: {
      vhs: {
        overrideNative: true
      },
      nativeAudioTracks: false,
      nativeVideoTracks: false
    },
    sources: [{
      src: channel.m3u8Url,
      type: 'application/x-mpegURL'
    }]
  };

  const handlePlayerReady = (player: any) => {
    player.on('error', () => setHasError(true));
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
  };

  return (
    <div 
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Video Layer */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {activePlayer === 'videojs' ? (
          <VideoJS key={retryKey} options={videoJsOptions} onReady={handlePlayerReady} />
        ) : (
          <HlsPlayer key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} />
        )}
      </div>

      {/* Loading overlay if video is buffering (we can fake it or use actual events. Since we are just passing URL, HlsPlayer handles it. For UI match we just show it on error retry) */}
      {hasError && retryCount < 5 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
           <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/60 via-transparent to-black/80"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={onToggleSidebar}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-lg font-medium text-white shadow-sm">
                  {channel.name} {channel.resolution ? \`(\${channel.resolution})\` : ''}
                </h2>
              </div>
              <button className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm">
                <Settings className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Error Toast positioned slightly above bottom bar */}
            {hasError && retryCount < 5 && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-gray-200 text-gray-900 px-6 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-2xl">
                <MonitorPlay className="w-4 h-4 text-blue-600" />
                Playback error, reconnects in 3s ({retryCount}/5)
              </div>
            )}
            
            {hasError && retryCount >= 5 && (
               <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full text-sm font-medium shadow-2xl">
                Stream unavailable
              </div>
            )}

            {/* Bottom Bar */}
            <div className="p-6 flex flex-col gap-4">
              
              {/* Info Row */}
              <div className="flex items-end gap-4">
                <button 
                  onClick={togglePlay}
                  className="w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors flex-shrink-0"
                >
                  {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-1" />}
                </button>
                
                <div className="flex items-center gap-3">
                  {channel.iconUrl && (
                    <div className="w-12 h-10 bg-white/10 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                      <img src={channel.iconUrl} alt="Logo" className="max-w-full max-h-full object-contain" onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}/>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className="text-sm text-gray-300">Now: {channel.currentProgram || 'No Program Found'}</div>
                    <div className="text-sm text-gray-400">Next: {channel.nextProgram || 'No Program Found'}</div>
                  </div>
                </div>
              </div>

              {/* Progress Line */}
              <div className="w-full h-0.5 bg-gray-600/50 rounded-full overflow-hidden">
                 <div className="h-full bg-white/50 w-full" />
              </div>

              {/* Actions Row */}
              <div className="flex items-center justify-between text-gray-400 text-sm font-medium">
                <button onClick={onPrev} className="flex items-center gap-2 hover:text-white transition-colors">
                  <SkipBack className="w-4 h-4" /> Previous Channel
                </button>
                
                <div className="flex items-center gap-8">
                  <button onClick={onToggleSidebar} className={\`flex items-center gap-2 hover:text-white transition-colors \${isSidebarOpen ? 'text-white' : ''}\`}>
                    <LayoutGrid className="w-4 h-4" /> Channels List
                  </button>
                  <button className="flex items-center gap-2 hover:text-white transition-colors">
                    <Maximize className="w-4 h-4" /> Aspect Ratio
                  </button>
                  <button className="flex items-center gap-2 hover:text-white transition-colors">
                    <Columns className="w-4 h-4" /> Multi-Screen
                  </button>
                </div>

                <button onClick={onNext} className="flex items-center gap-2 hover:text-white transition-colors">
                  <SkipForward className="w-4 h-4" /> Next Channel
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
`;

fs.writeFileSync('src/components/VideoPlayer.tsx', videoContent);
