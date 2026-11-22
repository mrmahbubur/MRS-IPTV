import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, AdFreeState } from '../types';
import { getChannelLogo, getChannelFallbackLogo } from '../lib/channelLogos';
import { ChannelThumbnail } from './ChannelThumbnail';
import { motion, AnimatePresence } from 'motion/react';
import { HlsPlayer } from './HlsPlayer';
import { AdBannerUnit } from './AdBannerUnit';
import { InPlayerAdBanner } from './InPlayerAdBanner';
import { InPlayerMiniGuide } from './InPlayerMiniGuide';
import { WatchAdVipButton } from './WatchAdVipButton';
import { MoreMenuSheet } from './MoreMenuSheet';
import { TvGuideSheet } from './TvGuideSheet';
import { PlayerCoachMarks } from './PlayerCoachMarks';
import { PlayerHelpModal } from './PlayerHelpModal';
import { ChannelListeningPanel, type GuidePlaybackStatus } from './ChannelListeningPanel';
import { sanitizeClientPlaybackError, type PlayerAdapter } from '../lib/playerAdapter';
import {
  getNextAdZone,
  recordAdEvent,
  grantRewardedAdFreeTime,
  getBackendAdRedirectUrl,
  AdZoneConfig
} from '../lib/adSystem';
import {
  ArrowLeft, ArrowUp, ArrowDown, Play, Pause, SkipBack, SkipForward, Maximize, Minimize,
  Volume2, VolumeX, Volume1, RefreshCw, X, Search, List, Zap,
  Tv, SlidersHorizontal, Lock, Unlock, Minimize2,
  Sun, ExternalLink, ShieldAlert, Trophy, Film, Newspaper,
  Music, Globe, Smile, Compass, Tv2, Grid, ChevronDown, Star, LayoutGrid,
  MoreVertical, Radio, Signal, HelpCircle, Check, Info
} from 'lucide-react';
import {
  isMobileDevice,
  useDeviceScreen,
  type PlayerLayoutMode,
  type SpecificDeviceType
} from '../lib/screenDimensions';

export type AspectRatioMode = 'contain' | 'cover' | 'fill';
export type ProxyMode = 'auto' | 'vlc' | 'smarters' | 'chrome' | 'smarttv';

interface VideoPlayerProps {
  channel: Channel;
  allChannels?: Channel[];
  onSelectChannel?: (channel: Channel) => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleSidebar?: () => void;
  onClose?: () => void;
  onMinimizePip?: () => void;
  isSidebarOpen?: boolean;
  onChannelError?: (channelId: string) => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  initialMode?: string;
  detectedLocation?: { country: string; region: string | null; regionLabel: string } | null;
  locationSource?: 'network-estimate' | 'unavailable';
}

const PROXY_PROFILES: ProxyMode[] = ['auto', 'vlc', 'smarters', 'chrome', 'smarttv'];

const CATEGORY_PRIORITY_ORDER: string[] = [
  'Bangladeshi',
  'Sports',
  "Recent WC Event's",
  'News',
  'Movies',
  'Indian',
  'Entertainment',
  'Kids',
  'Documentary',
  'Music',
  'Religious',
  'Lifestyle',
  'General'
];

function getCategoryMeta(catName: string) {
  const lower = catName.toLowerCase().trim();
  if (lower === 'all') return { label: 'All Channels', icon: Grid, iconColor: 'text-[#F5B301]' };
  if (lower.includes('bangla')) return { label: 'Bangladeshi', icon: Globe, iconColor: 'text-[#2ECC71]' };
  if (lower.includes('wc event') || lower.includes('world cup')) return { label: 'World Cup & Live Events', icon: Trophy, iconColor: 'text-[#F5B301]' };
  if (lower.includes('sport')) return { label: 'Live Sports', icon: Trophy, iconColor: 'text-[#F5B301]' };
  if (lower.includes('news')) return { label: 'Live News', icon: Newspaper, iconColor: 'text-[#22B8F0]' };
  if (lower.includes('movie') || lower.includes('cinema')) return { label: 'Movies & Cinema', icon: Film, iconColor: 'text-[#F5B301]' };
  if (lower.includes('india') || lower.includes('hindi')) return { label: 'Indian TV', icon: Tv, iconColor: 'text-[#F5B301]' };
  if (lower.includes('entertain')) return { label: 'Entertainment', icon: Tv2, iconColor: 'text-[#F5B301]' };
  if (lower.includes('kid') || lower.includes('cartoon')) return { label: 'Kids & Family', icon: Smile, iconColor: 'text-[#22B8F0]' };
  if (lower.includes('docum')) return { label: 'Documentary', icon: Compass, iconColor: 'text-[#2ECC71]' };
  if (lower.includes('music')) return { label: 'Music TV', icon: Music, iconColor: 'text-[#22B8F0]' };
  if (lower.includes('relig') || lower.includes('islam')) return { label: 'Religious & Islamic', icon: Globe, iconColor: 'text-[#2ECC71]' };
  return { label: catName, icon: Tv, iconColor: 'text-[#F5B301]' };
}

