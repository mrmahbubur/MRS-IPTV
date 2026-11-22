import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { getChannelLogo, getChannelFallbackLogo } from '../lib/channelLogos';

export interface ChannelThumbnailProps {
  channel: { id?: string; name: string; iconUrl?: string; category?: string };
  variant?: 'grid' | 'list' | 'compact-list' | 'hero';
  showHoverPlay?: boolean;
  borderless?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ChannelThumbnail
 * Ensures every channel thumbnail image fits its container cleanly in both List and Grid layouts:
 * - Full-bleed 16:9 SVG channel/event badges fill the stage 100% cleanly without inner gaps.
 * - Broadcast network logos (PNG/SVG) scale to fit (`w-full h-full object-contain`) with balanced optical breathing room.
 * - Automatic zero-broken-image fallback to `getChannelFallbackLogo`.
 */
export const ChannelThumbnail: React.FC<ChannelThumbnailProps> = ({
  channel,
  variant = 'grid',
  showHoverPlay = false,
  borderless = false,
  className = '',
  children
}) => {
  const primarySrc = getChannelLogo(channel);
  const [src, setSrc] = useState<string>(primarySrc);

  useEffect(() => {
    setSrc(getChannelLogo(channel));
  }, [channel.id, channel.name, channel.iconUrl, channel.category]);

  const isSvgCard = src.startsWith('data:image/svg+xml');

  const sizeClasses = {
    grid: 'w-full aspect-video rounded-xl',
    hero: 'w-full aspect-video rounded-xl',
    list: 'w-20 h-12 sm:w-24 sm:h-14 rounded-lg shrink-0',
    'compact-list': 'w-14 h-9 sm:w-16 sm:h-10 rounded-lg shrink-0'
  }[variant];

  const imgFitClasses = isSvgCard
    ? 'w-full h-full object-cover'
    : variant === 'compact-list'
    ? 'w-full h-full object-contain p-1'
    : variant === 'list'
    ? 'w-full h-full object-contain p-1.5'
    : 'w-full h-full object-contain p-2.5';

  const borderClasses = borderless
    ? 'bg-black/25'
    : 'bg-[var(--theme-card,#131B2B)] border border-[var(--theme-border,rgba(56,189,248,0.22))] group-hover:border-[var(--theme-border-accent,rgba(56,189,248,0.75))]';

  return (
    <div
      className={`relative ${borderClasses} flex items-center justify-center overflow-hidden transition-all select-none ${sizeClasses} ${className}`}
    >
      <img
        key={channel.id || channel.name}
        src={src}
        alt={channel.name}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={`${imgFitClasses} group-hover:scale-105 transition-transform duration-200`}
        onError={() => {
          const fallback = getChannelFallbackLogo(channel);
          if (src !== fallback) {
            setSrc(fallback);
          }
        }}
      />
      {showHoverPlay && (
        <div className="absolute inset-0 bg-[#040711]/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-lg btn-premium-primary flex items-center justify-center shadow-lg">
            <Play className="w-4 h-4 fill-white text-white ml-0.5 shrink-0" />
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

export default ChannelThumbnail;
