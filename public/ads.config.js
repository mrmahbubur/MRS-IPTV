/**
 * M R S IPTV - Central Monetag Ad Configuration (ads.config.js)
 * Pure data only: Monetag snippets/URLs are stored here inertly and loaded
 * ONLY by ad-manager.js when window.MRS_ADS.state() === "free",
 * or by rewardAds.js for Monetag's official rewarded ad completion callback.
 * Owner publisher ID and Monetag zones are preserved verbatim.
 */
(function (win) {
  'use strict';

  win.MRS_ADS_CONFIG = {
    apiBaseUrl: '',
    testMode: true,

    excludedViews: ['checkout', 'activate', 'account', 'support', 'legal', 'admin'],
    excludedPages: ['/checkout', '/activate', '/account', '/support', '/legal', '/admin'],

    publisherMeta: {
      monetag: 'fa9656182dbc7301dcd9a2326441dcf3'
    },

    monetag: {
      verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
      showRegularAds: false,
      rewarded: {
        enabled: false,
        // Owner pastes official rewarded snippet / completion function from Monetag dashboard here.
        snippet: null,
        showFn: null
      },
      // 10 Owner Verified Monetag Direct Smartlink Zones (unchanged)
      directZones: [
        { id: 'uplcm-11226634', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: 'Ultra-HD Sports & Match Priority Line' },
        { id: 'uplcm-11683565', zoneId: '11683565', url: 'https://uplcm.com/4/11683565', label: 'Live Sports Score & Goal Alert Feed' },
        { id: 'uplcm-11242745', zoneId: '11242745', url: 'https://uplcm.com/4/11242745', label: 'Sports Highlight & Match Replay Hub' },
        { id: 'uplcm-11242069', zoneId: '11242069', url: 'https://uplcm.com/4/11242069', label: 'VIP Sports Fans Community Lounge' },
        { id: 'uplcm-11242067', zoneId: '11242067', url: 'https://uplcm.com/4/11242067', label: '24/7 Exclusive HD Cinema & Live Broadcasts' },
        { id: 'uplcm-11242742', zoneId: '11242742', url: 'https://uplcm.com/4/11242742', label: 'Global Sports Discussion & Fixture Hub' },
        { id: 'uplcm-11230440', zoneId: '11230440', url: 'https://uplcm.com/4/11230440', label: 'High-Speed Global IPTV Mirror Support' },
        { id: 'uplcm-11683560', zoneId: '11683560', url: 'https://uplcm.com/4/11683560', label: 'Prime Broadcast CDN & Zero-Lag Relay' },
        { id: 'uplcm-9912130',  zoneId: '9912130',  url: 'https://uplcm.com/4/9912130',  label: 'All-Day Cinema, Reels & Sports Lounge' },
        { id: 'uplcm-11242744', zoneId: '11242744', url: 'https://uplcm.com/4/11242744', label: 'International Match Stream Partner Network' }
      ],
      vignette: {
        zoneId: '11242067',
        url: 'https://uplcm.com/4/11242067',
        scriptSrc: null,
        inlineSnippet: null
      },
      popunder: {
        zoneId: '11226634',
        scriptSrc: null,
        inlineSnippet: null,
        directZoneUrl: 'https://uplcm.com/4/11226634'
      },
      push: {
        workerPath: null,
        scriptSrc: null
      }
    },

    rewards: {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      unlocksVipChannels: true
    },

    caps: {
      popunderCooldownMs: 30 * 60 * 1000, // 1 per 30 minutes
      popunderMaxPerDay: 3,               // max 3 per day
      interstitialCooldownMs: 3 * 60 * 1000, // 1 per 3 minutes
      interstitialMaxPerDay: 12,          // max 12 per day
      pushDelayMs: 60 * 1000,             // after 60 seconds on site
      pushMinVisits: 2,                   // or 2nd visit
      pushDeclineDays: 30,                // remember "No" for 30 days
      emptySlotCollapseMs: 4000           // collapse unfilled dynamic slots after 4s
    }
  };
})(window);
