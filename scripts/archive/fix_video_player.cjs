const fs = require('fs');

const content = `import React, { useState, useEffect, useRef } from 'react';
import { Channel } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import HlsPlayer from './HlsPlayer';
import VideoJS from './VideoJS';
import { ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay, Volume2, Rewind, FastForward, Signal } from 'lucide-react';

interface VideoPlayerProps {
  channel: Channel;
  onNext: () => void;
  onPrev: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export default function VideoPlayer({ channel, onNext, onPrev, onToggleSidebar, isSidebarOpen }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [activePlayer, setActivePlayer] = useState<'videojs' | 'hlsjs'>('hlsjs');
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group box-border"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Video Layer */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {activePlayer === 'videojs' ? (
          <VideoJS key={retryKey} options={videoJsOptions} onReady={handlePlayerReady} />
        ) : (
          <HlsPlayer key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} isPlaying={isPlaying} />
        )}
      </div>

      {hasError && retryCount < 5 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
           <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

      {/* Big Center Play Button when Paused */}
      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-sm pointer-events-none">
           <div 
             className="w-24 h-24 bg-orange-500/90 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.6)] mb-4 pointer-events-auto cursor-pointer hover:scale-105 transition-transform" 
             onClick={(e) => { e.stopPropagation(); togglePlay(); }}
           >
             <Play className="w-12 h-12 text-white ml-2" fill="white" />
           </div>
           <span className="text-white text-lg font-medium tracking-wide drop-shadow-md">Click to Play</span>
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
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={onToggleSidebar}
                  className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg"
                >
                  {isSidebarOpen ? <ArrowLeft className="w-5 h-5 text-white" /> : <LayoutGrid className="w-5 h-5 text-white" />}
                </button>
                <h2 className="text-lg font-bold text-white shadow-sm uppercase tracking-wider flex items-center gap-3">
                  {channel.iconUrl && (
                    <img src={channel.iconUrl} alt="Logo" className="h-8 w-auto object-contain drop-shadow-md" onError={(e) => e.currentTarget.style.display = 'none'} />
                  )}
                  {channel.name}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Display Options">
                  <MonitorPlay className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Settings">
                  <Settings className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Fullscreen">
                  <Maximize className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

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
            <div className="p-6 flex flex-col gap-2">
              
              {/* Progress Line and Time */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white text-xs font-medium w-12 text-right">12:45</span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group">
                   <div className="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-colors"></div>
                   <div className="h-full bg-orange-500 w-[30%] shadow-[0_0_10px_rgba(249,115,22,0.8)] relative rounded-full"></div>
                </div>
                <span className="text-gray-400 text-xs font-medium w-12">45:30</span>
              </div>

              {/* Media Controls */}
              <div className="flex items-center justify-between">
                
                {/* Left: Volume */}
                <div className="flex items-center gap-4 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <div className="w-20 lg:w-24 h-1.5 bg-white/20 rounded-full hidden sm:block cursor-pointer overflow-hidden group">
                    <div className="h-full bg-white group-hover:bg-orange-500 transition-colors w-[80%] rounded-full" />
                  </div>
                </div>

                {/* Center: Playback */}
                <div className="flex items-center justify-center gap-4 lg:gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Rewind">
                    <Rewind className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-12 h-12 lg:w-14 lg:h-14 bg-transparent border-2 border-white/50 hover:border-orange-500 hover:text-orange-500 rounded-full flex items-center justify-center transition-all text-white"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 lg:w-6 lg:h-6" fill="currentColor" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 ml-1" fill="currentColor" />}
                  </button>
                  
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Fast Forward">
                    <FastForward className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                </div>

                {/* Right: CC, Speed, Signal */}
                <div className="flex items-center justify-end gap-4 lg:gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Closed Captions">
                    CC
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Playback Speed">
                    1.0x
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors" title="Signal Quality">
                    <Signal className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <button onClick={onToggleSidebar} className={\`hidden sm:flex items-center gap-2 hover:text-orange-500 transition-colors ml-2 \${isSidebarOpen ? 'text-orange-400' : 'text-white'}\`} title="Channel List">
                    <LayoutGrid className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
`;

fs.writeFileSync('src/components/VideoPlayer.tsx', content);
