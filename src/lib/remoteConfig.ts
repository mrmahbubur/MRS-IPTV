export interface DynamicRemoteConfig {
  version: number;
  lastUpdated: string;
  announcement: {
    enabled: boolean;
    text: string;
    badgeText: string;
    link?: string;
  };
  featuredHero: {
    channelIdOverride?: string;
    customTitle?: string;
    customSubtitle?: string;
    badgeText?: string;
  };
  adsConfig: {
    enabled: boolean;
    channelPlayThreshold: number;
    dwellTimerSeconds: number;
    rewardHours: number;
    inPlayerBannerEnabled: boolean;
    bannerIntervalSec: number;
    smartlinks: string[];
  };
  uiSpacing: {
    layoutDensity: 'comfortable' | 'compact' | 'spacious';
    channelCardSize: 'standard' | 'large' | 'compact';
    heroSpotlightEnabled: boolean;
    curatedRailsEnabled: boolean;
    recentWatchRowEnabled: boolean;
  };
  proxyDefaults: {
    recommendedProfile: 'auto' | 'vlc' | 'smarters' | 'chrome';
    lowLatencyTargetMs: number;
  };
  camelliaAutoDevStatus: {
    autoHealingActive: boolean;
    lastAutoTune: string;
    statusNote: string;
  };
  monthlyEvolution?: {
    version: string;
    cycleNumber: number;
    monthKey: string;
    evolutionTitle: string;
    aiReasoning: string;
    structuralChanges: string[];
    categoryPriorityOrder: string[];
    themeAccent: string;
    lastAutoEvolvedAt: string;
  };
}

export const DEFAULT_REMOTE_CONFIG: DynamicRemoteConfig = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  announcement: {
    enabled: false,
    text: "Camellia Autonomous Engine active: 8,890+ Live Channels · Zero-Buffer Proxy Enabled",
    badgeText: "CAMELLIA",
    link: "https://mrxshahin.ai.studio"
  },
  featuredHero: {
    customTitle: "Live Sports & Entertainment Center",
    customSubtitle: "Stream 8,890+ live international channels with zero-buffer VLC proxy lines and instant self-healing failover.",
    badgeText: "FEATURED LIVE"
  },
  adsConfig: {
    enabled: true,
    channelPlayThreshold: 4, // Prompts after 4 channel switches in non-VIP mode
    dwellTimerSeconds: 5, // Clean, comfortable 5-second countdown with direct skip/continue
    rewardHours: 1, // 1 hour Ad-Free VIP reward on sponsor engagement
    inPlayerBannerEnabled: true,
    bannerIntervalSec: 180,
    smartlinks: [
      "https://uplcm.com/4/11226634",
      "https://uplcm.com/4/11683565",
      "https://uplcm.com/4/11242745",
      "https://uplcm.com/4/11242069",
      "https://uplcm.com/4/11242067",
      "https://uplcm.com/4/11242742",
      "https://uplcm.com/4/11230440",
      "https://uplcm.com/4/11683560",
      "https://uplcm.com/4/9912130",
      "https://uplcm.com/4/11242744",
      "https://rzekl.com/g/pm1aev55clcb5002cfdd219aa26f6f/",
      "https://rzekl.com/g/1e8d114494cb5002cfdd16525dc3e8/"
    ]
  },
  uiSpacing: {
    layoutDensity: 'comfortable',
    channelCardSize: 'standard',
    heroSpotlightEnabled: true,
    curatedRailsEnabled: true,
    recentWatchRowEnabled: true
  },
  proxyDefaults: {
    recommendedProfile: 'auto',
    lowLatencyTargetMs: 24
  },
  camelliaAutoDevStatus: {
    autoHealingActive: true,
    lastAutoTune: new Date().toISOString(),
    statusNote: "24/7 Autonomous self-development active with real-time UI synchronization"
  },
  monthlyEvolution: {
    version: "v2026.10-EVO.1",
    cycleNumber: 1,
    monthKey: "2026-10",
    evolutionTitle: "October 2026 Autonomous Architecture Evolution",
    aiReasoning: "Camellia Autonomous Engine upgraded internal routing and category priority based on audience viewing patterns, reducing live stream latency without publishing.",
    structuralChanges: [
      "Elevated high-bandwidth sports and live national mirrors to Level-1 cache priority.",
      "Tuned HLS buffer chunk sizing for instantaneous startup across Smart TV & mobile devices.",
      "Updated live category priority rail based on audience viewing analytics.",
      "Refreshed autonomous stream doctor proxy failover thresholds for zero-buffering playback."
    ],
    categoryPriorityOrder: ["Sports", "Bangladeshi", "Movies", "News", "Entertainment", "Indian", "Kids", "Music", "Documentary", "Religious"],
    themeAccent: "autumn-ember-gold",
    lastAutoEvolvedAt: new Date().toISOString()
  }
};

let cachedConfig: DynamicRemoteConfig = { ...DEFAULT_REMOTE_CONFIG };

export async function fetchRemoteConfig(): Promise<DynamicRemoteConfig> {
  try {
    const res = await fetch('/api/system/dynamic-config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) {
        cachedConfig = data;
        localStorage.setItem('mrs_remote_config', JSON.stringify(data));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('shahintv_remote_config_updated', { detail: data }));
        }
        return data;
      }
    }
  } catch (e) {
    // Fallback to local storage if network fails
    try {
      const saved = localStorage.getItem('mrs_remote_config');
      if (saved) {
        cachedConfig = JSON.parse(saved);
        return cachedConfig;
      }
    } catch {}
  }
  return cachedConfig;
}

export function getCachedRemoteConfig(): DynamicRemoteConfig {
  try {
    const saved = localStorage.getItem('mrs_remote_config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return cachedConfig;
}

export async function updateRemoteConfig(partial: Partial<DynamicRemoteConfig>): Promise<DynamicRemoteConfig> {
  try {
    const res = await fetch('/api/system/dynamic-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
    if (res.ok) {
      const updated = await res.json();
      cachedConfig = updated.config || updated;
      localStorage.setItem('mrs_remote_config', JSON.stringify(cachedConfig));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shahintv_remote_config_updated', { detail: cachedConfig }));
      }
      return cachedConfig;
    }
  } catch (e) {
    console.warn('[RemoteConfig] Update failed:', e);
  }
  return cachedConfig;
}
