import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp, ArrowDown, Hand, Tv, Zap, MoreVertical, X, Check } from 'lucide-react';

interface PlayerCoachMarksProps {
  isOpen: boolean;
  onClose: () => void;
}

const COACH_STEPS = [
  {
    title: 'Swipe Up & Down',
    subtitle: 'Quick Channel Switching',
    description: 'Swipe up on the video to switch to the Next channel, or swipe down for the Previous channel.',
    icon: (
      <div className="flex items-center gap-1.5 p-3 rounded-full bg-[#F5B301]/15 border border-[#F5B301]/40 text-[#F5B301]">
        <ArrowUp className="w-5 h-5 stroke-[2.5] shrink-0" />
        <ArrowDown className="w-5 h-5 stroke-[2.5] shrink-0" />
      </div>
    )
  },
  {
    title: 'Tap to Reveal Controls',
    subtitle: 'Broadcast HUD & OSD',
    description: 'Tap anywhere on the live video stage to show the status bar, glossy center play/pause transport, and TV banner.',
    icon: (
      <div className="p-3 rounded-full bg-[#22B8F0]/15 border border-[#22B8F0]/40 text-[#22B8F0]">
        <Hand className="w-6 h-6 stroke-[2]" />
      </div>
    )
  },
  {
    title: 'TV Guide & 8,890+ Channels',
    subtitle: 'Instant Category Search',
    description: 'Tap "TV Guide" under the video or in the dock to open the full channel guide with categories, search, and live EPG.',
    icon: (
      <div className="p-3 rounded-full bg-[#2ECC71]/15 border border-[#2ECC71]/40 text-[#2ECC71]">
        <Tv className="w-6 h-6 stroke-[2]" />
      </div>
    )
  },
  {
    title: 'Stream Lines & Camellia Doctor',
    subtitle: 'AUTO Self-Healing Playback',
    description: 'Switch between Line 1, Line 2, and AUTO modes. Camellia Stream Doctor monitors playback and auto-heals stalled lines.',
    icon: (
      <div className="p-3 rounded-full bg-[#F5B301]/15 border border-[#F5B301]/40 text-[#F5B301]">
        <Zap className="w-6 h-6 stroke-[2]" />
      </div>
    )
  },
  {
    title: 'The More Menu',
    subtitle: 'VIP, Aspect Ratio & Help',
    description: 'Tap the three-dots menu icon on the top status bar or bottom dock for 1h VIP pass, aspect ratio (16:9/Zoom/Fill), audio boost, and Help.',
    icon: (
      <div className="p-3 rounded-full bg-white/10 border border-white/20 text-white">
        <MoreVertical className="w-6 h-6 stroke-[2]" />
      </div>
    )
  }
];

export const PlayerCoachMarks: React.FC<PlayerCoachMarksProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = COACH_STEPS[currentStep];
  const isLast = currentStep === COACH_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-sm rounded-[14px] bg-[rgba(12,18,40,0.92)] backdrop-blur-2xl border border-white/15 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-white"
        >
          {/* Top Bar with Step Count and Close */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[#F5B301]">
              Quick Guide · Step {currentStep + 1} of {COACH_STEPS.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Skip quick guide"
              className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 shrink-0"
              title="Skip Tour"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>

          {/* Step Graphic & Information */}
          <div className="my-5 flex flex-col items-center text-center">
            <div className="mb-3.5">
              {step.icon}
            </div>
            <h3 className="text-lg font-bold text-white mb-0.5">
              {step.title}
            </h3>
            <p className="text-xs font-semibold text-[#22B8F0] mb-2">
              {step.subtitle}
            </p>
            <p className="text-[13px] leading-relaxed text-white/75 max-w-[280px]">
              {step.description}
            </p>
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {COACH_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === currentStep ? 'w-6 bg-[#F5B301]' : 'w-1.5 bg-white/25 hover:bg-white/40'
                }`}
                title={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition-all cursor-pointer"
            >
              Skip
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="min-h-[42px] px-5 rounded-lg bg-[#F5B301] hover:bg-[#ffc01e] text-[#050816] text-xs font-black tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-[0_0_16px_rgba(245,179,1,0.35)] cursor-pointer"
            >
              <span>{isLast ? 'Get Started' : 'Next'}</span>
              {isLast ? <Check className="w-4 h-4 stroke-[3] shrink-0" /> : <ArrowUp className="w-4 h-4 rotate-90 stroke-[3] shrink-0" />}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
