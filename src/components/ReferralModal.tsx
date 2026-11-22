import React, { useState, useEffect } from 'react';
import {
  X, Gift, Share2, Copy, Check, Users,
  RefreshCw, MessageCircle, ShieldCheck,
  Send, CheckCircle2, Ticket, Loader2
} from 'lucide-react';
import {
  getUserReferralCode,
  getReferralShareUrl,
  getReferredByCode,
  applyReferralCodeManually,
  fetchReferralStats,
  shareToSocial,
  syncReferralVipReward,
  initReferralTrackingCode
} from '../lib/referral';
import { ReferralStats, AdFreeState } from '../types';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  adFreeState?: AdFreeState;
  onStateChange?: (state: AdFreeState) => void;
  onOpenPremiumModal?: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  onStateChange,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  // Friend Referral Code Application State
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [appliedReferrerCode, setAppliedReferrerCode] = useState<string | null>(null);
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const code = getUserReferralCode();
      setReferralCode(code);
      setShareUrl(getReferralShareUrl(code));
      setAppliedReferrerCode(getReferredByCode());
      setApplyFeedback(null);

      initReferralTrackingCode().then((data) => {
        if (data.referralCode) setReferralCode(data.referralCode);
        if (data.shareUrl) setShareUrl(data.shareUrl);
        loadStats(data.referralCode || code);
      });
    }
  }, [isOpen]);

  const loadStats = async (code: string) => {
    setIsLoading(true);
    try {
      const data = await fetchReferralStats(code);
      if (data) setStats(data);
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFriendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCodeInput.trim() || isApplyingCode) return;

    setIsApplyingCode(true);
    setApplyFeedback(null);

    const result = await applyReferralCodeManually(friendCodeInput);
    setIsApplyingCode(false);

    if (result.success) {
      setAppliedReferrerCode(result.referrerCode || friendCodeInput.trim().toUpperCase());
      setFriendCodeInput('');
      setApplyFeedback({ type: 'success', text: result.message });
      if (result.newState && onStateChange) {
        onStateChange(result.newState);
      }
    } else {
      if (result.referrerCode) {
        setAppliedReferrerCode(result.referrerCode);
      }
      setApplyFeedback({ type: 'error', text: result.message });
    }
  };

  const handleClaimReward = async () => {
    setClaimMessage('Checking referral milestone rewards...');
    try {
      await loadStats(referralCode);
      const reward = await syncReferralVipReward((newState) => {
        if (onStateChange) onStateChange(newState);
      });
      if (reward) {
        setClaimMessage('Congratulations! Your VIP reward pass has been activated on this device.');
      } else {
        setClaimMessage('Stats synced! Invite more friends or have them apply your code to unlock the next VIP tier.');
      }
    } catch {
      setClaimMessage('Unable to sync right now. Please try again in a moment.');
    }
    setTimeout(() => setClaimMessage(null), 4500);
  };

  if (!isOpen) return null;

  const totalReferrals = stats?.totalUniqueClicks || 0;
  const verifiedCount = stats?.milestoneProgress?.currentDevices ?? totalReferrals;

  const TIERS = [
    { target: 3, reward: '7 Days VIP Pass', desc: 'Free 7-day ad-free pass for 3 friends' },
    { target: 5, reward: '1 Month VIP Pass', desc: 'Full 30-day VIP ad-free unlock' },
    { target: 10, reward: '3 Months VIP Pass', desc: 'Quarterly VIP pass with 4K lines' },
    { target: 25, reward: 'Lifetime VIP Pass', desc: 'Unlimited lifetime VIP access' }
  ];

  const nextTier = TIERS.find(t => t.target > verifiedCount) || TIERS[TIERS.length - 1];
  const progressPct = Math.min(100, Math.round((verifiedCount / nextTier.target) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--theme-bg,#070A11)]/85 backdrop-blur-md overflow-y-auto select-none">
      <div className="relative w-full max-w-lg bg-[var(--theme-bg,#070A11)] border border-[var(--theme-border,rgba(56,189,248,0.35))] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.95)] overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="relative p-5 sm:p-6 bg-[var(--theme-surface,#0E131F)] border-b border-[var(--theme-border,rgba(56,189,248,0.22))] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl btn-premium-primary flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-white shrink-0" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Refer & Earn Free VIP</h2>
              <p className="text-xs text-[#C9D1E0]">Share your code or apply a friend's code for instant VIP</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close referral modal"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[76vh] space-y-5 custom-scrollbar">
          {/* 1. APPLY A FRIEND'S REFERRAL CODE BOX (Dual-Sided Instant Bonus) */}
          <div className="bg-[#080d21] border border-[#00D9FF]/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <span>Have a Friend's Referral Code?</span>
              </span>
              <span className="text-[11px] font-bold text-[#00D9FF] shrink-0">
                +2 Hours Instant VIP Bonus
              </span>
            </div>

            {appliedReferrerCode ? (
              <div className="p-3 rounded-lg bg-[#00D9FF]/15 border border-[#00D9FF]/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[#00D9FF] font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-[#00D9FF] shrink-0" />
                  <span>Applied Friend Code: <strong className="font-mono text-white">{appliedReferrerCode}</strong></span>
                </div>
                <span className="text-[10px] font-mono text-[#00D9FF] uppercase font-bold">Active</span>
              </div>
            ) : (
              <form onSubmit={handleApplyFriendCode} className="flex items-center gap-2">
                <input
                  type="text"
                  value={friendCodeInput}
                  onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. MRS-IPTV-XXXXXX)"
                  className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#050816] border border-[#00D9FF]/30 text-xs font-mono text-white placeholder-[#C9D1E0]/45 focus:outline-none focus:border-[#00D9FF] uppercase"
                />
                <button
                  type="submit"
                  disabled={isApplyingCode || !friendCodeInput.trim()}
                  className="min-h-[44px] px-4 rounded-lg bg-gradient-to-r from-[#00D9FF] via-[#176BFF] to-[#B832F5] disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider border border-[#00D9FF] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  {isApplyingCode ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Ticket className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>Apply Code</span>
                </button>
              </form>
            )}

            {applyFeedback && (
              <p className={`text-xs font-semibold ${applyFeedback.type === 'success' ? 'text-[#00D9FF]' : 'text-[#B832F5]'}`}>
                {applyFeedback.text}
              </p>
            )}
          </div>

          {/* 2. YOUR PERSONAL REFERRAL CODE & LINK */}
          <div className="bg-[#080d21] border border-[#00D9FF]/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">Your Personal Referral Code & Link</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(referralCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="min-h-[32px] px-2.5 rounded-md bg-[#00D9FF]/10 hover:bg-[#00D9FF]/20 text-xs text-[#00D9FF] hover:text-white font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span>{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-[#050816] border border-[#00D9FF]/35 gap-2">
              <span className="font-mono text-sm sm:text-base font-black text-[#00D9FF] tracking-wider">
                {referralCode || 'Loading...'}
              </span>
              <span className="text-[11px] text-[#C9D1E0] text-right">
                Friends get 2h VIP · You get Tier VIP
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#050816] border border-[#00D9FF]/20">
              <span className="font-mono text-xs text-[#C9D1E0] truncate">
                {shareUrl || 'Loading share link...'}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="min-h-[36px] px-3 rounded-lg bg-[#080d21] hover:bg-[#0c1433] border border-[#00D9FF]/30 text-xs text-[#00D9FF] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedLink ? <Check className="w-3 h-3 text-[#00D9FF] shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* 3. 1-TAP SOCIAL SHARE BUTTONS */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#C9D1E0] block">1-Tap Share to Friends</span>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => shareToSocial('whatsapp', shareUrl)}
                className="min-h-[54px] py-2.5 px-3 rounded-lg btn-premium-emerald text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => shareToSocial('telegram', shareUrl)}
                className="min-h-[54px] py-2.5 px-3 rounded-lg btn-premium-cyan text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Send className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <span>Telegram</span>
              </button>
              <button
                type="button"
                onClick={() => shareToSocial('facebook', shareUrl)}
                className="min-h-[54px] py-2.5 px-3 rounded-lg btn-premium-glass text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <span>Facebook</span>
              </button>
              <button
                type="button"
                onClick={() => shareToSocial('native', shareUrl)}
                className="min-h-[54px] py-2.5 px-3 rounded-lg btn-premium-purple text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-[#D875FF] shrink-0" />
                <span>More</span>
              </button>
            </div>
          </div>

          {/* 4. MILESTONE PROGRESS CARD */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#00D9FF] shrink-0" />
                  <span className="tabular-nums">Your Referral Progress ({verifiedCount} Joined)</span>
                </span>
                <p className="text-[11px] text-[#C9D1E0] mt-0.5 tabular-nums">
                  Next reward at {nextTier.target} friends ({nextTier.reward})
                </p>
              </div>
              <button
                type="button"
                aria-label="Refresh referral stats"
                onClick={() => loadStats(referralCode)}
                className="w-9 h-9 flex items-center justify-center rounded-lg btn-premium-cyan text-[#C9D1E0] hover:text-white transition-all cursor-pointer shrink-0"
                title="Refresh stats"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#00D9FF] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="w-full h-2.5 bg-[var(--theme-bg,#070A11)] rounded-full overflow-hidden border border-[var(--theme-border,rgba(56,189,248,0.30))]">
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, var(--theme-accent, #38BDF8) 0%, var(--theme-accent-secondary, #10B981) 100%)'
                }}
              />
            </div>

            <div className="space-y-1.5 pt-2">
              {TIERS.map((tier) => {
                const isUnlocked = verifiedCount >= tier.target;
                return (
                  <div
                    key={tier.target}
                    className={`flex items-center justify-between p-2.5 rounded-lg text-xs border ${
                      isUnlocked
                        ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                        : 'bg-[#050816]/85 border-[#00D9FF]/20 text-[#C9D1E0]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isUnlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-md border border-[#00D9FF]/45 flex items-center justify-center text-[9px] font-bold text-[#00D9FF] tabular-nums shrink-0">
                          {tier.target}
                        </div>
                      )}
                      <div>
                        <span className="font-bold text-white block">{tier.reward}</span>
                        <span className="text-[10px] text-[#C9D1E0]">{tier.desc}</span>
                      </div>
                    </div>
                    <span className={`text-[11px] font-mono tabular-nums font-bold shrink-0 ${isUnlocked ? 'text-emerald-400' : 'text-[#00D9FF]'}`}>
                      {isUnlocked ? 'Unlocked ✓' : `${tier.target} Friends`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {claimMessage && (
            <div className="p-3 rounded-lg bg-[#00D9FF]/15 border border-[#00D9FF]/45 text-[#00D9FF] text-xs font-medium text-center">
              {claimMessage}
            </div>
          )}

          {/* Sync & Claim Button */}
          <button
            type="button"
            onClick={handleClaimReward}
            className="w-full min-h-[46px] py-3.5 px-4 rounded-xl btn-premium-emerald text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Sync & Activate Unlocked VIP Rewards</span>
          </button>
        </div>
      </div>
    </div>
  );
};
