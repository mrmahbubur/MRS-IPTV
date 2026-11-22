import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Menu, MonitorSmartphone, X, RefreshCw, Crown, Play, Tv, Mic, MicOff, AlertCircle, ShieldCheck, Palette, Layers, Tag, Clock, Trash2, Radio, Check, UserCheck } from 'lucide-react';
import { AdFreeState, Channel } from '../types';
import { useBroadcastTheme } from '../lib/themeSystem';
import { useRealtimeVipCountdown } from '../lib/adSystem';
import { MrsIptvLogo } from './MrsIptvLogo';
import { ChannelThumbnail } from './ChannelThumbnail';
import { WatchAdVipButton } from './WatchAdVipButton';
import { useDeviceDetection } from '../hooks/useDeviceDetection';

interface TopHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  channels?: Channel[];
  onSelectChannel?: (channel: Channel, contextChannels?: Channel[]) => void;
  onSelectHome?: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  isRefreshing?: boolean;
  lastRefreshed?: Date | null;
  isAutoRefreshEnabled?: boolean;
  setIsAutoRefreshEnabled?: (enabled: boolean) => void;
  refreshIntervalSec?: number;
  setRefreshIntervalSec?: (sec: number) => void;
  onManualRefresh?: () => void;
  onOpenPremiumModal?: () => void;
  onOpenM3uManager?: () => void;
  onOpenAiChat?: () => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenMultiScreen?: () => void;
  onOpenAccountModal?: (tab: 'account' | 'support') => void;
  searchHistory?: (string | { query: string; searchedAt?: number })[];
  onClearSearchHistory?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ 
  searchQuery, 
  setSearchQuery, 
  channels = [],
  onSelectChannel, 
  onSelectHome,
  isMobileMenuOpen, 
  setIsMobileMenuOpen, 
  isRefreshing = false,
  onManualRefresh,
  onOpenPremiumModal,
  adFreeState,
  onRewardedGranted,
  onOpenMultiScreen,
  onOpenAccountModal,
  searchHistory = [],
  onClearSearchHistory
}) => {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [showMicPermissionPrompt, setShowMicPermissionPrompt] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const recognitionRef = useRef<any>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme, allThemes } = useBroadcastTheme();
  const { isSmallDevice } = useDeviceDetection();

  const vipCountdown = useRealtimeVipCountdown(adFreeState);
  const isVipActive = vipCountdown.isActive;

  const showVoiceFeedbackError = useCallback((message: string) => {
    setVoiceError(message);
    if (errorTimeoutRef.current) {
      window.clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = window.setTimeout(() => {
      setVoiceError(null);
    }, 4500);
  }, []);

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSpeechSupported(false);
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore abort errors on unmount
        }
      }
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const stopVoiceSearch = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop errors
      }
    }
    setIsListening(false);
  }, []);

  const startSpeechEngine = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setIsSpeechSupported(false);
      showVoiceFeedbackError('Voice search is not supported in this browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalTranscript += piece;
          } else {
            interimTranscript += piece;
          }
        }

        const rawTranscript = (finalTranscript || interimTranscript).trim();
        const cleanedQuery = rawTranscript.replace(/[.,!?]+$/g, '').trim();

        if (cleanedQuery) {
          setSearchQuery(cleanedQuery);
          setIsDropdownOpen(true);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        const errCode = event?.error;
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setShowMicPermissionPrompt(true);
          showVoiceFeedbackError('Microphone access required. Click "Allow" to enable voice search.');
        } else if (errCode === 'no-speech') {
          showVoiceFeedbackError('No speech detected. Tap the mic and speak a channel name.');
        } else if (errCode === 'audio-capture') {
          showVoiceFeedbackError('No microphone found on this device.');
        } else if (errCode !== 'aborted') {
          showVoiceFeedbackError('Voice recognition interrupted. Please try again.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      showVoiceFeedbackError('Could not start voice search. Please try again.');
    }
  }, [setSearchQuery, showVoiceFeedbackError]);

  const handleAllowMicrophonePermission = useCallback(async () => {
    setVoiceError(null);
    setIsRequestingMic(true);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release hardware audio tracks immediately so SpeechRecognition can bind to microphone
        stream.getTracks().forEach((track) => track.stop());
      }
      setShowMicPermissionPrompt(false);
      try {
        localStorage.setItem('mrs_mic_permission_allowed', 'true');
      } catch {}
      startSpeechEngine();
    } catch {
      try {
        localStorage.removeItem('mrs_mic_permission_allowed');
      } catch {}
      showVoiceFeedbackError(
        'Microphone permission was blocked by your browser. Please allow microphone access in your browser address bar settings.'
      );
    } finally {
      setIsRequestingMic(false);
    }
  }, [startSpeechEngine, showVoiceFeedbackError]);

  const toggleVoiceSearch = useCallback(() => {
    setVoiceError(null);

    if (isListening) {
      stopVoiceSearch();
      return;
    }

    // Always ask for permission when clicking on microphone
    setShowMicPermissionPrompt(true);
  }, [isListening, stopVoiceSearch]);

  // Filter matching channels in real time based on query
  const matchingChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !channels || channels.length === 0) return [];
    return channels.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.category && c.category.toLowerCase().includes(q))
    );
  }, [searchQuery, channels]);

  // Compute category statistics across all channels for real-time category suggestions
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of channels) {
      const cat = (c.category || 'General').trim();
      if (cat) {
        map.set(cat, (map.get(cat) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [channels]);

  // Suggested categories matching query, or top categories if query is empty/short
  const matchingCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return categoryStats.slice(0, 8);
    }
    // Categories whose name contains the query string
    const directMatches = categoryStats.filter(c => c.name.toLowerCase().includes(q));
    if (directMatches.length > 0) {
      return directMatches.slice(0, 8);
    }
    // Categories inferred from matching channels
    const inferred = new Map<string, number>();
    for (const c of matchingChannels) {
      const cat = (c.category || 'General').trim();
      if (cat) {
        inferred.set(cat, (inferred.get(cat) || 0) + 1);
      }
    }
    return Array.from(inferred.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [searchQuery, categoryStats, matchingChannels]);

  // Filter recent searches matching current query, or latest searches
  const matchingRecentSearches = useMemo(() => {
    if (!searchHistory || searchHistory.length === 0) return [];
    const q = searchQuery.trim().toLowerCase();
    const cleanList = searchHistory
      .map(item => (typeof item === 'string' ? item : item.query))
      .filter((text): text is string => !!text && text.trim().length > 0);
    const unique = Array.from(new Set(cleanList));
    if (!q) return unique.slice(0, 6);
    return unique.filter(text => text.toLowerCase().includes(q)).slice(0, 6);
  }, [searchHistory, searchQuery]);

  // Open dropdown when searchQuery changes and is non-empty
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  }, [searchQuery]);

  // Close search dropdown when clicking outside search container
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      const isSearchContainer = target.closest('.search-bar-container');
      const isSearchToggle = target.closest('.search-toggle-btn');
      const isChannelItem = target.closest('.channel-item');
      const isThemePicker = target.closest('.theme-picker-container');

      if (!isSearchContainer && !isSearchToggle && !isChannelItem) {
        setIsDropdownOpen(false);
        setShowMicPermissionPrompt(false);
      }
      if (!isThemePicker) {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Handle escape key to close search dropdown and stop voice search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setShowMicPermissionPrompt(false);
        setIsThemeMenuOpen(false);
        if (isListening) {
          stopVoiceSearch();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, stopVoiceSearch]);

  const handleChannelClick = (channel: Channel) => {
    if (isListening) {
      stopVoiceSearch();
    }
    if (onSelectChannel) {
      onSelectChannel(channel, matchingChannels.length > 0 ? matchingChannels : channels);
    }
    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsMobileSearchOpen(false);
  };

  const handleRefreshClick = () => {
    if (onManualRefresh) {
      onManualRefresh();
    }
  };

  const handleHomeLogoClick = () => {
    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsMobileSearchOpen(false);
    if (onSelectHome) {
      onSelectHome();
    }
  };

  const renderMicrophonePermissionBox = () => {
    if (!showMicPermissionPrompt) return null;

    return (
      <div className="mt-2 p-3.5 rounded-xl bg-[#0D121F] border border-sky-400/40 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-400/40 flex items-center justify-center shrink-0 text-sky-400">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Microphone Permission Request</span>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            </p>
            <p className="text-[11px] text-[#C9D1E0] mt-0.5">
              Allow <span className="text-sky-400 font-bold">M R S IPTV</span> to use your microphone for hands-free voice search?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setShowMicPermissionPrompt(false)}
            className="px-3 py-1.5 rounded-lg btn-premium-glass text-xs font-bold text-[#C9D1E0] hover:text-white cursor-pointer"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={handleAllowMicrophonePermission}
            disabled={isRequestingMic}
            className="px-3.5 py-1.5 rounded-lg btn-premium-primary text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>{isRequestingMic ? 'Requesting...' : 'Allow'}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderDropdownList = () => {
    const hasQuery = searchQuery.trim().length > 0;
    const hasHistory = matchingRecentSearches.length > 0;
    const hasCategories = matchingCategories.length > 0;
    const hasChannels = matchingChannels.length > 0;

    if (!isDropdownOpen || (!hasQuery && !hasHistory && !hasCategories)) return null;

    return (
      <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#0D121F]/98 border border-[var(--theme-border,rgba(56,189,248,0.3))] rounded-xl shadow-2xl backdrop-blur-2xl overflow-hidden max-h-[460px] flex flex-col divide-y divide-white/[0.08] animate-in fade-in slide-in-from-top-2 duration-150">
        <div className="px-4 py-2.5 bg-white/[0.03] flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Tv className={`w-3.5 h-3.5 shrink-0 ${theme.accentTextClass}`} />
            <span>
              {hasQuery 
                ? `Search Suggestions (${matchingChannels.length} channels, ${matchingCategories.length} categories)`
                : `Suggested Categories & Recent Searches`}
            </span>
          </span>
          <button 
            type="button" 
            onClick={() => setIsDropdownOpen(false)}
            className="text-[#C9D1E0] hover:text-white text-xs font-semibold min-h-[36px] px-3 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar divide-y divide-white/[0.06] max-h-[400px]">
          {/* Section 1: Popular / Matching Categories */}
          {hasCategories && (
            <div className="p-3 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold text-[var(--theme-accent,#38BDF8)] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{hasQuery ? 'Suggested Categories' : 'Popular Categories'}</span>
                </span>
                <span className="text-[10px] text-[#C9D1E0]/70 font-mono">
                  Click to filter
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {matchingCategories.map(cat => (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => {
                      setSearchQuery(cat.name);
                      setIsDropdownOpen(false);
                      setIsMobileSearchOpen(false);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--theme-surface,#0E131F)] hover:bg-white/10 border border-[var(--theme-border,rgba(56,189,248,0.25))] hover:border-[var(--theme-accent,#38BDF8)] flex items-center gap-1.5 transition-all cursor-pointer group"
                  >
                    <Tag className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)] shrink-0 group-hover:scale-110 transition-transform motion-reduce:transition-none" />
                    <span>{cat.name}</span>
                    <span className="text-[10px] font-mono tabular-nums font-semibold text-[#C9D1E0]/75 bg-white/5 px-1.5 py-0.5 rounded">
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Recent Searches */}
          {hasHistory && (
            <div className="p-3 bg-white/[0.01]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Recent Searches</span>
                </span>
                {onClearSearchHistory && (
                  <button
                    type="button"
                    onClick={onClearSearchHistory}
                    className="min-h-[32px] px-2.5 rounded-lg text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {matchingRecentSearches.map((term, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchQuery(term);
                      setIsDropdownOpen(false);
                      setIsMobileSearchOpen(false);
                    }}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium text-[#C9D1E0] hover:text-white bg-white/[0.03] hover:bg-white/10 border border-white/10 hover:border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Search className="w-3 h-3 text-[#C9D1E0]/70 shrink-0" />
                    <span>{term}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Matching Channels */}
          {hasQuery && (
            <div>
              {hasChannels ? (
                <div className="divide-y divide-white/[0.04]">
                  <div className="px-4 py-2 bg-white/[0.02] flex items-center justify-between text-[11px] font-extrabold text-[var(--theme-accent,#38BDF8)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5" />
                      <span>Matching Live Channels ({matchingChannels.length})</span>
                    </span>
                  </div>
                  {matchingChannels.slice(0, 10).map((channel, idx) => (
                    <button
                      key={channel.id || idx}
                      type="button"
                      onClick={() => handleChannelClick(channel)}
                      className="w-full text-left group flex items-center justify-between p-3 px-4 hover:bg-white/[0.04] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center min-w-0 mr-3">
                        <ChannelThumbnail
                          channel={channel}
                          variant="compact-list"
                        />
                        <div className="ml-3 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors">
                              {channel.name}
                            </h4>
                            {channel.category && (
                              <span className="text-[11px] text-[#C9D1E0] font-mono shrink-0">
                                · {channel.category}
                              </span>
                            )}
                          </div>
                          {channel.currentProgram ? (
                            <p className="text-[11px] text-[var(--theme-accent,#38BDF8)] truncate mt-0.5 font-medium">
                              Now: {channel.currentProgram}
                            </p>
                          ) : (
                            <p className="text-[11px] text-[#C9D1E0]/80 truncate mt-0.5">
                              Direct HD Stream
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="w-9 h-9 rounded-lg btn-premium-primary flex items-center justify-center shrink-0">
                        <Play className="w-4 h-4 fill-current ml-0.5 shrink-0" />
                      </div>
                    </button>
                  ))}

                  {matchingChannels.length > 10 && (
                    <div className="p-2.5 text-center bg-white/[0.03] text-xs text-[#C9D1E0] font-medium">
                      Showing top 10 of {matchingChannels.length} matches. Keep typing to refine.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-[#C9D1E0] flex flex-col items-center justify-center">
                  <Search className="w-7 h-7 text-[var(--theme-accent,#38BDF8)]/60 mb-2" />
                  <p className="text-sm font-bold text-white">No channels found</p>
                  <p className="text-xs text-[#C9D1E0]/80 mt-1">No broadcast matches "{searchQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-40 premium-surface backdrop-blur-2xl border-b border-white/[0.09] px-3 sm:px-4 lg:px-8 py-2 sm:py-2.5">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-2">
        {/* Main Row: Desktop & Mobile Top Bar */}
        <div className="flex items-center justify-between gap-3 sm:gap-4 w-full">
          {/* Zone 1: Top-Left Compact Horizontal M R S IPTV Logo & Mobile Menu Trigger */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Hamburger menu trigger for small screen devices */}
            <button 
              type="button"
              className="lg:hidden text-[#C9D1E0] hover:text-white w-10 h-10 flex items-center justify-center rounded-lg btn-premium-glass cursor-pointer shrink-0 motion-reduce:transition-none" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4 stroke-[2.5] shrink-0" /> : <Menu className="w-4 h-4 stroke-[2.5] shrink-0" />}
            </button>

            <MrsIptvLogo
              variant="compact"
              href="/"
              onClick={handleHomeLogoClick}
              iconClassName="h-[34px] sm:h-[40px] md:h-[48px] w-auto"
              wordmarkClassName="text-sm sm:text-base lg:text-lg"
              className="py-0.5 pr-1"
            />
          </div>

          {/* Zone 2: Desktop Center Search Bar (STRICTLY FOR DESKTOP / WINDOWS TV / LARGE SCREENS: hidden lg:block) */}
          <div className="search-bar-container relative hidden lg:block w-full max-w-xl">
            <div className={`flex items-center bg-[var(--theme-surface,#0E131F)] border rounded-xl px-3.5 py-1.5 w-full shadow-inner transition-all duration-200 motion-reduce:transition-none ${
              isListening
                ? 'border-[var(--theme-accent,#38BDF8)] ring-2 ring-[var(--theme-accent,#38BDF8)]/35'
                : showMicPermissionPrompt
                  ? 'border-[var(--theme-accent,#38BDF8)]/80 ring-2 ring-[var(--theme-accent,#38BDF8)]/20'
                  : 'border-[var(--theme-border,rgba(56,189,248,0.3))] focus-within:border-[var(--theme-accent,#38BDF8)] focus-within:ring-2 focus-within:ring-[var(--theme-accent,#38BDF8)]/20'
            }`}>
              <Search className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
              <input 
                type="text" 
                aria-label="Search live IPTV channels"
                placeholder={
                  isListening
                    ? "Listening... Say a channel, sport, or category (e.g. 'T Sports', 'Cricket')..."
                    : `Search ${channels.length > 0 ? channels.length.toLocaleString() : '8,890'}+ live channels, sports, news, or movies...`
                }
                className="bg-transparent border-none outline-none text-white font-medium ml-2.5 w-full text-xs sm:text-sm placeholder-[#C9D1E0]/60 py-1.5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
              />

              {searchQuery && (
                <button 
                  type="button" 
                  onClick={() => {
                    setSearchQuery('');
                    setIsDropdownOpen(false);
                  }}
                  className="text-[#C9D1E0] hover:text-white w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 ml-1 transition-colors cursor-pointer shrink-0"
                  title="Clear search"
                  aria-label="Clear search query"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              )}

              {/* Microphone Inside Search Bar */}
              <button
                type="button"
                onClick={toggleVoiceSearch}
                aria-label={isListening ? 'Stop voice search' : 'Search channels by voice'}
                title={
                  !isSpeechSupported
                    ? 'Voice search not supported in this browser'
                    : isListening
                      ? 'Listening... Click to stop voice search'
                      : 'Click microphone to allow voice search'
                }
                className={`ml-1.5 px-2.5 h-9 min-w-[38px] rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 motion-reduce:transition-none ${
                  isListening
                    ? 'bg-[var(--theme-accent,#38BDF8)]/25 text-white border border-[var(--theme-accent,#38BDF8)] shadow-sm shadow-[var(--theme-accent,#38BDF8)]/30'
                    : showMicPermissionPrompt
                      ? 'bg-[var(--theme-accent,#38BDF8)]/20 text-white border border-[var(--theme-accent,#38BDF8)]/70'
                      : 'text-[var(--theme-accent,#38BDF8)] hover:text-white bg-white/[0.04] hover:bg-white/10 border border-[var(--theme-accent,#38BDF8)]/35 hover:border-[var(--theme-accent,#38BDF8)]'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-white">
                      Listening
                    </span>
                  </>
                ) : (
                  <Mic className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                )}
              </button>

              {!searchQuery && !isListening && (
                <span className="text-[11px] font-mono tabular-nums text-[var(--theme-accent,#38BDF8)] font-bold shrink-0 ml-2 pl-2 border-l border-white/10">
                  {channels.length > 0 ? `${channels.length.toLocaleString()} CH` : 'LIVE'}
                </span>
              )}
            </div>

            {renderMicrophonePermissionBox()}

            {voiceError && (
              <div className="mt-1.5 px-3 py-2 rounded-lg bg-[var(--theme-surface,#0E131F)] border border-[var(--theme-border,rgba(56,189,248,0.4))] text-[#C9D1E0] text-xs flex items-center justify-between gap-2 shadow-lg">
                <span className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                  {voiceError}
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceError(null)}
                  className="text-[var(--theme-accent,#38BDF8)] hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer shrink-0"
                  aria-label="Dismiss voice search message"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            )}

            {renderDropdownList()}
          </div>

          {/* Zone 3: Right Primary Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Mobile Quick Search Toggle Button (keeps sticky mobile bar under 56px) */}
            <button
              type="button"
              onClick={() => {
                setIsMobileSearchOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
                  }
                  return next;
                });
              }}
              aria-expanded={isMobileSearchOpen}
              aria-label={isMobileSearchOpen ? 'Close search bar' : 'Open channel search'}
              title="Search channels"
              className={`lg:hidden search-toggle-btn flex items-center justify-center w-10 h-10 rounded-lg transition-colors cursor-pointer shrink-0 motion-reduce:transition-none ${
                isMobileSearchOpen || searchQuery.trim().length > 0
                  ? 'btn-premium-primary text-white'
                  : 'btn-premium-glass text-[var(--theme-accent,#38BDF8)]'
              }`}
            >
              {isMobileSearchOpen ? <X className="w-4 h-4 shrink-0" /> : <Search className="w-4 h-4 shrink-0" />}
            </button>

            {/* Smooth Channel Refresh Button */}
            <button 
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="flex items-center justify-center w-10 h-10 rounded-lg btn-premium-cyan group cursor-pointer shrink-0 motion-reduce:transition-none"
              title="Sync & Refresh Live Channels"
              aria-label="Sync and refresh live channels"
              id="refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 text-amber-400 group-hover:text-white transition-all duration-500 stroke-[2.2] shrink-0 motion-reduce:transition-none ${
                isRefreshing ? 'animate-spin text-amber-400' : 'group-hover:rotate-180 motion-reduce:group-hover:rotate-0'
              }`} />
            </button>

            {/* Interactive 6-Palette Broadcast Theme Switcher */}
            <div className="relative theme-picker-container shrink-0">
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen(prev => !prev)}
                aria-expanded={isThemeMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 px-3 h-10 rounded-lg btn-premium-glass text-xs font-extrabold cursor-pointer group shrink-0 motion-reduce:transition-none"
                title={`Active Theme: ${theme.name} — Choose broadcast theme`}
                aria-label={`Choose broadcast theme (${theme.shortLabel})`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/40"
                  style={{ backgroundColor: theme.swatchHex }}
                  aria-hidden="true"
                />
                <Palette className={`w-4 h-4 ${theme.accentTextClass} shrink-0`} />
                <span className="hidden xl:inline text-[11px] font-bold text-slate-200 group-hover:text-white">
                  {theme.shortLabel}
                </span>
              </button>

              {isThemeMenuOpen && (
                <div
                  role="menu"
                  aria-label="Broadcast Color Themes"
                  className="absolute right-0 mt-2 w-64 glass-panel rounded-xl p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.92)] z-50"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#C9D1E0]/75 border-b border-white/[0.06] mb-1">
                    Broadcast Studio Themes
                  </div>
                  <div className="space-y-0.5">
                    {allThemes.map((t) => {
                      const isActive = t.id === theme.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => {
                            setTheme(t.id);
                            setIsThemeMenuOpen(false);
                          }}
                          className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-white/[0.10] text-white font-bold'
                              : 'text-[#C9D1E0] hover:text-white hover:bg-white/[0.06] font-medium'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-4 h-4 rounded-md shrink-0 ring-1 ring-white/25"
                              style={{
                                background: `linear-gradient(135deg, ${t.swatchHex} 0%, ${t.bgHex} 100%)`
                              }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{t.shortLabel}</span>
                          </span>
                          {isActive && (
                            <Check className={`w-4 h-4 shrink-0 ${t.accentTextClass}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Minimal TV / Multi-Screen Trigger (Neon Amethyst Purple Studio Control) */}
            {onOpenMultiScreen && (
              <button 
                type="button"
                onClick={onOpenMultiScreen}
                className="hidden md:flex items-center gap-1.5 text-xs font-bold px-3.5 h-10 rounded-lg btn-premium-purple group cursor-pointer whitespace-nowrap shrink-0 motion-reduce:transition-none"
                title="Switch to Minimal TV Player"
              >
                <MonitorSmartphone className="w-4 h-4 text-[#B832F5] group-hover:scale-110 transition-transform shrink-0 motion-reduce:transition-none" />
                <span className="text-white">Minimal TV</span>
              </button>
            )}

            {/* Desktop Only Actions in Top Bar (Windows, Smart TV, Large Displays: hidden lg:flex) */}
            <div className="hidden lg:flex items-center gap-2">
              {/* Watch Ad & Get 1 Hour Free VIP Icon Button */}
              <WatchAdVipButton
                variant="header"
                adFreeState={adFreeState}
                onRewardedGranted={onRewardedGranted}
              />

              {/* Premium VIP Pass Status CTA with Real-Time Countdown */}
              <button 
                type="button"
                onClick={onOpenPremiumModal}
                className={`flex items-center gap-1.5 px-3.5 h-10 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 motion-reduce:transition-none ${
                  isVipActive && vipCountdown.isTemporary ? 'btn-premium-emerald' : 'btn-premium-gold'
                }`}
                title={isVipActive ? "VIP Ad-Free Active" : "Upgrade to Ad-Free VIP Pass"}
                id="premium-purchase-btn"
              >
                <Crown className={`w-4 h-4 shrink-0 ${isVipActive && vipCountdown.isTemporary ? 'text-emerald-400' : 'text-amber-400'}`} />
                {isVipActive && (
                  <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="font-mono tabular-nums tracking-tight">
                  {isVipActive ? (vipCountdown.shortBadgeText || 'VIP Active') : 'Get VIP Pass'}
                </span>
              </button>

              {onOpenAccountModal && (
                <button
                  type="button"
                  onClick={() => onOpenAccountModal('account')}
                  className="w-10 h-10 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white cursor-pointer shrink-0"
                  title="Account, Devices & Support"
                  aria-label="Open Account and Devices"
                >
                  <UserCheck className="w-4 h-4 text-[#F5B301]" />
                </button>
              )}
            </div>

            {/* Mobile Top Row VIP Quick Action (Small Screen Devices Only: lg:hidden) */}
            <button
              type="button"
              onClick={onOpenPremiumModal}
              className={`lg:hidden flex items-center gap-1.5 px-3 h-10 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 motion-reduce:transition-none ${
                isVipActive && vipCountdown.isTemporary ? 'btn-premium-emerald text-emerald-300' : 'btn-premium-gold text-amber-300'
              }`}
              title={isVipActive ? "VIP Status Active" : "VIP Pass"}
            >
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-mono tabular-nums tracking-tight text-[11px]">
                {isVipActive ? (vipCountdown.shortBadgeText || 'VIP') : 'VIP'}
              </span>
            </button>
          </div>
        </div>

        {/* Small Screen Devices ONLY (lg:hidden): Expandable Mobile Search & VIP Utility Strip */}
        {(isMobileSearchOpen || searchQuery.trim().length > 0 || isListening || showMicPermissionPrompt) && (
        <div className="lg:hidden search-bar-container flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
          {/* 1. Mobile Full-Width Search Bar with Microphone inside */}
          <div className="relative w-full">
            <div className={`flex items-center bg-[var(--theme-surface,#0E131F)] border rounded-xl px-3 py-1.5 w-full shadow-inner transition-all duration-200 motion-reduce:transition-none ${
              isListening
                ? 'border-[var(--theme-accent,#38BDF8)] ring-2 ring-[var(--theme-accent,#38BDF8)]/35'
                : showMicPermissionPrompt
                  ? 'border-[var(--theme-accent,#38BDF8)]/80 ring-2 ring-[var(--theme-accent,#38BDF8)]/20'
                  : 'border-[var(--theme-border,rgba(56,189,248,0.3))] focus-within:border-[var(--theme-accent,#38BDF8)] focus-within:ring-2 focus-within:ring-[var(--theme-accent,#38BDF8)]/20'
            }`}>
              <Search className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
              <input 
                ref={mobileSearchInputRef}
                type="text"
                aria-label="Search live IPTV channels on mobile"
                placeholder={
                  isListening
                    ? "Listening... Say a channel or sport..."
                    : `Search ${channels.length > 0 ? channels.length.toLocaleString() : '8,890'}+ live channels...`
                }
                className="bg-transparent border-none outline-none text-white font-medium ml-2.5 w-full text-xs placeholder-[#C9D1E0]/60 py-1.5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsDropdownOpen(false);
                  }}
                  className="text-[#C9D1E0] hover:text-white w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 ml-1 transition-colors cursor-pointer shrink-0"
                  title="Clear search"
                  aria-label="Clear search query"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              )}

              {/* Mobile Voice Search Mic Button */}
              <button
                type="button"
                onClick={toggleVoiceSearch}
                aria-label={isListening ? 'Stop voice search' : 'Search channels by voice'}
                title={
                  !isSpeechSupported
                    ? 'Voice search not supported'
                    : isListening
                      ? 'Listening... Click to stop'
                      : 'Voice Search'
                }
                className={`ml-1 px-2.5 h-9 min-w-[38px] rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shrink-0 motion-reduce:transition-none ${
                  isListening
                    ? 'bg-[var(--theme-accent,#38BDF8)]/25 text-white border border-[var(--theme-accent,#38BDF8)]'
                    : 'text-[var(--theme-accent,#38BDF8)] hover:text-white bg-white/[0.04] border border-[var(--theme-accent,#38BDF8)]/35'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                    <span className="text-[9px] font-extrabold uppercase text-white">Live</span>
                  </>
                ) : (
                  <Mic className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                )}
              </button>
            </div>

            {renderMicrophonePermissionBox()}

            {voiceError && (
              <div className="mt-1.5 px-3 py-2 rounded-lg bg-[var(--theme-surface,#0E131F)] border border-[var(--theme-border,rgba(56,189,248,0.4))] text-[#C9D1E0] text-xs flex items-center justify-between gap-2 shadow-lg">
                <span className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                  {voiceError}
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceError(null)}
                  className="text-[var(--theme-accent,#38BDF8)] hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer shrink-0"
                  aria-label="Dismiss voice search message"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            )}

            {renderDropdownList()}
          </div>

          {/* 2 & 3. Important Sections: 1-Hour VIP Pass & VIP Access Priority Buttons in HEAD */}
          <div className="grid grid-cols-2 gap-2 w-full">
            {/* 1-Hour Free VIP Pass Button */}
            <WatchAdVipButton
              variant="mobile-bar"
              adFreeState={adFreeState}
              onRewardedGranted={onRewardedGranted}
            />

            {/* VIP Access Button */}
            <button
              type="button"
              onClick={onOpenPremiumModal}
              className={`w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-md motion-reduce:transition-none ${
                isVipActive && vipCountdown.isTemporary ? 'btn-premium-emerald' : 'btn-premium-gold'
              }`}
              title="VIP Access & Code Activation"
              id="mobile-head-vip-access-btn"
            >
              <Crown className={`w-4 h-4 shrink-0 ${isVipActive && vipCountdown.isTemporary ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div className="flex flex-col text-left leading-tight truncate">
                <span className="text-[11px] font-extrabold text-white truncate">
                  {isVipActive ? 'VIP Active' : 'VIP Access'}
                </span>
                <span className="text-[9px] text-amber-300 font-mono tabular-nums truncate">
                  {isVipActive ? (vipCountdown.formattedClock || 'Unlimited') : 'Pass & Code'}
                </span>
              </div>
            </button>
          </div>
        </div>
        )}
      </div>
    </header>
  );
};
