/**
 * M R S IPTV - Central Ad Gate (ad-gate.js)
 * Loaded synchronously FIRST in <head>.
 * Guarantees zero ad visibility, zero ad script execution, and fail-closed VIP protection.
 */
(function (win, doc) {
  'use strict';

  var ENTITLE_KEY = 'mrs_vip_entitlement';
  var HINT_KEY = 'mrs_vip_ads_hint';
  var EXPIRED_NOTICE_KEY = 'mrs_ads_expired_notice';
  var DEVICE_KEY_PRIMARY = 'mrs_device_id';
  var DEVICE_KEY_LEGACY = 'shahintv_device_id';
  var STATUS_TIMEOUT_MS = 3000;
  var RETRY_INTERVAL_MS = 10000;
  var RETRY_MAX_MS = 120000;

  var AD_HOST_MARKERS = [
    'uplcm.com',
    'monetag',
    '5gvci.com',
    'quge5.com',
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
    'onclkds'
  ];

  var retryTimer = null;
  var retryStartedAt = 0;
  var checkInFlight = null;
  var debugMeta = {
    initializedAt: new Date().toISOString(),
    lastStatusCode: null,
    lastStatusAt: null,
    lastError: null,
    retryCount: 0,
    usedFailClosedHint: false,
    loadedAdScripts: []
  };

  function safeStorageGet(key) {
    try {
      return win.localStorage ? win.localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeStorageSet(key, val) {
    try {
      if (win.localStorage) win.localStorage.setItem(key, val);
    } catch (e) {}
  }

  function safeStorageRemove(key) {
    try {
      if (win.localStorage) win.localStorage.removeItem(key);
    } catch (e) {}
  }

  function getApiBaseUrl() {
    try {
      if (win.MRS_ADS_CONFIG && typeof win.MRS_ADS_CONFIG.apiBaseUrl === 'string') {
        return win.MRS_ADS_CONFIG.apiBaseUrl.replace(/\/+$/, '');
      }
      if (typeof win.__MRS_API_BASE_URL === 'string') {
        return win.__MRS_API_BASE_URL.replace(/\/+$/, '');
      }
    } catch (e) {}
    return '';
  }

  function getSavedEntitlement() {
    var raw = safeStorageGet(ENTITLE_KEY);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.active !== false &&
        parsed.revoked !== true &&
        parsed.status !== 'revoked' &&
        parsed.status !== 'expired' &&
        typeof parsed.token === 'string' &&
        parsed.token.trim().length > 0
      ) {
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function getSavedExpiryHint() {
    var raw = safeStorageGet(HINT_KEY);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt) {
        var ms = Date.parse(parsed.expiresAt);
        if (!isNaN(ms)) return { expiresAt: parsed.expiresAt, ms: ms };
      }
    } catch (e) {}
    return null;
  }

  function getDeviceIdSafe() {
    var primary = safeStorageGet(DEVICE_KEY_PRIMARY);
    if (primary && /^[A-Za-z0-9_-]{12,128}$/.test(primary)) return primary;
    var legacy = safeStorageGet(DEVICE_KEY_LEGACY);
    if (legacy && /^[A-Za-z0-9_-]{12,128}$/.test(legacy)) return legacy;
    return '';
  }

  function setVipCookie(active, expiresAt) {
    try {
      if (!active) {
        doc.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
        return;
      }
      var maxAge = 2592000;
      if (expiresAt) {
        var diffSec = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
        if (!isNaN(diffSec) && diffSec > 0) {
          maxAge = Math.max(60, Math.min(diffSec, 31536000));
        }
      }
      doc.cookie = 'mrs_vip_active=1; max-age=' + maxAge + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  function clearStaleVipCredentials(markExpiredNotice) {
    safeStorageRemove(ENTITLE_KEY);
    safeStorageRemove(HINT_KEY);
    safeStorageRemove('shahintv_adfree_activation');
    if (markExpiredNotice) {
      safeStorageSet(EXPIRED_NOTICE_KEY, '1');
    }
    setVipCookie(false);
    win.__MRS_IS_VIP = false;
  }

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var trimmed = url.trim();
    if (!trimmed) return false;
    var lower = trimmed.toLowerCase();
    var host = '';
    try {
      var candidate = lower.indexOf('//') === 0 ? 'https:' + trimmed : trimmed;
      if (typeof win.URL === 'function' && /^https?:\/\//i.test(candidate)) {
        host = String(new win.URL(candidate).hostname || '').toLowerCase();
      }
    } catch (e) {}
    for (var i = 0; i < AD_HOST_MARKERS.length; i++) {
      var marker = AD_HOST_MARKERS[i].toLowerCase();
      if (host && (host === marker || host.slice(-(marker.length + 1)) === '.' + marker)) {
        return true;
      }
      if (lower.indexOf(marker) !== -1) return true;
    }
    if (lower.indexOf('/api/ads/redirect') !== -1) return true;
    return false;
  }

  function injectGateStyles() {
    if (doc.getElementById('mrs-ad-gate-style')) return;
    var css = [
      'html:not([data-mrs-ad-state="free"]) .ad-slot,',
      'html:not([data-mrs-ad-state="free"]) .ad-label,',
      'html:not([data-mrs-ad-state="free"]) [data-ad-slot],',
      'html:not([data-mrs-ad-state="free"]) [data-ad-link],',
      'html:not([data-mrs-ad-state="free"]) [data-zone],',
      'html:not([data-mrs-ad-state="free"]) [data-ad-zone],',
      'html:not([data-mrs-ad-state="free"]) [data-monetag],',
      'html:not([data-mrs-ad-state="free"]) [data-monetag-zone],',
      'html:not([data-mrs-ad-state="free"]) [data-interstitial],',
      'html:not([data-mrs-ad-state="free"]) [data-popunder],',
      'html:not([data-mrs-ad-state="free"]) ins[data-zone],',
      'html:not([data-mrs-ad-state="free"]) .ad-sticky-banner,',
      'html:not([data-mrs-ad-state="free"]) #mrs-sticky-mobile-ad,',
      'html:not([data-mrs-ad-state="free"]) #mrs-banner-slot,',
      'html:not([data-mrs-ad-state="free"]) #mrs-consent-banner,',
      'html:not([data-mrs-ad-state="free"]) #mrs-push-preprompt,',
      'html:not([data-mrs-ad-state="free"]) #mrs-reward-sim-modal,',
      'html:not([data-mrs-ad-state="free"]) #mrs-monetag-interstitial,',
      'html:not([data-mrs-ad-state="free"]) #mrs-popunder-script,',
      'html:not([data-mrs-ad-state="free"]) #monetag-midnight-vignette,',
      'html:not([data-mrs-ad-state="free"]) div[id*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) div[class*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) aside[id*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) aside[class*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) section[id*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) section[class*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) dialog[id*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) dialog[class*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) div[id*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) div[class*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) aside[id*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) aside[class*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) section[id*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) section[class*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) div[id*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) div[class*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) aside[id*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) aside[class*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) section[id*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) section[class*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) div[id*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) div[class*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) aside[id*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) aside[class*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) section[id*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) section[class*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) iframe[id*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) iframe[class*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) iframe[id*="vignette"],',
      'html:not([data-mrs-ad-state="free"]) iframe[id*="interstitial"],',
      'html:not([data-mrs-ad-state="free"]) iframe[id*="popunder"],',
      'html:not([data-mrs-ad-state="free"]) iframe[data-mrs-ad-frame="1"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="uplcm.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="monetag"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="5gvci.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="quge5.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="n6wxm.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="al5sm.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="whomeehe.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="acscdn.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="tzegilo.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="madurird.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="otieu.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="nap5k.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="gloaphoo.net"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="dolohen.com"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="propellerads"],',
      'html:not([data-mrs-ad-state="free"]) iframe[src*="onclkds"],',
      'html:not([data-mrs-ad-state="free"]) .mrs-free-upsell {',
      '  display: none !important;',
      '  visibility: hidden !important;',
      '  height: 0 !important;',
      '  min-height: 0 !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  overflow: hidden !important;',
      '  pointer-events: none !important;',
      '}',
      'html[data-mrs-ad-state="vip"] .ad-slot,',
      'html[data-mrs-ad-state="vip"] [data-zone],',
      'html[data-mrs-ad-state="vip"] [data-ad-zone],',
      'html[data-mrs-ad-state="vip"] [data-monetag],',
      'html[data-mrs-ad-state="vip"] [data-monetag-zone],',
      'html[data-mrs-ad-state="vip"] [data-interstitial],',
      'html[data-mrs-ad-state="vip"] [data-popunder],',
      'html[data-mrs-ad-state="vip"] [id*="vignette"],',
      'html[data-mrs-ad-state="vip"] [class*="vignette"],',
      'html[data-mrs-ad-state="vip"] [id*="interstitial"],',
      'html[data-mrs-ad-state="vip"] [class*="interstitial"],',
      'html[data-mrs-ad-state="vip"] [id*="popunder"],',
      'html[data-mrs-ad-state="vip"] [class*="popunder"],',
      'html[data-mrs-ad-state="vip"] [id*="monetag"],',
      'html[data-mrs-ad-state="vip"] [class*="monetag"],',
      'html[data-mrs-ad-state="pending"] .ad-slot,',
      'html[data-mrs-ad-state="pending"] [data-zone],',
      'html[data-mrs-ad-state="pending"] [data-ad-zone],',
      'html[data-mrs-ad-state="pending"] [data-monetag],',
      'html[data-mrs-ad-state="pending"] [data-monetag-zone],',
      'html[data-mrs-ad-state="pending"] [data-interstitial],',
      'html[data-mrs-ad-state="pending"] [data-popunder],',
      'html[data-mrs-ad-state="pending"] [id*="vignette"],',
      'html[data-mrs-ad-state="pending"] [class*="vignette"],',
      'html[data-mrs-ad-state="pending"] [id*="interstitial"],',
      'html[data-mrs-ad-state="pending"] [class*="interstitial"],',
      'html[data-mrs-ad-state="pending"] [id*="popunder"],',
      'html[data-mrs-ad-state="pending"] [class*="popunder"],',
      'html[data-mrs-ad-state="pending"] [id*="monetag"],',
      'html[data-mrs-ad-state="pending"] [class*="monetag"] {',
      '  display: none !important;',
      '}',
      'html[data-mrs-ad-state="free"] .ad-banner-desktop {',
      '  min-height: 90px;',
      '}',
      'html[data-mrs-ad-state="free"] .ad-banner-mobile {',
      '  min-height: 50px;',
      '}'
    ].join('\n');

    var style = doc.createElement('style');
    style.id = 'mrs-ad-gate-style';
    style.type = 'text/css';
    style.appendChild(doc.createTextNode(css));
    var target = doc.head || doc.documentElement;
    if (target) target.appendChild(style);
  }

  function setAdState(nextState) {
    if (nextState !== 'pending' && nextState !== 'vip' && nextState !== 'free') {
      nextState = 'pending';
    }
    var prevState = win.MRS_AD_STATE;
    win.MRS_AD_STATE = nextState;
    win.__MRS_IS_VIP = nextState === 'vip';
    if (doc.documentElement) {
      doc.documentElement.setAttribute('data-mrs-ad-state', nextState);
    }
    if (nextState === 'vip') {
      purgeAdDomElements();
    }
    if (prevState !== nextState) {
      try {
        win.dispatchEvent(new CustomEvent('mrs_ads_state_change', {
          detail: { state: nextState, previousState: prevState }
        }));
      } catch (e) {}
    }
    return nextState;
  }

  function purgeAdDomElements() {
    try {
      var selectors = [
        '.ad-slot',
        '.ad-label',
        '[data-ad-slot]',
        '[data-zone]',
        '[data-ad-zone]',
        '[data-monetag]',
        '[data-monetag-zone]',
        '[data-interstitial]',
        '[data-popunder]',
        'ins[data-zone]',
        '.ad-sticky-banner',
        '#mrs-sticky-mobile-ad',
        '#mrs-consent-banner',
        '#mrs-push-preprompt',
        '#mrs-reward-sim-modal',
        '#mrs-monetag-interstitial',
        '#mrs-popunder-script',
        '#monetag-midnight-vignette',
        '#monetag-tag-script',
        'script[data-mrs-ad-injected="1"]',
        'script[data-zone]',
        'script[src*="uplcm.com"]',
        'script[src*="monetag"]',
        'script[src*="5gvci.com"]',
        'script[src*="quge5.com"]',
        'script[src*="n6wxm.com"]',
        'script[src*="al5sm.com"]',
        'script[src*="whomeehe.com"]',
        'script[src*="acscdn.com"]',
        'script[src*="tzegilo.com"]',
        'script[src*="madurird.com"]',
        'script[src*="otieu.com"]',
        'script[src*="nap5k.com"]',
        'script[src*="gloaphoo.net"]',
        'script[src*="dolohen.com"]',
        'script[src*="propellerads"]',
        'script[src*="onclkds"]',
        'iframe[src*="uplcm.com"]',
        'iframe[src*="monetag"]',
        'iframe[src*="quge5.com"]',
        'iframe[src*="5gvci.com"]',
        'iframe[src*="n6wxm.com"]',
        'iframe[src*="al5sm.com"]',
        'iframe[src*="whomeehe.com"]',
        'iframe[src*="acscdn.com"]',
        'iframe[src*="tzegilo.com"]',
        'iframe[src*="madurird.com"]',
        'iframe[src*="otieu.com"]',
        'iframe[src*="nap5k.com"]',
        'iframe[src*="gloaphoo.net"]',
        'iframe[src*="dolohen.com"]',
        'iframe[src*="propellerads"]',
        'iframe[src*="onclkds"]',
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
        'a[data-ad-link]'
      ].join(',');

      var nodes = doc.querySelectorAll(selectors);
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].parentNode) {
          nodes[i].parentNode.removeChild(nodes[i]);
        }
      }
    } catch (e) {}
  }

  function clearAdFrequencyStorage() {
    try {
      if (!win.localStorage) return;
      var toRemove = [];
      for (var i = 0; i < win.localStorage.length; i++) {
        var key = win.localStorage.key(i);
        if (!key) continue;
        if (
          key.indexOf('mrs_ads_') === 0 ||
          key.indexOf('mrs_ad_') === 0 ||
          key.indexOf('mrs_iptv_ad_') === 0 ||
          key === 'mrs_last_interstitial_shown_at' ||
          key === 'mrs_interstitial_daily_hist' ||
          key === 'shahintv_last_interstitial'
        ) {
          if (key !== EXPIRED_NOTICE_KEY) {
            toRemove.push(key);
          }
        }
      }
      for (var j = 0; j < toRemove.length; j++) {
        win.localStorage.removeItem(toRemove[j]);
      }
    } catch (e) {}
  }

  function unregisterAdWorkersAndPush() {
    try {
      if (!('serviceWorker' in win.navigator) || !win.navigator.serviceWorker.getRegistrations) {
        return Promise.resolve();
      }
      return win.navigator.serviceWorker.getRegistrations().then(function (regs) {
        var tasks = [];
        for (var i = 0; i < regs.length; i++) {
          (function (reg) {
            if (!reg) return;
            try {
              if (reg.pushManager && reg.pushManager.getSubscription) {
                tasks.push(
                  reg.pushManager.getSubscription().then(function (sub) {
                    if (sub && sub.unsubscribe) {
                      return sub.unsubscribe().catch(function () {});
                    }
                  }).catch(function () {})
                );
              }
            } catch (e) {}

            var scriptUrl = '';
            try {
              scriptUrl =
                (reg.active && reg.active.scriptURL) ||
                (reg.waiting && reg.waiting.scriptURL) ||
                (reg.installing && reg.installing.scriptURL) ||
                '';
            } catch (e) {}

            var lowerUrl = scriptUrl.toLowerCase();
            var isAppShellSw =
              lowerUrl.indexOf('/sw.js') !== -1 ||
              lowerUrl.indexOf('/service-worker.js') !== -1;
            var looksLikeAdSw =
              !isAppShellSw ||
              lowerUrl.indexOf('monetag') !== -1 ||
              lowerUrl.indexOf('onesignal') !== -1 ||
              lowerUrl.indexOf('push') !== -1 ||
              lowerUrl.indexOf('5gvci') !== -1 ||
              lowerUrl.indexOf('otieu') !== -1 ||
              lowerUrl.indexOf('nap5k') !== -1 ||
              lowerUrl.indexOf('quge5') !== -1 ||
              lowerUrl.indexOf('al5sm') !== -1 ||
              lowerUrl.indexOf('n6wxm') !== -1 ||
              lowerUrl.indexOf('acscdn') !== -1 ||
              lowerUrl.indexOf('tzegilo') !== -1 ||
              lowerUrl.indexOf('madurird') !== -1 ||
              lowerUrl.indexOf('uplcm') !== -1 ||
              lowerUrl.indexOf('propeller') !== -1 ||
              lowerUrl.indexOf('onclkds') !== -1 ||
              lowerUrl.indexOf('sw__2__') !== -1;

            if (looksLikeAdSw) {
              tasks.push(reg.unregister().catch(function () {}));
            }
          })(regs[i]);
        }
        return Promise.all(tasks).catch(function () {});
      }).catch(function () {});
    } catch (e) {
      return Promise.resolve();
    }
  }

  function stopRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function schedulePendingRetry() {
    stopRetryTimer();
    if (!retryStartedAt) retryStartedAt = Date.now();
    if (Date.now() - retryStartedAt >= RETRY_MAX_MS) {
      // Timed out retry window: stay fail-closed ('pending' => NO ads for this page view)
      return;
    }
    retryTimer = setTimeout(function () {
      debugMeta.retryCount += 1;
      verifyVipWithServer();
    }, RETRY_INTERVAL_MS);
  }

  function handleStatusFailureWithToken() {
    // Fail closed: NEVER show ads while a token exists and status check fails/times out.
    var hint = getSavedExpiryHint();
    if (hint && hint.ms > Date.now()) {
      debugMeta.usedFailClosedHint = true;
      return setAdState('vip');
    }
    setAdState('pending');
    schedulePendingRetry();
    return 'pending';
  }

  function verifyVipWithServer() {
    if (checkInFlight) return checkInFlight;

    var entitlement = getSavedEntitlement();
    if (!entitlement || !entitlement.token) {
      stopRetryTimer();
      clearStaleVipCredentials(false);
      return Promise.resolve(setAdState('free'));
    }

    var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
    var timeoutId = setTimeout(function () {
      if (controller) {
        try { controller.abort(); } catch (e) {}
      }
    }, STATUS_TIMEOUT_MS);

    var base = getApiBaseUrl();
    var deviceId = getDeviceIdSafe();
    var url = base + '/api/status' + (deviceId ? '?deviceId=' + encodeURIComponent(deviceId) : '');
    var headers = {
      Authorization: 'Bearer ' + entitlement.token
    };
    if (deviceId) headers['x-device-id'] = deviceId;

    checkInFlight = fetch(url, {
      method: 'GET',
      headers: headers,
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        clearTimeout(timeoutId);
        debugMeta.lastStatusCode = res.status;
        debugMeta.lastStatusAt = new Date().toISOString();

        return res.json().catch(function () { return null; }).then(function (json) {
          var payload = (json && json.data) ? json.data : json;
          if (res.ok && payload && payload.active === true) {
            stopRetryTimer();
            retryStartedAt = 0;
            debugMeta.lastError = null;
            debugMeta.usedFailClosedHint = false;
            var expiresAt = payload.expiresAt || entitlement.expiresAt || null;
            if (expiresAt) {
              safeStorageSet(HINT_KEY, JSON.stringify({ expiresAt: expiresAt }));
            }
            setVipCookie(true, expiresAt);
            return setAdState('vip');
          }

          // Server explicitly confirmed token is expired/invalid (401/403/404/410 or active === false)
          if (
            res.status === 401 ||
            res.status === 403 ||
            res.status === 404 ||
            res.status === 410 ||
            (payload && payload.active === false)
          ) {
            stopRetryTimer();
            retryStartedAt = 0;
            debugMeta.lastError = (json && json.error && json.error.message) || 'Plan expired or inactive';
            clearStaleVipCredentials(true);
            return setAdState('free');
          }

          // 5xx or ambiguous server error: fail closed (NO ads)
          debugMeta.lastError = 'HTTP ' + res.status;
          return handleStatusFailureWithToken();
        });
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        debugMeta.lastError = (err && err.name === 'AbortError') ? 'status_timeout_3s' : ((err && err.message) || 'network_error');
        debugMeta.lastStatusAt = new Date().toISOString();
        return handleStatusFailureWithToken();
      })
      .finally(function () {
        checkInFlight = null;
      });

    return checkInFlight;
  }

  function installInteractionGuards() {
    // 1. Protect core UI controls from accidental popunder/click hijacking
    win.__MRS_UI_TOUCH_LOCKED = false;
    var unlockTimer = null;

    function lockUiTouch() {
      win.__MRS_UI_TOUCH_LOCKED = true;
      if (unlockTimer) clearTimeout(unlockTimer);
      unlockTimer = setTimeout(function () {
        win.__MRS_UI_TOUCH_LOCKED = false;
      }, 800);
    }

    function handleCoreUiInteraction(e) {
      var target = e && e.target;
      if (!target || !target.closest) return;
      var core = target.closest(
        'button, [data-player-control], .player-ctrl-btn, video, nav, [role="button"], [role="tab"], input, select, textarea, form, [data-channel-card], .channel-card, a:not([data-ad-link])'
      );
      if (core) lockUiTouch();
    }

    win.addEventListener('touchstart', handleCoreUiInteraction, { capture: true, passive: true });
    win.addEventListener('pointerdown', handleCoreUiInteraction, { capture: true, passive: true });
    win.addEventListener('click', handleCoreUiInteraction, { capture: true, passive: true });

    // 2. Guard window.open against any ad popup when state !== 'free' or UI touch locked
    var origOpen = win.open;
    if (typeof origOpen === 'function') {
      win.open = function (url, target, features) {
        var currentState = win.MRS_AD_STATE || 'pending';
        if (currentState !== 'free' && (!url || isAdUrl(String(url)))) {
          return null;
        }
        if (url && isAdUrl(String(url)) && win.__MRS_UI_TOUCH_LOCKED) {
          return null;
        }
        return origOpen.call(win, url, target, features);
      };
    }

    // 3. Guard dynamic DOM appends/inserts against third-party ad scripts/iframes/overlays unless state === 'free'
    function shouldBlockAdChild(child) {
      if (!child || !child.tagName) return false;
      var tag = String(child.tagName).toLowerCase();
      if (
        tag !== 'script' &&
        tag !== 'iframe' &&
        tag !== 'div' &&
        tag !== 'ins' &&
        tag !== 'aside' &&
        tag !== 'section' &&
        tag !== 'dialog' &&
        tag !== 'a'
      ) {
        return false;
      }
      var src = (child.src || (child.getAttribute && child.getAttribute('src')) || '');
      var href = (child.href || (child.getAttribute && child.getAttribute('href')) || '');
      var elId = (child.id || (child.getAttribute && child.getAttribute('id')) || '').toLowerCase();
      var elClass = (typeof child.className === 'string' ? child.className : (child.getAttribute && child.getAttribute('class')) || '').toLowerCase();
      var isGateApproved = child.getAttribute && child.getAttribute('data-mrs-ad-approved') === '1';
      var hasZoneAttr = Boolean(
        child.getAttribute &&
        (child.getAttribute('data-zone') ||
          child.getAttribute('data-ad-zone') ||
          child.getAttribute('data-monetag') ||
          child.getAttribute('data-monetag-zone') ||
          child.getAttribute('data-interstitial') ||
          child.getAttribute('data-popunder') ||
          child.getAttribute('data-ad-slot') ||
          child.getAttribute('data-ad-link'))
      );

      // Even in free mode, block unsafe external script schemes or inline event handlers on injected ad scripts
      if (tag === 'script' && (isGateApproved || (child.getAttribute && child.getAttribute('data-mrs-ad-injected') === '1'))) {
        if (src && !/^https:\/\//i.test(String(src).trim())) {
          return true;
        }
        if (child.attributes) {
          for (var i = 0; i < child.attributes.length; i++) {
            var attrName = String(child.attributes[i].name || '').toLowerCase();
            if (attrName.indexOf('on') === 0 || attrName === 'srcdoc') {
              return true;
            }
          }
        }
      }

      var hasAdMarker =
        ((tag === 'script' || tag === 'iframe') && isAdUrl(src)) ||
        (tag === 'a' && isAdUrl(href)) ||
        hasZoneAttr ||
        (child.getAttribute && child.getAttribute('data-mrs-ad-injected') === '1') ||
        /(?:monetag|vignette|interstitial|popunder|ad-sticky-banner)/.test(elId) ||
        /(?:monetag|vignette|interstitial|popunder|ad-sticky-banner)/.test(elClass);

      var currentAdState = win.MRS_AD_STATE || 'pending';
      if (currentAdState !== 'free' && hasAdMarker) {
        return true;
      }
      if (currentAdState === 'vip' && (tag === 'script' || tag === 'iframe') && isAdUrl(src) && !isGateApproved) {
        return true;
      }
      return false;
    }

    if (win.Element && win.Element.prototype && win.Element.prototype.appendChild) {
      var origAppendChild = win.Element.prototype.appendChild;
      win.Element.prototype.appendChild = function (child) {
        if (shouldBlockAdChild(child)) return child;
        return origAppendChild.call(this, child);
      };
    }

    if (win.Element && win.Element.prototype && win.Element.prototype.insertBefore) {
      var origInsertBefore = win.Element.prototype.insertBefore;
      win.Element.prototype.insertBefore = function (child, refNode) {
        if (shouldBlockAdChild(child)) return child;
        return origInsertBefore.call(this, child, refNode);
      };
    }
  }

  // Initialize synchronously BEFORE DOM renders anything
  injectGateStyles();
  win.MRS_AD_STATE = 'pending';
  win.__MRS_IS_VIP = false;
  if (doc.documentElement) {
    doc.documentElement.setAttribute('data-mrs-ad-state', 'pending');
  }
  installInteractionGuards();

  // Public Gate API
  win.MRS_ADS = {
    state: function () {
      return win.MRS_AD_STATE || 'pending';
    },
    isVip: function () {
      if (win.__MRS_IS_VIP === true || win.MRS_AD_STATE === 'vip') return true;
      try {
        if (doc && doc.documentElement && typeof doc.documentElement.getAttribute === 'function') {
          if (doc.documentElement.getAttribute('data-mrs-ad-state') === 'vip') return true;
        }
        if (doc && typeof doc.cookie === 'string' && /(?:^|;\s*)mrs_vip_active=1(?:;|$)/.test(doc.cookie)) {
          return true;
        }
      } catch (e) {}
      return false;
    },
    refresh: function () {
      retryStartedAt = 0;
      return verifyVipWithServer();
    },
    enterVipMode: function (expiresAt, opts) {
      stopRetryTimer();
      retryStartedAt = 0;
      if (expiresAt) {
        safeStorageSet(HINT_KEY, JSON.stringify({ expiresAt: expiresAt }));
      }
      setVipCookie(true, expiresAt);
      clearAdFrequencyStorage();
      purgeAdDomElements();
      setAdState('vip');
      return unregisterAdWorkersAndPush().finally(function () {
        if ((!opts || !opts.noReload) && win.location && typeof win.location.reload === 'function') {
          try {
            win.location.reload();
          } catch (e) {}
        }
      });
    },
    debug: function () {
      var ent = getSavedEntitlement();
      var hint = getSavedExpiryHint();
      return {
        state: win.MRS_AD_STATE || 'pending',
        hasToken: Boolean(ent && ent.token),
        plan: ent ? ent.plan : null,
        hasExpiresHint: Boolean(hint),
        expiresAtHint: hint ? hint.expiresAt : null,
        lastStatusCode: debugMeta.lastStatusCode,
        lastStatusAt: debugMeta.lastStatusAt,
        lastError: debugMeta.lastError,
        retryCount: debugMeta.retryCount,
        usedFailClosedHint: debugMeta.usedFailClosedHint,
        loadedAdScripts: debugMeta.loadedAdScripts.slice()
      };
    },
    _trackLoadedScript: function (src) {
      if (src && debugMeta.loadedAdScripts.indexOf(src) === -1) {
        debugMeta.loadedAdScripts.push(src);
      }
    }
  };

  // Step 2C decision immediately: if no token -> 'free' sync, else verify /api/status
  var initialEntitlement = getSavedEntitlement();
  if (!initialEntitlement || !initialEntitlement.token) {
    setVipCookie(false);
    setAdState('free');
  } else {
    verifyVipWithServer();
  }
})(window, document);
