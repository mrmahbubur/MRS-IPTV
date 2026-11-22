import { useState, useEffect } from 'react';

export type BroadcastThemeId =
  | 'clean-realistic'
  | 'clean'
  | 'obsidian-gold'
  | 'emerald-matrix'
  | 'crimson-velvet'
  | 'royal-amethyst';

export interface BroadcastThemeOption {
  id: BroadcastThemeId;
  name: string;
  shortLabel: string;
  swatchHex: string;
  accentDarkHex: string;
  secondaryHex: string;
  bgHex: string;
  surfaceHex: string;
  cardHex: string;
  cardHoverHex: string;
  accentSoftRgba: string;
  accentGlowRgba: string;
  borderRgba: string;
  borderAccentRgba: string;
  radial1Rgba: string;
  radial2Rgba: string;
  radial3Rgba: string;
  accentTextClass: string;
  activeNavClass: string;
  badgeTextClass: string;
  glowBorderClass: string;
}

export const BROADCAST_THEMES: BroadcastThemeOption[] = [
  {
    id: 'clean-realistic',
    name: 'Clean Realistic (Midnight Graphite & Sapphire)',
    shortLabel: 'Sapphire',
    swatchHex: '#38BDF8',
    accentDarkHex: '#0369A1',
    secondaryHex: '#10B981',
    bgHex: '#070A11',
    surfaceHex: '#0E131F',
    cardHex: '#131B2B',
    cardHoverHex: '#182236',
    accentSoftRgba: 'rgba(14, 165, 233, 0.20)',
    accentGlowRgba: 'rgba(56, 189, 248, 0.28)',
    borderRgba: 'rgba(56, 189, 248, 0.22)',
    borderAccentRgba: 'rgba(56, 189, 248, 0.78)',
    radial1Rgba: 'rgba(14, 165, 233, 0.10)',
    radial2Rgba: 'rgba(16, 185, 129, 0.05)',
    radial3Rgba: 'rgba(99, 102, 241, 0.04)',
    accentTextClass: 'text-sky-400',
    activeNavClass: 'from-sky-500/20 via-blue-500/15 to-transparent border-sky-400/80 shadow-black/80',
    badgeTextClass: 'text-sky-400',
    glowBorderClass: 'hover:border-sky-400/70'
  },
  {
    id: 'clean',
    name: 'Clean Studio (Obsidian Navy & Electric Cyan)',
    shortLabel: 'Cyan Studio',
    swatchHex: '#00D9FF',
    accentDarkHex: '#0E7490',
    secondaryHex: '#10B981',
    bgHex: '#050816',
    surfaceHex: '#080E24',
    cardHex: '#0D1536',
    cardHoverHex: '#141F4D',
    accentSoftRgba: 'rgba(0, 217, 255, 0.18)',
    accentGlowRgba: 'rgba(0, 217, 255, 0.30)',
    borderRgba: 'rgba(0, 217, 255, 0.24)',
    borderAccentRgba: 'rgba(0, 217, 255, 0.82)',
    radial1Rgba: 'rgba(0, 217, 255, 0.12)',
    radial2Rgba: 'rgba(16, 185, 129, 0.07)',
    radial3Rgba: 'rgba(129, 140, 248, 0.06)',
    accentTextClass: 'text-[#00D9FF]',
    activeNavClass: 'from-[#00D9FF]/20 via-sky-500/15 to-blue-500/10 border-[#00D9FF]/80 shadow-black/80',
    badgeTextClass: 'text-[#00D9FF]',
    glowBorderClass: 'hover:border-[#00D9FF]/75'
  },
  {
    id: 'obsidian-gold',
    name: 'Imperial Solar Gold & Obsidian Studio',
    shortLabel: 'Solar Gold',
    swatchHex: '#F59E0B',
    accentDarkHex: '#B45309',
    secondaryHex: '#10B981',
    bgHex: '#080A10',
    surfaceHex: '#0E121B',
    cardHex: '#131824',
    cardHoverHex: '#1A2132',
    accentSoftRgba: 'rgba(245, 158, 11, 0.20)',
    accentGlowRgba: 'rgba(245, 158, 11, 0.28)',
    borderRgba: 'rgba(245, 158, 11, 0.24)',
    borderAccentRgba: 'rgba(251, 191, 36, 0.78)',
    radial1Rgba: 'rgba(245, 158, 11, 0.11)',
    radial2Rgba: 'rgba(16, 185, 129, 0.06)',
    radial3Rgba: 'rgba(245, 158, 11, 0.05)',
    accentTextClass: 'text-amber-400',
    activeNavClass: 'from-amber-500/25 via-orange-500/20 to-emerald-500/15 border-amber-400/85 shadow-black/80',
    badgeTextClass: 'text-amber-400',
    glowBorderClass: 'hover:border-amber-400/75'
  },
  {
    id: 'emerald-matrix',
    name: 'Emerald Jade & Carbon Broadcast',
    shortLabel: 'Emerald',
    swatchHex: '#10B981',
    accentDarkHex: '#047857',
    secondaryHex: '#38BDF8',
    bgHex: '#060D0B',
    surfaceHex: '#0B1714',
    cardHex: '#10221D',
    cardHoverHex: '#152E27',
    accentSoftRgba: 'rgba(16, 185, 129, 0.20)',
    accentGlowRgba: 'rgba(16, 185, 129, 0.28)',
    borderRgba: 'rgba(16, 185, 129, 0.24)',
    borderAccentRgba: 'rgba(52, 211, 153, 0.80)',
    radial1Rgba: 'rgba(16, 185, 129, 0.12)',
    radial2Rgba: 'rgba(56, 189, 248, 0.06)',
    radial3Rgba: 'rgba(16, 185, 129, 0.05)',
    accentTextClass: 'text-emerald-400',
    activeNavClass: 'from-emerald-500/25 via-teal-500/20 to-amber-500/15 border-emerald-400/85 shadow-black/80',
    badgeTextClass: 'text-emerald-400',
    glowBorderClass: 'hover:border-emerald-400/75'
  },
  {
    id: 'crimson-velvet',
    name: 'Cinema Ruby & Obsidian Velvet',
    shortLabel: 'Cinema Ruby',
    swatchHex: '#F43F5E',
    accentDarkHex: '#BE123C',
    secondaryHex: '#F59E0B',
    bgHex: '#0D070A',
    surfaceHex: '#170C12',
    cardHex: '#22111A',
    cardHoverHex: '#2C1622',
    accentSoftRgba: 'rgba(244, 63, 94, 0.20)',
    accentGlowRgba: 'rgba(244, 63, 94, 0.28)',
    borderRgba: 'rgba(244, 63, 94, 0.24)',
    borderAccentRgba: 'rgba(251, 113, 133, 0.80)',
    radial1Rgba: 'rgba(244, 63, 94, 0.12)',
    radial2Rgba: 'rgba(245, 158, 11, 0.06)',
    radial3Rgba: 'rgba(168, 85, 247, 0.05)',
    accentTextClass: 'text-rose-400',
    activeNavClass: 'from-rose-500/25 via-amber-500/20 to-purple-500/15 border-rose-400/85 shadow-black/80',
    badgeTextClass: 'text-rose-400',
    glowBorderClass: 'hover:border-rose-400/75'
  },
  {
    id: 'royal-amethyst',
    name: 'Royal Amethyst & Studio Violet',
    shortLabel: 'Amethyst',
    swatchHex: '#A855F7',
    accentDarkHex: '#7E22CE',
    secondaryHex: '#38BDF8',
    bgHex: '#0A0712',
    surfaceHex: '#120D20',
    cardHex: '#1A132E',
    cardHoverHex: '#231A3D',
    accentSoftRgba: 'rgba(168, 85, 247, 0.20)',
    accentGlowRgba: 'rgba(168, 85, 247, 0.28)',
    borderRgba: 'rgba(168, 85, 247, 0.24)',
    borderAccentRgba: 'rgba(192, 132, 252, 0.80)',
    radial1Rgba: 'rgba(168, 85, 247, 0.12)',
    radial2Rgba: 'rgba(56, 189, 248, 0.06)',
    radial3Rgba: 'rgba(244, 63, 94, 0.05)',
    accentTextClass: 'text-purple-400',
    activeNavClass: 'from-purple-500/25 via-amber-500/20 to-rose-500/15 border-purple-400/85 shadow-black/80',
    badgeTextClass: 'text-purple-400',
    glowBorderClass: 'hover:border-purple-400/75'
  }
];

