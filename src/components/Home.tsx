import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Channel, AdFreeState } from '../types';
import { ChannelThumbnail } from './ChannelThumbnail';
import {
  Bookmark, ChevronRight, ChevronLeft, Play, ShieldCheck,
  Clapperboard, Tv2, Newspaper, Smile, Music2, Globe, LayoutGrid,
  Trophy, Flame, Radio, ArrowRight, Heart, Compass,
  Search, RefreshCw, Trash2, History, Megaphone
} from 'lucide-react';
import { motion } from 'motion/react';
import { usePassiveTouchScroll } from '../hooks/usePassiveTouchScroll';
import { AiPersonalizedRecommendations } from './AiPersonalizedRecommendations';
import { useRemoteConfig } from '../hooks/useRemoteConfig';
import { AdBannerUnit } from './AdBannerUnit';
import { AdvertisementCategoryView } from './AdvertisementCategoryView';
import { WatchAdVipButton } from './WatchAdVipButton';
import { ADVERTISEMENT_AFFILIATE_ZONES } from '../lib/adSystem';
import { getStoredAdFreeState } from '../lib/codes';
import { useBroadcastTheme } from '../lib/themeSystem';
import { LegalPolicyModal } from './LegalPolicyModal';

function getChannelStatusMeta(
  perf?: { status: 'live' | 'offline'; latency: number; lastChecked: number }
): { isOffline: boolean; label: string } {
  if (perf?.status === 'offline') {
    return { isOffline: true, label: 'Busy' };
  }
  if (perf && typeof perf.latency === 'number' && perf.latency > 0) {
    return { isOffline: false, label: `${perf.latency}ms` };
  }
  return { isOffline: false, label: 'HD' };
}

/* -------------------------------------------------------------------------- */
/*                            Channel Grid Component                          */
/* -------------------------------------------------------------------------- */

