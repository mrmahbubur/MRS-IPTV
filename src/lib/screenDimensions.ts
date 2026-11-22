import { useState, useEffect } from 'react';

export type SpecificDeviceType = 
  | 'android-mobile'
  | 'iphone'
  | 'android-tablet'
  | 'ipad'
  | 'laptop'
  | 'desktop'
  | 'android-tv'
  | 'google-tv';

export type PlayerLayoutMode = 
  | 'mobile-portrait'
  | 'mobile-landscape'
  | 'tablet-portrait'
  | 'tablet-landscape'
  | 'desktop-theater'
  | 'tv-overscan';

export interface ScreenDimensionProfile {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio: number;
  aspectRatio: number;
  aspectRatioLabel: string;
  isPortrait: boolean;
  isLandscape: boolean;
  isUltrawide: boolean;
  isClassic43: boolean;
  isTvStandard169: boolean;
  deviceCategory: 'Smart TV' | 'Desktop' | 'Mobile Phone' | 'Tablet';
  specificDeviceType: SpecificDeviceType;
  playerLayoutMode: PlayerLayoutMode;
  optimalScalingMode: 'fit' | 'fill' | 'zoom' | '4:3';
  fitDescription: string;
  hasTouch: boolean;
}

/**
 * Accurately analyzes the user's display hardware, viewport resolution, 
 * device pixel ratio, and aspect ratio before entering Android TV Mode.
 */
export function analyzeDeviceScreen(): ScreenDimensionProfile {
  let width = 1920;
  let height = 1080;
  let availWidth = 1920;
  let availHeight = 1080;
  let dpr = 1;

  if (typeof window !== 'undefined') {
    width = window.innerWidth || window.screen?.width || 1920;
    height = window.innerHeight || window.screen?.height || 1080;
    availWidth = window.screen?.availWidth || width;
    availHeight = window.screen?.availHeight || height;
    dpr = window.devicePixelRatio || 1;
  }

  const aspectRatio = width / (height || 1);
  const isPortrait = height > width;
  const isLandscape = !isPortrait;

  // Determine standard aspect ratio classifications
  const isUltrawide = aspectRatio >= 2.1; // e.g. 21:9 or 32:9
  const isClassic43 = aspectRatio >= 1.25 && aspectRatio <= 1.45; // ~4:3 (1.333)
  const isTvStandard169 = aspectRatio >= 1.7 && aspectRatio <= 1.85; // ~16:9 (1.777)

  // Label calculation
  let aspectRatioLabel = '16:9 HD';
  if (isUltrawide) aspectRatioLabel = '21:9 Ultrawide';
  else if (isClassic43) aspectRatioLabel = '4:3 Classic TV';
  else if (isPortrait) aspectRatioLabel = '9:16 Portrait Mobile';
  else if (Math.abs(aspectRatio - 1.6) < 0.05) aspectRatioLabel = '16:10 Display';
  else aspectRatioLabel = `${aspectRatio.toFixed(2)}:1 Wide`;

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const hasTouch = typeof window !== 'undefined' ? (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) : false;

  // Check URL query override for quick testing (?device=iphone, ?device=ipad, ?device=android, ?device=tablet, ?device=tv)
  let urlDeviceOverride = '';
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      urlDeviceOverride = (params.get('device') || '').toLowerCase();
    } catch {}
  }

  // Determine device category and specific device type
  let deviceCategory: 'Smart TV' | 'Desktop' | 'Mobile Phone' | 'Tablet' = 'Desktop';
  let specificDeviceType: SpecificDeviceType = 'desktop';

  const isTv = isAndroidTvDevice();
  if (isTv || urlDeviceOverride === 'tv' || urlDeviceOverride === 'androidtv') {
    specificDeviceType = /googletv|google tv/i.test(userAgent) ? 'google-tv' : 'android-tv';
    deviceCategory = 'Smart TV';
  } else if (/iphone|ipod/i.test(userAgent) || urlDeviceOverride === 'iphone') {
    specificDeviceType = 'iphone';
    deviceCategory = 'Mobile Phone';
  } else if (/ipad/i.test(userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !userAgent.includes('iphone')) || urlDeviceOverride === 'ipad') {
    specificDeviceType = 'ipad';
    deviceCategory = 'Tablet';
  } else if (/android/i.test(userAgent) || urlDeviceOverride === 'android' || urlDeviceOverride === 'mobile') {
    if (/mobile/i.test(userAgent) || (isPortrait && width < 600) || urlDeviceOverride === 'mobile') {
      specificDeviceType = 'android-mobile';
      deviceCategory = 'Mobile Phone';
    } else {
      specificDeviceType = 'android-tablet';
      deviceCategory = 'Tablet';
    }
  } else if (urlDeviceOverride === 'tablet') {
    specificDeviceType = 'android-tablet';
    deviceCategory = 'Tablet';
  } else if (hasTouch && width >= 600 && width <= 1024) {
    specificDeviceType = 'android-tablet';
    deviceCategory = 'Tablet';
  } else if (hasTouch && (width < 600 || (width < 768 && isPortrait))) {
    specificDeviceType = 'android-mobile';
    deviceCategory = 'Mobile Phone';
  } else if (!hasTouch && width >= 1024 && width < 1680) {
    specificDeviceType = 'laptop';
    deviceCategory = 'Desktop';
  } else {
    specificDeviceType = 'desktop';
    deviceCategory = 'Desktop';
  }

  // Determine Player Layout Mode
  let playerLayoutMode: PlayerLayoutMode = 'desktop-theater';
  if (deviceCategory === 'Smart TV' || specificDeviceType === 'android-tv' || specificDeviceType === 'google-tv') {
    playerLayoutMode = 'tv-overscan';
  } else if (deviceCategory === 'Mobile Phone') {
    playerLayoutMode = isPortrait ? 'mobile-portrait' : 'mobile-landscape';
  } else if (deviceCategory === 'Tablet') {
    playerLayoutMode = isPortrait ? 'tablet-portrait' : 'tablet-landscape';
  } else {
    playerLayoutMode = 'desktop-theater';
  }

  // Determine optimal video scaling mode to guarantee zero letterbox / edge clipping
  let optimalScalingMode: 'fit' | 'fill' | 'zoom' | '4:3' = 'fit';
  let fitDescription = '100% Screen Fit (Aspect-Preserved)';

  if (isTvStandard169) {
    optimalScalingMode = 'fill';
    fitDescription = '16:9 Fullscreen Native Match';
  } else if (isClassic43) {
    optimalScalingMode = '4:3';
    fitDescription = '4:3 True CRT/Box Fit';
  } else if (isUltrawide) {
    optimalScalingMode = 'zoom';
    fitDescription = 'Ultrawide 21:9 Edge-to-Edge';
  } else if (isPortrait) {
    optimalScalingMode = 'fit';
    fitDescription = 'Portrait Full-Height View';
  } else {
    optimalScalingMode = 'fit';
    fitDescription = 'Zero-Distortion Screen Fit';
  }

  return {
    width,
    height,
    availWidth,
    availHeight,
    devicePixelRatio: dpr,
    aspectRatio,
    aspectRatioLabel,
    isPortrait,
    isLandscape,
    isUltrawide,
    isClassic43,
    isTvStandard169,
    deviceCategory,
    specificDeviceType,
    playerLayoutMode,
    optimalScalingMode,
    fitDescription,
    hasTouch
  };
}

