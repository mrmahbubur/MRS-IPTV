import React, { useState, useEffect } from 'react';
import { Gift, ExternalLink, X, Globe, Crown } from 'lucide-react';
import hourlySupportBannerImg from '../assets/images/hourly_ad_support_banner_1791108106898.jpg';
import {
  AdZoneConfig,
  getNextAdZone,
  getRandomAdZone,
  recordAdEvent,
  confirmAndOpenNextAdZone,
  grantRewardedAdFreeTime,
  getBackendAdRedirectUrl,
  canTriggerInterstitialAd,
  markInterstitialAdShown,
  hasUserViewedAdInLastHour
} from '../lib/adSystem';
import { AdFreeState } from '../types';

interface LocalizedPromptData {
  langKey: string;
  languageName: string;
  badge: string;
  headline: string;
  subtext: string;
  ctaText: string;
}

const CLIENT_LANGUAGE_FALLBACKS: Record<string, LocalizedPromptData> = {
  bn: {
    langKey: 'bn',
    languageName: 'বাংলা',
    badge: 'ফ্রি লাইভ টিভি সাপোর্ট · ৫ সেকেন্ডের বার্তা',
    headline: 'ফ্রি স্ট্রিমিং চালু রাখতে একটি স্পনসর বিজ্ঞাপন দেখুন!',
    subtext: 'আপনি এখনও কোনো বিজ্ঞাপন দেখেননি বা VIP পাস চালু করেননি। ৮,৮৯০+ চ্যানেল ফ্রি দেখতে নিচের বাটনে ট্যাপ করে ১ ঘণ্টার ফ্রি VIP আনলক করুন।',
    ctaText: 'বিজ্ঞাপন দেখুন ও ১ ঘণ্টা ফ্রি VIP পান'
  },
  hi: {
    langKey: 'hi',
    languageName: 'हिन्दी',
    badge: 'फ्री लाइव टीवी सपोर्ट · 5 सेकंड का संदेश',
    headline: 'फ्री स्ट्रीमिंग जारी रखने के लिए एक स्पॉन्सर विज्ञापन देखें!',
    subtext: 'आपने अभी तक कोई विज्ञापन नहीं देखा है और न ही VIP पास लिया है। 8,890+ लाइव चैनल फ्री देखने के लिए नीचे टैप करें और 1 घंटे का फ्री VIP पाएं।',
    ctaText: 'विज्ञापन देखें और 1 घंटा फ्री VIP पाएं'
  },
  ur: {
    langKey: 'ur',
    languageName: 'اردو',
    badge: 'فری لائیو ٹی وی سپورٹ · 5 سیکنڈ کا پیغام',
    headline: 'فری اسٹریمنگ جاری رکھنے کے لیے ایک اسپانسر اشتہار دیکھیں!',
    subtext: 'آپ نے ابھی تک کوئی اشتہار نہیں دیکھا اور نہ ہی VIP پاس لیا ہے۔ 8,890+ چینلز مفت دیکھنے اور 1 گھنٹہ فری VIP حاصل کرنے کے لیے نیچے کلک کریں۔',
    ctaText: 'اشتہار دیکھیں اور 1 گھنٹہ فری VIP حاصل کریں'
  },
  ar: {
    langKey: 'ar',
    languageName: 'العربية',
    badge: 'دعم البث المباشر المجاني · رسالة 5 ثوانٍ',
    headline: 'شاهد إعلان الراعي لاستمرار البث المباشر مجاناً!',
    subtext: 'لم تشاهد أي إعلان ولم تفعل اشتراك VIP بعد. اضغط أدناه لمشاهدة عرض الراعي والحصول على ساعة كاملة من البث بدون إعلانات.',
    ctaText: 'شاهد الإعلان واحصل على ساعة VIP مجاناً'
  },
  es: {
    langKey: 'es',
    languageName: 'Español',
    badge: 'Soporte de TV en Vivo · Aviso de 5s',
    headline: '¡Mira un anuncio patrocinado para mantener la TV en vivo gratis!',
    subtext: 'Aún no has visto anuncios ni tienes pase VIP. Toca abajo para apoyar el servidor gratuito y desbloquear 1 Hora VIP sin anuncios.',
    ctaText: 'Ver Anuncio y Obtener 1h VIP Gratis'
  },
  en: {
    langKey: 'en',
    languageName: 'English',
    badge: 'Free Live TV Support · 5s Reminder',
    headline: 'Watch a Quick Sponsor Ad to Keep 8,890+ Channels Free!',
    subtext: 'You have not viewed any sponsor ads or activated a VIP Pass yet. Tap below to support our high-speed servers and unlock 1 Hour of Free VIP.',
    ctaText: 'Watch Sponsor Ad & Get 1h Free VIP'
  }
};

function detectInitialClientLanguage(): LocalizedPromptData {
  try {
    const lang = (navigator.language || 'en').toLowerCase();
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
    if (lang.startsWith('bn') || tz.includes('dhaka')) return CLIENT_LANGUAGE_FALLBACKS.bn;
    if (lang.startsWith('hi') || tz.includes('kolkata') || tz.includes('calcutta')) return CLIENT_LANGUAGE_FALLBACKS.hi;
    if (lang.startsWith('ur') || tz.includes('karachi')) return CLIENT_LANGUAGE_FALLBACKS.ur;
    if (lang.startsWith('ar') || tz.includes('riyadh') || tz.includes('dubai')) return CLIENT_LANGUAGE_FALLBACKS.ar;
    if (lang.startsWith('es')) return CLIENT_LANGUAGE_FALLBACKS.es;
  } catch {}
  return CLIENT_LANGUAGE_FALLBACKS.en;
}

