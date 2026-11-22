import { useState, useEffect } from 'react';
import { DynamicRemoteConfig, DEFAULT_REMOTE_CONFIG, getCachedRemoteConfig, fetchRemoteConfig } from '../lib/remoteConfig';

export function useRemoteConfig(): DynamicRemoteConfig {
  const [config, setConfig] = useState<DynamicRemoteConfig>(() => getCachedRemoteConfig() || DEFAULT_REMOTE_CONFIG);

  useEffect(() => {
    // Initial fetch on mount
    fetchRemoteConfig().then(cfg => {
      if (cfg) setConfig(cfg);
    });

    // Periodic check every 45 seconds to pick up backend/Camellia updates automatically
    const interval = setInterval(() => {
      fetchRemoteConfig().then(cfg => {
        if (cfg) setConfig(cfg);
      });
    }, 45000);

    // Event listener for instant local or cross-tab updates
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };

    window.addEventListener('shahintv_remote_config_updated', handleUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('shahintv_remote_config_updated', handleUpdate);
    };
  }, []);

  return config;
}