/**
 * React hook to reactively subscribe to display dimension, orientation,
 * and layout mode changes across all devices.
 */
export function useDeviceScreen(): ScreenDimensionProfile {
  const [profile, setProfile] = useState<ScreenDimensionProfile>(() => analyzeDeviceScreen());

  useEffect(() => {
    let animFrame: number;
    const handleUpdate = () => {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        setProfile(analyzeDeviceScreen());
      });
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', handleUpdate);
    }

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.removeEventListener) {
        screen.orientation.removeEventListener('change', handleUpdate);
      }
    };
  }, []);

  return profile;
}

/**
 * Triggers native HTML5 fullscreen mode safely across standard browsers,
 * Android WebViews, Tizen, WebOS, and mobile Chrome.
 */
export async function requestFullscreenSafe(targetElement?: HTMLElement | null): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const elem: any = targetElement || document.documentElement;

  try {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement && !(document as any).mozFullScreenElement) {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen({ navigationUI: 'hide' } as any);
        return true;
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
        return true;
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen();
        return true;
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
        return true;
      }
    }
  } catch (err) {
    console.debug('[Screen Dimension Engine] Fullscreen request handled or restricted by browser policy:', err);
  }
  return false;
}

/**
 * Exits native fullscreen safely
 */
export async function exitFullscreenSafe(): Promise<void> {
  if (typeof document === 'undefined') return;

  try {
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    }
  } catch (e) {}
}