const ChannelGrid = ({
  title,
  channelsList,
  setActiveView,
  onSelectChannel,
  favorites,
  setFavorites,
  performanceData,
  adFreeState,
  onRewardedGranted,
  onOpenVipModal,
  onResetFilters,
}: {
  title: string;
  channelsList: Channel[];
  setActiveView: (view: string) => void;
  onSelectChannel: (channel: Channel, contextChannels?: Channel[]) => void;
  favorites: string[];
  setFavorites: (favorites: string[]) => void;
  performanceData?: Record<string, { status: 'live' | 'offline'; latency: number; lastChecked: number }>;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
  onResetFilters?: () => void;
}) => {
  const [sortBy, setSortBy] = useState<'system' | 'alphabetical'>('system');
  const [visibleCount, setVisibleCount] = useState(84);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const { theme } = useBroadcastTheme();

  usePassiveTouchScroll(gridContainerRef);

  useEffect(() => {
    setVisibleCount(84);
  }, [channelsList, sortBy]);

  const sortedChannels = useMemo(() => {
    if (sortBy === 'alphabetical') {
      return [...channelsList].sort((a, b) => a.name.localeCompare(b.name));
    }
    return channelsList;
  }, [channelsList, sortBy]);

  const visibleChannels = useMemo(() => {
    return sortedChannels.slice(0, visibleCount);
  }, [sortedChannels, visibleCount]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 84, channelsList.length));
        }
      },
      {
        root: null,
        rootMargin: '300px',
        threshold: 0.1
      }
    );

    observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [channelsList.length]);

  return (
    <div ref={gridContainerRef} className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-24 lg:pb-10">
      <motion.div
        key={title}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            {title !== 'Search Results' && (
              <button
                type="button"
                onClick={() => setActiveView('home')}
                className="w-10 h-10 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center text-white cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
                title="Back to Home"
                aria-label="Back to Home"
              >
                <ChevronLeft strokeWidth={1.75} className="w-5 h-5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
              </button>
            )}
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-white tracking-tight">
                {title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#C9D1E0] mt-0.5">
                <span className={`font-mono tabular-nums font-bold ${theme.accentTextClass}`}>
                  {channelsList.length.toLocaleString()}
                </span>
                <span aria-hidden="true">·</span>
                <span>Live HD Broadcasts</span>
              </div>
            </div>
          </div>

          {title !== 'Search Results' && title !== 'All Categories' && (
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <WatchAdVipButton
                variant="header"
                adFreeState={adFreeState || getStoredAdFreeState()}
                onRewardedGranted={onRewardedGranted}
              />
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSortBy('system')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer motion-reduce:transition-none ${
                    sortBy === 'system'
                      ? 'bg-[var(--theme-accent,#38BDF8)]/20 text-white'
                      : 'text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  Priority
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('alphabetical')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer motion-reduce:transition-none ${
                    sortBy === 'alphabetical'
                      ? 'bg-[var(--theme-accent,#38BDF8)]/20 text-white'
                      : 'text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  A–Z
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Native Sponsor Banner Unit inside Category / Catalog Grid */}
        <AdBannerUnit
          placement="catalog-inline"
          adFreeState={adFreeState || getStoredAdFreeState()}
          onRewardedGranted={onRewardedGranted}
          onOpenVipModal={onOpenVipModal}
          refreshTrigger={title}
        />

        {/* Channel Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3.5 sm:gap-4">
          {visibleChannels.map((channel, idx) => {
            const isFav = favorites.includes(channel.id);
            const statusMeta = getChannelStatusMeta(performanceData?.[channel.id]);

            return (
              <div
                key={channel.id}
                onClick={() => onSelectChannel(channel, channelsList)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectChannel(channel, channelsList);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Watch ${channel.name}`}
                className="channel-item group relative bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] flex flex-col justify-between transition-colors motion-reduce:transition-none"
              >
                {/* Micro Header */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
                    <span className="text-[var(--theme-accent,#38BDF8)] font-bold">
                      {String(idx + 1).padStart(3, '0')}
                    </span>
                    <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
                    <span className={statusMeta.isOffline ? 'text-amber-400/90 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFav) {
                        setFavorites(favorites.filter(id => id !== channel.id));
                      } else {
                        setFavorites([...favorites, channel.id]);
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 motion-reduce:transition-none"
                    title={isFav ? 'Remove Favorite' : 'Save Channel'}
                    aria-label={isFav ? `Remove ${channel.name} from favorites` : `Save ${channel.name} to favorites`}
                  >
                    <Bookmark strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>

                {/* Fit-Size Channel Logo Stage */}
                <ChannelThumbnail
                  channel={channel}
                  variant="grid"
                  borderless={true}
                  showHoverPlay={true}
                />

                {/* Highlighted Channel Metadata */}
                <div className="mt-2.5 space-y-0.5">
                  <h4 title={channel.name} className="text-xs sm:text-[13px] font-extrabold text-white group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors truncate">
                    {channel.name}
                  </h4>
                  <div className="flex items-center justify-between text-[11px] text-[#C9D1E0]/80">
                    <span className="truncate font-medium">{channel.category || 'Live TV'}</span>
                    <span className="text-emerald-400 font-mono text-[10px] font-bold shrink-0 ml-1">
                      LIVE
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {channelsList.length === 0 && (
            <div className="col-span-full py-14 px-6 text-center text-[#C9D1E0] bg-[var(--theme-surface,#0E131F)]/70 rounded-2xl space-y-4">
              <Radio strokeWidth={1.75} className="w-8 h-8 text-[var(--theme-accent,#38BDF8)] mx-auto" />
              <div className="space-y-1">
                <p className="font-display font-bold text-base text-white">No live channels matched this view</p>
                <p className="text-xs text-[#C9D1E0]/80 max-w-md mx-auto">
                  {title === 'Saved Favorite Channels'
                    ? 'Bookmark any live channel card to build your personal quick-access lineup.'
                    : 'Try switching regions or exploring the full global live directory.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {onResetFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="min-h-[42px] px-5 py-2 rounded-lg btn-premium-primary text-xs font-extrabold cursor-pointer motion-reduce:transition-none"
                  >
                    Reset Region Filter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveView('live')}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer transition-colors motion-reduce:transition-none"
                >
                  Browse All Channels
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading Sentinel */}
        {channelsList.length > visibleCount && (
          <div ref={sentinelRef} className="w-full py-8 flex justify-center items-center">
            <div className="flex items-center gap-2 text-xs text-[#C9D1E0] font-semibold">
              <RefreshCw strokeWidth={1.75} className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)] animate-spin shrink-0" />
              <span>Loading more channels ({visibleCount} of {channelsList.length})...</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                       Horizontal Channel Row Component                     */
/* -------------------------------------------------------------------------- */

const HorizontalCategoryRow = ({
  categoryName,
  subtitle,
  categoryIcon: Icon,
  channelsList,
  onSelectChannel,
  setActiveView,
  performanceData,
  actionButton,
}: {
  categoryName: string;
  subtitle: string;
  categoryIcon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  channelsList: Channel[];
  onSelectChannel: (channel: Channel, contextChannels?: Channel[]) => void;
  setActiveView: (view: string) => void;
  performanceData?: Record<string, { status: 'live' | 'offline'; latency: number; lastChecked: number }>;
  actionButton?: React.ReactNode;
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  usePassiveTouchScroll(rowRef);
  const { theme } = useBroadcastTheme();

  if (channelsList.length === 0) return null;

  const scrollLeft = () => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: -380, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: 380, behavior: 'smooth' });
    }
  };

  return (
    <section className="space-y-3.5 relative group/row">
      {/* Clean Borderless Row Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon strokeWidth={1.75} className={`w-5 h-5 shrink-0 ${theme.accentTextClass}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
                {categoryName}
              </h2>
              <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
              <span className={`text-xs font-mono tabular-nums font-bold shrink-0 ${theme.accentTextClass}`}>
                {channelsList.length.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-[#C9D1E0]/80 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {actionButton}

          {/* Quiet Borderless Desktop Scroll Controls */}
          <div className="hidden sm:flex items-center gap-0.5">
            <button
              type="button"
              onClick={scrollLeft}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.08] cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
              title="Scroll left"
              aria-label={`Scroll ${categoryName} left`}
            >
              <ChevronLeft strokeWidth={1.75} className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={scrollRight}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.08] cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
              title="Scroll right"
              aria-label={`Scroll ${categoryName} right`}
            >
              <ChevronRight strokeWidth={1.75} className="w-4 h-4 shrink-0" />
            </button>
          </div>

          {!actionButton && (
            <button
              type="button"
              onClick={() => setActiveView('category:' + categoryName)}
              className="min-h-[36px] text-xs font-bold text-[#C9D1E0] hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer whitespace-nowrap transition-colors motion-reduce:transition-none"
            >
              <span>Explore</span>
              <ChevronRight strokeWidth={1.75} className={`w-3.5 h-3.5 shrink-0 ${theme.accentTextClass}`} />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Rail */}
      <div ref={rowRef} className="flex overflow-x-auto pb-2.5 custom-scrollbar scroll-horizontal-hardware gap-3.5 snap-x">
        {channelsList.slice(0, 20).map((channel, idx) => {
          const statusMeta = getChannelStatusMeta(performanceData?.[channel.id]);

          return (
            <div
              key={channel.id}
              onClick={() => onSelectChannel(channel, channelsList)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectChannel(channel, channelsList);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Watch ${channel.name}`}
              className="channel-item w-[164px] sm:w-[188px] shrink-0 bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] flex flex-col justify-between group transition-colors motion-reduce:transition-none snap-start"
            >
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums mb-1.5">
                <span className="text-[var(--theme-accent,#38BDF8)] font-bold">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className={`font-semibold flex items-center gap-1 ${statusMeta.isOffline ? 'text-amber-400/90' : 'text-emerald-400'}`}>
                  <Radio strokeWidth={1.75} className="w-2.5 h-2.5 shrink-0" />
                  {statusMeta.label === 'HD' ? 'LIVE' : statusMeta.label}
                </span>
              </div>

              <ChannelThumbnail
                channel={channel}
                variant="grid"
                borderless={true}
                showHoverPlay={true}
              />

              <div className="mt-2.5 space-y-0.5">
                <h4 title={channel.name} className="text-xs sm:text-[13px] font-extrabold text-white truncate group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors">
                  {channel.name}
                </h4>
                <p className="text-[11px] text-[#C9D1E0]/80 truncate font-medium">
                  {channel.currentProgram || channel.category || '24/7 Live Stream'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Main Home View Component                        */
/* -------------------------------------------------------------------------- */

interface HomeProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel, contextChannels?: Channel[]) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  activeView: string;
  setActiveView: (view: string) => void;
  favorites: string[];
  setFavorites: (favorites: string[]) => void;
  performanceData?: Record<string, { status: 'live' | 'offline'; latency: number; lastChecked: number }>;
  watchHistory?: { id?: string; name: string; category?: string; count?: number; watchedAt?: number }[];
  searchHistory?: (string | { query: string; searchedAt?: number })[];
  onOpenAiChat?: () => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
  onClearWatchHistory?: () => void;
  onClearSearchHistory?: () => void;
}

export const Home: React.FC<HomeProps> = ({
  channels,
  onSelectChannel,
  searchQuery = '',
  setSearchQuery,
  activeView,
  setActiveView,
  favorites,
  setFavorites,
  performanceData,
  watchHistory = [],
  searchHistory = [],
  onOpenAiChat,
  adFreeState,
  onRewardedGranted,
  onOpenVipModal,
  onClearWatchHistory,
  onClearSearchHistory
}) => {
  const mainHomeScrollRef = useRef<HTMLDivElement>(null);
  usePassiveTouchScroll(mainHomeScrollRef);
  const remoteConfig = useRemoteConfig();
  const { theme } = useBroadcastTheme();

  // Region / Country Filter state
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>('ALL');
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'dmca' | 'vip' | 'privacy'>('terms');
  const [backendPolicy, setBackendPolicy] = useState<{ copyrightNotice?: string; currentYear?: number; policyVersion?: string } | null>(null);

  useEffect(() => {
    fetch('/api/policy')
      .then(res => res.json())
      .then(data => setBackendPolicy(data))
      .catch(() => {});
  }, []);

  // Country definitions for fast filtering
  const countryFilters = [
    { code: 'ALL', label: 'Global' },
    { code: 'BD', label: 'Bangladesh' },
    { code: 'IN', label: 'India' },
    { code: 'PK', label: 'Pakistan' },
    { code: 'ME', label: 'Middle East' },
    { code: 'GB', label: 'UK' },
    { code: 'US', label: 'USA' },
  ];

  // Channels filtered by selected regional country if not ALL
  const countryFilteredChannels = useMemo(() => {
    if (selectedCountryFilter === 'ALL') return channels;
    const targetCode = selectedCountryFilter.toUpperCase();
    return channels.filter(c => {
      if (Array.isArray(c.countries) && c.countries.length > 0) {
        if (targetCode === 'ME') {
          if (c.countries.some(cc => ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'EG', 'JO', 'LB'].includes(cc.toUpperCase()))) {
            return true;
          }
        } else if (c.countries.some(cc => cc.toUpperCase() === targetCode)) {
          return true;
        }
      }
      const cat = (c.category || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      if (targetCode === 'BD') return /\b(bangla|bangladeshi|bd|dhaka)\b/.test(cat) || /\b(somoy|t[\s_-]?sports|jamuna|ntv|atn|ekattor|channel[\s_-]?i)\b/.test(name);
      if (targetCode === 'IN') return /\b(india|indian|hindi|kolkata|bengali)\b/.test(cat) || /\b(star sports|sony|zee|aaj tak|ndtv|dd sports)\b/.test(name);
      if (targetCode === 'PK') return /\b(pakistan|pakistani|urdu|lahore|karachi)\b/.test(cat) || /\b(ptv|a[\s_-]?sports|geo|ary)\b/.test(name);
      if (targetCode === 'ME') return /\b(arab|arabic|middle east|uae|qatar|saudi)\b/.test(cat) || /\b(bein|al jazeera|al arabiya|mbc)\b/.test(name);
      if (targetCode === 'GB') return /\b(uk|british|england|london)\b/.test(cat) || /\b(sky sports|tnt sports|bbc|itv|channel 4|gb news)\b/.test(name);
      if (targetCode === 'US') return /\b(usa|united states|american|us)\b/.test(cat) || /\b(espn|cnn|fox|nbc|cbs|abc|hbo|msnbc)\b/.test(name);
      return true;
    });
  }, [channels, selectedCountryFilter]);

  // Group channels by major category
  const categoriesMap = useMemo(() => {
    const map = new Map<string, Channel[]>();
    countryFilteredChannels.forEach(c => {
      let cat = (c.category || 'General').trim();
      if (!cat) cat = 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    });
    return map;
  }, [countryFilteredChannels]);

  // Dynamic category metadata with explicit Tailwind utility classes (JIT-safe)
  const dynamicCategories = useMemo(() => {
    const list: {
      name: string;
      count: number;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      subtitle: string;
      colorClass: string;
      chevronHoverClass: string;
    }[] = [];

    categoriesMap.forEach((channelList, name) => {
      let icon: React.ComponentType<{ className?: string; strokeWidth?: number }> = LayoutGrid;
      let subtitle = 'Live HD Broadcasts';
      let colorClass = 'text-sky-400';
      let chevronHoverClass = 'group-hover:text-sky-400';

      const nameLower = name.toLowerCase();
      if (nameLower.includes('bangladeshi') || nameLower.includes('bangla')) {
        icon = Globe;
        subtitle = 'National & Regional Channels';
        colorClass = 'text-emerald-400';
        chevronHoverClass = 'group-hover:text-emerald-400';
      } else if (nameLower.includes('movie') || nameLower.includes('cinema')) {
        icon = Clapperboard;
        subtitle = 'HD Cinema & Blockbusters';
        colorClass = 'text-purple-400';
        chevronHoverClass = 'group-hover:text-purple-400';
      } else if (nameLower.includes('news')) {
        icon = Newspaper;
        subtitle = '24/7 Global & Regional Headlines';
        colorClass = 'text-rose-400';
        chevronHoverClass = 'group-hover:text-rose-400';
      } else if (nameLower.includes('sport')) {
        icon = Trophy;
        subtitle = 'Cricket, Football, F1 & Leagues';
        colorClass = 'text-emerald-400';
        chevronHoverClass = 'group-hover:text-emerald-400';
      } else if (nameLower.includes('kid') || nameLower.includes('cartoon')) {
        icon = Smile;
        subtitle = 'Animated Shows & Family Fun';
        colorClass = 'text-amber-400';
        chevronHoverClass = 'group-hover:text-amber-400';
      } else if (nameLower.includes('music')) {
        icon = Music2;
        subtitle = 'Hits, Videos & Live Concerts';
        colorClass = 'text-pink-400';
        chevronHoverClass = 'group-hover:text-pink-400';
      } else if (nameLower.includes('tv') || nameLower.includes('series') || nameLower.includes('entertainment')) {
        icon = Tv2;
        subtitle = 'Dramas, Reality & General TV';
        colorClass = 'text-sky-400';
        chevronHoverClass = 'group-hover:text-sky-400';
      } else if (nameLower.includes('indian') || nameLower.includes('hindi')) {
        icon = Tv2;
        subtitle = 'Hindi & Regional Networks';
        colorClass = 'text-blue-400';
        chevronHoverClass = 'group-hover:text-blue-400';
      } else if (nameLower.includes('docum') || nameLower.includes('nature') || nameLower.includes('discovery')) {
        icon = Compass;
        subtitle = 'Science, Wildlife & History';
        colorClass = 'text-teal-400';
        chevronHoverClass = 'group-hover:text-teal-400';
      } else if (nameLower.includes('relig') || nameLower.includes('islam') || nameLower.includes('spiritual')) {
        icon = Heart;
        subtitle = 'Spiritual & Quran Streams';
        colorClass = 'text-amber-400';
        chevronHoverClass = 'group-hover:text-amber-400';
      }

      list.push({
        name,
        count: channelList.length,
        icon,
        subtitle,
        colorClass,
        chevronHoverClass,
      });
    });

    const priorityOrder = remoteConfig.monthlyEvolution?.categoryPriorityOrder;
    if (priorityOrder && Array.isArray(priorityOrder) && priorityOrder.length > 0) {
      return list.sort((a, b) => {
        const idxA = priorityOrder.findIndex(p => a.name.toLowerCase().includes(p.toLowerCase()));
        const idxB = priorityOrder.findIndex(p => b.name.toLowerCase().includes(p.toLowerCase()));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return b.count - a.count;
      });
    }

    return list.sort((a, b) => b.count - a.count);
  }, [categoriesMap, remoteConfig.monthlyEvolution]);

  // Top 5 Spotlight Channels for Interactive Hero Stage
  const spotlightCandidates = useMemo(() => {
    if (countryFilteredChannels.length === 0) return [];
    const list: Channel[] = [];

    const overrideId = remoteConfig.featuredHero?.channelIdOverride;
    if (overrideId) {
      const match = countryFilteredChannels.find(
        c => c.id === overrideId || c.name.toLowerCase() === overrideId.toLowerCase()
      );
      if (match) list.push(match);
    }

    for (const ch of countryFilteredChannels) {
      if (list.length >= 5) break;
      if (!list.some(existing => existing.id === ch.id)) {
        list.push(ch);
      }
    }
    return list;
  }, [countryFilteredChannels, remoteConfig.featuredHero]);

  const featuredChannel =
    spotlightCandidates[heroIndex % Math.max(1, spotlightCandidates.length)] ||
    spotlightCandidates[0] ||
    null;

  const featuredPerf = featuredChannel ? performanceData?.[featuredChannel.id] : undefined;
  const featuredStatusMeta = getChannelStatusMeta(featuredPerf);

  // Recently watched channel objects
  const recentChannels = useMemo(() => {
    if (!watchHistory || watchHistory.length === 0) return [];
    const list: Channel[] = [];
    watchHistory.slice(0, 10).forEach(item => {
      const match = channels.find(
        c => (item.id && c.id === item.id) || c.name.toLowerCase() === item.name.toLowerCase()
      );
      if (match && !list.some(c => c.id === match.id)) {
        list.push(match);
      }
    });
    return list;
  }, [channels, watchHistory]);

  const activeRegionLabel =
    countryFilters.find(f => f.code === selectedCountryFilter)?.label || 'Global';

  /* -------------------------------------------------------------------------- */
  /*                            Sub-Views Handling                              */
  /* -------------------------------------------------------------------------- */

  if (searchQuery.trim().length > 0) {
    const searchResults = channels.filter(
      c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.category && c.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return (
      <ChannelGrid
        title={`Search Results for "${searchQuery}"`}
        channelsList={searchResults}
        setActiveView={setActiveView}
        onSelectChannel={onSelectChannel}
        favorites={favorites}
        setFavorites={setFavorites}
        performanceData={performanceData}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
        onOpenVipModal={onOpenVipModal}
      />
    );
  }

  if (activeView === 'live') {
    return (
      <ChannelGrid
        title={selectedCountryFilter === 'ALL' ? 'All Live IPTV Channels' : `${activeRegionLabel} Live Channels`}
        channelsList={countryFilteredChannels}
        setActiveView={setActiveView}
        onSelectChannel={onSelectChannel}
        favorites={favorites}
        setFavorites={setFavorites}
        performanceData={performanceData}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
        onOpenVipModal={onOpenVipModal}
        onResetFilters={selectedCountryFilter !== 'ALL' ? () => setSelectedCountryFilter('ALL') : undefined}
      />
    );
  }

  if (activeView === 'favorites') {
    const favoriteChannels = channels.filter(c => favorites.includes(c.id));
    return (
      <ChannelGrid
        title="Saved Favorite Channels"
        channelsList={favoriteChannels}
        setActiveView={setActiveView}
        onSelectChannel={onSelectChannel}
        favorites={favorites}
        setFavorites={setFavorites}
        performanceData={performanceData}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
        onOpenVipModal={onOpenVipModal}
      />
    );
  }

  if (activeView === 'categories') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-24 lg:pb-10">
        <motion.div
          key="categories"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
        >
          <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="w-10 h-10 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center text-white cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ChevronLeft strokeWidth={1.75} className="w-5 h-5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
            </button>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-white tracking-tight">
                Live Broadcast Categories
              </h2>
              <p className="text-xs text-[#C9D1E0]/85 mt-0.5 tabular-nums">
                Explore {channels.length.toLocaleString()} live channels by genre and regional broadcast network
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {dynamicCategories.map((cat, idx) => (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                aria-label={`Browse ${cat.name} channels`}
                onClick={() => setActiveView('category:' + cat.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('category:' + cat.name);
                  }
                }}
                className="nav-item flex items-center gap-3.5 p-4 bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] transition-colors motion-reduce:transition-none"
              >
                <cat.icon strokeWidth={1.75} className={`w-5 h-5 shrink-0 ${cat.colorClass}`} />
                <div className="min-w-0 flex-1">
                  <h3 title={cat.name} className="text-sm font-extrabold text-white group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors truncate">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-[#C9D1E0]/80 font-mono tabular-nums mt-0.5">
                    {cat.count.toLocaleString()} live channels
                  </p>
                </div>
                <ChevronRight
                  strokeWidth={1.75}
                  className={`w-4 h-4 text-[#C9D1E0]/60 ${cat.chevronHoverClass} group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-all shrink-0`}
                />
              </div>
            ))}

            <div
              role="button"
              tabIndex={0}
              aria-label="Browse Advertisement offers"
              onClick={() => setActiveView('category:Advertisement')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveView('category:Advertisement');
                }
              }}
              className="nav-item flex items-center gap-3.5 p-4 bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] transition-colors motion-reduce:transition-none"
            >
              <Megaphone strokeWidth={1.75} className="w-5 h-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <h3 title="Advertisement" className="text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors truncate">
                  Advertisement
                </h3>
                <p className="text-xs text-[#C9D1E0]/80 font-mono tabular-nums mt-0.5">
                  {ADVERTISEMENT_AFFILIATE_ZONES.length} featured offers
                </p>
              </div>
              <ChevronRight
                strokeWidth={1.75}
                className="w-4 h-4 text-[#C9D1E0]/60 group-hover:text-amber-400 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-all shrink-0"
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (activeView === 'category:Advertisement') {
    return (
      <AdvertisementCategoryView
        onBackHome={() => setActiveView('home')}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
        onOpenVipModal={onOpenVipModal}
      />
    );
  }

  if (activeView.startsWith('category:')) {
    const categoryName = activeView.split(':')[1] || 'General';
    const targetCat = categoryName.toLowerCase().trim();
    const categoryChannels = channels.filter(c => {
      const cCat = (c.category || 'General').toLowerCase().trim();
      if (cCat === targetCat) return true;
      if (targetCat === 'bangladeshi' && (cCat.includes('bangla') || cCat.includes('bd'))) return true;
      if (targetCat === 'sports' && (cCat.includes('sport') || cCat.includes('cricket') || cCat.includes('football') || cCat.includes('wc'))) return true;
      if (targetCat === 'movies' && (cCat.includes('movie') || cCat.includes('cinema') || cCat.includes('film'))) return true;
      if (targetCat === 'news' && cCat.includes('news')) return true;
      if (targetCat === 'entertainment' && (cCat.includes('entertain') || cCat.includes('drama') || cCat.includes('series'))) return true;
      if (targetCat === 'indian' && (cCat.includes('india') || cCat.includes('hindi'))) return true;
      if (targetCat === 'kids' && (cCat.includes('kid') || cCat.includes('cartoon') || cCat.includes('animat'))) return true;
      if (targetCat === 'music' && (cCat.includes('music') || cCat.includes('song'))) return true;
      if (targetCat === 'religious' && (cCat.includes('relig') || cCat.includes('islam') || cCat.includes('spirit'))) return true;
      if (targetCat === 'documentary' && (cCat.includes('docum') || cCat.includes('nature') || cCat.includes('discove'))) return true;
      return false;
    });

    return (
      <ChannelGrid
        title={`${categoryName} Channels`}
        channelsList={categoryChannels.length > 0 ? categoryChannels : channels.filter(c => (c.category || '').toLowerCase().includes(targetCat))}
        setActiveView={setActiveView}
        onSelectChannel={onSelectChannel}
        favorites={favorites}
        setFavorites={setFavorites}
        performanceData={performanceData}
        adFreeState={adFreeState}
        onRewardedGranted={onRewardedGranted}
        onOpenVipModal={onOpenVipModal}
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                            Main Default Home View                          */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* 1. Minimal Borderless Genre & Region Toolbar */}
      <div className="bg-[var(--theme-surface,#0E131F)]/80 backdrop-blur-md border-b border-white/[0.05] px-4 lg:px-8 py-2 shrink-0">
        <div className="max-w-[1720px] mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-2">
          {/* Left: Clean Borderless Genre Links */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer bg-[var(--theme-accent,#38BDF8)]/15 text-white motion-reduce:transition-none"
            >
              <Flame strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${theme.accentTextClass}`} />
              <span>Spotlight</span>
            </button>

            {dynamicCategories.slice(0, 6).map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  tabIndex={0}
                  onClick={() => setActiveView('category:' + cat.name)}
                  className="nav-item min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#C9D1E0]/85 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer motion-reduce:transition-none"
                >
                  <Icon strokeWidth={1.75} className={`w-3.5 h-3.5 shrink-0 ${cat.colorClass}`} />
                  <span>{cat.name}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActiveView('category:Advertisement')}
              className="nav-item min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer motion-reduce:transition-none"
            >
              <Megaphone strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Advertisement</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('categories')}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#C9D1E0]/85 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0 flex items-center gap-1 cursor-pointer motion-reduce:transition-none"
            >
              <span>All Genres</span>
              <ChevronRight strokeWidth={1.75} className={`w-3.5 h-3.5 shrink-0 ${theme.accentTextClass}`} />
            </button>
          </div>

          {/* Right: Borderless Regional Switcher */}
          <div
            role="group"
            aria-label="Filter channels by region"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0"
          >
            {countryFilters.map(c => {
              const isSelected = selectedCountryFilter === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedCountryFilter(c.code);
                    setHeroIndex(0);
                  }}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer motion-reduce:transition-none ${
                    isSelected
                      ? 'bg-white/[0.12] text-white'
                      : 'text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Main Home Content Scroll Area */}
      <div ref={mainHomeScrollRef} className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-24 lg:pb-10">
        <motion.div
          key="home-main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="max-w-[1720px] mx-auto p-3.5 sm:p-6 lg:p-8 space-y-6 sm:space-y-8"
        >
          {/* Section A: Streamlined Borderless Hero Spotlight */}
          {featuredChannel && remoteConfig.uiSpacing?.heroSpotlightEnabled !== false && (
            <section className="relative rounded-2xl overflow-hidden bg-[var(--theme-surface,#0E131F)]/90 p-5 sm:p-7 lg:p-9">
              {/* Clean Architectural Radial Spotlight Backdrop */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 65% 80% at 88% 18%, var(--theme-radial-1, rgba(56,189,248,0.12)), transparent 70%), radial-gradient(ellipse 50% 60% at 10% 90%, var(--theme-radial-2, rgba(16,185,129,0.06)), transparent 70%)'
                }}
              />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
                {/* Left: Hero Broadcast Headline & Two Focused Actions */}
                <div className="lg:col-span-7 flex flex-col justify-between gap-5">
                  <div className="space-y-3.5 sm:space-y-4">
                    {/* Unboxed Metadata Line */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Radio strokeWidth={1.75} className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{remoteConfig.featuredHero?.badgeText || 'Featured Live Broadcast'}</span>
                      </span>
                      <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
                      <span className={theme.accentTextClass}>
                        {featuredChannel.category || 'Live Television'}
                      </span>
                      <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
                      <span className="text-[#E2E8F0] font-mono tabular-nums">
                        {countryFilteredChannels.length.toLocaleString()} {activeRegionLabel === 'Global' ? 'Channels' : activeRegionLabel}
                      </span>
                    </div>

                    <h1 className="font-display text-2xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.08]">
                      <span className="text-highlight-luminous">
                        {featuredChannel.name}
                      </span>
                    </h1>

                    <p className="text-[#C9D1E0]/90 text-sm sm:text-[15px] line-clamp-2 max-w-2xl leading-relaxed font-medium">
                      {featuredChannel.currentProgram
                        ? `Now Broadcasting: ${featuredChannel.currentProgram}${featuredChannel.nextProgram ? ` · Up Next: ${featuredChannel.nextProgram}` : ''}`
                        : (remoteConfig.featuredHero?.customSubtitle || 'Stream high-definition live sports, national television, and global cinema networks with adaptive playback.')}
                    </p>

                    {/* Clean 2-Button Hero Action Pair */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectChannel(featuredChannel, countryFilteredChannels)}
                        className="min-h-[44px] px-6 py-3 rounded-xl btn-premium-primary font-extrabold text-sm flex items-center gap-2 cursor-pointer motion-reduce:transition-none"
                      >
                        <Play strokeWidth={1.75} className="w-4 h-4 fill-white shrink-0" />
                        <span>Watch Live</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const isFav = favorites.includes(featuredChannel.id);
                          if (isFav) {
                            setFavorites(favorites.filter(id => id !== featuredChannel.id));
                          } else {
                            setFavorites([...favorites, featuredChannel.id]);
                          }
                        }}
                        className="min-h-[44px] px-4 py-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] font-bold text-sm text-white flex items-center gap-2 cursor-pointer transition-colors motion-reduce:transition-none"
                      >
                        <Bookmark
                          strokeWidth={1.75}
                          className={`w-4 h-4 shrink-0 ${favorites.includes(featuredChannel.id) ? 'fill-amber-400 text-amber-400' : 'text-[#C9D1E0]'}`}
                        />
                        <span>{favorites.includes(featuredChannel.id) ? 'Saved' : 'Save'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Borderless 5-Channel Spotlight Switcher Strip */}
                  {spotlightCandidates.length > 1 && (
                    <div className="pt-3 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {spotlightCandidates.map((cand, idx) => {
                        const isCurrent = cand.id === featuredChannel.id;
                        return (
                          <button
                            key={cand.id}
                            type="button"
                            aria-pressed={isCurrent}
                            onClick={() => setHeroIndex(idx)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-left flex items-center gap-2 shrink-0 transition-colors cursor-pointer motion-reduce:transition-none ${
                              isCurrent
                                ? 'bg-white/[0.11] text-white'
                                : 'text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.05]'
                            }`}
                          >
                            <span className={`font-mono tabular-nums text-[10px] font-bold ${isCurrent ? theme.accentTextClass : 'text-[#C9D1E0]/60'}`}>
                              0{idx + 1}
                            </span>
                            <span className="text-xs font-bold truncate max-w-[120px]">
                              {cand.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Borderless Full-Height Broadcast Preview Stage */}
                <div className="lg:col-span-5 flex items-stretch">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Play ${featuredChannel.name} live stream`}
                    onClick={() => onSelectChannel(featuredChannel, countryFilteredChannels)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectChannel(featuredChannel, countryFilteredChannels);
                      }
                    }}
                    className="channel-item w-full rounded-xl bg-black/25 hover:bg-black/35 p-4 sm:p-5 flex flex-col justify-between gap-3 relative cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <Radio strokeWidth={1.75} className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        LIVE
                      </span>
                      <span className={`font-semibold ${featuredStatusMeta.isOffline ? 'text-amber-400' : theme.accentTextClass}`}>
                        {featuredStatusMeta.label === 'HD' ? 'Adaptive HD' : `${featuredStatusMeta.label} Verified`}
                      </span>
                    </div>

                    <div className="flex-1 flex items-center justify-center my-1">
                      <ChannelThumbnail
                        channel={featuredChannel}
                        variant="hero"
                        borderless={true}
                        showHoverPlay={true}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs pt-2 border-t border-white/[0.06]">
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{featuredChannel.name}</div>
                        <div className="text-[11px] text-[#C9D1E0]/80 truncate">
                          {featuredChannel.currentProgram || featuredChannel.category || '24/7 Live Channel'}
                        </div>
                      </div>
                      <span className={`font-extrabold shrink-0 flex items-center gap-1 ${theme.accentTextClass}`}>
                        <span>Play</span>
                        <ArrowRight strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Native High-CPM Sponsor Banner & Live 1h VIP Unlock Unit */}
          <AdBannerUnit
            placement="home-top"
            adFreeState={adFreeState || getStoredAdFreeState()}
            onRewardedGranted={onRewardedGranted}
            onOpenVipModal={onOpenVipModal}
          />

          {/* Section B: Continue Watching / Recent Channels */}
          {recentChannels.length > 0 && remoteConfig.uiSpacing?.recentWatchRowEnabled !== false && (
            <HorizontalCategoryRow
              categoryName="Recently Watched"
              subtitle="Instant resume for your recently streamed live channels"
              categoryIcon={Play}
              channelsList={recentChannels}
              onSelectChannel={onSelectChannel}
              setActiveView={setActiveView}
              performanceData={performanceData}
              actionButton={
                onClearWatchHistory ? (
                  <button
                    type="button"
                    onClick={onClearWatchHistory}
                    className="min-h-[36px] text-xs font-semibold text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors motion-reduce:transition-none"
                    title="Clear your watch history"
                  >
                    <Trash2 strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0" />
                    <span>Clear</span>
                  </button>
                ) : null
              }
            />
          )}

          {/* Section B.2: Borderless Search History Strip */}
          {searchHistory && searchHistory.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${theme.accentTextClass}`} />
                  <h3 className="font-display text-sm font-extrabold text-white tracking-tight">
                    Recent Searches
                  </h3>
                </div>

                {onClearSearchHistory && (
                  <button
                    type="button"
                    onClick={onClearSearchHistory}
                    className="min-h-[34px] text-xs font-semibold text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap transition-colors motion-reduce:transition-none"
                    title="Clear your search history"
                  >
                    <Trash2 strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {searchHistory.map((item, idx) => {
                  const queryText = typeof item === 'string' ? item : item.query;
                  if (!queryText) return null;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (setSearchQuery) setSearchQuery(queryText);
                        setActiveView('search');
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#C9D1E0] hover:text-white bg-white/[0.05] hover:bg-white/[0.11] flex items-center gap-1.5 transition-colors cursor-pointer motion-reduce:transition-none"
                    >
                      <Search strokeWidth={1.75} className={`w-3.5 h-3.5 shrink-0 ${theme.accentTextClass}`} />
                      <span>{queryText}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section C: Curated Category Rails */}
          {dynamicCategories.slice(0, 5).map(cat => {
            const catChannels = categoriesMap.get(cat.name) || [];
            if (catChannels.length === 0) return null;

            return (
              <HorizontalCategoryRow
                key={cat.name}
                categoryName={cat.name}
                subtitle={cat.subtitle}
                categoryIcon={cat.icon}
                channelsList={catChannels}
                onSelectChannel={onSelectChannel}
                setActiveView={setActiveView}
                performanceData={performanceData}
              />
            );
          })}

          {/* Section D: Personalized Recommendations */}
          <AiPersonalizedRecommendations
            channels={channels}
            onSelectChannel={onSelectChannel}
            favorites={favorites}
            setFavorites={setFavorites}
            watchHistory={watchHistory}
            searchHistory={searchHistory}
            performanceData={performanceData}
            onOpenAiChat={onOpenAiChat}
          />

          {/* Section E: Full Catalog Preview Grid */}
          <section className="space-y-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-black text-white tracking-tight">
                  Complete Live Directory
                </h2>
                <p className="text-xs text-[#C9D1E0]/80 tabular-nums">
                  {countryFilteredChannels.length.toLocaleString()} live sports, news, and entertainment broadcasts
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveView('live')}
                className="min-h-[36px] text-xs font-bold text-[#C9D1E0] hover:text-white hover:bg-white/[0.06] flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
              >
                <span>View all</span>
                <ChevronRight strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${theme.accentTextClass}`} />
              </button>
            </div>

            {countryFilteredChannels.length === 0 ? (
              <div className="py-12 px-6 text-center text-[#C9D1E0] bg-[var(--theme-surface,#0E131F)]/70 rounded-2xl space-y-3">
                <p className="font-display font-bold text-base text-white">
                  No channels indexed for {activeRegionLabel}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedCountryFilter('ALL')}
                  className="min-h-[42px] px-5 py-2 rounded-xl btn-premium-primary text-xs font-extrabold cursor-pointer motion-reduce:transition-none"
                >
                  Show All Global Channels
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3.5 sm:gap-4">
                  {countryFilteredChannels.slice(0, 21).map((channel, idx) => {
                    const isFav = favorites.includes(channel.id);
                    const statusMeta = getChannelStatusMeta(performanceData?.[channel.id]);

                    return (
                      <div
                        key={channel.id}
                        onClick={() => onSelectChannel(channel, countryFilteredChannels)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectChannel(channel, countryFilteredChannels);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Watch ${channel.name}`}
                        className="channel-item group relative bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] flex flex-col justify-between transition-colors motion-reduce:transition-none"
                      >
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums">
                            <span className={`${theme.accentTextClass} font-bold`}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
                            <span className={statusMeta.isOffline ? 'text-amber-400/90 font-semibold' : 'text-emerald-400 font-semibold'}>
                              {statusMeta.label}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isFav) {
                                setFavorites(favorites.filter(id => id !== channel.id));
                              } else {
                                setFavorites([...favorites, channel.id]);
                              }
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#C9D1E0]/75 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 motion-reduce:transition-none"
                            title={isFav ? 'Remove Favorite' : 'Save Channel'}
                            aria-label={isFav ? `Remove ${channel.name} from favorites` : `Save ${channel.name} to favorites`}
                          >
                            <Bookmark strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                        </div>

                        <ChannelThumbnail
                          channel={channel}
                          variant="grid"
                          borderless={true}
                          showHoverPlay={true}
                        />

                        <div className="mt-2.5 space-y-0.5">
                          <h4 title={channel.name} className="text-xs sm:text-[13px] font-extrabold text-white group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors truncate">
                            {channel.name}
                          </h4>
                          <p className="text-[11px] text-[#C9D1E0]/80 truncate font-medium">
                            {channel.category || 'Live IPTV'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setActiveView('live')}
                    className="min-h-[44px] px-6 py-3 rounded-xl btn-premium-primary text-xs font-extrabold flex items-center gap-2 cursor-pointer tabular-nums motion-reduce:transition-none"
                  >
                    <span>Browse All {countryFilteredChannels.length.toLocaleString()} Channels</span>
                    <ArrowRight strokeWidth={1.75} className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Section F: Borderless Interactive Browse by Genre */}
          {dynamicCategories.length > 0 && (
            <section className="space-y-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight">
                    Browse by Genre
                  </h2>
                  <p className="text-xs text-[#C9D1E0]/80">
                    Jump into live sports, regional networks, cinema, and 24/7 news
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('categories')}
                  className="min-h-[36px] text-xs font-bold text-[#C9D1E0] hover:text-white hover:bg-white/[0.06] flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
                >
                  <span>All categories</span>
                  <ChevronRight strokeWidth={1.75} className={`w-4 h-4 shrink-0 ${theme.accentTextClass}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {dynamicCategories.slice(0, 8).map((cat, idx) => {
                  const Icon = cat.icon;
                  return (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${cat.name} category`}
                      onClick={() => setActiveView('category:' + cat.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveView('category:' + cat.name);
                        }
                      }}
                      className="nav-item bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-4 flex items-center gap-3.5 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] transition-colors motion-reduce:transition-none"
                    >
                      <Icon strokeWidth={1.75} className={`w-5 h-5 shrink-0 ${cat.colorClass}`} />
                      <div className="min-w-0 flex-1">
                        <h3 title={cat.name} className="text-xs sm:text-sm font-extrabold text-white group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors truncate">
                          {cat.name}
                        </h3>
                        <p className="text-[11px] text-[#C9D1E0]/80 font-mono tabular-nums mt-0.5 truncate">
                          {cat.count.toLocaleString()} live
                        </p>
                      </div>
                      <ChevronRight
                        strokeWidth={1.75}
                        className={`w-4 h-4 text-[#C9D1E0]/55 ${cat.chevronHoverClass} group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-all shrink-0`}
                      />
                    </div>
                  );
                })}

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Open Advertisement category"
                  onClick={() => setActiveView('category:Advertisement')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveView('category:Advertisement');
                    }
                  }}
                  className="nav-item bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-4 flex items-center gap-3.5 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] transition-colors motion-reduce:transition-none"
                >
                  <Megaphone strokeWidth={1.75} className="w-5 h-5 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <h3 title="Advertisement" className="text-xs sm:text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors truncate">
                      Advertisement
                    </h3>
                    <p className="text-[11px] text-[#C9D1E0]/80 font-mono tabular-nums mt-0.5 truncate">
                      {ADVERTISEMENT_AFFILIATE_ZONES.length} affiliate offers
                    </p>
                  </div>
                  <ChevronRight
                    strokeWidth={1.75}
                    className="w-4 h-4 text-[#C9D1E0]/55 group-hover:text-amber-400 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-all shrink-0"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Section G: Automated Annual Copyright & Compliance Policy Footer */}
          <footer className="mt-8 pt-6 pb-6 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#C9D1E0]">
            <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
              <span className="font-mono text-white font-semibold">
                {backendPolicy?.copyrightNotice || `Copyright © 2024–${new Date().getFullYear()} M R S IPTV. All rights reserved.`}
              </span>
              <span className="hidden sm:inline text-white/25" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--theme-accent,#38BDF8)]">
                <ShieldCheck strokeWidth={1.75} className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Annual Policy Auto-Renewed · v{backendPolicy?.policyVersion || 'LTS'}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 font-semibold text-[11px]">
              <button
                type="button"
                onClick={() => { setLegalTab('terms'); setIsLegalModalOpen(true); }}
                className="min-h-[38px] px-2.5 inline-flex items-center rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
              >
                Terms & Fair Use
              </button>
              <span className="text-white/20" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => { setLegalTab('dmca'); setIsLegalModalOpen(true); }}
                className="min-h-[38px] px-2.5 inline-flex items-center rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
              >
                DMCA Notice
              </button>
              <span className="text-white/20" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => { setLegalTab('vip'); setIsLegalModalOpen(true); }}
                className="min-h-[38px] px-2.5 inline-flex items-center rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
              >
                Single-Device Policy
              </button>
              <span className="text-white/20" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => { setLegalTab('privacy'); setIsLegalModalOpen(true); }}
                className="min-h-[38px] px-2.5 inline-flex items-center rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
              >
                Privacy
              </button>
            </div>
          </footer>
        </motion.div>
      </div>

      {/* Dynamic Legal & Policy Modal */}
      <LegalPolicyModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalTab}
      />
    </div>
  );
};
