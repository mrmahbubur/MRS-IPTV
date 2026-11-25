import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Star, Lock, SlidersHorizontal, Zap, Sun, Volume2,
  HelpCircle, RefreshCw, ShieldCheck
} from 'lucide-react';
import { AdFreeState } from '../types';

interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onToggleLock: () => void;
  aspectRatio: 'contain' | 'cover' | 'fill';
  onCycleAspectRatio: () => void;
  proxyMode: string;
  onCycleProxyMode: () => void;
  candidateUrlsCount: number;
  activeMirrorIdx: number;
  onCycleMirror: () => void;
  volumeBoost: number;
  onCycleAudioBoost: () => void;
  brightness: number;
  onCycleBrightness: () => void;
  onReload: () => void;
  onOpenHelp: () => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
}

export const MoreMenuSheet: React.FC<MoreMenuSheetProps> = ({
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
  onToggleLock,
  aspectRatio,
  onCycleAspectRatio,
  proxyMode,
  onCycleProxyMode,
  candidateUrlsCount,
  activeMirrorIdx,
  onCycleMirror,
  volumeBoost,
  onCycleAudioBoost,
  brightness,
  onCycleBrightness,
  onReload,
  onOpenHelp,
  adFreeState,
  onRewardedGranted
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-t-[18px] sm:rounded-[14px] bg-[rgba(12,18,40,0.96)] border border-white/10 backdrop-blur-2xl p-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] text-white font-sans max-h-[85vh] overflow-y-auto custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#F5B301]/15 border border-[#F5B301]/40 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#F5B301] shrink-0" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Player Controls & Settings
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player settings"
              className="w-10 h-10 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            {/* 1. Favorite Toggle */}
            <button
              type="button"
              onClick={() => {
                onToggleFavorite();
              }}
              className={`h-14 p-3 rounded-[12px] border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                isFavorite
                  ? 'bg-[#F5B301]/15 border-[#F5B301]/60 text-white shadow-[0_0_12px_rgba(245,179,1,0.25)]'
                  : 'bg-white/[0.04] border-white/10 text-white/80 hover:bg-white/[0.08]'
              }`}
            >
              <Star className={`w-5 h-5 shrink-0 ${isFavorite ? 'fill-[#F5B301] text-[#F5B301]' : 'text-white/60'}`} />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">
                  {isFavorite ? 'Saved Favorite' : 'Save Favorite'}
                </span>
                <span className="text-[10px] text-white/50 block">Quick Access</span>
              </div>
            </button>

            {/* 2. Aspect Ratio */}
            <button
              type="button"
              onClick={onCycleAspectRatio}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-5 h-5 text-[#22B8F0] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">
                  Aspect: {aspectRatio === 'contain' ? '16:9 Fit' : aspectRatio === 'cover' ? 'Zoom 21:9' : 'Fill'}
                </span>
                <span className="text-[10px] text-white/50 block">Screen Scaling</span>
              </div>
            </button>

            {/* 3. Stream Line / Mirror */}
            <button
              type="button"
              onClick={onCycleMirror}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <Zap className="w-5 h-5 text-[#2ECC71] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">
                  Source: Line {activeMirrorIdx + 1}/{candidateUrlsCount || 1}
                </span>
                <span className="text-[10px] text-white/50 block">Mirror Line</span>
              </div>
            </button>

            {/* 4. Proxy Profile Mode */}
            <button
              type="button"
              onClick={onCycleProxyMode}
              className="h-14 p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5 text-[#F5B301] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate uppercase">
                  Routing: {proxyMode}
                </span>
                <span className="text-[10px] text-white/50 block">Camellia Proxy</span>
              </div>
            </button>

            {/* 5. Audio Boost */}
            <button
              type="button"
              onClick={onCycleAudioBoost}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <Volume2 className="w-5 h-5 text-[#22B8F0] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">
                  Audio: {Math.round(volumeBoost * 100)}%
                </span>
                <span className="text-[10px] text-white/50 block">Speaker Boost</span>
              </div>
            </button>

            {/* 6. Video Brightness */}
            <button
              type="button"
              onClick={onCycleBrightness}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <Sun className="w-5 h-5 text-[#F5B301] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">
                  Bright: {Math.round(brightness * 100)}%
                </span>
                <span className="text-[10px] text-white/50 block">Display Level</span>
              </div>
            </button>

            {/* 7. Screen Lock */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onToggleLock();
              }}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <Lock className="w-5 h-5 text-white/70 shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">Lock Controls</span>
                <span className="text-[10px] text-white/50 block">Prevent Taps</span>
              </div>
            </button>

            {/* 8. Stream Reload / Self-Heal */}
            <button
              type="button"
              onClick={() => {
                onReload();
                onClose();
              }}
              className="h-14 p-3 rounded-[12px] bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left flex items-center gap-2.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-5 h-5 text-[#2ECC71] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate">Reload Stream</span>
                <span className="text-[10px] text-white/50 block">Auto-Heal</span>
              </div>
            </button>

            {/* 9. Help & Instructions (Primary Highlight) */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHelp();
              }}
              className="h-14 p-3 rounded-[12px] bg-[#F5B301]/10 border border-[#F5B301]/40 hover:bg-[#F5B301]/20 text-left flex items-center gap-2.5 transition-all cursor-pointer col-span-2 sm:col-span-1 shadow-[0_0_12px_rgba(245,179,1,0.15)]"
            >
              <HelpCircle className="w-5 h-5 text-[#F5B301] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold block truncate text-[#F5B301]">
                  Help & Instructions
                </span>
                <span className="text-[10px] text-white/60 block">Full User Guide</span>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
