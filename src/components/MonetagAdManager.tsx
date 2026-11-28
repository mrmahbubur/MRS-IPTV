import React, { useEffect } from 'react';
import { AdFreeState } from '../types';
import { useAdGate, detectClientVipState } from '../lib/useAdGate';

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
  const { isFreeMode, adState, adConfig } = useAdGate();

  const purgeMonetagFromDom = () => {
    try {
      const clientVip = detectClientVipState();
      const vipLocked = adState !== 'free' || clientVip.isLocked;
      (window as any).__MRS_IS_VIP = adState === 'vip' || clientVip.isVip;

      if (vipLocked) {
        const selectors = [
          '#monetag-tag-script',
          '#monetag-midnight-vignette',
          '#mrs-monetag-interstitial',
          '#mrs-popunder-script',
          '[data-zone]',
          '[data-ad-zone]',
          '[data-monetag-zone]',
          'ins[data-zone]',
          'script[data-mrs-ad-injected="1"]',
          'script[data-zone]',
          'script[src*="quge5.com"]',
          'script[src*="5gvci.com"]',
          'script[src*="al5sm.com"]',
          'script[src*="whomeehe.com"]',
          'script[src*="acscdn.com"]',
          'script[src*="tzegilo.com"]',
          'script[src*="madurird.com"]',
          'script[src*="n6wxm.com"]',
          'script[src*="uplcm.com"]',
          'script[src*="monetag.com"]',
          'iframe[src*="quge5.com"]',
          'iframe[src*="5gvci.com"]',
          'iframe[src*="n6wxm.com"]',
          'iframe[src*="al5sm.com"]',
          'iframe[src*="whomeehe.com"]',
          'iframe[src*="acscdn.com"]',
          'iframe[src*="tzegilo.com"]',
          'iframe[src*="madurird.com"]',
          'iframe[src*="uplcm.com"]',
          'iframe[src*="monetag"]',
          'iframe[id*="monetag"]',
          'iframe[class*="monetag"]',
          'iframe[id*="vignette"]',
          'iframe[id*="interstitial"]',
          'iframe[id*="popunder"]',
          'iframe[data-mrs-ad-frame="1"]',
          'div[id*="monetag"]',
          'div[class*="monetag"]',
          'aside[id*="monetag"]',
          'aside[class*="monetag"]',
          'section[id*="monetag"]',
          'section[class*="monetag"]',
          'div[id*="vignette"]',
          'div[class*="vignette"]',
          'div[id*="interstitial"]',
          'div[class*="interstitial"]',
          'div[id*="popunder"]',
          'div[class*="popunder"]',
          'a[data-ad-link]',
          '.ad-slot',
          '.ad-sticky-banner',
          '#mrs-sticky-mobile-ad',
          '#mrs-consent-banner',
          '#mrs-push-preprompt',
          '#mrs-reward-sim-modal',
        ].join(', ');

        document.querySelectorAll(selectors).forEach((el) => el.remove());
      } else if (!adConfig.formats.interstitial) {
        document
          .querySelectorAll(
            '#mrs-monetag-interstitial, #monetag-midnight-vignette, div[id*="vignette"], div[class*="vignette"], div[id*="interstitial"], div[class*="interstitial"], iframe[id*="vignette"], iframe[id*="interstitial"]'
          )
          .forEach((el) => el.remove());
      }
    } catch {}
  };

  useEffect(() => {
    purgeMonetagFromDom();
  }, [adState, isFreeMode, adConfig.formats.interstitial]);

  useEffect(() => {
    try {
      const verId = adConfig.monetag?.verificationId;
      if (verId) {
        const meta = document.querySelector('meta[name="monetag"]');
        if (meta && meta.getAttribute('content') !== verId) {
          meta.setAttribute('content', verId);
        }
      }
    } catch {}
  }, [adConfig.monetag?.verificationId]);

  useEffect(() => {
    const handleCaptureAdBlock = (e: Event) => {
      const clientVip = detectClientVipState();
      if (clientVip.isLocked || clientVip.isVip) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const anchor = target.closest('a');
          const anchorId = (anchor?.id || '').toLowerCase();
          const anchorClass = (typeof anchor?.className === 'string' ? anchor.className : '').toLowerCase();
          if (
            anchor &&
            (anchor.hasAttribute('data-ad-link') ||
              anchor.href?.includes('quge5.com') ||
              anchor.href?.includes('5gvci.com') ||
              anchor.href?.includes('n6wxm.com') ||
              anchor.href?.includes('al5sm.com') ||
              anchor.href?.includes('whomeehe.com') ||
              anchor.href?.includes('acscdn.com') ||
              anchor.href?.includes('tzegilo.com') ||
              anchor.href?.includes('madurird.com') ||
              anchor.href?.includes('uplcm.com') ||
              anchor.href?.includes('monetag.com') ||
              anchor.href?.includes('/api/ads/redirect') ||
              anchorId.includes('monetag') ||
              anchorId.includes('vignette') ||
              anchorId.includes('interstitial') ||
              anchorId.includes('popunder') ||
              anchorClass.includes('monetag') ||
              anchorClass.includes('vignette') ||
              anchorClass.includes('interstitial') ||
              anchorClass.includes('popunder'))
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
