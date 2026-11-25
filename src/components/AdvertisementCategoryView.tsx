import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Crown, ExternalLink, Megaphone, CheckCircle2, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { AdFreeState } from '../types';
import {
  ADVERTISEMENT_AFFILIATE_ZONES,
  AdZoneConfig,
  STORED_AD_ZONES,
  getAffiliateGoUrl,
  grantRewardedAdFreeTime,
  recordAdEvent,
} from '../lib/adSystem';
import { useRemoteConfig } from '../hooks/useRemoteConfig';
import { useAdGate } from '../lib/useAdGate';

interface AdvertisementCategoryViewProps {
  onBackHome: () => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
}

type OfferFilter = 'all' | 'affiliate' | 'sponsors';

const OfferCard: React.FC<{
  zone: AdZoneConfig;
  href: string;
  isAffiliate: boolean;
  testMode: boolean;
  onOfferClick: (zone: AdZoneConfig) => void;
}> = ({ zone, href, isAffiliate, testMode, onOfferClick }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !impressionLoggedRef.current) {
          timer = setTimeout(() => {
            if (!impressionLoggedRef.current) {
              impressionLoggedRef.current = true;
              recordAdEvent('impression', zone, 'advertisement-category');
            }
          }, 800);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [zone]);

  let domainLabel = 'Partner Offer';
  try {
    domainLabel = new URL(zone.url).hostname.replace(/^www\./i, '');
  } catch {}

  return (
    <article
      ref={cardRef}
      data-sponsored="true"
      className="ad-slot affiliate-block sponsored-block bg-[var(--theme-card,#131B2B)]/60 hover:bg-[var(--theme-card-hover,#182236)] rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors motion-reduce:transition-none"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#C9D1E0]/75 font-medium flex-wrap">
          <span className="ad-label text-amber-400 font-bold uppercase tracking-wider">
            {isAffiliate ? 'Sponsored · Affiliate link' : 'Sponsored'}
          </span>
          <span aria-hidden="true">·</span>
          <span className={isAffiliate ? 'text-amber-300 font-semibold' : 'text-[var(--theme-accent,#38BDF8)] font-semibold'}>
            {zone.network}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{domainLabel}</span>
        </div>

        <h3 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug">
          {zone.label}
        </h3>

        <p className="text-xs sm:text-sm text-[#C9D1E0]/85 leading-relaxed">
          {zone.subtitle}
        </p>
      </div>

      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-xs text-[#C9D1E0]/70 truncate">
          {testMode ? 'Test Mode Placeholder' : 'Opens in new tab'}
        </span>
        {testMode ? (
          <span className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-extrabold inline-flex items-center justify-center shrink-0">
            [Test Offer: {zone.zoneId.slice(0, 10)}]
          </span>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="sponsored nofollow noopener"
            data-ad-link="true"
            onClick={() => onOfferClick(zone)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl btn-premium-primary text-xs font-extrabold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#38BDF8)]"
          >
            <span>{zone.ctaText || 'Visit Offer'}</span>
            <ExternalLink strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0" />
          </a>
        )}
      </div>
    </article>
  );
};

export const AdvertisementCategoryView: React.FC<AdvertisementCategoryViewProps> = ({
  onBackHome,
  adFreeState,
  onRewardedGranted,
  onOpenVipModal,
}) => {
  const remoteConfig = useRemoteConfig();
  const { isFreeMode, isVipLocked, adConfig } = useAdGate();
  const [filter, setFilter] = useState<OfferFilter>('all');
  const [claimedOfferLabel, setClaimedOfferLabel] = useState<string | null>(null);
  const isVip = isVipLocked || !isFreeMode;

  const sponsorZones = useMemo(
    () => STORED_AD_ZONES.filter((z) => z.category !== 'advertisement'),
    []
  );

  // Strictly block affiliate/ad offers for VIP users or pending fail-closed states
  if (isVip || !adConfig.formats.affiliate) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-24 lg:pb-10">
        <div className="max-w-3xl mx-auto p-6 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-black text-white">
            {isVipLocked ? 'VIP Ad-Free Experience Active' : 'Offers Unavailable'}
          </h2>
          <p className="text-sm text-[#C9D1E0]/85 max-w-md mx-auto">
            {isVipLocked
              ? 'Your active VIP Pass completely hides all sponsored links, affiliate offers, and promotions across every page.'
              : 'Partner offers are currently paused.'}
          </p>
          <button
            type="button"
            onClick={onBackHome}
            className="min-h-[44px] px-5 py-2.5 rounded-xl btn-premium-primary text-xs font-extrabold text-white inline-flex items-center gap-2 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Live Channels</span>
          </button>
        </div>
      </div>
    );
  }

  const handleOfferClick = (zone: AdZoneConfig) => {
    recordAdEvent('click', zone, 'advertisement-category');
    const rewardHours = remoteConfig.adsConfig.rewardHours || 1;
    const newState = grantRewardedAdFreeTime(rewardHours);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    setClaimedOfferLabel(zone.label);
  };

  const showAffiliates = filter === 'all' || filter === 'affiliate';
  const showSponsors = (filter === 'all' || filter === 'sponsors') && adConfig.formats.banner;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth-hardware pb-24 lg:pb-10">
      <motion.div
        key="category-advertisement"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="w-11 h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center text-white cursor-pointer shrink-0 transition-colors motion-reduce:transition-none"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ChevronLeft strokeWidth={1.75} className="w-5 h-5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
            </button>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <Megaphone strokeWidth={1.75} className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Advertisement &amp; Partner Offers</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#C9D1E0]/85 mt-0.5">
                Sponsored affiliate links and featured sponsors supporting free live TV access
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl">
              {(
                [
                  { id: 'all', label: 'All Offers' },
                  { id: 'affiliate', label: 'Affiliate Links' },
                  { id: 'sponsors', label: 'Broadcast Sponsors' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer motion-reduce:transition-none ${
                    filter === tab.id
                      ? 'bg-[var(--theme-accent,#38BDF8)]/20 text-white'
                      : 'text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {onOpenVipModal && (
              <button
                type="button"
                onClick={onOpenVipModal}
                className="mrs-free-upsell min-h-[44px] px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Crown strokeWidth={1.75} className="w-4 h-4 shrink-0" />
                <span>Go ad-free with VIP</span>
              </button>
            )}
          </div>
        </div>

        {claimedOfferLabel && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 flex items-center gap-3 text-xs sm:text-sm text-emerald-200">
            <CheckCircle2 strokeWidth={1.75} className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Opened <strong className="text-white">{claimedOfferLabel}</strong> — thank you for supporting M R S IPTV.
            </span>
          </div>
        )}

        {showAffiliates && (
          <section className="space-y-3.5 affiliate-block">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Featured Affiliate Offers
                </h3>
                <p className="text-xs text-[#C9D1E0]/75 mt-0.5">
                  Sponsored · Affiliate links routed via verified partner gateway ({ADVERTISEMENT_AFFILIATE_ZONES.length} active offers)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ADVERTISEMENT_AFFILIATE_ZONES.map((zone) => (
                <OfferCard
                  key={zone.id}
                  zone={zone}
                  href={getAffiliateGoUrl(zone.zoneId, 'advertisement-category', adFreeState?.deviceId?.slice(0, 16))}
                  isAffiliate={true}
                  testMode={adConfig.testMode}
                  onOfferClick={handleOfferClick}
                />
              ))}
            </div>
          </section>
        )}

        {showSponsors && (
          <section className="space-y-3.5 pt-2 border-t border-white/[0.06] sponsored-block">
            <div>
              <h3 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight">
                Broadcast Sponsors
              </h3>
              <p className="text-xs text-[#C9D1E0]/75 mt-0.5">
                Sponsored partner offers helping keep 8,200+ channels free
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sponsorZones.map((zone) => (
                <OfferCard
                  key={zone.id}
                  zone={zone}
                  href={getAffiliateGoUrl(zone.zoneId, 'advertisement-sponsors', adFreeState?.deviceId?.slice(0, 16))}
                  isAffiliate={false}
                  testMode={adConfig.testMode}
                  onOfferClick={handleOfferClick}
                />
              ))}
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
};
