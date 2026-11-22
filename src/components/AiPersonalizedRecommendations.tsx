import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Channel } from '../types';
import { ChannelThumbnail } from './ChannelThumbnail';
import { Sparkles, Bookmark, Radio } from 'lucide-react';
import { useBroadcastTheme } from '../lib/themeSystem';
import { usePassiveTouchScroll } from '../hooks/usePassiveTouchScroll';

interface AiPersonalizedRecommendationsProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel, contextChannels?: Channel[]) => void;
  favorites: string[];
  setFavorites: (favorites: string[]) => void;
  watchHistory: { id?: string; name: string; category?: string; count?: number; watchedAt?: number }[];
  searchHistory: (string | { query: string; searchedAt?: number })[];
  performanceData?: Record<string, { status: 'live' | 'offline'; latency: number; lastChecked: number }>;
  onOpenAiChat?: () => void;
}

interface AiRecommendResult {
  insight: string;
  topGenres: string[];
  recommendations: (Channel & { matchRate?: string; aiReason?: string })[];
}

export const AiPersonalizedRecommendations: React.FC<AiPersonalizedRecommendationsProps> = ({
  channels,
  onSelectChannel,
  favorites,
  setFavorites,
  watchHistory,
  searchHistory,
  performanceData,
}) => {
  const [, setLoading] = useState<boolean>(false);
  const [aiData, setAiData] = useState<AiRecommendResult | null>(null);
  const { theme } = useBroadcastTheme();
  const railRef = useRef<HTMLDivElement>(null);
  usePassiveTouchScroll(railRef);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/recommend-personalized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchHistory,
          searchHistory,
          favorites
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAiData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch stream recommendations', e);
    } finally {
      setLoading(false);
    }
  }, [watchHistory, searchHistory, favorites]);

  useEffect(() => {
    fetchRecommendations();
  }, [watchHistory.length, searchHistory.length, fetchRecommendations]);

  const recommendedList: (Channel & { matchRate?: string; aiReason?: string })[] =
    aiData?.recommendations && aiData.recommendations.length > 0
      ? aiData.recommendations
      : channels.slice(0, 10);

  if (!recommendedList || recommendedList.length === 0) return null;

  return (
    <section className="space-y-3.5 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles strokeWidth={1.75} className={`w-5 h-5 shrink-0 ${theme.accentTextClass}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
                Curated For You
              </h2>
              <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
              <span className={`text-xs font-mono tabular-nums font-bold shrink-0 ${theme.accentTextClass}`}>
                {recommendedList.length} Picks
              </span>
            </div>
            <p className="text-xs text-[#C9D1E0]/80 truncate">
              {aiData?.insight || 'Personalized live streams tailored to your viewing activity'}
            </p>
          </div>
        </div>
      </div>

      <div
        ref={railRef}
        className="flex items-stretch gap-3.5 overflow-x-auto custom-scrollbar scroll-horizontal-hardware pb-2.5 pt-0.5 snap-x"
      >
        {recommendedList.map((channel, idx) => {
          const isFav = favorites.includes(channel.id);
          const perf = performanceData?.[channel.id];
          const isOffline = perf?.status === 'offline';
          const hasMeasuredLatency = Boolean(perf && typeof perf.latency === 'number' && perf.latency > 0 && !isOffline);

          return (
            <div
              key={channel.id}
              tabIndex={0}
              role="button"
              aria-label={`Watch ${channel.name}`}
              onClick={() => onSelectChannel(channel, recommendedList)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectChannel(channel, recommendedList);
                }
              }}
              className="channel-item w-[172px] sm:w-[196px] shrink-0 bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg,#070A11)] group flex flex-col justify-between transition-colors motion-reduce:transition-none snap-start"
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums">
                  <span className={`font-bold ${theme.accentTextClass}`}>
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[#C9D1E0]/40" aria-hidden="true">·</span>
                  <span className={`font-semibold flex items-center gap-1 ${isOffline ? 'text-amber-400/90' : 'text-emerald-400'}`}>
                    <Radio strokeWidth={1.75} className="w-2.5 h-2.5 shrink-0" />
                    {isOffline ? 'Busy' : hasMeasuredLatency ? `${perf!.latency}ms` : 'LIVE'}
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
                  title={isFav ? 'Remove Favorite' : 'Save Favorite'}
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
                <h5 title={channel.name} className="text-xs sm:text-[13px] font-extrabold text-white truncate group-hover:text-[var(--theme-accent,#38BDF8)] transition-colors">
                  {channel.name}
                </h5>
                <p className="text-[11px] text-[#C9D1E0]/80 truncate font-medium">
                  {channel.aiReason || channel.category || 'Live IPTV'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