export const MASTER_BROADCAST_THEME: BroadcastThemeOption = BROADCAST_THEMES[0];

const THEME_STORAGE_KEY = 'mrs_iptv_implanted_theme_v2';

export function getStoredBroadcastTheme(): BroadcastThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as BroadcastThemeId | null;
    if (saved && BROADCAST_THEMES.some(t => t.id === saved)) {
      return saved;
    }
  } catch {}
  return 'clean-realistic';
}

export function applyBroadcastTheme(themeId: BroadcastThemeId = 'clean-realistic'): void {
  const target = BROADCAST_THEMES.find(t => t.id === themeId) || MASTER_BROADCAST_THEME;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, target.id);
  } catch {}

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-theme', target.id);
    root.style.setProperty('--theme-bg', target.bgHex);
    root.style.setProperty('--theme-surface', target.surfaceHex);
    root.style.setProperty('--theme-card', target.cardHex);
    root.style.setProperty('--theme-card-hover', target.cardHoverHex);
    root.style.setProperty('--theme-accent', target.swatchHex);
    root.style.setProperty('--theme-accent-dark', target.accentDarkHex);
    root.style.setProperty('--theme-accent-secondary', target.secondaryHex);
    root.style.setProperty('--theme-accent-soft', target.accentSoftRgba);
    root.style.setProperty('--theme-accent-glow', target.accentGlowRgba);
    root.style.setProperty('--theme-border', target.borderRgba);
    root.style.setProperty('--theme-border-neutral', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--theme-border-accent', target.borderAccentRgba);
    root.style.setProperty('--theme-radial-1', target.radial1Rgba);
    root.style.setProperty('--theme-radial-2', target.radial2Rgba);
    root.style.setProperty('--theme-radial-3', target.radial3Rgba);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', target.bgHex);
    }

    window.dispatchEvent(new CustomEvent('mrs_theme_changed', { detail: target }));
  }
}

