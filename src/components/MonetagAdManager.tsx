import React, { useEffect } from 'react';
import { AdFreeState } from '../types';
import { getStoredAdFreeState } from '../lib/codes';

interface MonetagAdManagerProps {
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
}

/**
 * MonetagAdManager
 * Enforces removal of obsolete 3rd-party script tags (quge5.com / n6wxm.com / 5gvci.com / asiafilm.org)
 * and strictly guards VIP ad-free mode. All monetized ads use the 10 direct verified uplcm.com links
 * rotating in sequence via src/lib/adSystem.ts.
 */
export const MonetagAdManager: React.FC<MonetagAdManagerProps> = ({
  adFreeState
}) => {
  const currentStored = getStoredAdFreeState();
  const effectiveVip = !!(
    (adFreeState?.isActive || adFreeState?.isAdFree) ||
    (currentStored?.isActive || currentStored?.isAdFree)
  );

  // Helper to purge any legacy tags, iframes, or popups from DOM
  const purgeMonetagFromDom = () => {
    try {
      (window as any).__MRS_IS_VIP = effectiveVip;

      // Remove any leftover legacy tag or vignette scripts
      const existingScript = document.getElementById('monetag-tag-script');
      if (existingScript) existingScript.remove();

      const existingVignette = document.getElementById('monetag-midnight-vignette');
      if (existingVignette) existingVignette.remove();

      // Remove any injected iframes, scripts, anchors or overlays from obsolete domains
      const elements = document.querySelectorAll(
        'script[src*="quge5.com"], script[data-zone="300808"], script[src*="n6wxm.com"], script[data-zone="12138523"], ' +
        'iframe[src*="quge5.com"], iframe[src*="5gvci.com"], iframe[src*="n6wxm.com"], iframe[src*="asiafilm.org"], ' +
        'div[id*="monetag"], div[class*="monetag"], div[id*="vignette"], ' +
        'a[href*="quge5.com"], a[href*="5gvci.com"], a[href*="n6wxm.com"], a[href*="asiafilm.org"]'
      );
      elements.forEach(el => el.remove());
    } catch (e) {}
  };

  useEffect(() => {
    purgeMonetagFromDom();
  }, [effectiveVip]);

  useEffect(() => {
    // Listen for VIP activations to immediately purge any ads
    const handleAdfreeUpdated = (e: any) => {
      const state: AdFreeState | undefined = e.detail;
      const isNowVip = !!(state?.isActive || state?.isAdFree);
      (window as any).__MRS_IS_VIP = isNowVip;
      purgeMonetagFromDom();
    };

    window.addEventListener('shahintv_adfree_updated', handleAdfreeUpdated);

    // Global interceptor: when VIP is active, suppress any ad navigations
    const handleCaptureAdBlock = (e: Event) => {
      if ((window as any).__MRS_IS_VIP) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const anchor = target.closest('a');
          if (
            anchor &&
            (anchor.href?.includes('quge5.com') ||
             anchor.href?.includes('5gvci.com') ||
             anchor.href?.includes('n6wxm.com') ||
             anchor.href?.includes('asiafilm.org') ||
             anchor.href?.includes('uplcm.com') ||
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
      window.removeEventListener('shahintv_adfree_updated', handleAdfreeUpdated);
      window.removeEventListener('click', handleCaptureAdBlock, true);
      window.removeEventListener('touchstart', handleCaptureAdBlock, true);
      window.removeEventListener('touchend', handleCaptureAdBlock, true);
    };
  }, []);

  return null;
};
