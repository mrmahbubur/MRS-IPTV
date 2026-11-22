import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Star, Radio, Grid, LayoutList, Play,
  Trophy, Globe, Film, Newspaper, Tv2, Smile, Compass, Music, Clock
} from 'lucide-react';
import { Channel } from '../types';
import { ChannelThumbnail } from './ChannelThumbnail';

interface TvGuideSheetProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannel: Channel;
  onSelectChannel: (channel: Channel) => void;
  favorites: string[];
  onToggleFavorite: (channelId: string, e: React.MouseEvent) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Channels', icon: Grid },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'bangla', label: 'Bangladeshi', icon: Globe },
  { id: 'sports', label: 'Live Sports', icon: Trophy },
  { id: 'news', label: 'Live News', icon: Newspaper },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'kids', label: 'Kids & Cartoons', icon: Smile },
  { id: 'entertainment', label: 'Entertainment', icon: Tv2 },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'documentary', label: 'Documentary', icon: Compass }
];

const LIST_ROW_HEIGHT = 68;
const GRID_ROW_HEIGHT = 76;
const OVERSCAN = 6;

function formatSlotTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export const TvGuideSheet: React.FC<TvGuideSheetProps> = ({
  isOpen,
  onClose,
  channels,
  currentChannel,
  onSelectChannel,
  favorites,
  onToggleFavorite
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Window virtualization state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  // Live clock tick every 30s for EPG 'NOW' line
  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    if (!isOpen) return;
    setNowDate(new Date());
    const id = setInterval(() => setNowDate(new Date()), 30000);
    return () => clearInterval(id);
  }, [isOpen]);

  // 200ms debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setScrollTop(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Track scroll container height for window virtualization
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isOpen) return;
    const measure = () => setViewportHeight(el.clientHeight || 480);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [isOpen, viewMode]);

  const filteredChannels = useMemo(() => {
    let list = channels;

    if (selectedCategory === 'favorites') {
      list = list.filter(c => favorites.includes(c.id));
    } else if (selectedCategory !== 'all') {
      const catKey = selectedCategory.toLowerCase();
      list = list.filter(c => {
        const cat = (c.category || '').toLowerCase();
        if (catKey === 'bangla') return cat.includes('bangla');
        if (catKey === 'sports') return cat.includes('sport') || cat.includes('wc event');
        if (catKey === 'news') return cat.includes('news');
        if (catKey === 'movies') return cat.includes('movie') || cat.includes('cinema');
        if (catKey === 'kids') return cat.includes('kid') || cat.includes('cartoon');
        if (catKey === 'entertainment') return cat.includes('entertain');
        if (catKey === 'music') return cat.includes('music');
        if (catKey === 'documentary') return cat.includes('docum');
        return cat.includes(catKey);
      });
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q) ||
        (c.currentProgram || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [channels, selectedCategory, favorites, debouncedSearch]);

  // EPG Time slots (4 x 30-minute slots anchored to current half-hour)
  const epgTimeSlots = useMemo(() => {
    const base = new Date(nowDate);
    const mins = base.getMinutes();
    base.setMinutes(mins < 30 ? 0 : 30, 0, 0);
    return [0, 30, 60, 90].map(offset => {
      const slotStart = new Date(base.getTime() + offset * 60000);
      return {
        label: formatSlotTime(slotStart),
        startMs: slotStart.getTime()
      };
    });
  }, [nowDate]);

  // Exact percentage of "NOW" within the 2-hour (120-min) EPG window
  const nowIndicatorPercent = useMemo(() => {
    if (!epgTimeSlots.length) return 10;
    const elapsedMin = Math.max(0, Math.min(120, (nowDate.getTime() - epgTimeSlots[0].startMs) / 60000));
    return (elapsedMin / 120) * 100;
  }, [epgTimeSlots, nowDate]);

  const rowHeight = viewMode === 'list' ? LIST_ROW_HEIGHT : GRID_ROW_HEIGHT;
  const totalHeight = filteredChannels.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endIndex = Math.min(
    filteredChannels.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN
  );
  const virtualSlice = useMemo(
    () => filteredChannels.slice(startIndex, endIndex),
    [filteredChannels, startIndex, endIndex]
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[115] flex items-end justify-center bg-black/80 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full h-[85vh] rounded-t-[20px] bg-[rgba(12,18,40,0.96)] border-t border-white/10 backdrop-blur-3xl flex flex-col overflow-hidden text-white font-sans shadow-[0_-20px_50px_rgba(0,0,0,0.9)] midnight-glass-noise"
        >
          {/* Drag Handle Indicator */}
          <button
            type="button"
            aria-label="Drag handle to close TV Guide"
            onClick={onClose}
            className="w-12 h-1.5 rounded-full bg-white/25 mx-auto my-2 shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5B301]"
          />

          {/* Header */}
          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#F5B301]/15 text-[#F5B301] border border-[#F5B301]/40">
                <Radio className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>TV Guide</span>
                  <span className="text-[10px] font-mono text-[#F5B301] font-bold">
                    ({filteredChannels.length.toLocaleString()} Channels)
                  </span>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={viewMode === 'list' ? 'Switch to EPG Timeline Grid view' : 'Switch to Compact List view'}
                onClick={() => {
                  setViewMode(prev => prev === 'list' ? 'grid' : 'list');
                  setScrollTop(0);
                  if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                }}
                className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold flex items-center gap-1.5 text-white/85 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                title="Toggle EPG Grid / List"
              >
                {viewMode === 'list' ? (
                  <>
                    <Grid className="w-4 h-4 text-[#22B8F0] shrink-0" />
                    <span className="hidden sm:inline">EPG Grid</span>
                  </>
                ) : (
                  <>
                    <LayoutList className="w-4 h-4 text-[#F5B301] shrink-0" />
                    <span className="hidden sm:inline">List View</span>
                  </>
                )}
              </button>

              <button
                type="button"
                aria-label="Close TV Guide"
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5 shrink-0" />
              </button>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="p-3 border-b border-white/5 bg-[#080D20] shrink-0 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search live channels or programs"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search ${channels.length > 0 ? channels.length.toLocaleString() : '8,890'}+ live channels, sports or genres...`}
                className="w-full h-10 pl-9 pr-10 bg-white/[0.05] border border-white/10 rounded-lg text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#F5B301]"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Clear search query"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              )}
            </div>

            {/* Category Chips Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((cat) => {
                const IconComp = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-label={`Filter by ${cat.label}`}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setScrollTop(0);
                      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                    }}
                    className={`h-9 px-3.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#F5B301] text-[#050816] shadow-[0_0_12px_rgba(245,179,1,0.3)]'
                        : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#050816]' : 'text-[#F5B301]'}`} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* EPG Timeline Header (Only shown in Grid Mode) */}
          {viewMode === 'grid' && channels.length > 0 && (
            <div className="flex items-stretch border-b border-white/10 bg-[#070C1E] shrink-0 text-[10px] font-mono">
              <div className="w-40 sm:w-52 px-3 py-2 border-r border-white/10 text-[#F5B301] font-bold uppercase flex items-center gap-1.5 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>Channel · Now</span>
              </div>
              <div className="flex-1 grid grid-cols-4 relative">
                {epgTimeSlots.map((slot, i) => (
                  <div
                    key={slot.label}
                    className={`px-2.5 py-2 border-r border-white/5 font-bold ${
                      i === 0 ? 'text-white bg-[#F5B301]/10' : 'text-white/60'
                    }`}
                  >
                    {slot.label}
                  </div>
                ))}
                {/* Live crimson NOW marker header badge */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#FF3B4E] pointer-events-none z-10"
                  style={{ left: `${nowIndicatorPercent}%` }}
                >
                  <span className="absolute top-0.5 -translate-x-1/2 px-1 py-0.2 rounded bg-[#FF3B4E] text-[8px] font-black text-white">
                    NOW
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Virtualized Channel Content View (List or EPG Timeline Grid) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto custom-scrollbar bg-[#050816]/80 relative"
          >
            {channels.length === 0 ? (
              /* Shimmer Loading Skeleton when catalog is still hydrating */
              <div className="p-3 space-y-2" aria-label="Loading channels">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[60px] rounded-[12px] bg-white/[0.03] border border-white/5 p-2.5 flex items-center gap-3 animate-pulse"
                  >
                    <div className="w-9 h-5 rounded bg-white/10 shrink-0" />
                    <div className="w-12 h-8 rounded bg-white/10 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-44 rounded bg-white/10" />
                      <div className="h-2.5 w-28 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-white/50">
                <Radio className="w-8 h-8 text-white/20 mb-2" />
                <p className="text-xs">No channels found matching &ldquo;{debouncedSearch}&rdquo;</p>
              </div>
            ) : (
              /* Windowed Virtual Container */
              <div
                className="relative w-full"
                style={{ height: `${totalHeight}px` }}
              >
                <div
                  className="absolute inset-x-0 top-0 p-2 sm:p-3 space-y-1.5"
                  style={{ transform: `translateY(${startIndex * rowHeight}px)` }}
                >
                  {viewMode === 'list'
                    ? virtualSlice.map((ch, offset) => {
                        const actualIdx = startIndex + offset;
                        const isActive = ch.id === currentChannel.id || ch.name === currentChannel.name;
                        const isFav = favorites.includes(ch.id);

                        return (
                          <div
                            key={`${ch.id}-${actualIdx}`}
                            style={{ height: `${LIST_ROW_HEIGHT - 6}px` }}
                            onClick={() => {
                              onSelectChannel(ch);
                              onClose();
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectChannel(ch);
                                onClose();
                              }
                            }}
                            aria-label={`Tune to channel ${actualIdx + 1}: ${ch.name}`}
                            className={`w-full px-2.5 py-2 rounded-[12px] flex items-center justify-between text-left transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-[#F5B301] ${
                              isActive
                                ? 'bg-[#F5B301]/15 border border-[#F5B301]/60 shadow-[0_0_16px_rgba(245,179,1,0.2)] border-l-4 border-l-[#F5B301]'
                                : 'bg-white/[0.03] hover:bg-white/[0.07] border border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                                  isActive
                                    ? 'bg-[#F5B301]/25 border-[#F5B301] text-[#F5B301]'
                                    : 'bg-black/40 border-white/10 text-white/60'
                                }`}
                              >
                                {String(actualIdx + 1).padStart(3, '0')}
                              </span>

                              <ChannelThumbnail channel={ch} variant="compact-list" />

                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-xs font-bold truncate transition-colors ${
                                    isActive ? 'text-[#F5B301]' : 'text-white group-hover:text-[#F5B301]'
                                  }`}
                                >
                                  {ch.name}
                                </p>
                                <p className="text-[10px] text-white/55 truncate flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[#22B8F0]">{ch.category || 'Live TV'}</span>
                                  <span>·</span>
                                  <span className="truncate">
                                    {ch.currentProgram && ch.currentProgram !== 'No Program Found'
                                      ? ch.currentProgram
                                      : `${ch.name} Broadcast`}
                                  </span>
                                  <span>·</span>
                                  <span className="flex items-center gap-1 text-[#2ECC71] shrink-0">
                                    <Radio className="w-3 h-3 text-[#2ECC71] shrink-0" />
                                    LIVE
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <button
                                type="button"
                                aria-label={isFav ? `Remove ${ch.name} from favorites` : `Add ${ch.name} to favorites`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite(ch.id, e);
                                }}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0 ${
                                  isFav ? 'text-[#F5B301] bg-[#F5B301]/15' : 'text-white/50 hover:text-white hover:bg-white/10'
                                }`}
                                title={isFav ? 'Remove Favorite' : 'Save Favorite'}
                              >
                                <Star className={`w-4 h-4 shrink-0 ${isFav ? 'fill-[#F5B301]' : ''}`} />
                              </button>

                              {isActive ? (
                                <span className="px-2.5 h-9 rounded-lg bg-[#2ECC71]/20 border border-[#2ECC71]/50 text-[10px] font-mono font-bold text-[#2ECC71] flex items-center gap-1">
                                  PLAYING
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Play ${ch.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectChannel(ch);
                                    onClose();
                                  }}
                                  className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#F5B301] hover:text-[#050816] text-white/80 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                                >
                                  <Play className="w-4 h-4 fill-current shrink-0" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    : virtualSlice.map((ch, offset) => {
                        /* EPG Timeline Grid Row */
                        const actualIdx = startIndex + offset;
                        const isActive = ch.id === currentChannel.id || ch.name === currentChannel.name;
                        const isFav = favorites.includes(ch.id);
                        const nowTitle =
                          ch.currentProgram && ch.currentProgram !== 'No Program Found'
                            ? ch.currentProgram
                            : `${ch.name} • Live ${ch.category || 'TV'}`;
                        const nextTitle =
                          ch.nextProgram && ch.nextProgram !== 'No Program Found'
                            ? ch.nextProgram
                            : `Continuous ${ch.category || 'Live'} Feed`;

                        return (
                          <div
                            key={`epg-${ch.id}-${actualIdx}`}
                            style={{ height: `${GRID_ROW_HEIGHT - 6}px` }}
                            onClick={() => {
                              onSelectChannel(ch);
                              onClose();
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectChannel(ch);
                                onClose();
                              }
                            }}
                            aria-label={`Tune to EPG channel ${actualIdx + 1}: ${ch.name}`}
                            className={`w-full rounded-[12px] border flex items-stretch overflow-hidden transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-[#F5B301] ${
                              isActive
                                ? 'bg-[#F5B301]/15 border-[#F5B301]'
                                : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10'
                            }`}
                          >
                            {/* Sticky Left Channel Column */}
                            <div className="w-36 sm:w-48 px-2.5 py-2 border-r border-white/10 flex items-center gap-2 shrink-0 bg-[#070C1E]/85">
                              <span className="font-mono text-[9px] font-bold text-[#F5B301] w-7 shrink-0">
                                {String(actualIdx + 1).padStart(3, '0')}
                              </span>
                              <ChannelThumbnail channel={ch} variant="compact-list" />
                              <div className="min-w-0 flex-1">
                                <p className={`text-[11px] font-bold truncate ${isActive ? 'text-[#F5B301]' : 'text-white'}`}>
                                  {ch.name}
                                </p>
                                <span className="text-[9px] text-[#22B8F0] truncate block">
                                  {ch.category || 'Live TV'}
                                </span>
                              </div>
                              <button
                                type="button"
                                aria-label={isFav ? `Remove ${ch.name} from favorites` : `Add ${ch.name} to favorites`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite(ch.id, e);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-[#F5B301] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F5B301] cursor-pointer shrink-0"
                              >
                                <Star className={`w-4 h-4 shrink-0 ${isFav ? 'fill-[#F5B301] text-[#F5B301]' : ''}`} />
                              </button>
                            </div>

                            {/* EPG Timeline Programme Blocks + NOW Line */}
                            <div className="flex-1 grid grid-cols-4 relative">
                              <div className="col-span-2 p-2 border-r border-white/10 bg-white/[0.03] flex flex-col justify-center min-w-0">
                                <span className="text-[9px] font-mono text-[#2ECC71] font-bold uppercase flex items-center gap-1">
                                  <Radio className="w-3 h-3 text-[#2ECC71] shrink-0" />
                                  ON NOW · {epgTimeSlots[0]?.label}
                                </span>
                                <span className="text-[11px] font-bold text-white truncate mt-0.5">{nowTitle}</span>
                              </div>
                              <div className="col-span-2 p-2 flex flex-col justify-center min-w-0">
                                <span className="text-[9px] font-mono text-white/50 uppercase">
                                  UP NEXT · {epgTimeSlots[2]?.label}
                                </span>
                                <span className="text-[11px] text-white/75 truncate mt-0.5">{nextTitle}</span>
                              </div>

                              {/* Vertical Live Crimson 'NOW' Line */}
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-[#FF3B4E]/80 pointer-events-none"
                                style={{ left: `${nowIndicatorPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