export function cycleBroadcastTheme(): BroadcastThemeOption {
  const currentId = getStoredBroadcastTheme();
  const idx = BROADCAST_THEMES.findIndex(t => t.id === currentId);
  const next = BROADCAST_THEMES[(idx + 1) % BROADCAST_THEMES.length];
  applyBroadcastTheme(next.id);
  return next;
}

export function useBroadcastTheme(): {
  themeId: BroadcastThemeId;
  theme: BroadcastThemeOption;
  setTheme: (id: BroadcastThemeId) => void;
  cycleTheme: () => BroadcastThemeOption;
  allThemes: BroadcastThemeOption[];
} {
  const [themeId, setThemeId] = useState<BroadcastThemeId>(() => getStoredBroadcastTheme());

  useEffect(() => {
    applyBroadcastTheme(themeId);
    const handleThemeChange = (e: Event) => {
      const evt = e as CustomEvent<BroadcastThemeOption>;
      if (evt.detail?.id) {
        setThemeId(evt.detail.id);
      } else {
        setThemeId(getStoredBroadcastTheme());
      }
    };
    window.addEventListener('mrs_theme_changed', handleThemeChange);
    return () => window.removeEventListener('mrs_theme_changed', handleThemeChange);
  }, [themeId]);

  const theme = BROADCAST_THEMES.find(t => t.id === themeId) || MASTER_BROADCAST_THEME;

  return {
    themeId,
    theme,
    setTheme: applyBroadcastTheme,
    cycleTheme: cycleBroadcastTheme,
    allThemes: BROADCAST_THEMES
  };
}
