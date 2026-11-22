import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Channel } from '../types';
import { ChannelThumbnail } from './ChannelThumbnail';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Play, ChevronLeft, ChevronRight, Tv, Star } from 'lucide-react';

interface InPlayerMiniGuideProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannel: Channel;
  onSelectChannel: (channel: Channel) => void;
}

export const InPlayerMiniGuide: React.FC<InPlayerMiniGuideProps> = ({
  isOpen,
  onClose,
  channels = [],
  currentChannel,
  onSelectChannel
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shahintv_favorites') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleFavUpdate = () => {
      try {
        setFavorites(JSON.parse(localStorage.getItem('shahintv_favorites') || '[]'));
      } catch {}
    };
    window.addEventListener('shahintv_favorites_updated', handleFavUpdate);
    return () => window.removeEventListener('shahintv_favorites_updated', handleFavUpdate);
  }, []);

  const toggleFavorite = (channelId: string) => {
    const nextFavs = favorites.includes(channelId)
      ? favorites.filter(id => id !== channelId)
      : [...favorites, channelId];
    setFavorites(nextFavs);
    localStorage.setItem('shahintv_favorites', JSON.stringify(nextFavs));
    window.dispatchEvent(new CustomEvent('shahintv_favorites_updated', { detail: nextFavs }));
  };

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    channels.forEach(ch => {
      const cat = ch.category || 'General';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    return ['All', 'Favorites', ...sorted.slice(0, 10)];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    let list = channels;
    if (selectedCategory === 'Favorites') {
      list = list.filter(c => favorites.includes(c.id));
    } else if (selectedCategory !== 'All') {
      list = list.filter(c => (c.category || 'General').toLowerCase() === selectedCategory.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q)));
    }
    return list;
  }, [channels, selectedCategory, searchQuery, favorites]);

  useEffect(() => {
    if (focusedIndex >= 0 && cardRefs.current[focusedIndex]) {
      cardRefs.current[focusedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [focusedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredChannels.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (focusedIndex >= 0 && filteredChannels[focusedIndex]) {
          e.preventDefault();
          onSelectChannel(filteredChannels[focusedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, filteredChannels, onSelectChannel, onClose]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const amount = direction === 'left' ? -380 : 380;
      scrollContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const handlePreProbe = (ch: Channel) => {
    if (!ch || !ch.m3u8Url) return;
    try {
      fetch(`/api/stream/pre-probe?url=${encodeURIComponent(ch.m3u8Url)}&mode=auto`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      }).catch(() => {});
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-35 bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 35, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 35, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-16 sm:bottom-20 left-3 right-3 sm:left-8 sm:right-8 z-40 bg-[#0E1019]/96 backdrop-blur-3xl border border-amber-400/50 rounded-xl shadow-[0_10px_60px_rgba(0,0,0,0.95)] p-3 sm:p-4 text-white flex flex-col gap-2.5 pointer-events-auto max-w-5xl mx-auto select-none"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/45 flex items-center justify-center text-amber-400 shrink-0">
                <Tv className="w-4 h-4 shrink-0" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">Quick Channel Rail</span>
                <span className="text-[10px] font-mono tabular-nums text-amber-400 font-black">
                  · {filteredChannels.length.toLocaleString()} CHANNELS
                </span>
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative flex-1 max-w-xs hidden sm:block">
              <Search className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search quick channel rail"
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 bg-[#090A10] border border-amber-400/35 focus:border-amber-400 text-white placeholder-[#C9D1E0]/60 text-xs rounded-lg pl-9 pr-3 py-1.5 outline-none transition-all"
              />
            </div>

            {/* Close & Scroll Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                className="w-9 h-9 flex items-center justify-center rounded-lg player-ctrl-btn text-white transition-all cursor-pointer shrink-0"
                title="Scroll Left"
                aria-label="Scroll Quick Rail Left"
              >
                <ChevronLeft className="w-4 h-4 text-amber-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                className="w-9 h-9 flex items-center justify-center rounded-lg player-ctrl-btn text-white transition-all cursor-pointer shrink-0"
                title="Scroll Right"
                aria-label="Scroll Quick Rail Right"
              >
                <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 h-9 flex items-center justify-center gap-1.5 rounded-lg player-ctrl-btn-danger text-white text-xs font-bold transition-all ml-0.5 cursor-pointer shrink-0"
                title="Close Guide [Esc or G]"
              >
                <X className="w-4 h-4 text-rose-300 shrink-0" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>
          </div>

          {/* Category Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs shrink-0">
            {categories.map((cat) => {
              const isFavTab = cat === 'Favorites';
              const isSelected = selectedCategory === cat;
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 h-9 rounded-lg font-bold text-[11px] whitespace-nowrap transition-all uppercase tracking-wider shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'player-ctrl-btn-active text-white'
                      : 'player-ctrl-btn text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  {isFavTab && <Star className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'fill-amber-300 text-amber-300' : 'fill-amber-400 text-amber-400'}`} />}
                  <span>{cat}</span>
                  {isFavTab && (
                    <span className="text-[10px] font-mono tabular-nums text-amber-300 ml-0.5">
                      ({favorites.length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Channels Horizontal Rail */}
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar py-1 scroll-smooth"
          >
            {filteredChannels.length === 0 ? (
              <div className="py-8 w-full text-center text-xs text-[#C9D1E0]">
                {selectedCategory === 'Favorites' ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Star className="w-6 h-6 text-amber-400/70" />
                    <span>No favorite channels yet. Tap the star icon on any channel card to save it!</span>
                  </div>
                ) : (
                  <span>No channels match "{searchQuery}"</span>
                )}
              </div>
            ) : (
              filteredChannels.slice(0, 120).map((ch, idx) => {
                const isCurrent = ch.id === currentChannel.id;
                const isFocused = idx === focusedIndex;
                const isFav = favorites.includes(ch.id);

                return (
                  <div
                    key={ch.id}
                    ref={(el) => { cardRefs.current[idx] = el; }}
                    onClick={() => onSelectChannel(ch)}
                    onMouseEnter={() => {
                      setFocusedIndex(idx);
                      handlePreProbe(ch);
                    }}
                    className={`group relative flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 w-24 sm:w-28 h-28 sm:h-30 text-center select-none ${
                      isCurrent
                        ? 'sidebar-square-btn-active scale-100'
                        : isFocused
                        ? 'bg-[#1D2133] border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                        : 'sidebar-square-btn'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(ch.id);
                      }}
                      className={`absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                        isFav
                          ? 'bg-amber-500/20 text-amber-300 scale-105'
                          : 'opacity-0 group-hover:opacity-100 bg-black/60 text-[#C9D1E0] hover:text-white'
                      }`}
                      title={isFav ? 'Remove Favorite' : 'Add Favorite'}
                      aria-label={isFav ? `Remove ${ch.name} from favorites` : `Add ${ch.name} to favorites`}
                    >
                      <Star className={`w-3.5 h-3.5 shrink-0 ${isFav ? 'fill-amber-300' : ''}`} />
                    </button>

                    <span className="absolute top-1.5 left-1.5 text-[8px] font-mono font-bold text-amber-400">
                      #{idx + 1}
                    </span>

                    <div className="mt-1">
                      <ChannelThumbnail
                        channel={ch}
                        variant="compact-list"
                      />
                    </div>

                    <div className="w-full px-0.5">
                      <span className={`text-[10px] sm:text-[11px] font-bold block truncate leading-tight ${
                        isCurrent ? 'text-amber-300' : 'text-white group-hover:text-amber-300'
                      }`}>
                        {ch.name}
                      </span>
                      <span className="text-[8px] text-[#C9D1E0] truncate block mt-0.5">
                        {ch.category || 'Live'}
                      </span>
                    </div>

                    {isCurrent ? (
                      <span className="text-[8px] font-mono font-black uppercase tracking-wider text-emerald-400">
                        PLAYING
                      </span>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};
