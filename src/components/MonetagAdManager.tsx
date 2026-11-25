import React, { useEffect } from 'react';
import { AdFreeState } from '../types';
import { useAdGate } from '../lib/useAdGate';

interface MonetagAdManagerProps {
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
}

/**
 * MonetagAdManager
 * Mirrors central window.MRS_ADS gate state, enforces DOM cleanup of ad elements when state !== 'free',
 * and suppresses any residual ad navigation clicks if VIP/pending is active.
 */
export const MonetagAdManager: React.FC<MonetagAdManagerProps> = () => {
  const { isFreeMode, adState } = useAdGate();

  const purgeMonetagFromDom = () => {
    try {
      const vipLocked = adState !== 'free';
      (window as any).__MRS_IS_VIP = adState === 'vip';

      if (!vipLocked) return;

      const selectors = [
        '#monetag-tag-script',
        '#monetag-midnight-vignette',
        'script[src*="quge5.com"]',
        'script[data-zone="300808"]',
        'script[src*="n6wxm.com"]',
        'script[data-zone="12138523"]',
        'script[src*="uplcm.com"]',
        'script[src*="rzekl.com"]',
        'script[src*="highperformanceformat"]',
        'script[src*="topcreativeformat"]',
        'script[src*="profitablegate"]',
        'iframe[src*="quge5.com"]',
        'iframe[src*="5gvci.com"]',
        'iframe[src*="n6wxm.com"]',
        'iframe[src*="asiafilm.org"]',
        'iframe[src*="uplcm.com"]',
        'iframe[src*="rzekl.com"]',
        'div[id*="monetag"]',
        'div[class*="monetag"]',
        'div[id*="vignette"]',
        '.ad-slot',
        '.ad-sticky-banner',
        '#mrs-sticky-mobile-ad'
      ].join(', ');

      document.querySelectorAll(selectors).forEach((el) => el.remove());
    } catch {}
  };

  useEffect(() => {
    purgeMonetagFromDom();
  }, [adState, isFreeMode]);

  useEffect(() => {
    const handleCaptureAdBlock = (e: Event) => {
      const gateState = (window as any).MRS_ADS?.state?.() || (window as any).MRS_AD_STATE || 'pending';
      if (gateState !== 'free') {
        const target = e.target as HTMLElement | null;
        if (target) {
          const anchor = target.closest('a');
          if (
            anchor &&
            (anchor.hasAttribute('data-ad-link') ||
              anchor.href?.includes('quge5.com') ||
              anchor.href?.includes('5gvci.com') ||
              anchor.href?.includes('n6wxm.com') ||
              anchor.href?.includes('asiafilm.org') ||
              anchor.href?.includes('uplcm.com') ||
              anchor.href?.includes('rzekl.com') ||
              anchor.href?.includes('/go/') ||
              anchor.href?.includes('/api/ads/redirect') ||
              anchor.id?.includes('monetag') ||
              anchor.className?.includes('monetag'))
          ) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
      }
    };

    window.addEventListener('click', handleCaptureAdBlock, true);
    window.addEventListener('touchstart', handleCaptureAdBlock, { capture: true, passive: false });
    window.addEventListener('touchend', handleCaptureAdBlock, { capture: true, passive: false });

    return () => {
      window.removeEventListener('click', handleCaptureAdBlock, true);
      window.removeEventListener('touchstart', handleCaptureAdBlock, true);
      window.removeEventListener('touchend', handleCaptureAdBlock, true);
    };
  }, []);

  return null;
};
