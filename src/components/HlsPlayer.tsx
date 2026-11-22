import React, { useEffect, useImperativeHandle, useRef } from 'react';
import Hls from 'hls.js';
import type { Channel } from '../types';
import type { PlayerAdapter } from '../lib/playerAdapter';

interface HlsPlayerProps {
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (v: number) => void;
  src: string;
  onError?: (errMessage?: string) => void;
  isPlaying?: boolean;
  onWaiting?: () => void;
  onPlaying?: () => void;
  onLoadedMetadata?: () => void;
  onAutoMuted?: (muted: boolean) => void;
  onAutoplayBlocked?: () => void;
  onQualityDetected?: (label: string) => void;
  adapterRef?: React.MutableRefObject<PlayerAdapter | null>;
  className?: string;
  aspectRatio?: 'contain' | 'cover' | 'fill';
  volumeBoost?: number;
  brightness?: number;
}

export const HlsPlayer = React.forwardRef<HTMLVideoElement, HlsPlayerProps>(({
  src,
  onError,
  isPlaying = true,
  volume = 1,
  muted = false,
  onVolumeChange,
  onWaiting,
  onPlaying,
  onLoadedMetadata,
  onAutoMuted,
  onAutoplayBlocked,
  onQualityDetected,
  adapterRef,
  className,
  aspectRatio = 'contain',
  volumeBoost = 1,
  brightness = 1
}, ref) => {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const activeSrcRef = useRef<string>('');
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryCountersRef = useRef({ network: 0, media: 0 });
  const isPlayingPropRef = useRef(isPlaying);
  isPlayingPropRef.current = isPlaying;

  useImperativeHandle(ref, () => internalRef.current as HTMLVideoElement, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const webAudioConnectedRef = useRef(false);

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const onPlayingRef = useRef(onPlaying);
  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);

  const onLoadedMetadataRef = useRef(onLoadedMetadata);
  useEffect(() => { onLoadedMetadataRef.current = onLoadedMetadata; }, [onLoadedMetadata]);

  const onWaitingRef = useRef(onWaiting);
  useEffect(() => { onWaitingRef.current = onWaiting; }, [onWaiting]);

  const onAutoMutedRef = useRef(onAutoMuted);
  useEffect(() => { onAutoMutedRef.current = onAutoMuted; }, [onAutoMuted]);

  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  useEffect(() => { onAutoplayBlockedRef.current = onAutoplayBlocked; }, [onAutoplayBlocked]);

  const onQualityDetectedRef = useRef(onQualityDetected);
  useEffect(() => { onQualityDetectedRef.current = onQualityDetected; }, [onQualityDetected]);

  const clearStallTimer = () => {
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
  };

  // Safe play helper: honors current mute/volume; never force-mutes on autoplay rejection
  const safePlayVideo = async (video: HTMLVideoElement): Promise<'playing' | 'autoplay-blocked' | 'error'> => {
    try {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      return 'playing';
    } catch (err: any) {
      if (err && (err.name === 'NotAllowedError' || String(err).includes('NotAllowedError'))) {
        onAutoplayBlockedRef.current?.();
        return 'autoplay-blocked';
      }
      if (err && err.name === 'AbortError') {
        // Normal source swap interruption — not a playback failure
        return 'playing';
      }
      return 'error';
    }
  };

  const loadSourceIntoSinglePlayer = (nextSrc: string) => {
    const video = internalRef.current;
    if (!video || !nextSrc) return;

    activeSrcRef.current = nextSrc;
    recoveryCountersRef.current = { network: 0, media: 0 };
    clearStallTimer();

    const isLowRamAndroid = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 4) <= 4;

    if (Hls.isSupported()) {
      try {
        if (!hlsRef.current) {
          const hls = new Hls({
            enableWorker: !isLowRamAndroid && typeof Worker !== 'undefined',
            capLevelToPlayerSize: true,
            lowLatencyMode: true,
            maxBufferLength: isLowRamAndroid ? 8 : 12,
            maxMaxBufferLength: isLowRamAndroid ? 16 : 24,
            maxBufferSize: (isLowRamAndroid ? 12 : 24) * 1024 * 1024,
            backBufferLength: 6,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            maxBufferHole: 2.0,
            maxFragLookUpTolerance: 0.8,
            nudgeOffset: 0.2,
            nudgeMaxRetry: 6,
            abrEwmaDefaultEstimate: 750000,
            abrBandWidthFactor: 0.9,
            abrBandWidthUpFactor: 0.7,
            testBandwidth: true,
            manifestLoadingTimeOut: 12000,
            manifestLoadingMaxRetry: 4,
            manifestLoadingRetryDelay: 600,
            levelLoadingTimeOut: 12000,
            levelLoadingMaxRetry: 4,
            levelLoadingRetryDelay: 600,
            fragLoadingTimeOut: 14000,
            fragLoadingMaxRetry: 5,
            fragLoadingRetryDelay: 500,
            startFragPrefetch: true,
            appendErrorMaxRetry: 4,
          });

          hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            clearStallTimer();
            if (data.levels && data.levels.length > 0) {
              const highest = data.levels[data.levels.length - 1];
              if (highest && highest.height) {
                onQualityDetectedRef.current?.(`${highest.height}p HD`);
              } else {
                onQualityDetectedRef.current?.('LIVE HD');
              }
            }
            if (isPlayingPropRef.current && internalRef.current) {
              safePlayVideo(internalRef.current);
            }
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            const lvl = hls.levels?.[data.level];
            if (lvl && lvl.height) {
              onQualityDetectedRef.current?.(`${lvl.height}p`);
            }
          });

          hls.on(Hls.Events.FRAG_LOADED, () => {
            recoveryCountersRef.current.network = 0;
            clearStallTimer();
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            clearStallTimer();
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (recoveryCountersRef.current.network < 2) {
                  recoveryCountersRef.current.network += 1;
                  const attempt = recoveryCountersRef.current.network;
                  setTimeout(() => {
                    if (hlsRef.current) {
                      try { hlsRef.current.startLoad(); } catch {}
                    }
                  }, 600 * attempt);
                } else {
                  onErrorRef.current?.('Network signal interrupted');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                if (recoveryCountersRef.current.media === 0) {
                  recoveryCountersRef.current.media = 1;
                  hls.recoverMediaError();
                } else if (recoveryCountersRef.current.media === 1) {
                  recoveryCountersRef.current.media = 2;
                  hls.swapAudioCodec();
                  hls.recoverMediaError();
                } else {
                  // Fallback to native HTML5 playback on the SAME <video> element
                  try {
                    hls.detachMedia();
                    hls.destroy();
                  } catch {}
                  hlsRef.current = null;
                  if (internalRef.current && activeSrcRef.current) {
                    internalRef.current.src = activeSrcRef.current;
                    if (isPlayingPropRef.current) {
                      safePlayVideo(internalRef.current);
                    }
                  }
                }
                break;
              default:
                onErrorRef.current?.('Stream format or decoder unavailable');
                break;
            }
          });

          hls.attachMedia(video);
          hlsRef.current = hls;
        } else {
          hlsRef.current.stopLoad();
        }

        hlsRef.current.loadSource(nextSrc);
        hlsRef.current.startLoad();
        return;
      } catch {
        // Fallback below to native <video src>
      }
    }

    // Native Safari/iOS/Android Stagefright HLS playback on the single <video>
    video.src = nextSrc;
    video.load();
    if (isPlayingPropRef.current) {
      safePlayVideo(video);
    }
  };

  // Expose unified PlayerAdapter so guide, swipe, Prev/Next all drive this single video element
  useEffect(() => {
    if (!adapterRef) return;
    adapterRef.current = {
      setSource: (_channel: Channel, resolvedSrc: string) => {
        if (resolvedSrc && resolvedSrc !== activeSrcRef.current) {
          loadSourceIntoSinglePlayer(resolvedSrc);
        } else if (resolvedSrc) {
          // Force reload when retrying the same URL
          loadSourceIntoSinglePlayer(resolvedSrc);
        }
      },
      play: async () => {
        const video = internalRef.current;
        if (!video) return 'error';
        return safePlayVideo(video);
      },
      pause: () => {
        internalRef.current?.pause();
      },
      setMuted: (m: boolean) => {
        if (internalRef.current) {
          internalRef.current.muted = m;
        }
      },
      setVolume: (v: number) => {
        if (internalRef.current) {
          internalRef.current.volume = Math.max(0, Math.min(1, v));
        }
      },
      getState: () => {
        const v = internalRef.current;
        return {
          muted: v ? v.muted : true,
          volume: v ? v.volume : 1,
          paused: v ? v.paused : true,
          readyState: v ? v.readyState : 0,
          playing: Boolean(v && !v.paused && v.readyState >= 2),
        };
      },
    };
    return () => {
      if (adapterRef) adapterRef.current = null;
    };
  }, [adapterRef]);

  // Attach single-element stall detection and cleanup strictly on unmount
  useEffect(() => {
    const video = internalRef.current;
    if (!video) return;

    const armStallTimer = () => {
      clearStallTimer();
      stallTimeoutRef.current = setTimeout(() => {
        const v = internalRef.current;
        if (!v) return;
        if (v.readyState < 2 && isPlayingPropRef.current) {
          try { hlsRef.current?.startLoad(); } catch {}
          setTimeout(() => {
            if (internalRef.current && internalRef.current.readyState < 2 && isPlayingPropRef.current) {
              onErrorRef.current?.('Stream stalled waiting for signal');
            }
          }, 3500);
        }
      }, 9000);
    };

    const handleWaiting = () => {
      onWaitingRef.current?.();
      armStallTimer();
    };
    const handleStalled = () => armStallTimer();
    const handlePlaying = () => {
      clearStallTimer();
      onPlayingRef.current?.();
    };
    const handleLoadedMetadata = () => {
      clearStallTimer();
      onLoadedMetadataRef.current?.();
    };
    const handleTimeUpdate = () => clearStallTimer();

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      clearStallTimer();
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
    };
  }, []);

  // Load new stream URL into the existing single HLS / <video> instance without unmounting
  useEffect(() => {
    if (src) {
      loadSourceIntoSinglePlayer(src);
    }
  }, [src]);

  // Optional Web Audio Boost (100% -> 200% for quiet Android speakers)
  useEffect(() => {
    const video = internalRef.current;
    if (!video) return;

    if (volumeBoost > 1) {
      try {
        if (!audioCtxRef.current && !webAudioConnectedRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioCtxRef.current = ctx;

            const source = ctx.createMediaElementSource(video);
            sourceNodeRef.current = source;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(volumeBoost, ctx.currentTime);
            gainNodeRef.current = gain;

            source.connect(gain);
            gain.connect(ctx.destination);
            webAudioConnectedRef.current = true;
          }
        } else if (gainNodeRef.current && audioCtxRef.current) {
          gainNodeRef.current.gain.setValueAtTime(volumeBoost, audioCtxRef.current.currentTime);
        }

        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended' && isPlaying) {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch {
        webAudioConnectedRef.current = false;
      }
    } else if (gainNodeRef.current && audioCtxRef.current) {
      try {
        gainNodeRef.current.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
      } catch {}
    }
  }, [volumeBoost, isPlaying]);

  // Sync play/pause, explicit muted flag, and volume without clobbering user mute state
  useEffect(() => {
    const video = internalRef.current;
    if (!video) return;

    if (volume !== undefined) {
      const clamped = Math.max(0, Math.min(1, volume));
      if (Math.abs(video.volume - clamped) > 0.01) {
        video.volume = clamped;
      }
    }
    if (video.muted !== Boolean(muted)) {
      video.muted = Boolean(muted);
    }

    if (isPlaying) {
      if (video.paused && activeSrcRef.current) {
        safePlayVideo(video);
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [isPlaying, volume, muted]);

  const aspectClass =
    aspectRatio === 'cover'
      ? 'object-cover'
      : aspectRatio === 'fill'
      ? 'object-fill'
      : 'object-contain';

  return (
    <video
      ref={internalRef}
      onVolumeChange={(e) => onVolumeChange && onVolumeChange((e.target as HTMLVideoElement).volume)}
      onError={() => {
        onErrorRef.current?.('Media playback error');
      }}
      style={brightness !== 1 ? { filter: `brightness(${brightness})` } : undefined}
      className={className || `w-full h-full bg-black ${aspectClass} transform-gpu will-change-transform`}
      autoPlay
      playsInline
      {...({
        'webkit-playsinline': 'true',
        'x5-playsinline': 'true',
        'x5-video-player-type': 'h5',
        'x5-video-player-fullscreen': 'true',
        'x5-video-orientation': 'landscape'
      } as any)}
    />
  );
});

HlsPlayer.displayName = 'HlsPlayer';
