import React from 'react';
import { Home, Radio, LayoutGrid, Crown, UserCheck } from 'lucide-react';
import { AdFreeState } from '../types';
import { useBroadcastTheme } from '../lib/themeSystem';

interface BottomNavProps {
  activeView: string;
  setActiveView: (view: string) => void;
  onOpenPremiumModal?: () => void;
  onOpenAccountModal?: (tab: 'account' | 'support') => void;
  adFreeState?: AdFreeState;
  isMobileMenuOpen?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  activeView, 
  setActiveView,
  onOpenPremiumModal,
  onOpenAccountModal,
  adFreeState,
  isMobileMenuOpen = false
}) => {
  const { theme } = useBroadcastTheme();
  const isVip = Boolean(adFreeState?.isActive || adFreeState?.isAdFree);

  const handleTap = (id: string) => {
    if (id === 'vip' && onOpenPremiumModal) {
      onOpenPremiumModal();
      return;
    }
    if (id === 'account' && onOpenAccountModal) {
      onOpenAccountModal('account');
      return;
    }
    setActiveView(id);
  };

  const navItems = [
    { id: 'home', icon: Home, label: 'Home', iconColor: theme.accentTextClass, activeClass: 'border-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent-soft,rgba(56,189,248,0.15))] text-white shadow-[0_0_14px_var(--theme-accent-glow,rgba(56,189,248,0.22))]' },
    { id: 'live', icon: Radio, label: 'Live TV', iconColor: 'text-emerald-400', activeClass: 'border-emerald-400 bg-emerald-500/15 text-white shadow-[0_0_12px_rgba(16,185,129,0.2)]' },
    { id: 'categories', icon: LayoutGrid, label: 'Genres', iconColor: 'text-purple-400', activeClass: 'border-purple-400 bg-purple-500/15 text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]' },
    { id: 'vip', icon: Crown, label: isVip ? 'VIP' : 'Go VIP', iconColor: 'text-[#F5B301]', activeClass: 'border-[#F5B301] bg-[#F5B301]/15 text-white' },
    { id: 'account', icon: UserCheck, label: 'Account', iconColor: 'text-sky-400', activeClass: 'border-sky-400 bg-sky-500/15 text-white' }
  ];

  return (
    <nav 
      aria-label="Mobile Navigation"
      className={`lg:hidden fixed bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 pointer-events-none transition-all duration-300 ease-in-out motion-reduce:transition-none ${
        isMobileMenuOpen ? 'opacity-0 translate-y-16 pointer-events-none invisible' : 'opacity-100 translate-y-0 visible'
      }`}
    >
      <div className="pointer-events-auto premium-surface backdrop-blur-2xl border border-white/[0.10] shadow-[0_14px_42px_rgba(0,0,0,0.92)] rounded-2xl px-1.5 py-1.5 flex items-center justify-around max-w-lg mx-auto gap-1">
        {navItems.map((item) => {
          const isActive = activeView === item.id || (item.id === 'categories' && activeView.startsWith('category:'));
          const Icon = item.icon;
          return (
            <button 
              key={item.id} 
              type="button"
              tabIndex={0}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleTap(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-w-[54px] min-h-[46px] px-1.5 py-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)] transition-all duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-95 cursor-pointer border ${
                isActive 
                  ? `${item.activeClass} font-extrabold` 
                  : 'text-[#C9D1E0] hover:text-white bg-transparent hover:bg-white/[0.05] border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${item.iconColor}`} />
              <span className={`text-[10px] tracking-tight leading-none whitespace-nowrap ${
                isActive ? 'font-extrabold text-white' : 'font-semibold text-[#C9D1E0]'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
