import React, { useRef, useState, useEffect } from 'react';
import { 
  Home, Tv, Activity, Film, MonitorPlay, Newspaper, Baby, Music, 
  Star, Crown, ChevronRight, 
  Tv2, Radio, Globe, Compass, Heart, Megaphone,
  Smartphone, Gift, Download, X, UserCheck, HelpCircle
} from 'lucide-react';
import { AdFreeState } from '../types';
import { usePassiveTouchScroll } from '../hooks/usePassiveTouchScroll';
import { setTvModeExited } from '../lib/screenDimensions';
import { useRealtimeVipCountdown } from '../lib/adSystem';
import { MrsIptvLogo } from './MrsIptvLogo';
import { WatchAdVipButton } from './WatchAdVipButton';

export interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  meta?: string;
  iconColorClass?: string;
  metaHighlightClass?: string;
}

interface SidebarProps {
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  onOpenPremiumModal?: () => void;
  onOpenReferralModal?: () => void;
  onOpenMonthlyReport?: () => void;
  onOpenAccountModal?: (tab: 'account' | 'support') => void;
  onOpenLegalModal?: (tab?: 'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about') => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onClearCache?: () => void;
  totalChannelsCount?: number;
  favoritesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isMobileMenuOpen, 
  onCloseMobileMenu, 
  activeView, 
  setActiveView,
  onOpenPremiumModal,
  onOpenReferralModal,
  onOpenAccountModal,
  onOpenLegalModal,
  adFreeState,
  onRewardedGranted,
  totalChannelsCount = 8890,
  favoritesCount = 0
}) => {
  const sidebarRef = useRef<HTMLElement | null>(null);
  usePassiveTouchScroll(sidebarRef);

  const vipCountdown = useRealtimeVipCountdown(adFreeState);
  const isVipActive = vipCountdown.isActive;

  const [appsCatalog, setAppsCatalog] = useState<Array<{
    id: string;
    title: string;
    subtitle: string;
    version: string;
    size: string;
    fileName: string;
    downloadUrl: string;
    storeUrl: string;
    updatedAt?: string;
  }>>([
    {
      id: 'm-r-s-iptv-pro',
      title: 'M R S IPTV TV',
      subtitle: 'Smart TV',
      version: '1.0',
      size: '31.93 MB',
      fileName: 'M_R_S_IPTV_Pro.apk',
      downloadUrl: 'https://mrmahbubur.github.io/APPS-STORE/apks/M_R_S_IPTV_Pro.apk',
      storeUrl: 'https://mrmahbubur.github.io/APPS-STORE/?app=m-r-s-iptv-pro',
      updatedAt: '2026-11-15',
    },
    {
      id: 'm-r-s-iptv',
      title: 'M R S IPTV Android',
      subtitle: 'Android Mobile',
      version: '1.0.0',
      size: '9.33 MB',
      fileName: 'M_R_S_IPTV.apk',
      downloadUrl: 'https://mrmahbubur.github.io/APPS-STORE/apks/M_R_S_IPTV.apk',
      storeUrl: 'https://mrmahbubur.github.io/APPS-STORE/?app=m-r-s-iptv',
      updatedAt: '2026-11-15',
    }
  ]);

  useEffect(() => {
    let active = true;
    const allowedIptvAppIds = new Set(['m-r-s-iptv-pro', 'm-r-s-iptv']);
    fetch('/api/apps-store')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.apps)) {
          const filtered = data.apps.filter((app: any) =>
            allowedIptvAppIds.has(String(app?.id || '').toLowerCase())
          );
          if (filtered.length > 0) {
            setAppsCatalog(filtered);
          }
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Group 1: Core Broadcast Hubs (Multi-Color Jewel Accents)
  const primaryApps: NavItem[] = [
    { 
      id: 'home', 
      icon: Home, 
      label: 'Home Spotlight',
      meta: 'Featured',
      iconColorClass: 'text-[var(--theme-accent,#38BDF8)]',
      metaHighlightClass: 'text-[var(--theme-accent,#38BDF8)]'
    },
    { 
      id: 'live', 
      icon: Radio, 
      label: 'All Live Channels', 
      meta: `${totalChannelsCount.toLocaleString()}+`,
      iconColorClass: 'text-emerald-400',
      metaHighlightClass: 'text-emerald-400 font-mono tabular-nums'
    },
    { 
      id: 'minimal-tv', 
      icon: Tv, 
      label: 'Minimal TV Player',
      meta: 'Fast Zap',
      iconColorClass: 'text-sky-400',
      metaHighlightClass: 'text-sky-400'
    },
    { 
      id: 'play-android-tv', 
      icon: MonitorPlay, 
      label: 'Android TV Mode',
      meta: 'DPAD Remote',
      iconColorClass: 'text-purple-400',
      metaHighlightClass: 'text-purple-400'
    }
  ];

  // Group 2: Curated Genre Categories (Distinct Multi-Color Accents)
  const categoryItems: NavItem[] = [
    { id: 'category:Bangladeshi', icon: Globe, label: 'Bangladeshi TV', meta: 'BD HD', iconColorClass: 'text-emerald-400', metaHighlightClass: 'text-emerald-400' },
    { id: 'category:Sports', icon: Activity, label: 'Sports & Live Games', meta: 'Live', iconColorClass: 'text-amber-400', metaHighlightClass: 'text-amber-400' },
    { id: 'category:Movies', icon: Film, label: 'Movies & Cinema', meta: 'Cinema', iconColorClass: 'text-purple-400', metaHighlightClass: 'text-purple-400' },
    { id: 'category:News', icon: Newspaper, label: 'News 24/7', meta: 'Global', iconColorClass: 'text-rose-400', metaHighlightClass: 'text-rose-400' },
    { id: 'category:Entertainment', icon: Tv2, label: 'Entertainment', meta: 'Shows', iconColorClass: 'text-[var(--theme-accent,#38BDF8)]', metaHighlightClass: 'text-[var(--theme-accent,#38BDF8)]' },
    { id: 'category:Indian', icon: Tv, label: 'Indian & Regional', meta: 'IN HD', iconColorClass: 'text-orange-400', metaHighlightClass: 'text-orange-400' },
    { id: 'category:Kids', icon: Baby, label: 'Kids & Family', meta: 'Family', iconColorClass: 'text-pink-400', metaHighlightClass: 'text-pink-400' },
    { id: 'category:Music', icon: Music, label: 'Music & Studio', meta: 'Audio', iconColorClass: 'text-violet-400', metaHighlightClass: 'text-violet-400' },
    { id: 'category:Documentary', icon: Compass, label: 'Documentary & Nature', meta: '4K Doc', iconColorClass: 'text-teal-400', metaHighlightClass: 'text-teal-400' },
    { id: 'category:Religious', icon: Heart, label: 'Religious & Spiritual', meta: '24/7', iconColorClass: 'text-yellow-400', metaHighlightClass: 'text-yellow-400' },
    { id: 'category:Advertisement', icon: Megaphone, label: 'Advertisement', meta: 'Offers', iconColorClass: 'text-amber-400', metaHighlightClass: 'text-amber-400' }
  ];

  const handleNavClick = (id: string) => {
    if (id === 'play-android-tv') {
      setTvModeExited(false);
    }
    setActiveView(id);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-md z-40 transition-opacity"
          onClick={onCloseMobileMenu}
        />
      )}

      <aside 
        ref={sidebarRef} 
        aria-label="Primary Broadcast Navigation"
        className={`
          fixed lg:sticky top-0 left-0 h-screen 
          w-[84vw] max-w-[290px] sm:w-[64vw] sm:max-w-[290px] lg:w-[276px] xl:w-[290px]
          flex flex-col premium-surface backdrop-blur-2xl border-r border-white/[0.10] 
          overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-5 shrink-0 z-50 transition-transform duration-300
          ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl shadow-black/95' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Mobile Close Button */}
        {isMobileMenuOpen && (
          <button 
            type="button"
            className="lg:hidden absolute top-3.5 right-3.5 w-10 h-10 flex items-center justify-center rounded-lg sidebar-square-btn text-[#C9D1E0] hover:text-white transition-all active:scale-95 cursor-pointer"
            onClick={onCloseMobileMenu}
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* ================================================================= */}
        {/* 1. BRAND IDENTITY HEADER WITH OFFICIAL M R S IPTV VECTOR LOGO     */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-5 pb-4 border-b border-white/[0.09] shrink-0">
          <MrsIptvLogo
            variant="primary"
            showTagline={true}
            href="/"
            onClick={() => handleNavClick('home')}
            iconClassName="h-[38px] md:h-[48px] w-auto"
            wordmarkClassName="text-lg sm:text-xl"
          />
          <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-[#C9D1E0] px-0.5">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono tabular-nums font-bold text-emerald-400">
                {totalChannelsCount.toLocaleString()}
              </span>
              <span>Live Channels</span>
            </span>
            <span className="text-[var(--theme-accent,#38BDF8)] font-mono text-[10px] font-bold">24/7 HD</span>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. SCROLLABLE NAVIGATION DOCK (ALL BUTTONS WITH SQUARE BORDERLINE) */}
        {/* ================================================================= */}
        <div className="flex-1 px-3.5 py-4 space-y-5">
          {/* Group A: Core Broadcast Hubs */}
          <div className="space-y-1.5">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#C9D1E0] tracking-wide uppercase">
                Broadcast Hub
              </span>
              <span className="text-[11px] font-mono font-bold text-[var(--theme-accent,#38BDF8)]">
                4 Modes
              </span>
            </div>

            {primaryApps.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  id={item.id === 'play-android-tv' ? 'btn-android-tv-mode' : `btn-nav-${item.id}`}
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`nav-item relative w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all motion-reduce:transition-none group cursor-pointer ${
                    isActive 
                      ? 'sidebar-square-btn-active text-white font-bold' 
                      : 'sidebar-square-btn text-[#C9D1E0] hover:text-white font-semibold'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-transform motion-reduce:transition-none group-hover:scale-105 ${
                      item.iconColorClass || 'text-[var(--theme-accent,#38BDF8)]'
                    }`} />
                    <span className={`truncate ${isActive ? 'text-white font-extrabold tracking-wide' : 'text-white/95 group-hover:text-white'}`}>
                      {item.label}
                    </span>
                  </div>

                  {item.meta && (
                    <span className={`text-[11px] font-semibold shrink-0 ml-2 whitespace-nowrap ${
                      item.metaHighlightClass || 'text-[var(--theme-accent,#38BDF8)]'
                    }`}>
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.08] mx-1" />

          {/* Group B: Curated Live Genres */}
          <div className="space-y-1.5">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#C9D1E0] tracking-wide uppercase">
                Live TV Categories
              </span>
              <button
                type="button"
                onClick={() => handleNavClick('categories')}
                className="min-h-[34px] px-3 py-1 text-[11px] font-bold text-[var(--theme-accent,#38BDF8)] hover:text-white sidebar-square-btn rounded-lg cursor-pointer"
              >
                All Genres
              </button>
            </div>

            {categoryItems.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`nav-item w-full min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-lg text-xs transition-all motion-reduce:transition-none group cursor-pointer ${
                    isActive 
                      ? 'sidebar-square-btn-active text-white font-bold' 
                      : 'sidebar-square-btn text-[#C9D1E0] hover:text-white font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-transform motion-reduce:transition-none group-hover:scale-105 ${
                      item.iconColorClass || 'text-[var(--theme-accent,#38BDF8)]'
                    }`} />
                    <span className={`truncate ${isActive ? 'text-white font-bold' : 'text-white/90 group-hover:text-white'}`}>
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.meta && (
                      <span className={`text-[10px] font-mono font-bold ${item.metaHighlightClass || 'text-[#C9D1E0]'}`}>
                        {item.meta}
                      </span>
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${
                      isActive ? 'text-[var(--theme-accent,#38BDF8)]' : 'text-[#C9D1E0]/60 group-hover:text-[var(--theme-accent,#38BDF8)]'
                    }`} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.08] mx-1" />

          {/* Group C: Personal Library (No Site Reload Option) */}
          <div className="space-y-1.5">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#C9D1E0] tracking-wide uppercase">
                Personal Library
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleNavClick('favorites')}
              className={`nav-item w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all motion-reduce:transition-none group cursor-pointer ${
                activeView === 'favorites' 
                  ? 'sidebar-square-btn-active text-white font-bold' 
                  : 'sidebar-square-btn text-[#C9D1E0] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Star className={`w-4 h-4 shrink-0 ${
                  activeView === 'favorites' ? 'text-amber-400 fill-amber-400' : 'text-amber-400 fill-amber-400/20'
                }`} />
                <span className="text-white/95">Saved Favorites</span>
              </div>
              {favoritesCount > 0 ? (
                <span className="text-xs font-mono tabular-nums font-bold text-amber-400">
                  {favoritesCount}
                </span>
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#C9D1E0]/60 group-hover:text-amber-400 transition-colors" />
              )}
            </button>

            {onOpenAccountModal && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAccountModal('account');
                    if (onCloseMobileMenu) onCloseMobileMenu();
                  }}
                  className="nav-item w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all motion-reduce:transition-none group cursor-pointer sidebar-square-btn text-[#C9D1E0] hover:text-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserCheck className="w-4 h-4 shrink-0 text-[#F5B301]" />
                    <span className="text-white/95 truncate">Account &amp; Devices</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-[#F5B301] shrink-0">
                    VIP Desk
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenAccountModal('support');
                    if (onCloseMobileMenu) onCloseMobileMenu();
                  }}
                  className="nav-item w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all motion-reduce:transition-none group cursor-pointer sidebar-square-btn text-[#C9D1E0] hover:text-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <HelpCircle className="w-4 h-4 shrink-0 text-[var(--theme-accent,#38BDF8)]" />
                    <span className="text-white/95 truncate">Help &amp; Support</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-[var(--theme-accent,#38BDF8)] shrink-0">
                    24/7
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. BOTTOM VIP MEMBERSHIP, REFERRAL & OFFICIAL APK DOCK            */}
        {/* ================================================================= */}
        <div className="px-3.5 space-y-2.5 pt-3.5 border-t border-white/[0.09] shrink-0">
          {/* 1-Click Watch Ad & Get 1 Hour Free VIP Card */}
          <WatchAdVipButton
            variant="sidebar"
            adFreeState={adFreeState}
            onRewardedGranted={onRewardedGranted}
            onAfterClick={() => {
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
          />

          {/* Refer & Earn VIP Card */}
          <button
            type="button"
            id="sidebar-referral-btn"
            onClick={() => {
              if (onOpenReferralModal) onOpenReferralModal();
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
            className="w-full min-h-[52px] relative overflow-hidden sidebar-square-btn rounded-xl p-3 text-left transition-all motion-reduce:transition-none group shadow-lg cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-400/45 shrink-0 group-hover:scale-105 transition-transform">
                  <Gift className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-extrabold text-white block truncate">
                    Refer & Earn Free VIP
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold block truncate mt-0.5">
                    Instant 2h Bonus · Free Passes
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </button>

          {/* VIP Pass Membership Card with Real-Time 1-Hour Countdown */}
          <button
            type="button"
            onClick={() => {
              if (onOpenPremiumModal) onOpenPremiumModal();
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
            className="w-full min-h-[52px] relative overflow-hidden sidebar-square-btn-active rounded-xl p-3 text-left cursor-pointer group transition-all motion-reduce:transition-none shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/55 shrink-0 group-hover:scale-105 transition-transform">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-white">VIP Pass</span>
                    <span className="text-[#C9D1E0]/60">·</span>
                    <span className="text-[11px] font-mono tabular-nums font-bold text-amber-400">
                      {isVipActive
                        ? (vipCountdown.isTemporary ? vipCountdown.formattedClock : 'Active')
                        : 'Upgrade'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#C9D1E0] block truncate mt-0.5">
                    {isVipActive ? '100% Ad-Free & Priority HD' : 'Unlock Zero-Ad 4K Streaming'}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </button>

          {/* Official TV & Mobile APK Downloads from MRS App Store */}
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-[#C9D1E0]">
              <span className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)]" />
                <span>Official Android Apps</span>
              </span>
              <a
                href="https://mrmahbubur.github.io/APPS-STORE/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--theme-accent,#38BDF8)] hover:text-white hover:underline font-mono text-[10px] font-bold"
              >
                MRS App Store
              </a>
            </div>

            <div className="space-y-1.5">
              {appsCatalog.map((app) => {
                const isTv = app.id.includes('pro') || app.subtitle.toLowerCase().includes('tv');
                return (
                  <a
                    key={app.id}
                    id={isTv ? 'sidebar-apk-download-btn' : 'sidebar-mobile-apk-download-btn'}
                    href={app.downloadUrl}
                    download={app.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Download ${app.title} (v${app.version} · ${app.size}${app.updatedAt ? ` · Updated ${app.updatedAt}` : ''}) from MRS App Store`}
                    className="w-full min-h-[48px] py-2 px-3 sidebar-square-btn btn-square text-white rounded-xl flex items-center justify-between gap-2 cursor-pointer group"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {isTv ? (
                        <Tv className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                      )}
                      <span className="min-w-0 text-left">
                        <span className="text-[11px] font-extrabold text-white block truncate leading-tight">
                          {app.title}
                        </span>
                        <span className="text-[10px] font-mono text-[#C9D1E0] block truncate">
                          {app.subtitle} · v{app.version} · {app.size}
                        </span>
                      </span>
                    </span>
                    <Download className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] group-hover:translate-y-0.5 transition-transform shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Developer Credit & Dynamic Annual Policy */}
          <div className="text-center pt-1 text-[11px] text-[#C9D1E0]/80">
            <span>Engineered by </span>
            <a 
              href="https://mrxshahin.ai.studio" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[var(--theme-accent,#38BDF8)] hover:text-white hover:underline font-bold"
            >
              M R S
            </a>
          </div>

          <div className="text-center pb-1 text-[10px] text-[#C9D1E0]/60 flex items-center justify-center gap-1.5 font-mono">
            <span>© {new Date().getFullYear()} M R S IPTV</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => {
                if (onOpenLegalModal) onOpenLegalModal('terms');
                if (onCloseMobileMenu) onCloseMobileMenu();
              }}
              className="text-[var(--theme-accent,#38BDF8)] hover:underline cursor-pointer"
            >
              Terms &amp; Legal
            </button>
            <span>·</span>
            <a href="#admin" className="text-[var(--theme-accent,#38BDF8)] hover:underline">
              Admin
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};