interface HourlyAdReminderOverlayProps {
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
}

export const HourlyAdReminderOverlay: React.FC<HourlyAdReminderOverlayProps> = ({
  adFreeState,
  onRewardedGranted,
  onOpenVipModal
}) => {
  const isVip = !!(adFreeState?.isActive || adFreeState?.isAdFree);
  const [isVisible, setIsVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getRandomAdZone());
  const [localizedData, setLocalizedData] = useState<LocalizedPromptData>(() => detectInitialClientLanguage());

  useEffect(() => {
    const handleRotation = (e: Event) => {
      const evt = e as CustomEvent<{ nextZone?: AdZoneConfig }>;
      if (evt.detail?.nextZone) {
        setActiveZone(evt.detail.nextZone);
      } else {
        setActiveZone(getRandomAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleRotation);
  }, []);

  // Fetch server-side geo + AI localized prompt on mount
  useEffect(() => {
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
    let tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {}

    fetch('/api/ai/localized-ad-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, timezone: tz })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.headline) {
          setLocalizedData(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isVip) {
      setIsVisible(false);
      return;
    }

    const checkAndShowHourlyReminder = () => {
      if (isVip) return;
      try {
        if (!hasUserViewedAdInLastHour() && canTriggerInterstitialAd()) {
          const nextZone = getRandomAdZone();
          setActiveZone(nextZone);
          markInterstitialAdShown();
          recordAdEvent('impression', nextZone, 'hourly-visual-reminder');
          setSecondsLeft(5);
          setIsVisible(true);
        }
      } catch {}
    };

    // Check after 2 minutes of initial stream watch, then periodically every 15 minutes
    const initialTimer = setTimeout(checkAndShowHourlyReminder, 2 * 60 * 1000);
    const periodicInterval = setInterval(checkAndShowHourlyReminder, 15 * 60 * 1000);

    const handleManualTrigger = () => {
      const nextZone = getRandomAdZone();
      setActiveZone(nextZone);
      recordAdEvent('impression', nextZone, 'hourly-visual-reminder');
      setSecondsLeft(5);
      setIsVisible(true);
    };
    window.addEventListener('mrs_trigger_hourly_ad_reminder', handleManualTrigger);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(periodicInterval);
      window.removeEventListener('mrs_trigger_hourly_ad_reminder', handleManualTrigger);
    };
  }, [isVip]);

  useEffect(() => {
    if (!isVisible) return;

    const countdownInterval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setIsVisible(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [isVisible]);

  if (!isVisible || isVip) return null;

  const progressPct = ((5 - secondsLeft) / 5) * 100;

  const backendAdUrl = getBackendAdRedirectUrl('hourly-visual-reminder-click', activeZone.zoneId);

  const handleWatchAdAndClaimVip = (_e: React.MouseEvent<HTMLAnchorElement>) => {
    recordAdEvent('click', activeZone, 'hourly-visual-reminder-click');
    // Single click: browser natively opens backend redirect in new tab
    const newState = grantRewardedAdFreeTime(1);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    setTimeout(() => {
      setIsVisible(false);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-lg bg-[#0E1019] border border-amber-400/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top 5-Second Auto-Close Progress Bar */}
        <div className="w-full h-1.5 bg-[#07080D]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-500 transition-all duration-1000 ease-linear"
            style={{ width: `${100 - progressPct}%` }}
          />
        </div>

        {/* Visual Generated Image Banner with Native-Language Text Overlay */}
        <a
          href={backendAdUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-ad-link="true"
          onClick={handleWatchAdAndClaimVip}
          className="relative block w-full aspect-video overflow-hidden bg-black group cursor-pointer"
        >
          <img
            src={hourlySupportBannerImg}
            alt="Support Free Live TV Streaming"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/mrs-iptv-logo.png';
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1019] via-black/65 to-black/30 flex flex-col justify-between p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 drop-shadow">
                <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{localizedData.languageName} · {localizedData.badge}</span>
              </div>

              <span className="text-xs font-mono font-bold tabular-nums text-white bg-black/85 px-2.5 py-1 rounded-md border border-amber-400/45">
                {secondsLeft}s
              </span>
            </div>

            <div className="space-y-2 text-left">
              <h2 className="text-lg sm:text-2xl font-black text-white leading-snug drop-shadow-lg">
                {localizedData.headline}
              </h2>
              <p className="text-xs sm:text-sm text-[#C9D1E0] leading-relaxed drop-shadow line-clamp-3">
                {localizedData.subtext}
              </p>
            </div>
          </div>
        </a>

        {/* Bottom Action Bar */}
        <div className="p-4 sm:p-5 bg-[#0E1019] space-y-2.5">
          <a
            href={backendAdUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-ad-link="true"
            onClick={handleWatchAdAndClaimVip}
            className="w-full min-h-[46px] py-3.5 px-5 rounded-xl btn-premium-gold text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Gift className="w-4 h-4 shrink-0 text-amber-300" />
            <span>{localizedData.ctaText}</span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>

          <div className="flex items-center justify-between pt-1 gap-2">
            {onOpenVipModal ? (
              <button
                type="button"
                onClick={() => {
                  setIsVisible(false);
                  onOpenVipModal();
                }}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-400 hover:text-amber-300 hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 shrink-0" />
                <span>Get Permanent Ad-Free VIP Pass</span>
              </button>
            ) : <span />}

            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#C9D1E0] hover:text-white hover:bg-white/5 flex items-center gap-1.5 cursor-pointer tabular-nums"
            >
              <span>Auto-closing in {secondsLeft}s</span>
              <X className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