/**
 * Checks if the current client environment is an Android TV or Smart TV.
 * Inspects userAgent signatures, TV browser tokens, and platform characteristics.
 */
export function isAndroidTvOrSmartTv(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = (navigator.userAgent || '').toLowerCase();
  
  // Specific Android TV & Smart TV User Agent tokens
  const tvSignatures = [
    'googletv',
    'google tv',
    'android tv',
    'androidtv',
    'smart-tv',
    'smarttv',
    'smart tv',
    'tizen',          // Samsung Tizen Smart TV
    'web0s',          // LG webOS
    'webos',
    'vizio',          // Vizio SmartCast
    'hbbtv',          // Hybrid Broadcast Broadband TV
    'aftt',           // Fire TV Stick
    'aftm',           // Fire TV Stick 4K
    'aftb',           // Fire TV Box
    'afts',           // Fire TV Stick Lite
    'aftk',           // Fire TV Cube
    'afta',
    'appletv',        // Apple TV
    'apple tv',
    'boxee',
    'roku',           // Roku TV
    'hisense',        // Hisense VIDAA / Android TV
    'vidaa',
    'philips',
    'bravia',         // Sony BRAVIA Android TV
    'sony tv',
    'mitv',           // Xiaomi Mi TV
    'mi tv',
    'crkey',          // Chromecast with Google TV
    'leanback',
    'large screen tv'
  ];

  for (const sig of tvSignatures) {
    if (ua.includes(sig)) {
      return true;
    }
  }

  // Android device without "mobile" token in landscape resolution:
  // Google documentation specifies Chrome on Android TV omits the "Mobile" token from the UA string.
  if (ua.includes('android') && !ua.includes('mobile')) {
    const width = window.innerWidth || window.screen?.width || 0;
    const height = window.innerHeight || window.screen?.height || 0;
    const aspect = width / (height || 1);
    // TV screens are landscape (16:9 or wider) with width >= 1280
    if (aspect >= 1.5 && width >= 1280) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the current client environment is strictly an Android TV or Smart TV device.
 * Evaluates TV hardware UA signatures, Android TV Chrome signatures (Android without 'mobile'),
 * and URL test flags (?tv=1, ?androidtv=1, ?device=tv, ?device=androidtv).
 */
export function isAndroidTvDevice(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tv') === '1' || params.get('androidtv') === '1' || params.get('device') === 'tv' || params.get('device') === 'androidtv') {
      return true;
    }
  } catch (e) {}

  return isAndroidTvOrSmartTv();
}

/**
 * Determines whether the app should automatically launch directly into Android TV Mode.
 * Checks for TV hardware detection or URL testing override (?mode=tv or ?tv=1),
 * while honoring user intent if they previously exited TV mode during this browser session.
 */
export function shouldAutoOpenAndroidTvMode(): boolean {
  if (typeof window === 'undefined') return false;

  // If user explicitly pressed "Exit TV / Back to Home" during this session, honor their intent
  try {
    if (sessionStorage.getItem('mrs_tv_mode_exited') === 'true') {
      return false;
    }
  } catch (e) {}

  // Check URL query override for instant testing (?mode=home or ?mode=tv)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'home') {
      return false;
    }
    if (params.get('mode') === 'tv' || params.get('tv') === '1' || params.get('androidtv') === '1') {
      return true;
    }
  } catch (e) {}

  // Automatically open Android TV Mode on opening the site
  return true;
}

/**
 * Records when the user manually exits Android TV mode so they can browse the homepage
 * without being auto-redirected during the same session.
 */
export function setTvModeExited(exited: boolean): void {
  try {
    if (exited) {
      sessionStorage.setItem('mrs_tv_mode_exited', 'true');
    } else {
      sessionStorage.removeItem('mrs_tv_mode_exited');
    }
  } catch (e) {}
}

/**
 * Detects if the current client is strictly a mobile device (smartphone/mobile browser/touch device).
 * Excludes Android TV, Smart TVs, and standard desktop computers.
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // TV devices are never mobile devices
  if (isAndroidTvDevice()) return false;

  // URL test override (?device=mobile or ?mobile=1)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('device') === 'mobile' || params.get('mobile') === '1') {
      return true;
    }
  } catch (e) {}

  const ua = (navigator.userAgent || '').toLowerCase();
  const isMobileUa = /mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(ua);
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobileScreen = window.innerWidth <= 1024 && (window.innerHeight >= window.innerWidth || window.innerWidth < 768);

  return isMobileUa || (isTouch && isMobileScreen);
}


