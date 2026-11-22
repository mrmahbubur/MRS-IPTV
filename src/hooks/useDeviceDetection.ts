import { useState, useEffect, useCallback } from 'react';

export interface DeviceDetectionResult {
  isSmallDevice: boolean;
  isMobileUserAgent: boolean;
  isTouchScreen: boolean;
  isSmartTv: boolean;
  isWindowsDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  deviceType: 'small-mobile' | 'small-tablet' | 'desktop-windows' | 'smart-tv';
}

/**
 * Robust device and screen dimension detector.
 * Accurately detects:
 * - Small screen devices (mobile phones, small tablets, narrow viewports)
 * - Windows TV / PC and Smart TV hardware
 * - Real-time viewport changes (resizing, portrait/landscape orientation)
 */
export function checkIsSmallDevice(): DeviceDetectionResult {
  if (typeof window === 'undefined') {
    return {
      isSmallDevice: false,
      isMobileUserAgent: false,
      isTouchScreen: false,
      isSmartTv: false,
      isWindowsDesktop: true,
      screenWidth: 1920,
      screenHeight: 1080,
      deviceType: 'desktop-windows'
    };
  }

  const ua = (navigator.userAgent || '').toLowerCase();
  
  // Accurately determine viewport width across all mobile viewports, high-DPI screens, and emulators
  const viewportWidth = window.innerWidth || 
    (document.documentElement ? document.documentElement.clientWidth : 0) || 
    window.screen?.width || 
    1280;
  const viewportHeight = window.innerHeight || 
    (document.documentElement ? document.documentElement.clientHeight : 0) || 
    window.screen?.height || 
    720;
  
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const hasTouch = 'ontouchstart' in window || maxTouchPoints > 0;

  // 1. Detect Smart TV
  const isSmartTv = /smart-tv|googletv|androidtv|tizen|webos|vizio|hbbtv|aftt|appletv|boxee|roku/i.test(ua);

  // 2. Detect Mobile OS / User Agent
  const isMobileUserAgent = /android|iphone|ipod|ipad|blackberry|iemobile|opera mini|silk|mobile/i.test(ua);

  // 3. Detect Windows Desktop / TV
  const isWindowsDesktop = (navigator.platform?.includes('Win') || ua.includes('windows')) && 
    !isMobileUserAgent && 
    !isSmartTv && 
    viewportWidth >= 1024;

  // Check manual developer/tester override from query params or localStorage
  let manualOverride: string | null = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    manualOverride = urlParams.get('device_mode') || localStorage.getItem('mrs_device_mode_override');
  } catch (e) {}

  let isSmall = false;

  if (manualOverride === 'small' || manualOverride === 'mobile') {
    isSmall = true;
  } else if (manualOverride === 'desktop' || manualOverride === 'tv') {
    isSmall = false;
  } else if (isSmartTv) {
    // Smart TV remains as it was (desktop TV layout)
    isSmall = false;
  } else if (isWindowsDesktop && viewportWidth >= 1024) {
    // Windows desktop remains as it was
    isSmall = false;
  } else if (isMobileUserAgent) {
    // Any mobile phone or small tablet
    isSmall = true;
  } else if (viewportWidth < 1024) {
    // Any viewport under 1024px (small screens, mobile, narrow window)
    isSmall = true;
  } else if (hasTouch && viewportWidth <= 1180 && viewportHeight >= viewportWidth) {
    // Touch device in portrait mode
    isSmall = true;
  } else {
    isSmall = false;
  }

  let deviceType: 'small-mobile' | 'small-tablet' | 'desktop-windows' | 'smart-tv' = 'desktop-windows';
  if (isSmartTv) {
    deviceType = 'smart-tv';
  } else if (isWindowsDesktop) {
    deviceType = 'desktop-windows';
  } else if (viewportWidth <= 640 || (isMobileUserAgent && !ua.includes('ipad'))) {
    deviceType = 'small-mobile';
  } else {
    deviceType = isSmall ? 'small-tablet' : 'desktop-windows';
  }

  return {
    isSmallDevice: isSmall,
    isMobileUserAgent,
    isTouchScreen: hasTouch,
    isSmartTv,
    isWindowsDesktop,
    screenWidth: viewportWidth,
    screenHeight: viewportHeight,
    deviceType
  };

}

export function useDeviceDetection(): DeviceDetectionResult {
  const [detection, setDetection] = useState<DeviceDetectionResult>(() => checkIsSmallDevice());

  const handleUpdate = useCallback(() => {
    const current = checkIsSmallDevice();
    setDetection(current);

    // Synchronize HTML data attribute for CSS targeting
    try {
      if (document?.documentElement) {
        document.documentElement.setAttribute('data-device-size', current.isSmallDevice ? 'small' : 'large');
        document.documentElement.setAttribute('data-device-type', current.deviceType);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    handleUpdate();

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    // Also check via matchMedia
    const mql = window.matchMedia('(max-width: 1023px)');
    const handleMql = () => handleUpdate();
    if (mql.addEventListener) {
      mql.addEventListener('change', handleMql);
    } else {
      mql.addListener(handleMql);
    }

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handleMql);
      } else {
        mql.removeListener(handleMql);
      }
    };
  }, [handleUpdate]);

  return detection;
}
