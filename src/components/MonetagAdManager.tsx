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
const AD_DOMAIN_MARKERS = [
  'quge5.com',
  '5gvci.com',
  'n6wxm.com',
  'al5sm.com',
  'whomeehe.com',
  'acscdn.com',
  'tzegilo.com',
  'madurird.com',
  'otieu.com',
  'nap5k.com',
  'gloaphoo.net',
  'dolohen.com',
  'groleet.com',
  'ousness.com',
  'grookilte.com',
  'zuphaims.com',
  'thubanoa.com',
  'izcle.com',
  'kulroak.com',
  'propellerads',
  'onclkds',
  'uplcm.com',
  'monetag',
];

export const MonetagAdManager: React.FC<MonetagAdManagerProps> = () => {
  const { isFreeMode, adState, adConfig } = useAdGate();

  const purgeMonetagFromDom = () => {
    try {
      const clientVip = detectClientVipState();
      const vipLocked = adState !== 'free' || clientVip.isLocked;
      (window as any).__MRS_IS_VIP = adState === 'vip' || clientVip.isVip;

      if (vipLocked) {
        const scriptDomainSelectors = AD_DOMAIN_MARKERS.map((d) => `script[src*="${d}"]`);
        const iframeDomainSelectors = AD_DOMAIN_MARKERS.map((d) => `iframe[src*="${d}"]`);
        const selectors = [
          '#monetag-tag-script',
          '#monetag-midnight-vignette',
          '#mrs-monetag-interstitial',
          '#mrs-popunder-script',
          '[data-zone]',
          '[data-ad-zone]',
          '[data-monetag]',
          '[data-monetag-zone]',
          '[data-interstitial]',
          '[data-popunder]',
          'ins[data-zone]',
          'script[data-mrs-ad-injected="1"]',
          'script[data-zone]',
          ...scriptDomainSelectors,
          ...iframeDomainSelectors,
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
          'dialog[id*="monetag"]',
          'dialog[class*="monetag"]',
          'div[id*="vignette"]',
          'div[class*="vignette"]',
          'aside[id*="vignette"]',
          'aside[class*="vignette"]',
          'section[id*="vignette"]',
          'section[class*="vignette"]',
          'div[id*="interstitial"]',
          'div[class*="interstitial"]',
          'aside[id*="interstitial"]',
          'aside[class*="interstitial"]',
          'section[id*="interstitial"]',
          'section[class*="interstitial"]',
          'div[id*="popunder"]',
          'div[class*="popunder"]',
          'aside[id*="popunder"]',
          'aside[class*="popunder"]',
          'section[id*="popunder"]',
          'section[class*="popunder"]',
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
            '#mrs-monetag-interstitial, #monetag-midnight-vignette, div[id*="vignette"], div[class*="vignette"], aside[id*="vignette"], aside[class*="vignette"], section[id*="vignette"], section[class*="vignette"], div[id*="interstitial"], div[class*="interstitial"], iframe[id*="vignette"], iframe[id*="interstitial"]'
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
          const hrefLower = (anchor?.href || '').toLowerCase();
          if (
            anchor &&
            (anchor.hasAttribute('data-ad-link') ||
              anchor.hasAttribute('data-zone') ||
              anchor.hasAttribute('data-monetag') ||
              AD_DOMAIN_MARKERS.some((m) => hrefLower.includes(m)) ||
              hrefLower.includes('/api/ads/redirect') ||
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