function extractRawStreamUrl(url: string): string {
  if (!url) return '';
  let current = url.trim();
  let iterations = 0;
  while (current.includes('/api/proxy') && iterations < 5) {
    iterations++;
    try {
      const parsed = new URL(current, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const inner = parsed.searchParams.get('url');
      if (inner && inner !== current) {
        current = inner;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return current;
}

// 600ms TV-Static Canvas Flash Component for authentic cable TV channel zapping
const TvStaticCanvas: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const w = (canvas.width = 160);
    const h = (canvas.height = 90);
    const imgData = ctx.createImageData(w, h);
    const buffer32 = new Uint32Array(imgData.data.buffer);

    const render = () => {
      const len = buffer32.length;
      for (let i = 0; i < len; i++) {
        const val = (Math.random() * 255) | 0;
        buffer32[i] = (255 << 24) | (val << 16) | (val << 8) | val;
      }
      ctx.putImageData(imgData, 0, 0);
      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover z-25 pointer-events-none opacity-40 mix-blend-screen transition-opacity duration-300"
    />
  );
};

export default function VideoPlayer({
  channel,
  allChannels = [],
  onSelectChannel,
  onNext,
  onPrev,
  onToggleSidebar,
  onClose,
  onMinimizePip,
  onChannelError,
  adFreeState,
  onRewardedGranted,
  initialMode,
  detectedLocation = null,
  locationSource = 'unavailable'
}: VideoPlayerProps) {
  const isVip = !!(adFreeState?.isActive || adFreeState?.isAdFree);

  // 1. Playback & Self-Healing State (confirmedPlayingChannelId updates strictly on genuine media settlement)
  const [isPlaying, setIsPlaying] = useState(true);
  const [confirmedPlayingChannelId, setConfirmedPlayingChannelId] = useState<string | null>(null);
  const [guidePlaybackStatus, setGuidePlaybackStatus] = useState<GuidePlaybackStatus>('connecting');
  const [guidePlaybackError, setGuidePlaybackError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showCenterTransport, setShowCenterTransport] = useState(false);
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [firstTimeVipExpiryTip, setFirstTimeVipExpiryTip] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [autoHealAttempt, setAutoHealAttempt] = useState(0);
  const [autoHealStatus, setAutoHealStatus] = useState<string | null>(null);
  const [streamQuality, setStreamQuality] = useState<string>('LIVE HD');
  const [showTvStatic, setShowTvStatic] = useState(false);
  const [showOsdBanner, setShowOsdBanner] = useState(true);
  const [stallToast, setStallToast] = useState(false);

  // 2. Audio, Auto-Mute Recovery, Boost & Brightness
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tv-volume');
      return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 1;
    } catch {
      return 1;
    }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoMutedByBrowser, setIsAutoMutedByBrowser] = useState(false);
  const [volumeBoost, setVolumeBoost] = useState<number>(1);
  const [brightness, setBrightness] = useState<number>(1);
  const [showVolumeSliderPopup, setShowVolumeSliderPopup] = useState(false);
  const prevVolumeRef = useRef(volume > 0 ? volume : 1);

  // 3. Modals & Sheets (Midnight Broadcast System)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isTvGuideOpen, setIsTvGuideOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isCoachMarksOpen, setIsCoachMarksOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !localStorage.getItem('mrs_onboarding_v2');
    } catch {
      return false;
    }
  });

  // 4. Live Clock (HH:MM updated each minute)
  const [clockTime, setClockTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // 5. Numeric Channel Input Overlay (e.g. "CH 0__")
  const [channelNumberInput, setChannelNumberInput] = useState('');
  const channelDialTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 6. Favorites Sync inside Player
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shahintv_favorites') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const syncFavs = () => {
      try {
        setFavorites(JSON.parse(localStorage.getItem('shahintv_favorites') || '[]'));
      } catch {}
    };
    window.addEventListener('shahintv_favorites_updated', syncFavs);
    return () => window.removeEventListener('shahintv_favorites_updated', syncFavs);
  }, []);

  const toggleChannelFavorite = useCallback((channelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavorites(prev => {
      const exists = prev.includes(channelId);
      const next = exists ? prev.filter(id => id !== channelId) : [...prev, channelId];
      try {
        localStorage.setItem('shahintv_favorites', JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('shahintv_favorites_updated', { detail: next }));
      } catch {}
      return next;
    });
  }, []);

  // 7. Device Layout & Screen Profile
  const screenProfile = useDeviceScreen();
  const {
    playerLayoutMode,
    specificDeviceType,
    isPortrait,
    isLandscape,
    isUltrawide
  } = screenProfile;

  const isPortraitMobile = playerLayoutMode === 'mobile-portrait';
  const isLandscapeMobile = playerLayoutMode === 'mobile-landscape';
  const isTabletPortrait = playerLayoutMode === 'tablet-portrait';
  const isTabletLandscape = playerLayoutMode === 'tablet-landscape';
  const isTvMode = playerLayoutMode === 'tv-overscan';
  const isIphone = specificDeviceType === 'iphone';
  const isIpad = specificDeviceType === 'ipad';

  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>(() => {
    return (localStorage.getItem('shahintv_aspect_ratio') as AspectRatioMode) || 'contain';
  });
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => {
    return (localStorage.getItem('shahintv_proxy_mode') as ProxyMode) || 'auto';
  });
  const [activeMirrorIdx, setActiveMirrorIdx] = useState<number>(0);

  // 8. Channel Guide Drawer State (starts closed; never unmounts/pauses/mutes video when toggled)
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isQuickRailOpen, setIsQuickRailOpen] = useState<boolean>(false);

  // 9. Gesture & Toast HUD Feedback
  const [gestureHud, setGestureHud] = useState<{ type: 'volume' | 'brightness' | 'info'; text: string } | null>(null);
  const [overlaySponsorZone, setOverlaySponsorZone] = useState<AdZoneConfig | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerAdapterRef = useRef<PlayerAdapter | null>(null);
  const channelsOpenBtnRef = useRef<HTMLButtonElement | null>(null);
  const switchingLockRef = useRef<boolean>(false);
  const switchingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const centerTransportTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gestureHudTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number; startVol: number; startBright: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  useEffect(() => {
    const onFirstVipExpired = () => {
      setFirstTimeVipExpiryTip(true);
    };
    window.addEventListener('mrs_1h_vip_expired_first_time', onFirstVipExpired);
    return () => window.removeEventListener('mrs_1h_vip_expired_first_time', onFirstVipExpired);
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isTouchLocked, setIsTouchLocked] = useState(false);

  // 10. Slim 24px Swipe Hint on right edge
  // Shown ONLY when the site is opened for ~4s, stored in sessionStorage.
  // Never shown while swiping, on channel change, or at any other moment!
  const [showSwipeHint, setShowSwipeHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (!isMobileDevice()) return false;
    try {
      const dismissed = sessionStorage.getItem('mrs_swipe_hint_dismissed');
      return !dismissed;
    } catch {
      return true;
    }
  });

  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
    try {
      sessionStorage.setItem('mrs_swipe_hint_dismissed', '1');
    } catch {}
  }, []);

  useEffect(() => {
    if (!showSwipeHint) return;
    const timer = setTimeout(() => {
      dismissSwipeHint();
    }, 4000);
    return () => clearTimeout(timer);
  }, [showSwipeHint, dismissSwipeHint]);

  // 11. TV Static on Channel Change & OSD Banner (4s)
  useEffect(() => {
    setShowTvStatic(true);
    const staticTimer = setTimeout(() => setShowTvStatic(false), 600);

    setShowOsdBanner(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setShowOsdBanner(false), 4000);

    return () => {
      clearTimeout(staticTimer);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [channel.id]);

  // 12. 10-second stall detection for contextual tip
  useEffect(() => {
    if (!isBuffering || hasError) {
      setStallToast(false);
      return;
    }
    const timer = setTimeout(() => {
      if (isBuffering && !hasError) {
        setStallToast(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [isBuffering, hasError, retryKey]);

  // Cleanly reset playback status on channel change without bumping retryKey (which would cause a double HLS load)
  useEffect(() => {
    setHasError(false);
    setIsBuffering(true);
    setIsPlaying(true);
    setConfirmedPlayingChannelId(null);
    setGuidePlaybackStatus('connecting');
    setGuidePlaybackError(null);
    setActiveMirrorIdx(0);
    setAutoHealAttempt(0);
    setAutoHealStatus(null);
    setStallToast(false);
  }, [channel.id, channel.m3u8Url, channel.name]);

  // In-Player Sponsor Overlay for Non-VIP Users
  useEffect(() => {
    if (isVip) {
      setOverlaySponsorZone(null);
      return;
    }
    const timer = setInterval(() => {
      const zone = getNextAdZone();
      setOverlaySponsorZone(zone);
      recordAdEvent('impression', zone, 'fullscreen-overlay');
      setTimeout(() => {
        setOverlaySponsorZone(prev => (prev?.id === zone.id ? null : prev));
      }, 8000);
    }, 90000);

    return () => clearInterval(timer);
  }, [isVip]);

  const showToastHud = useCallback((type: 'volume' | 'brightness' | 'info', text: string) => {
    setGestureHud({ type, text });
    if (gestureHudTimeoutRef.current) clearTimeout(gestureHudTimeoutRef.current);
    gestureHudTimeoutRef.current = setTimeout(() => {
      setGestureHud(null);
    }, 1300);
  }, []);

  const channelIndex = useMemo(() => {
    if (!allChannels.length) return 1;
    const idx = allChannels.findIndex(c => c.id === channel.id || c.name === channel.name);
    return idx >= 0 ? idx + 1 : 1;
  }, [allChannels, channel.id, channel.name]);

  const channelNumberFormatted = useMemo(() => {
    return `CH ${String(channelIndex).padStart(3, '0')}`;
  }, [channelIndex]);

  const nextChannel = useMemo(() => {
    if (!allChannels.length) return null;
    const idx = allChannels.findIndex(c => c.id === channel.id || c.name === channel.name);
    if (idx === -1) return allChannels[0] || null;
    return allChannels[(idx + 1) % allChannels.length] || null;
  }, [allChannels, channel.id, channel.name]);

  const prevChannel = useMemo(() => {
    if (!allChannels.length) return null;
    const idx = allChannels.findIndex(c => c.id === channel.id || c.name === channel.name);
    if (idx === -1) return allChannels[allChannels.length - 1] || null;
    return allChannels[(idx - 1 + allChannels.length) % allChannels.length] || null;
  }, [allChannels, channel.id, channel.name]);

  // Mobile: Stage taps unmute audio immediately, while guide/dialog/buttons preserve explicit mute state
  useEffect(() => {
    if (!isMobileDevice()) return;

    const handleMobileTapToUnmute = (e: MouseEvent | TouchEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('#channel-guide, button[data-mute-btn], [data-no-auto-unmute], [role="dialog"], input, select')) {
        return;
      }

      if (video.muted || isMuted || isAutoMutedByBrowser || volume === 0) {
        try {
          video.muted = false;
          const restoredVol = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1;
          video.volume = restoredVol;
          setVolume(restoredVol);
          setIsMuted(false);
          setIsAutoMutedByBrowser(false);
          showToastHud('volume', 'Sound Unmuted');
          if (video.paused) {
            playerAdapterRef.current?.play().catch(() => {});
          }
        } catch (err) {}
      }
    };

    window.addEventListener('touchstart', handleMobileTapToUnmute, { passive: true, capture: true });
    window.addEventListener('click', handleMobileTapToUnmute, { capture: true });

    return () => {
      window.removeEventListener('touchstart', handleMobileTapToUnmute, { capture: true });
      window.removeEventListener('click', handleMobileTapToUnmute, { capture: true });
    };
  }, [isMuted, isAutoMutedByBrowser, volume, showToastHud]);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLock: any = null;
    const requestWake = async () => {
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock && isPlaying && !hasError) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    };
    requestWake();
    return () => {
      if (wakeLock) {
        try { wakeLock.release(); } catch {}
      }
    };
  }, [isPlaying, hasError]);

  // Controls auto-hide timers: 4.0s for top/dock HUD, 3.0s for center transport (center opens on tap or pause)
  const triggerControls = useCallback((revealCenter = false) => {
    setShowControls(true);
    if (revealCenter || !isPlaying) {
      setShowCenterTransport(true);
    }
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (centerTransportTimeoutRef.current) clearTimeout(centerTransportTimeoutRef.current);
    centerTransportTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !hasError && !isQuickRailOpen && !isMoreMenuOpen && !showVolumeSliderPopup) {
        setShowCenterTransport(false);
      }
    }, 3000);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !hasError && !isQuickRailOpen && !isMoreMenuOpen && !showVolumeSliderPopup) {
        setShowControls(false);
      }
    }, 4000);
  }, [isPlaying, hasError, isQuickRailOpen, isMoreMenuOpen, showVolumeSliderPopup]);

  useEffect(() => {
    triggerControls(false);
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (centerTransportTimeoutRef.current) clearTimeout(centerTransportTimeoutRef.current);
    };
  }, [triggerControls]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      const fsElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement;
      setIsFullscreen(!!fsElement);
      if (!fsElement) {
        setIsPseudoFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerControls();
    // Target outer container so the persistent video column and #channel-guide stay together in fullscreen
    const target = containerRef.current || videoStageRef.current;
    const video = videoRef.current as any;

    const isCurrentlyFs =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      isPseudoFullscreen;

    if (!isCurrentlyFs) {
      setIsPseudoFullscreen(true);
      setIsFullscreen(true);

      try {
        if (target?.requestFullscreen) {
          await target.requestFullscreen();
        } else if ((target as any)?.webkitRequestFullscreen) {
          (target as any).webkitRequestFullscreen();
        } else if (video?.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      } catch {}

      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape');
        }
      } catch {}
    } else {
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);

      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } catch {}

      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch {}
    }
  }, [isPseudoFullscreen, triggerControls]);

  const handleBack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPseudoFullscreen || document.fullscreenElement) {
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch {}
      return;
    }
    if (onClose) {
      onClose();
    } else if (onToggleSidebar) {
      onToggleSidebar();
    }
  }, [isPseudoFullscreen, onClose, onToggleSidebar]);

  const handleVolumeChange = useCallback((newVal: number) => {
    const clamped = Math.max(0, Math.min(1, Number(newVal.toFixed(2))));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    setIsAutoMutedByBrowser(false);
    try {
      localStorage.setItem('tv-volume', clamped.toString());
    } catch {}
  }, []);

  const toggleMute = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsAutoMutedByBrowser(false);
    if (isMuted || volume === 0) {
      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.85;
      setVolume(restored);
      setIsMuted(false);
      try { localStorage.setItem('tv-volume', restored.toString()); } catch {}
      showToastHud('volume', `Volume ${Math.round(restored * 100)}%`);
    } else {
      prevVolumeRef.current = volume;
      setVolume(0);
      setIsMuted(true);
      try { localStorage.setItem('tv-volume', '0'); } catch {}
      showToastHud('volume', 'Audio Muted');
    }
    triggerControls();
  }, [isMuted, volume, showToastHud, triggerControls]);

  const cycleAudioBoost = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const levels = [1, 1.5, 2];
    const next = levels[(levels.indexOf(volumeBoost) + 1) % levels.length];
    setVolumeBoost(next);
    showToastHud('volume', `Audio Boost: ${Math.round(next * 100)}%`);
    triggerControls();
  }, [volumeBoost, showToastHud, triggerControls]);

  const cycleBrightness = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const levels = [1, 1.15, 0.85, 0.7];
    const next = levels[(levels.indexOf(brightness) + 1) % levels.length];
    setBrightness(next);
    showToastHud('brightness', `Brightness: ${Math.round(next * 100)}%`);
    triggerControls();
  }, [brightness, showToastHud, triggerControls]);

  const cycleAspectRatio = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const modes: AspectRatioMode[] = ['contain', 'cover', 'fill'];
    const labels: Record<AspectRatioMode, string> = {
      contain: 'Fit Screen (16:9)',
      cover: 'Zoom / Crop to Fill',
      fill: 'Stretch Fullscreen'
    };
    const next = modes[(modes.indexOf(aspectRatio) + 1) % modes.length];
    setAspectRatio(next);
    try { localStorage.setItem('shahintv_aspect_ratio', next); } catch {}
    showToastHud('info', labels[next]);
    triggerControls();
  }, [aspectRatio, showToastHud, triggerControls]);

  const cycleProxyMode = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = PROXY_PROFILES[(PROXY_PROFILES.indexOf(proxyMode) + 1) % PROXY_PROFILES.length];
    setProxyMode(next);
    try { localStorage.setItem('shahintv_proxy_mode', next); } catch {}
    setHasError(false);
    setIsBuffering(true);
    setRetryKey(k => k + 1);
    showToastHud('info', `Proxy Line: ${next.toUpperCase()}`);
    triggerControls();
  }, [proxyMode, showToastHud, triggerControls]);

  // Unified single-player channel switching flow with in-flight switch lock
  const selectChannelUnified = useCallback((targetChannel: Channel) => {
    if (!targetChannel || !onSelectChannel) return;
    if (switchingLockRef.current) return;
    if (targetChannel.id === channel.id && !hasError && confirmedPlayingChannelId === targetChannel.id) {
      return;
    }

    switchingLockRef.current = true;
    setIsSwitching(true);
    setConfirmedPlayingChannelId(null);
    setGuidePlaybackStatus('connecting');
    setGuidePlaybackError(null);
    setHasError(false);
    setIsBuffering(true);

    if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
    switchingTimerRef.current = setTimeout(() => {
      switchingLockRef.current = false;
      setIsSwitching(false);
    }, 1500);

    onSelectChannel(targetChannel);
  }, [channel.id, confirmedPlayingChannelId, hasError, onSelectChannel]);

  const handleNextUnified = useCallback(() => {
    if (nextChannel) {
      selectChannelUnified(nextChannel);
    } else {
      onNext();
    }
  }, [nextChannel, selectChannelUnified, onNext]);

  const handlePrevUnified = useCallback(() => {
    if (prevChannel) {
      selectChannelUnified(prevChannel);
    } else {
      onPrev();
    }
  }, [prevChannel, selectChannelUnified, onPrev]);

  // Numeric channel dialing jump
  const jumpToChannelNumber = useCallback((numStr: string) => {
    const targetNum = parseInt(numStr, 10);
    if (!isNaN(targetNum) && targetNum >= 1 && targetNum <= allChannels.length) {
      const ch = allChannels[targetNum - 1];
      if (ch) {
        selectChannelUnified(ch);
        showToastHud('info', `Tuned to CH ${String(targetNum).padStart(3, '0')}: ${ch.name}`);
      }
    }
  }, [allChannels, selectChannelUnified, showToastHud]);

  const handleDialDigit = useCallback((digit: string) => {
    setChannelNumberInput(prev => {
      const next = (prev + digit).slice(0, 4);
      if (channelDialTimerRef.current) clearTimeout(channelDialTimerRef.current);
      channelDialTimerRef.current = setTimeout(() => {
        jumpToChannelNumber(next);
        setChannelNumberInput('');
      }, 2000);
      return next;
    });
  }, [jumpToChannelNumber]);

  const candidateUrls = useMemo(() => {
    const list = [channel.m3u8Url, ...(channel.mirrors || []), ...(channel.backupUrls || [])].filter(Boolean);
    const cleaned = list.map(u => extractRawStreamUrl(u)).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, [channel.m3u8Url, channel.mirrors, channel.backupUrls]);

  // Keyboard navigation & Android TV Remote Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea', 'select'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;
      if (isGuideOpen) return;
      triggerControls();

      // Number keys 0-9 for channel dialing
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDialDigit(e.key);
        return;
      }

      switch (e.key) {
        case 'Enter':
          if (channelNumberInput) {
            e.preventDefault();
            if (channelDialTimerRef.current) clearTimeout(channelDialTimerRef.current);
            jumpToChannelNumber(channelNumberInput);
            setChannelNumberInput('');
            return;
          }
          if (!isQuickRailOpen && !isMoreMenuOpen && !isTvGuideOpen) {
            e.preventDefault();
            setIsPlaying(prev => !prev);
          }
          break;
        case ' ':
          if (!isQuickRailOpen && !isMoreMenuOpen && !isTvGuideOpen) {
            e.preventDefault();
            setIsPlaying(prev => !prev);
          }
          break;
        case 'ArrowUp':
        case 'PageUp':
        case 'ChannelUp':
          e.preventDefault();
          handlePrevUnified();
          break;
        case 'ArrowDown':
        case 'PageDown':
        case 'ChannelDown':
          e.preventDefault();
          handleNextUnified();
          break;
        case 'ArrowLeft':
          if (!isQuickRailOpen && !isTvGuideOpen) {
            e.preventDefault();
            handleVolumeChange(volume - 0.05);
            showToastHud('volume', `Volume ${Math.round(Math.max(0, volume - 0.05) * 100)}%`);
          }
          break;
        case 'ArrowRight':
          if (!isQuickRailOpen && !isTvGuideOpen) {
            e.preventDefault();
            handleVolumeChange(volume + 0.05);
            showToastHud('volume', `Volume ${Math.round(Math.min(1, volume + 0.05) * 100)}%`);
          }
          break;
        case 'k':
        case 'K':
          if (!isQuickRailOpen && !isMoreMenuOpen && !isTvGuideOpen) {
            e.preventDefault();
            setIsPlaying(prev => !prev);
          }
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'l':
        case 'L':
          if (candidateUrls.length > 1) {
            const nextIdx = (activeMirrorIdx + 1) % candidateUrls.length;
            setActiveMirrorIdx(nextIdx);
            setRetryKey(k => k + 1);
            showToastHud('info', `Source: Line ${nextIdx + 1}/${candidateUrls.length}`);
          } else {
            cycleProxyMode();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'g':
        case 'G':
          setIsTvGuideOpen(prev => !prev);
          break;
        case 'h':
        case 'H':
        case '?':
          setIsHelpModalOpen(prev => !prev);
          break;
        case 'Escape':
        case 'BackSpace':
          if (isKeypadOpen) {
            setIsKeypadOpen(false);
          } else if (isTvGuideOpen) {
            setIsTvGuideOpen(false);
          } else if (isMoreMenuOpen) {
            setIsMoreMenuOpen(false);
          } else if (isQuickRailOpen) {
            setIsQuickRailOpen(false);
          } else {
            handleBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleNextUnified, handlePrevUnified, volume, handleVolumeChange, toggleMute, toggleFullscreen,
    handleBack, showToastHud, triggerControls, isQuickRailOpen, isMoreMenuOpen,
    isTvGuideOpen, isGuideOpen, isKeypadOpen, channelNumberInput, handleDialDigit, jumpToChannelNumber,
    activeMirrorIdx, candidateUrls, cycleProxyMode
  ]);

  const streamSrc = useMemo(() => {
    const chosenUrl = candidateUrls[activeMirrorIdx % candidateUrls.length] || channel.m3u8Url || '';
    if (!chosenUrl) return '';

    const rawTarget = extractRawStreamUrl(chosenUrl);
    const activeProfile = proxyMode === 'auto' ? 'chrome' : proxyMode;
    return `/api/proxy?url=${encodeURIComponent(rawTarget)}&profile=${activeProfile}&_t=${retryKey}`;
  }, [candidateUrls, activeMirrorIdx, channel.m3u8Url, proxyMode, retryKey]);

  const handleStreamError = useCallback(async (errMessage?: string) => {
    // 1. Auto-failover to backup mirror line from same channel name if available
    if (candidateUrls.length > 1 && activeMirrorIdx < candidateUrls.length - 1) {
      const nextMirror = activeMirrorIdx + 1;
      setActiveMirrorIdx(nextMirror);
      setAutoHealStatus(`Auto-switching to backup live mirror line ${nextMirror + 1} of ${candidateUrls.length}...`);
      setIsBuffering(true);
      setGuidePlaybackStatus('connecting');
      setRetryKey(k => k + 1);
      return;
    }

    // 2. Cycle proxy profiles and query autonomous Camellia Stream Doctor
    if (autoHealAttempt < 4) {
      const nextAttempt = autoHealAttempt + 1;
      setAutoHealAttempt(nextAttempt);
      const fallbackProfiles: ProxyMode[] = ['chrome', 'vlc', 'smarters', 'smarttv'];
      const nextProfile = fallbackProfiles[(nextAttempt - 1) % fallbackProfiles.length];

      setAutoHealStatus(`Camellia Stream Doctor switching to ${nextProfile.toUpperCase()} line...`);
      setIsBuffering(true);
      setGuidePlaybackStatus('connecting');

      if (nextAttempt === 1) {
        try {
          const rawUrl = extractRawStreamUrl(candidateUrls[activeMirrorIdx % candidateUrls.length] || channel.m3u8Url || '');
          const res = await fetch('/api/ai/diagnose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelName: channel.name,
              m3u8Url: rawUrl,
              streamUrl: rawUrl,
              category: channel.category,
              lastError: 'Stream playback stalled or returned network error'
            })
          });
          if (res.ok) {
            const data = await res.json();
            const recProfile = data?.recommendedProxyMode || data?.bestWorkingProfile || data?.recommendedProfile;
            if (recProfile && PROXY_PROFILES.includes(recProfile as ProxyMode)) {
              setProxyMode(recProfile as ProxyMode);
              setAutoHealStatus(`Camellia Stream Doctor activated optimal ${recProfile.toUpperCase()} proxy profile.`);
              setRetryKey(k => k + 1);
              return;
            }

            if (!data?.isStreamAlive && Array.isArray(data?.alternativeMirrors) && data.alternativeMirrors.length > 0) {
              const alt = data.alternativeMirrors[0];
              if (alt && alt.m3u8Url) {
                setAutoHealStatus(`Camellia Stream Doctor failover: switching to alternative mirror "${alt.name}"...`);
                selectChannelUnified(alt);
                return;
              }
            }
          }
        } catch {}
      }

      setProxyMode(nextProfile);
      setRetryKey(k => k + 1);
      return;
    }

    switchingLockRef.current = false;
    setIsSwitching(false);
    setConfirmedPlayingChannelId(null);
    setGuidePlaybackStatus('error');
    setGuidePlaybackError(sanitizeClientPlaybackError(errMessage || `${channel.name} stream signal is currently unavailable.`));
    setAutoHealStatus(null);
    setIsBuffering(false);
    setHasError(true);
    if (onChannelError) onChannelError(channel.id);
  }, [candidateUrls, activeMirrorIdx, autoHealAttempt, channel.id, channel.m3u8Url, channel.name, channel.category, onChannelError, selectChannelUnified]);

  const handleRetry = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHasError(false);
    setIsBuffering(true);
    setConfirmedPlayingChannelId(null);
    setGuidePlaybackStatus('connecting');
    setGuidePlaybackError(null);
    setAutoHealAttempt(0);
    setAutoHealStatus(null);
    setStallToast(false);
    setRetryKey(prev => prev + 1);
    showToastHud('info', 'Reloading Live Stream...');
  };

  const handleCycleMirror = useCallback(() => {
    const nextIdx = (activeMirrorIdx + 1) % Math.max(1, candidateUrls.length);
    setActiveMirrorIdx(nextIdx);
    setRetryKey(k => k + 1);
    showToastHud('info', `Source: Line ${nextIdx + 1}/${candidateUrls.length}`);
  }, [activeMirrorIdx, candidateUrls.length, showToastHud]);

  const runStreamDoctorNow = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStallToast(false);
    setIsBuffering(true);
    setAutoHealStatus('Camellia Stream Doctor probing fastest live proxy...');
    try {
      const rawUrl = extractRawStreamUrl(candidateUrls[activeMirrorIdx % Math.max(1, candidateUrls.length)] || channel.m3u8Url || '');
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: channel.name,
          m3u8Url: rawUrl,
          streamUrl: rawUrl,
          category: channel.category,
          lastError: 'Manual Stream Doctor invoked during 10s buffer stall'
        })
      });
      if (res.ok) {
        const data = await res.json();
        const recProfile = data?.recommendedProxyMode || data?.bestWorkingProfile || data?.recommendedProfile;
        if (recProfile && PROXY_PROFILES.includes(recProfile as ProxyMode)) {
          setProxyMode(recProfile as ProxyMode);
          try { localStorage.setItem('shahintv_proxy_mode', recProfile); } catch {}
          setAutoHealStatus(`Stream Doctor switched to ${recProfile.toUpperCase()} line`);
          showToastHud('info', `Stream Doctor: ${recProfile.toUpperCase()} active`);
          setRetryKey(k => k + 1);
          return;
        }
        if (!data?.isStreamAlive && Array.isArray(data?.alternativeMirrors) && data.alternativeMirrors.length > 0) {
          const alt = data.alternativeMirrors[0];
          if (alt && alt.m3u8Url && onSelectChannel) {
            showToastHud('info', `Stream Doctor switched to mirror: ${alt.name}`);
            onSelectChannel(alt);
            return;
          }
        }
      }
    } catch {}
    handleCycleMirror();
  }, [activeMirrorIdx, candidateUrls, channel.category, channel.m3u8Url, channel.name, handleCycleMirror, onSelectChannel, showToastHud]);

  const handleStageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchLocked) {
      triggerControls();
      return;
    }

    dismissSwipeHint();

    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);

    if (now - lastTapTimeRef.current < 280) {
      if (relX < 0.3) {
        showToastHud('info', '◀ Previous Channel');
        handlePrevUnified();
      } else if (relX > 0.7) {
        showToastHud('info', 'Next Channel ▶');
        handleNextUnified();
      } else {
        cycleAspectRatio();
      }
      lastTapTimeRef.current = 0;
      return;
    }

    lastTapTimeRef.current = now;

    if (showControls) {
      setShowControls(false);
      setShowCenterTransport(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (centerTransportTimeoutRef.current) clearTimeout(centerTransportTimeoutRef.current);
    } else {
      triggerControls(true);
    }
  };

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    dismissSwipeHint();
    if (isTouchLocked || e.touches.length !== 1) return;
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (['button', 'input', 'a', 'select'].includes(targetTag)) return;

    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
      startVol: isMuted ? 0 : volume,
      startBright: brightness
    };
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isTouchLocked || !touchStartRef.current || e.touches.length !== 1) return;

    if (isMobileDevice()) {
      return;
    }

    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = touchStartRef.current.y - e.touches[0].clientY;

    if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx) * 1.8) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isRightSide = touchStartRef.current.x - rect.left > rect.width * 0.5;
      const deltaRatio = dy / Math.max(140, rect.height * 0.65);

      if (isRightSide) {
        const nextVol = Math.max(0, Math.min(1, touchStartRef.current.startVol + deltaRatio));
        handleVolumeChange(nextVol);
        showToastHud('volume', `Volume ${Math.round(nextVol * 100)}%`);
      } else {
        const nextBright = Math.max(0.35, Math.min(1.2, Number((touchStartRef.current.startBright + deltaRatio).toFixed(2))));
        setBrightness(nextBright);
        showToastHud('brightness', `Brightness ${Math.round(nextBright * 100)}%`);
      }
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isTouchLocked || !touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;

    // Mobile Swipe UP / DOWN dedicated to changing channels
    if (isMobileDevice()) {
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        if (dy > 0) {
          // Swipe UP -> Next Channel
          const label = nextChannel ? `▲ Next: ${nextChannel.name}` : '▲ Next Channel';
          showToastHud('info', label);
          handleNextUnified();
        } else {
          // Swipe DOWN -> Previous Channel
          const label = prevChannel ? `▼ Prev: ${prevChannel.name}` : '▼ Previous Channel';
          showToastHud('info', label);
          handlePrevUnified();
        }
        touchStartRef.current = null;
        return;
      }
    }

    // Horizontal swipe for desktop/touchscreen
    if (Math.abs(dx) > 95 && Math.abs(dx) > Math.abs(dy) * 2.2) {
      if (dx > 0) {
        showToastHud('info', 'Next Channel ▶');
        handleNextUnified();
      } else {
        showToastHud('info', '◀ Previous Channel');
        handlePrevUnified();
      }
    }
    touchStartRef.current = null;
  };

  const isHardwareOrPseudoFullscreen = isFullscreen || isPseudoFullscreen || initialMode === 'smart-tv' || initialMode === 'minimal';
  const isCurrentChannelFav = favorites.includes(channel.id);

  return (
    <div
      ref={containerRef}
      data-layout-mode={playerLayoutMode}
      data-device-type={specificDeviceType}
      data-orientation={isPortrait ? 'portrait' : 'landscape'}
      className={`${
        isPseudoFullscreen || isLandscapeMobile
          ? 'fixed inset-0 z-[9999] w-screen h-screen bg-[#050816]'
          : 'relative w-full h-full bg-[#050816]'
      } flex flex-row select-none overflow-hidden font-sans text-white`}
    >
      {/* Persistent Primary Player Column (never unmounts when #channel-guide toggles) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden relative">
      {/* Wrapper keeps stage sizing consistent in both portrait & landscape */}
      <div className={isLandscapeMobile ? 'flex-1 flex flex-row min-h-0 w-full relative overflow-hidden' : 'contents'}>
      {/* ==================================================================== */}
      {/* 1. REAL-TV VIDEO STAGE (Single Persistent <video> / Hls Instance)    */}
      {/* ==================================================================== */}
      <div
        ref={videoStageRef}
        onMouseMove={() => triggerControls(false)}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        className={`relative bg-black overflow-hidden transition-all ${
          isLandscapeMobile
            ? 'flex-1 h-full min-w-0'
            : isHardwareOrPseudoFullscreen
            ? 'w-full h-full flex-1 shrink-0'
            : isPortraitMobile
            ? `w-full shrink-0 aspect-video max-h-[36vh] min-h-[210px] border-b border-white/[0.08] shadow-[0_10px_35px_rgba(0,0,0,0.8)] ${
                isIphone ? 'pt-[max(0px,env(safe-area-inset-top))]' : ''
              }`
            : isTabletPortrait
            ? 'w-full shrink-0 h-[40vh] sm:h-[44vh] border-b border-white/[0.08] shadow-[0_10px_35px_rgba(0,0,0,0.8)]'
            : isTvMode
            ? 'w-full h-full flex-1 shrink-0'
            : 'w-full shrink-0 flex-1 min-h-[280px] border-b border-white/[0.08]'
        }`}
        style={{
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.85)'
        }}
      >
        {/* Real-TV Thin Glass Highlight on Top Edge */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent z-20 pointer-events-none" />

        {/* 600ms TV-Static Canvas Flash on Channel Switch */}
        <TvStaticCanvas active={showTvStatic} />

        {/* Single Persistent HLS Video Player Engine */}
        <HlsPlayer
          ref={videoRef}
          adapterRef={playerAdapterRef}
          src={streamSrc}
          isPlaying={isPlaying}
          muted={isMuted}
          volume={volume}
          volumeBoost={volumeBoost}
          brightness={brightness}
          aspectRatio={aspectRatio}
          onAutoMuted={(muted) => setIsAutoMutedByBrowser(muted)}
          onAutoplayBlocked={() => {
            if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
            setIsBuffering(false);
            setGuidePlaybackStatus('autoplay-blocked');
            switchingLockRef.current = false;
            setIsSwitching(false);
          }}
          onQualityDetected={(q) => setStreamQuality(q)}
          onWaiting={() => {
            setIsBuffering(true);
            setGuidePlaybackStatus('connecting');
          }}
          onLoadedMetadata={() => {
            if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
            setConfirmedPlayingChannelId(channel.id);
            switchingLockRef.current = false;
            setIsSwitching(false);
          }}
          onPlaying={() => {
            if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
            setIsBuffering(false);
            setHasError(false);
            setAutoHealStatus(null);
            setStallToast(false);
            setConfirmedPlayingChannelId(channel.id);
            setGuidePlaybackStatus('playing');
            setGuidePlaybackError(null);
            switchingLockRef.current = false;
            setIsSwitching(false);
          }}
          onError={handleStreamError}
        />

        {/* Stage Tap Catch Surface for HUD Controls */}
        <div
          onClick={handleStageTap}
          className="absolute inset-0 z-10 cursor-pointer"
        />

        {/* Watermark Logo while Playing (Top-Right, 60% Opacity) */}
        {!isBuffering && !hasError && isPlaying && (
          <div className="absolute top-3.5 right-3.5 z-15 pointer-events-none opacity-60">
            <img
              key={`wm-${channel.id}`}
              src={getChannelLogo(channel)}
              alt=""
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (img.dataset.fallbackApplied) return;
                img.dataset.fallbackApplied = '1';
                img.src = getChannelFallbackLogo(channel);
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-md drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            />
          </div>
        )}

        {/* In-Player Sponsor Banner when Paused */}
        <InPlayerAdBanner
          isBuffering={isBuffering}
          isPlaying={isPlaying}
          adFreeState={adFreeState}
          onRewardedGranted={onRewardedGranted}
        />

        {/* Quick Channel Rail Overlay [G] */}
        <InPlayerMiniGuide
          isOpen={isQuickRailOpen}
          onClose={() => setIsQuickRailOpen(false)}
          channels={allChannels}
          currentChannel={channel}
          onSelectChannel={(ch) => {
            selectChannelUnified(ch);
            setIsQuickRailOpen(false);
          }}
        />

        {/* Browser Autoplay Auto-Mute Recovery & Tap to Play Prompt */}
        {(isAutoMutedByBrowser || guidePlaybackStatus === 'autoplay-blocked') && (
          <div className="absolute top-16 sm:top-[68px] left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2">
            {guidePlaybackStatus === 'autoplay-blocked' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(true);
                  playerAdapterRef.current?.play().then((res) => {
                    if (res === 'playing') {
                      setConfirmedPlayingChannelId(channel.id);
                      setGuidePlaybackStatus('playing');
                    }
                  });
                }}
                className="px-4 h-10 rounded-xl bg-[#F5B301] text-[#050816] font-extrabold text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(245,179,1,0.5)] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>Tap to Play</span>
              </button>
            ) : (
              <button
                type="button"
                data-mute-btn="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAutoMutedByBrowser(false);
                  setIsMuted(false);
                  if (videoRef.current) {
                    videoRef.current.muted = false;
                    videoRef.current.volume = volume > 0 ? volume : 0.9;
                  }
                }}
                className="px-4 h-10 rounded-xl bg-[#F5B301] text-[#050816] font-extrabold text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(245,179,1,0.5)] cursor-pointer"
              >
                <VolumeX className="w-4 h-4 shrink-0" />
                <span>Tap to Unmute Live Audio</span>
              </button>
            )}
          </div>
        )}

        {/* Numeric Dial Overlay (e.g. "CH 005") */}
        <AnimatePresence>
          {channelNumberInput && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="absolute top-16 right-5 z-40 pointer-events-none"
            >
              <div className="px-4 py-2 rounded-xl bg-[rgba(12,18,40,0.92)] border border-[#F5B301] shadow-[0_0_25px_rgba(245,179,1,0.4)] backdrop-blur-xl flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#22B8F0] shrink-0" />
                <span className="font-mono text-lg font-black tracking-widest text-[#F5B301] tabular-nums">
                  CH {channelNumberInput.padEnd(3, '_')}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slim 24px Swipe Hint on Right Edge (Shown ONLY once on first load for ~4s) */}
        <AnimatePresence>
          {showSwipeHint && isMobileDevice() && (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-35 pointer-events-none select-none flex flex-col items-center"
            >
              <div className="w-6 py-2 rounded-full bg-[rgba(12,18,40,0.88)] border border-white/15 backdrop-blur-md shadow-2xl flex flex-col items-center gap-1 text-white">
                <span className="text-[7px] font-mono font-bold tracking-tighter text-[#F5B301]">NEXT</span>
                <ArrowUp className="w-3 h-3 text-[#F5B301]" />
                <div className="w-1 h-2.5 rounded-full bg-white/25" />
                <ArrowDown className="w-3 h-3 text-[#F5B301]" />
                <span className="text-[7px] font-mono font-bold tracking-tighter text-[#F5B301]">PREV</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gesture Toast HUD Feedback */}
        <AnimatePresence>
          {gestureHud && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
            >
              <div className="px-4 py-2 rounded-[12px] bg-[rgba(12,18,40,0.92)] backdrop-blur-xl border border-[#F5B301]/40 text-white font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(0,0,0,0.9)]">
                {gestureHud.type === 'volume' && <Volume2 className="w-4 h-4 text-[#22B8F0]" />}
                {gestureHud.type === 'brightness' && <Sun className="w-4 h-4 text-[#F5B301]" />}
                {gestureHud.type === 'info' && <Zap className="w-4 h-4 text-[#F5B301]" />}
                <span>{gestureHud.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buffering & Searching Signal Arc Connecting Graphic */}
        <AnimatePresence>
          {isBuffering && !hasError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none bg-black/45 backdrop-blur-[2px]"
            >
              {/* Center Faint Logo Watermark + Animated Searching Signal Arcs */}
              <div className="relative flex items-center justify-center w-20 h-20">
                <svg
                  className="absolute inset-0 w-20 h-20 animate-spin text-[#F5B301]"
                  viewBox="0 0 80 80"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="40" cy="40" r="35" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                  <path
                    d="M40 5 A35 35 0 0 1 73 28"
                    stroke="#F5B301"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M15 62 A32 32 0 0 1 10 34"
                    stroke="#22B8F0"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <img
                  key={`buf-${channel.id}`}
                  src={getChannelLogo(channel)}
                  alt=""
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.dataset.fallbackApplied) return;
                    img.dataset.fallbackApplied = '1';
                    img.src = getChannelFallbackLogo(channel);
                  }}
                  className="w-12 h-12 object-contain rounded-lg opacity-35 filter blur-[0.2px]"
                />
              </div>

              {/* Dedicated Row for "Connecting to live stream..." that NO other element may overlap */}
              <div className="mt-3 px-3.5 py-1 rounded-full bg-[rgba(12,18,40,0.88)] border border-white/10 backdrop-blur-md midnight-glass-noise">
                <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-white/95">
                  {autoHealStatus || 'Connecting to live stream...'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 10s Buffering Stalled Non-Blocking Contextual Toast */}
        <AnimatePresence>
          {stallToast && !hasError && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 z-35 max-w-md w-[92%] bg-[rgba(12,18,40,0.95)] border border-[#F5B301]/45 rounded-[12px] p-2.5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-2 pointer-events-auto midnight-glass-noise"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white truncate">Stream stalled for 10s</p>
                <p className="text-[10px] text-white/60 truncate">Switch line or diagnose live proxy</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="Try next mirror line"
                  onClick={handleCycleMirror}
                  className="px-3 min-h-[38px] rounded-lg bg-[#F5B301] text-[#050816] font-bold text-[11px] focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer"
                >
                  Try next line
                </button>
                <button
                  type="button"
                  aria-label="Run Stream Doctor diagnosis"
                  onClick={runStreamDoctorNow}
                  className="px-3 min-h-[38px] rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-[11px] focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer"
                >
                  Run Stream Doctor
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stream Error Screen */}
        <AnimatePresence>
          {hasError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 bg-[#050816]/96 backdrop-blur-xl text-center"
            >
              <div className="w-12 h-12 rounded-full bg-[#FF3B4E]/15 border border-[#FF3B4E]/40 flex items-center justify-center text-[#FF3B4E] mb-2.5">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Stream Signal Busy</h3>
              <p className="text-[11px] text-white/60 max-w-xs mt-1">
                We tested proxy lines for <strong className="text-white">{channel.name}</strong>. Retry or switch to another channel.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-4 min-h-[42px] rounded-lg bg-[#F5B301] text-[#050816] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(245,179,1,0.3)]"
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span>Retry Stream</span>
                </button>

                <button
                  type="button"
                  onClick={cycleProxyMode}
                  className="px-3.5 min-h-[42px] rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-[#F5B301] shrink-0" />
                  <span>Line: {proxyMode.toUpperCase()}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  className="px-3.5 min-h-[42px] rounded-lg bg-[#2ECC71]/20 border border-[#2ECC71]/50 text-xs font-bold text-[#2ECC71] flex items-center gap-1.5 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 shrink-0" />
                  <span>Next Channel</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen Lock Floating Unlock Controls */}
        {isTouchLocked && showControls && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-35 flex flex-col justify-between p-3 sm:p-4 pointer-events-none"
          >
            <div className="flex justify-end pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  setIsTouchLocked(false);
                  showToastHud('info', 'Screen Controls Unlocked');
                  triggerControls();
                }}
                className="px-3.5 h-10 rounded-lg bg-[#F5B301] text-[#050816] font-bold text-xs flex items-center gap-1.5 shadow-xl cursor-pointer"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span>Unlock</span>
              </button>
            </div>
            <div className="flex items-center justify-center my-auto pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  setIsTouchLocked(false);
                  showToastHud('info', 'Screen Controls Unlocked');
                  triggerControls();
                }}
                className="px-5 h-11 rounded-xl bg-[#F5B301] text-[#050816] font-bold text-xs flex items-center gap-2 shadow-[0_0_25px_rgba(245,179,1,0.4)] cursor-pointer"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span>Tap to Unlock Screen Controls</span>
              </button>
            </div>
            <div />
          </div>
        )}

        {/* OSD Channel Banner on every channel change (shows 4s, fades) at bottom of video */}
        <AnimatePresence>
          {showOsdBanner && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-2 inset-x-2 sm:inset-x-4 z-25 pointer-events-none"
            >
              <div className="p-2.5 sm:p-3 rounded-[12px] bg-[rgba(12,18,40,0.90)] border border-white/10 backdrop-blur-xl shadow-[0_15px_35px_rgba(0,0,0,0.85)] flex flex-col gap-2 text-white midnight-glass-noise">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Large Gold Channel Number Box */}
                    <div className="px-2 py-1 rounded-[8px] bg-[#F5B301] text-[#050816] font-mono font-black text-xs sm:text-sm tracking-wider shrink-0 shadow-[0_0_12px_rgba(245,179,1,0.35)]">
                      {channelNumberFormatted}
                    </div>

                    <ChannelThumbnail channel={channel} variant="compact-list" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                          {channel.name}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded-full bg-[#FF3B4E]/20 border border-[#FF3B4E]/40 text-[9px] font-mono font-bold text-[#FF3B4E] flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B4E] shadow-[0_0_6px_rgba(255,59,78,0.85)]" />
                          LIVE
                        </span>
                      </div>
                      <p className="text-[10px] text-white/75 truncate mt-0.5">
                        {channel.currentProgram && channel.currentProgram !== 'No Program Found'
                          ? `Now: ${channel.currentProgram}`
                          : (channel.category || 'Live TV')}
                        {channel.nextProgram && channel.nextProgram !== 'No Program Found'
                          ? ` · Next: ${channel.nextProgram}`
                          : ''}
                      </p>
                      <p className="text-[9px] font-mono text-[#22B8F0] truncate">
                        Line {activeMirrorIdx + 1} · HD · {proxyMode === 'auto' ? 'AUTO' : proxyMode.toUpperCase()} ({streamQuality})
                      </p>
                    </div>
                  </div>

                  {/* Live Animated Signal Bars + Equalizer Bars */}
                  <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                    {!isBuffering && isPlaying && !isMuted && (
                      <div className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                        <span className="w-1 h-full rounded-sm bg-[#F5B301] animate-eq-bar-1" />
                        <span className="w-1 h-full rounded-sm bg-[#2ECC71] animate-eq-bar-2" />
                        <span className="w-1 h-full rounded-sm bg-[#22B8F0] animate-eq-bar-3" />
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-[#2ECC71]">
                      <Signal className="w-4 h-4 text-[#2ECC71]" />
                      <span>SIGNAL OK</span>
                    </div>
                  </div>
                </div>

                {/* Broadcast Half-Hour Slot EPG Progress Bar */}
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#22B8F0] via-[#F5B301] to-[#2ECC71]"
                    style={{
                      width: `${Math.max(8, Math.min(98, Math.round(((new Date().getMinutes() % 30) * 60 + new Date().getSeconds()) / 18)))}%`
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ================================================================== */}
        {/* UNIFIED BROADCAST HUD CONTROLS OVERLAY                             */}
        {/* ================================================================== */}
        <AnimatePresence>
          {showControls && !isTouchLocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none bg-gradient-to-t from-black/85 via-transparent to-black/80 p-2 sm:p-3"
            >
              {/* (1) TOP STATUS BAR (44px-48px+, auto-hides after 4s) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="min-h-[44px] sm:min-h-[48px] w-full flex items-center justify-between gap-1.5 sm:gap-2 px-0.5 sm:px-1 pointer-events-auto"
              >
                {/* Left: Back button + small channel logo + 'CH 001' + Channels Guide Trigger */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label="Back to Home Channels"
                    onClick={handleBack}
                    className="h-9 sm:h-10 xl:h-11 px-2.5 rounded-[10px] bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center gap-1.5 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors"
                    title="Back to Channels"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#F5B301]" />
                    <span className="hidden sm:inline text-xs font-bold">Back</span>
                  </button>

                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 h-9 sm:h-10 xl:h-11 rounded-[10px] bg-[rgba(12,18,40,0.72)] border border-white/10 backdrop-blur-md min-w-0 max-w-fit">
                    <img
                      key={`top-${channel.id}`}
                      src={getChannelLogo(channel)}
                      alt=""
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.dataset.fallbackApplied) return;
                        img.dataset.fallbackApplied = '1';
                        img.src = getChannelFallbackLogo(channel);
                      }}
                      className="w-5 h-5 object-contain rounded shrink-0"
                    />
                    <span className="font-mono text-[11px] sm:text-xs font-extrabold text-[#F5B301] whitespace-nowrap shrink-0">
                      {channelNumberFormatted}
                    </span>
                    <span className="text-white/20 shrink-0">|</span>
                    <span className="text-[11px] sm:text-xs font-bold text-white truncate min-w-0 max-w-[95px] min-[375px]:max-w-[125px] min-[420px]:max-w-[160px] sm:max-w-[210px] lg:max-w-[280px]">
                      {channel.name}
                    </span>
                  </div>

                  {/* Primary Accessible Channels Guide Trigger Adjusted Across All Devices */}
                  <button
                    ref={channelsOpenBtnRef}
                    id="channels-open"
                    type="button"
                    aria-label="Open Channels Guide"
                    aria-controls="channel-guide"
                    aria-expanded={isGuideOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsGuideOpen(prev => !prev);
                      triggerControls(false);
                    }}
                    className={`min-w-[40px] sm:min-w-[44px] min-h-[38px] sm:min-h-[40px] xl:min-h-[44px] h-9 sm:h-10 xl:h-11 px-2.5 min-[390px]:px-3 md:px-3.5 xl:px-4 rounded-[10px] border backdrop-blur-md text-[11px] sm:text-xs xl:text-sm font-bold flex items-center justify-center gap-1.5 xl:gap-2 shrink-0 whitespace-nowrap select-none touch-manipulation cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301] focus-visible:ring-offset-1 focus-visible:ring-offset-[#050816] transition-all shadow-sm ${
                      isGuideOpen
                        ? 'bg-[#F5B301] text-[#050816] border-[#F5B301] shadow-[0_0_16px_rgba(245,179,1,0.35)]'
                        : 'bg-[rgba(12,18,40,0.76)] hover:bg-[rgba(22,34,72,0.9)] border-white/20 hover:border-[#F5B301]/60 text-white'
                    }`}
                    title="Open Channels Guide"
                  >
                    <List className="w-4 h-4 xl:w-[18px] xl:h-[18px] shrink-0" />
                    <span className="hidden min-[390px]:inline">Channels</span>
                  </button>
                </div>

                {/* Center / Right: LIVE chip + Signal bars + Live Clock + Keypad (md+) + ONE More Menu button */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {/* LIVE Chip with crisp red indicator dot */}
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 h-8 sm:h-9 rounded-full bg-[#FF3B4E]/15 border border-[#FF3B4E]/40 text-[#FF3B4E] text-[11px] font-mono font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#FF3B4E] shadow-[0_0_6px_rgba(255,59,78,0.85)]" />
                    <span>LIVE</span>
                  </div>

                  {/* Signal Bars */}
                  <div className="hidden md:flex items-center gap-1 px-2 h-8 sm:h-9 rounded-[10px] bg-white/5 border border-white/10 text-[#2ECC71]">
                    <Signal className="w-3.5 h-3.5 text-[#2ECC71]" />
                    <span className="text-[10px] font-mono font-bold">HD</span>
                  </div>

                  {/* Live Clock (HH:MM) */}
                  <div className="hidden min-[360px]:flex px-2 sm:px-2.5 h-9 sm:h-10 rounded-[10px] bg-white/5 border border-white/10 text-white/90 text-[11px] sm:text-xs font-mono font-bold items-center">
                    {clockTime}
                  </div>

                  {/* On-Screen Number Keypad Toggle (Shown in Top Bar on md+; on phones it lives in Bottom Dock) */}
                  <button
                    type="button"
                    aria-label="Open Channel Number Keypad"
                    onClick={() => {
                      setIsKeypadOpen(prev => !prev);
                      triggerControls(false);
                    }}
                    className={`hidden md:flex h-9 sm:h-10 px-2.5 rounded-[10px] border text-[11px] font-mono font-bold items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors ${
                      isKeypadOpen
                        ? 'bg-[#F5B301] text-[#050816] border-[#F5B301]'
                        : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                    }`}
                    title="Channel Keypad (0-9)"
                  >
                    123
                  </button>

                  {/* ONE Menu Button that opens the 'More' bottom sheet */}
                  <button
                    type="button"
                    aria-label="Open More Menu and Settings"
                    onClick={() => setIsMoreMenuOpen(true)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-[10px] bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors"
                    title="Open More Menu & Settings"
                  >
                    <MoreVertical className="w-4 h-4 text-[#F5B301]" />
                  </button>
                </div>
              </div>

              {/* (4) CENTER TRANSPORT (appears on tap or when paused; hidden during buffering so it never overlaps connecting arc) */}
              {showCenterTransport && (!isBuffering || !isPlaying) && !hasError && (
                <div className="flex items-center justify-center gap-6 sm:gap-8 pointer-events-none my-auto self-center">
                  {/* Prev Channel */}
                  <button
                    type="button"
                    aria-label="Previous Channel"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevUnified();
                      triggerControls(true);
                    }}
                    className="pointer-events-auto px-3.5 h-10 rounded-[12px] bg-[rgba(12,18,40,0.85)] border border-white/10 hover:border-[#F5B301]/50 text-white flex items-center justify-center gap-1.5 cursor-pointer backdrop-blur-md shadow-xl active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
                    title="Previous Channel"
                  >
                    <SkipBack className="w-4 h-4 text-[#F5B301] fill-current" />
                    <span className="text-xs font-mono font-extrabold uppercase">CH -</span>
                  </button>

                  {/* Large 64px Glossy Round Play/Pause Button */}
                  <button
                    type="button"
                    aria-label={isPlaying ? 'Pause Stream' : 'Play Stream'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaying(p => !p);
                      triggerControls(true);
                    }}
                    className="pointer-events-auto relative overflow-hidden glossy-btn-shine w-16 h-16 rounded-full bg-gradient-to-b from-[#F5B301] to-[#E09A00] text-[#050816] flex items-center justify-center cursor-pointer shadow-[0_0_30px_rgba(245,179,1,0.5)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
                    title={isPlaying ? 'Pause Stream' : 'Play Stream'}
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 fill-current stroke-[2]" />
                    ) : (
                      <Play className="w-7 h-7 fill-current stroke-[2] ml-1" />
                    )}
                  </button>

                  {/* Next Channel */}
                  <button
                    type="button"
                    aria-label="Next Channel"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextUnified();
                      triggerControls(true);
                    }}
                    className="pointer-events-auto px-3.5 h-10 rounded-[12px] bg-[rgba(12,18,40,0.85)] border border-white/10 hover:border-[#F5B301]/50 text-white flex items-center justify-center gap-1.5 cursor-pointer backdrop-blur-md shadow-xl active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
                    title="Next Channel"
                  >
                    <span className="text-xs font-mono font-extrabold uppercase">CH +</span>
                    <SkipForward className="w-4 h-4 text-[#F5B301] fill-current" />
                  </button>
                </div>
              )}

              {/* Bottom Quick Row in Fullscreen / Landscape Overlay Mode */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between gap-2 w-full pointer-events-auto pt-1 pb-[max(0px,env(safe-area-inset-bottom))]"
              >
                <div className="hidden sm:flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-white/60 truncate">
                    {channel.category || 'Live TV'} · Line {activeMirrorIdx + 1} · {proxyMode === 'auto' ? 'AUTO' : proxyMode.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-auto overflow-x-auto no-scrollbar max-w-full">
                  {isLandscapeMobile && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous Channel"
                        onClick={handlePrevUnified}
                        className="h-9 px-2.5 rounded-lg bg-white/10 border border-white/10 text-white font-mono text-[11px] font-bold flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                      >
                        <SkipBack className="w-3.5 h-3.5 text-[#F5B301] shrink-0" />
                        <span>CH-</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Next Channel"
                        onClick={handleNextUnified}
                        className="h-9 px-2.5 rounded-lg bg-white/10 border border-white/10 text-white font-mono text-[11px] font-bold flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                      >
                        <span>CH+</span>
                        <SkipForward className="w-3.5 h-3.5 text-[#F5B301] shrink-0" />
                      </button>
                      <button
                        type="button"
                        aria-label={isCurrentChannelFav ? 'Remove channel from favorites' : 'Save channel to favorites'}
                        onClick={(e) => toggleChannelFavorite(channel.id, e)}
                        className={`h-9 min-w-[36px] px-2.5 rounded-lg border flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0 ${
                          isCurrentChannelFav ? 'bg-[#F5B301]/20 border-[#F5B301] text-[#F5B301]' : 'bg-white/10 border-white/10 text-white/80'
                        }`}
                      >
                        <Star className={`w-4 h-4 shrink-0 ${isCurrentChannelFav ? 'fill-[#F5B301]' : ''}`} />
                      </button>
                      <button
                        type="button"
                        aria-label={isGuideOpen ? 'Hide Landscape Channel Panel' : 'Show Landscape Channel Panel'}
                        onClick={() => setIsGuideOpen(prev => !prev)}
                        className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0 ${
                          isGuideOpen
                            ? 'bg-[#F5B301] text-[#050816] border-[#F5B301]'
                            : 'bg-white/10 border-white/10 text-white'
                        }`}
                      >
                        <List className="w-4 h-4 shrink-0" />
                        <span>Channels</span>
                      </button>
                      <button
                        type="button"
                        data-mute-btn="true"
                        aria-label="Toggle Mute Audio"
                        onClick={toggleMute}
                        className="h-9 min-w-[36px] px-2.5 rounded-lg bg-white/10 border border-white/10 text-white flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                      >
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-[#FF3B4E] shrink-0" /> : <Volume2 className="w-4 h-4 text-[#22B8F0] shrink-0" />}
                      </button>
                      <button
                        type="button"
                        aria-label="Open Help and Instructions"
                        onClick={() => setIsHelpModalOpen(true)}
                        className="h-9 min-w-[36px] px-2.5 rounded-lg bg-white/10 border border-white/10 text-[#F5B301] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                      >
                        <HelpCircle className="w-4 h-4 shrink-0" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    aria-label="Cycle Aspect Ratio"
                    onClick={cycleAspectRatio}
                    className="h-9 px-3 rounded-lg bg-white/10 border border-white/10 text-xs font-mono font-bold text-white flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#22B8F0] shrink-0" />
                    <span>{aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'ZOOM' : 'FILL'}</span>
                  </button>

                  <button
                    type="button"
                    aria-label={isFullscreen || isPseudoFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                    onClick={toggleFullscreen}
                    className="h-9 px-3 rounded-lg bg-[#F5B301] text-[#050816] font-bold text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                  >
                    {isFullscreen || isPseudoFullscreen ? (
                      <Minimize className="w-4 h-4 shrink-0" />
                    ) : (
                      <Maximize className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isFullscreen || isPseudoFullscreen ? 'Exit' : 'Full'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* On-Screen Numeric Channel Keypad (CH 0__) */}
        <AnimatePresence>
          {isKeypadOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-14 right-3 z-50 w-56 p-3 rounded-xl bg-[rgba(12,18,40,0.96)] border border-[#F5B301]/45 shadow-[0_20px_50px_rgba(0,0,0,0.92)] backdrop-blur-2xl pointer-events-auto midnight-glass-noise"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-black text-[#F5B301] tracking-wider tabular-nums">
                  CH {(channelNumberInput || '').padEnd(3, '_')}
                </span>
                <button
                  type="button"
                  aria-label="Close channel keypad"
                  onClick={() => setIsKeypadOpen(false)}
                  className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={k === 'DEL' ? 'Delete last digit' : k === 'OK' ? 'Tune to entered channel' : `Digit ${k}`}
                    onClick={() => {
                      if (k === 'DEL') {
                        setChannelNumberInput(prev => prev.slice(0, -1));
                      } else if (k === 'OK') {
                        if (channelNumberInput) {
                          if (channelDialTimerRef.current) clearTimeout(channelDialTimerRef.current);
                          jumpToChannelNumber(channelNumberInput);
                          setChannelNumberInput('');
                          setIsKeypadOpen(false);
                        }
                      } else {
                        handleDialDigit(k);
                      }
                    }}
                    className={`h-10 rounded-lg font-mono text-xs font-extrabold active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5B301] ${
                      k === 'OK'
                        ? 'bg-[#F5B301] text-[#050816]'
                        : k === 'DEL'
                        ? 'bg-[#FF3B4E]/20 text-[#FF3B4E] border border-[#FF3B4E]/40'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* First-time 1h VIP expiry renewal tip while inside VideoPlayer */}
        {firstTimeVipExpiryTip && !isVip && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-16 sm:top-[68px] left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md p-3 rounded-xl bg-[rgba(12,18,40,0.96)] border border-[#F5B301]/50 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-2 pointer-events-auto"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#F5B301]">1h Free VIP Expired</p>
              <p className="text-[10px] text-white/75 truncate">Renew now for another ad-free hour</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <WatchAdVipButton
                variant="player"
                adFreeState={adFreeState}
                onRewardedGranted={(newState) => {
                  if (onRewardedGranted) onRewardedGranted(newState);
                  setFirstTimeVipExpiryTip(false);
                }}
              />
              <button
                type="button"
                aria-label="Dismiss VIP tip"
                onClick={() => setFirstTimeVipExpiryTip(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. CHANNEL INFO CARD UNDER VIDEO (In Portrait & Standard Mode)         */}
      {/* ==================================================================== */}
      {(!isHardwareOrPseudoFullscreen && !isLandscapeMobile) && (
        <div className="p-3 bg-[#050816] space-y-2.5 shrink-0">
          {/* Midnight Broadcast Channel Info Card: Strict 4-Row Specification */}
          <div className="p-3.5 rounded-[14px] bg-[rgba(12,18,40,0.72)] border border-white/[0.08] backdrop-blur-md shadow-[0_10px_25px_rgba(0,0,0,0.5)] space-y-2.5 midnight-glass-noise">
            {/* Row 1: Chips (LIVE TV with red dot, category, HD chip) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-[#FF3B4E]/15 border border-[#FF3B4E]/40 text-[#FF3B4E] text-[10px] font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B4E] shadow-[0_0_6px_rgba(255,59,78,0.85)]" />
                LIVE TV
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#22B8F0] text-[10px] font-bold">
                {channel.category || 'General Entertainment'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#F5B301]/15 border border-[#F5B301]/30 text-[#F5B301] text-[10px] font-mono font-bold">
                {streamQuality}
              </span>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-mono">
                Line {activeMirrorIdx + 1} · {proxyMode === 'auto' ? 'AUTO' : proxyMode.toUpperCase()}
              </span>
            </div>

            {/* Row 2: Channel Title (FULL ROW! min-width:0, 2-line clamp, NEVER single-word wrap) */}
            <div className="w-full min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2 min-w-0 break-words">
                {channel.name}
              </h2>
            </div>

            {/* Row 3: Description (2-line clamp, real channel metadata / EPG) */}
            <div>
              <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
                {channel.currentProgram && channel.currentProgram !== 'No Program Found'
                  ? `Now airing: ${channel.currentProgram}. Adaptive live broadcast stream with multi-line Camellia Stream Doctor failover.`
                  : `Official ${channel.category || 'Live TV'} broadcast stream with adaptive HLS bitrate and Camellia Stream Doctor auto-failover.`}
              </p>
            </div>

            {/* Row 4: 'Channels' Listening Drawer Trigger & 'TV Guide' */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                aria-label="Open Full TV Guide"
                onClick={() => setIsTvGuideOpen(true)}
                className="flex-1 min-h-[44px] rounded-[10px] bg-[#F5B301] hover:bg-[#F5B301]/90 text-[#050816] font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,179,1,0.25)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all cursor-pointer whitespace-nowrap"
              >
                <Tv className="w-4 h-4 shrink-0" />
                <span>TV Guide ({allChannels.length.toLocaleString()})</span>
              </button>

              <button
                type="button"
                aria-controls="channel-guide"
                aria-expanded={isGuideOpen}
                aria-label={isGuideOpen ? 'Hide channel guide panel' : 'Open channel guide panel'}
                onClick={() => setIsGuideOpen(prev => !prev)}
                className={`flex-1 min-h-[44px] rounded-[10px] border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all cursor-pointer whitespace-nowrap ${
                  isGuideOpen
                    ? 'bg-white/15 border-[#F5B301]/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                }`}
              >
                <List className="w-4 h-4 text-[#22B8F0] shrink-0" />
                <span>{isGuideOpen ? 'Hide Channels' : 'Channels'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. BOTTOM CONTROL DOCK (ONE row, horizontally scrollable with fade)   */}
      {/* ==================================================================== */}
      {(!isHardwareOrPseudoFullscreen && !isLandscapeMobile) && (
        <div className="relative px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 bg-[#050816] shrink-0">
          {/* Right-edge scroll fade gradient mask */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#050816] via-[#050816]/80 to-transparent z-10" />

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 pr-6">
            {/* 1. Play / Pause */}
            <button
              type="button"
              aria-label={isPlaying ? 'Pause live stream' : 'Play live stream'}
              onClick={() => setIsPlaying(p => !p)}
              className={`h-10 px-3.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all ${
                isPlaying
                  ? 'bg-white/10 border-white/15 border-b-2 border-b-[#F5B301] text-white shadow-[0_4px_14px_rgba(245,179,1,0.18)]'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-[#F5B301] fill-current shrink-0" /> : <Play className="w-4 h-4 text-[#F5B301] fill-current shrink-0" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {/* 2. CH - */}
            <button
              type="button"
              aria-label="Previous Channel"
              onClick={handlePrevUnified}
              className="h-10 px-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
            >
              <SkipBack className="w-4 h-4 text-[#F5B301] shrink-0" />
              <span>CH -</span>
            </button>

            {/* 3. CH + */}
            <button
              type="button"
              aria-label="Next Channel"
              onClick={handleNextUnified}
              className="h-10 px-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
            >
              <span>CH +</span>
              <SkipForward className="w-4 h-4 text-[#F5B301] shrink-0" />
            </button>

            {/* 4. Volume with popup percentage slider */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Open volume and audio boost slider"
                onClick={() => setShowVolumeSliderPopup(prev => !prev)}
                className={`h-10 px-3.5 rounded-lg border text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all ${
                  showVolumeSliderPopup
                    ? 'bg-white/15 border-white/20 border-b-2 border-b-[#F5B301]'
                    : 'bg-white/5 hover:bg-white/10 border-white/10'
                }`}
                title="Volume Control"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-[#FF3B4E] shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#22B8F0] shrink-0" />
                )}
                <span className="font-mono tabular-nums">{isMuted ? '0%' : `${Math.round(volume * 100)}%`}</span>
              </button>

              {/* Volume Slider Popup */}
              {showVolumeSliderPopup && (
                <div className="absolute bottom-12 left-0 z-50 p-3 rounded-xl bg-[rgba(12,18,40,0.96)] border border-white/15 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-2 w-44 midnight-glass-noise">
                  <div className="flex items-center justify-between w-full text-[11px] font-mono">
                    <span className="text-white/60">Volume</span>
                    <span className="font-bold text-[#F5B301] tabular-nums">{Math.round(volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Volume percentage"
                    min="0"
                    max="1"
                    step="0.02"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/20 accent-[#F5B301] rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between w-full gap-1.5 pt-1 border-t border-white/10">
                    <button
                      type="button"
                      aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                      onClick={toggleMute}
                      className="min-h-[34px] px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white/85 hover:text-white cursor-pointer"
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      aria-label="Cycle speaker audio boost"
                      onClick={cycleAudioBoost}
                      className="min-h-[34px] px-2.5 rounded-lg bg-[#F5B301]/15 hover:bg-[#F5B301]/25 text-[11px] font-mono font-bold text-[#F5B301] cursor-pointer"
                    >
                      Boost: {Math.round(volumeBoost * 100)}%
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Aspect Ratio */}
            <button
              type="button"
              aria-label="Cycle screen aspect ratio"
              onClick={cycleAspectRatio}
              className={`h-10 px-3.5 rounded-lg border text-white font-mono font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all ${
                aspectRatio !== 'contain'
                  ? 'bg-white/10 border-white/20 border-b-2 border-b-[#F5B301]'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
              title="Screen Aspect Ratio"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#22B8F0] shrink-0" />
              <span>{aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'ZOOM' : 'FILL'}</span>
            </button>

            {/* 6. Line Selector + AUTO Toggle */}
            <div className="flex items-center rounded-lg bg-white/5 border border-white/10 shrink-0 overflow-hidden">
              <button
                type="button"
                aria-label="Switch stream mirror line"
                onClick={handleCycleMirror}
                className="h-10 px-3 hover:bg-white/10 text-white font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all"
                title="Switch Stream Source Line"
              >
                <Zap className="w-4 h-4 text-[#2ECC71] shrink-0" />
                <span>Line {activeMirrorIdx + 1}</span>
              </button>
              <button
                type="button"
                aria-label="Toggle AUTO proxy line selection"
                onClick={cycleProxyMode}
                className={`h-10 px-2.5 font-mono text-[11px] font-black uppercase border-l border-white/10 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors ${
                  proxyMode === 'auto'
                    ? 'bg-[#F5B301]/20 text-[#F5B301]'
                    : 'text-white/75 hover:text-white hover:bg-white/10'
                }`}
                title="Toggle AUTO / Proxy Line"
              >
                {proxyMode === 'auto' ? 'AUTO' : proxyMode}
              </button>
            </div>

            {/* 7. Favorite Star */}
            <button
              type="button"
              aria-label={isCurrentChannelFav ? 'Remove channel from favorites' : 'Save channel to favorites'}
              onClick={(e) => toggleChannelFavorite(channel.id, e)}
              className={`h-10 px-3.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all ${
                isCurrentChannelFav
                  ? 'bg-[#F5B301]/15 border-[#F5B301] border-b-2 border-b-[#F5B301] text-[#F5B301] shadow-[0_0_12px_rgba(245,179,1,0.2)]'
                  : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
              }`}
              title={isCurrentChannelFav ? 'Remove Favorite' : 'Save Favorite'}
            >
              <Star className={`w-4 h-4 shrink-0 ${isCurrentChannelFav ? 'fill-[#F5B301]' : ''}`} />
              <span>{isCurrentChannelFav ? 'Favorited' : 'Favorite'}</span>
            </button>

            {/* 8. 1h VIP Button */}
            <div className="shrink-0">
              <WatchAdVipButton
                variant="player"
                adFreeState={adFreeState}
                onRewardedGranted={onRewardedGranted}
              />
            </div>

            {/* 9. Numeric Dial Keypad Button */}
            <button
              type="button"
              aria-label="Open on-screen numeric channel keypad"
              onClick={() => setIsKeypadOpen(prev => !prev)}
              className={`h-10 px-3 rounded-lg border font-mono font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all ${
                isKeypadOpen
                  ? 'bg-[#F5B301] text-[#050816] border-[#F5B301]'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
              }`}
              title="Channel Number Keypad"
            >
              <span>123</span>
            </button>

            {/* 10. Help Button */}
            <button
              type="button"
              aria-label="Open Help and Shortcuts"
              onClick={() => setIsHelpModalOpen(true)}
              className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#F5B301] font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301]"
              title="Help & Instructions"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
            </button>

            {/* 11. More Sheet */}
            <button
              type="button"
              aria-label="Open More Settings Sheet"
              onClick={() => setIsMoreMenuOpen(true)}
              className="h-10 px-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F5B301]"
            >
              <MoreVertical className="w-4 h-4 text-[#F5B301] shrink-0" />
              <span>More</span>
            </button>
          </div>
        </div>
      )}

      </div>

      {/* ==================================================================== */}
      {/* 4. ACCESSIBLE CHANNEL-LISTENING PANEL (#channel-guide)               */}
      {/* Sibling to the video column: toggling never unmounts/pauses/mutes.   */}
      {/* ==================================================================== */}
      <ChannelListeningPanel
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        channels={allChannels}
        activeChannel={channel}
        confirmedPlayingChannelId={confirmedPlayingChannelId}
        playbackStatus={guidePlaybackStatus}
        playbackError={guidePlaybackError}
        isSwitching={isSwitching}
        onSelectChannel={selectChannelUnified}
        onRetry={() => handleRetry()}
        onTapToPlay={() => {
          setIsPlaying(true);
          playerAdapterRef.current?.play().then((res) => {
            if (res === 'playing') {
              setConfirmedPlayingChannelId(channel.id);
              setGuidePlaybackStatus('playing');
            }
          });
        }}
        favorites={favorites}
        onToggleFavorite={toggleChannelFavorite}
        detectedLocation={detectedLocation}
        locationSource={locationSource}
        isMobileLayout={isPortraitMobile || isTabletPortrait}
        restoreFocusToRef={channelsOpenBtnRef}
      />

      {/* ==================================================================== */}
      {/* 5. MORE MENU BOTTOM SHEET                                            */}
      {/* ==================================================================== */}
      <MoreMenuSheet
        isOpen={isMoreMenuOpen}
        onClose={() => setIsMoreMenuOpen(false)}
        isFavorite={isCurrentChannelFav}
        onToggleFavorite={() => toggleChannelFavorite(channel.id)}
        onToggleLock={() => {
          setIsTouchLocked(true);
          showToastHud('info', 'Screen Controls Locked');
        }}
        aspectRatio={aspectRatio}
        onCycleAspectRatio={cycleAspectRatio}
        proxyMode={proxyMode}
        onCycleProxyMode={cycleProxyMode}
        candidateUrlsCount={candidateUrls.length}
        activeMirrorIdx={activeMirrorIdx}
        onCycleMirror={handleCycleMirror}
        volumeBoost={volumeBoost}
        onCycleAudioBoost={cycleAudioBoost}
        brightness={brightness}
        onCycleBrightness={cycleBrightness}
        onReload={handleRetry}
        onOpenHelp={() => setIsHelpModalOpen(true)}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
      />

      {/* ==================================================================== */}
      {/* 6. TV GUIDE & 8,890+ CHANNELS BOTTOM SHEET (85% Height)              */}
      {/* ==================================================================== */}
      <TvGuideSheet
        isOpen={isTvGuideOpen}
        onClose={() => setIsTvGuideOpen(false)}
        channels={allChannels}
        currentChannel={channel}
        onSelectChannel={(ch) => {
          selectChannelUnified(ch);
          setIsTvGuideOpen(false);
        }}
        favorites={favorites}
        onToggleFavorite={toggleChannelFavorite}
      />

      {/* ==================================================================== */}
      {/* 7. FIRST-LAUNCH 5-STEP COACH MARKS                                  */}
      {/* ==================================================================== */}
      <PlayerCoachMarks
        isOpen={isCoachMarksOpen}
        onClose={() => {
          setIsCoachMarksOpen(false);
          try {
            localStorage.setItem('mrs_onboarding_v2', '1');
          } catch {}
        }}
      />

      {/* ==================================================================== */}
      {/* 8. HELP & INSTRUCTIONS FULL SCREEN MODAL                            */}
      {/* ==================================================================== */}
      <PlayerHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </div>
  );
}
