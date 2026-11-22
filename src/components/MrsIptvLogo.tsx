import React, { useState, useId } from 'react';
import siteLogoEmblem from '../assets/images/site_logo_emblem_1791948138398.jpg';

export type MrsLogoVariant = 'primary' | 'compact' | 'icon' | 'light' | 'monochrome';

export interface MrsIptvLogoProps {
  variant?: MrsLogoVariant;
  showTagline?: boolean;
  subtitle?: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  useAssetFile?: boolean;
}

/**
 * M R S IPTV — Official Production Logo Component
 *
 * Brand Color Specification:
 * - Obsidian foundation: #050816
 * - Electric cyan:       #00D9FF
 * - Sapphire blue:       #176BFF
 * - Deep violet:         #B832F5
 * - Champagne gold:      #FBBF24
 * - Pure white:          #FFFFFF
 */
export const MrsIptvLogo: React.FC<MrsIptvLogoProps> = ({
  variant = 'compact',
  showTagline = false,
  subtitle,
  onClick,
  href = '/',
  className = '',
  iconClassName = 'h-[38px] md:h-[46px] w-[38px] md:w-[46px]',
  wordmarkClassName = 'text-base sm:text-lg',
  useAssetFile = true
}) => {
  const [imgError, setImgError] = useState(false);
  const uid = useId().replace(/:/g, '');

  const logoSrc = siteLogoEmblem || '/mrs-iptv-logo.png';

  const isLight = variant === 'light';
  const isMono = variant === 'monochrome';

  const handleTrigger = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  const renderSvgSymbol = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 150 116"
      role="img"
      aria-label="M R S IPTV logo"
      className="h-[38px] md:h-[48px] w-auto object-contain shrink-0 select-none"
    >
      <title>M R S IPTV logo</title>
      <defs>
        <linearGradient id={`mrsGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D9FF" />
          <stop offset="50%" stopColor="#176BFF" />
          <stop offset="100%" stopColor="#B832F5" />
        </linearGradient>
        <linearGradient id={`mrsSilver-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9D1E0" />
        </linearGradient>
      </defs>

      <g transform="translate(6, 6)">
        <rect
          x="0"
          y="6"
          width="108"
          height="78"
          rx="14"
          fill="#050816"
          stroke={isMono ? '#FFFFFF' : isLight ? '#050816' : `url(#mrsSilver-${uid})`}
          strokeWidth="5.5"
        />
        <rect
          x="8.5"
          y="14.5"
          width="91"
          height="61"
          rx="8.5"
          fill="#050816"
          stroke={isMono ? '#FFFFFF' : `url(#mrsGrad-${uid})`}
          strokeWidth="3.2"
        />
        <path
          d="M41 27.5 C41 25 43.8 23.5 46 24.8 L75.5 42 C77.7 43.3 77.7 46.5 75.5 47.8 L46 65 C43.8 66.3 41 64.8 41 62.3 Z"
          fill={isMono ? '#FFFFFF' : `url(#mrsGrad-${uid})`}
        />
        {!isMono && (
          <path d="M46.5 34.5 L64 44.9 L46.5 55.3 Z" fill="#FFFFFF" opacity="0.96" />
        )}
        <path
          d="M33 95 L75 95"
          stroke={isMono ? '#FFFFFF' : isLight ? '#050816' : '#C9D1E0'}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M45 84 L41 95 M63 84 L67 95"
          stroke={isMono ? '#FFFFFF' : isLight ? '#050816' : '#C9D1E0'}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <path
          d="M117 28 A 20 20 0 0 1 117 62"
          fill="none"
          stroke={isMono ? '#FFFFFF' : '#00D9FF'}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M127 19 A 32 32 0 0 1 127 71"
          fill="none"
          stroke={isMono ? '#FFFFFF' : `url(#mrsGrad-${uid})`}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );

  if (variant === 'icon') {
    return (
      <a
        href={href}
        onClick={handleTrigger}
        aria-label="M R S IPTV logo"
        title="M R S IPTV"
        className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      >
        {useAssetFile && !imgError ? (
          <img
            src={logoSrc}
            alt="M R S IPTV emblem"
            referrerPolicy="no-referrer"
            style={{ objectFit: 'cover' }}
            className={`object-cover rounded-xl shadow-lg border border-cyan-500/25 shrink-0 select-none block ${iconClassName}`}
            onError={() => setImgError(true)}
          />
        ) : (
          renderSvgSymbol()
        )}
      </a>
    );
  }

  return (
    <a
      href={href}
      onClick={handleTrigger}
      aria-label="M R S IPTV logo"
      title="M R S IPTV — Your World • Your Channels"
      className={`inline-flex items-center gap-2.5 sm:gap-3 shrink-0 group select-none no-underline ${className}`}
    >
      {/* Rebuilt M R S IPTV Logo Emblem */}
      <div className="relative shrink-0 flex items-center justify-center bg-transparent">
        {useAssetFile && !imgError ? (
          <img
            src={logoSrc}
            alt="M R S IPTV emblem"
            referrerPolicy="no-referrer"
            style={{ objectFit: 'cover' }}
            className={`object-cover rounded-xl shadow-md border border-cyan-500/25 shrink-0 select-none block ${iconClassName}`}
            onError={() => setImgError(true)}
          />
        ) : (
          renderSvgSymbol()
        )}
      </div>

      {/* Exact Brand Wordmark: M R S IPTV */}
      <div className="min-w-0 flex flex-col justify-center">
        <div
          className={`font-display font-black tracking-wider leading-none flex items-center gap-1.5 whitespace-nowrap ${wordmarkClassName}`}
        >
          <span className={isLight ? 'text-[#050816]' : 'text-[#FFFFFF]'}>
            M R S
          </span>
          <span
            className={
              isMono
                ? 'text-[#FFFFFF]'
                : 'bg-gradient-to-r from-[#00D9FF] via-[#176BFF] to-[#B832F5] bg-clip-text text-transparent'
            }
          >
            IPTV
          </span>
        </div>

        {showTagline && (
          <span
            className={`text-[9px] sm:text-[10px] font-bold tracking-[0.16em] uppercase mt-1 truncate ${
              isLight ? 'text-[#050816]/80' : 'text-[#C9D1E0]'
            }`}
          >
            YOUR WORLD • YOUR CHANNELS
          </span>
        )}

        {!showTagline && subtitle && (
          <span
            className={`text-[11px] font-medium mt-1 truncate ${
              isLight ? 'text-[#050816]/80' : 'text-[#C9D1E0]'
            }`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </a>
  );
};

export default MrsIptvLogo;
