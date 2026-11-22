const fs = require('fs');

const content = `import React, { useState, useEffect, useRef } from 'react';
import { Channel } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { HlsPlayer } from './HlsPlayer';
import VideoJS from './VideoJS';
import { ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Minimize, Loader2, MonitorPlay, Volume2, VolumeX, PictureInPicture, Signal } from 'lucide-react';

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
  const [activePlayer, setActivePlayer] = useState<'hlsjs'>('hlsjs');
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tv-volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    localStorage.setItem('tv-volume', v.toString());
  };

  const toggleMute = () => {
    if (volume > 0) {
      setVolume(0);
      localStorage.setItem('tv-volume', '0');
    } else {
      setVolume(1);
      localStorage.setItem('tv-volume', '1');
    }
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('player-container');
    if (!document.fullscreenElement && container) {
      container.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const togglePiP = async () => {
    if (videoRef.current) {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group box-border"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        <HlsPlayer ref={videoRef} key={retryKey} src={channel.m3u8Url} onError={() => setHasError(true)} isPlaying={isPlaying} volume={volume} onVolumeChange={v => {
          if(Math.abs(v - volume) > 0.01) {
            setVolume(v);
            localStorage.setItem('tv-volume', v.toString());
          }
        }} />
      </div>

      {hasError && retryCount < 5 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
           <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

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

      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none"
          >
            <div className="flex items-center justify-between p-6 pointer-events-auto">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => document.exitFullscreen().catch(()=>{}).finally(onToggleSidebar)}
                  className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-lg font-bold text-white shadow-sm uppercase tracking-wider flex items-center gap-3">
                  {channel.iconUrl && (
                    <img src={channel.iconUrl} alt="Logo" className="h-8 w-auto object-contain drop-shadow-md" onError={(e) => e.currentTarget.style.display = 'none'} />
                  )}
                  {channel.name}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={togglePiP} className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Picture in Picture">
                  <PictureInPicture className="w-5 h-5 text-white" />
                </button>
                <button onClick={toggleFullscreen} className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Fullscreen">
                  {isFullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
                </button>
              </div>
            </div>

            {hasError && retryCount < 5 && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-gray-200 text-gray-900 px-6 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-2xl pointer-events-none">
                <MonitorPlay className="w-4 h-4 text-blue-600" />
                Playback error, reconnects in 3s ({retryCount}/5)
              </div>
            )}
            
            {hasError && retryCount >= 5 && (
               <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full text-sm font-medium shadow-2xl pointer-events-none">
                Stream unavailable
              </div>
            )}

            <div className="p-6 flex flex-col gap-2 pointer-events-auto">
              
              <div className="flex items-center justify-between">
                
                <div className="flex items-center gap-4 w-1/3">
                  <button onClick={toggleMute} className="text-white hover:text-orange-500 transition-colors">
                    {volume === 0 ? <VolumeX className="w-5 h-5 lg:w-6 lg:h-6" /> : <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" />}
                  </button>
                  <input 
                    type="range" 
                    min="0" max="1" step="0.05" 
                    value={volume} 
                    onChange={handleVolumeChange} 
                    className="w-24 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer hidden sm:block accent-orange-500 hover:accent-orange-400" 
                  />
                </div>

                <div className="flex items-center justify-center gap-4 lg:gap-6 w-1/3">
                  <button onClick={onPrev} className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Previous Channel">
                    <SkipBack className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-12 h-12 lg:w-14 lg:h-14 bg-transparent border-2 border-white/50 hover:border-orange-500 hover:text-orange-500 rounded-full flex items-center justify-center transition-all text-white"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 lg:w-6 lg:h-6" fill="currentColor" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 ml-1" fill="currentColor" />}
                  </button>
                  
                  <button onClick={onNext} className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Next Channel">
                    <SkipForward className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                </div>

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
                  <button onClick={onToggleSidebar} className={`hidden sm:flex items-center gap-2 hover:text-orange-500 transition-colors ml-2 ${isSidebarOpen ? 'text-orange-400' : 'text-white'}`} title="Channel List">
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
