import React from 'react';
import { AdFreeState } from '../types';
import { AdBannerUnit } from './AdBannerUnit';

interface PartnerAdShowcaseProps {
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
}

/**
 * Single non-numbered featured sponsor unit (no multi-link listing or numbering).
 */
export const PartnerAdShowcase: React.FC<PartnerAdShowcaseProps> = ({
  adFreeState,
  onRewardedGranted,
  onOpenVipModal
}) => {
  return (
    <AdBannerUnit
      placement="home-top"
      adFreeState={adFreeState}
      onRewardedGranted={onRewardedGranted}
      onOpenVipModal={onOpenVipModal}
    />
  );
};
