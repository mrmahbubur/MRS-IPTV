import React from 'react';
import { AdFreeState } from '../types';

interface InPlayerAdBannerProps {
  isBuffering: boolean;
  isPlaying: boolean;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
}

/**
 * Overlay ads over the video player are strictly disabled per policy.
 * Free users receive at most one non-intrusive banner unit below the player card.
 */
export const InPlayerAdBanner: React.FC<InPlayerAdBannerProps> = () => {
  return null;
};
