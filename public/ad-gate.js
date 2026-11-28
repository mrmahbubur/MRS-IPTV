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
    'whomeehe.com'
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
      if (parsed && typeof parsed.token === 'string' && parsed.token.trim().length > 0) {
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
    return (
      safeStorageGet(DEVICE_KEY_PRIMARY) ||
      safeStorageGet(DEVICE_KEY_LEGACY) ||
      ''
    );
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
    var lower = url.toLowerCase();
    for (var i = 0; i < AD_HOST_MARKERS.length; i++) {
      if (lower.indexOf(AD_HOST_MARKERS[i].toLowerCase()) !== -1) return true;
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
      'html:not([data-mrs-ad-state="free"]) .ad-sticky-banner,',
      'html:not([data-mrs-ad-state="free"]) #mrs-sticky-mobile-ad,',
      'html:not([data-mrs-ad-state="free"]) #mrs-banner-slot,',
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
      'html[data-mrs-ad-state="pending"] .ad-slot {',
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
        '.ad-sticky-banner',
        '#mrs-sticky-mobile-ad',
        '#mrs-consent-banner',
        '#mrs-push-preprompt',
        'script[data-mrs-ad-injected="1"]',
        'script[src*="uplcm.com"]',
        'script[src*="quge5.com"]',
        'script[src*="n6wxm.com"]',
        'iframe[src*="uplcm.com"]',
        'iframe[src*="quge5.com"]',
        'iframe[src*="5gvci.com"]',
        'iframe[src*="n6wxm.com"]',
        'iframe[data-mrs-ad-frame="1"]',
        'div[id*="monetag"]',
        'div[class*="monetag"]',
        'div[id*="vignette"]'
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

    // 3. Guard dynamic DOM appends against third-party ad scripts/iframes unless state === 'free'
    if (win.Element && win.Element.prototype && win.Element.prototype.appendChild) {
      var origAppendChild = win.Element.prototype.appendChild;
      win.Element.prototype.appendChild = function (child) {
        if (child && child.tagName) {
          var tag = String(child.tagName).toLowerCase();
          if (tag === 'script' || tag === 'iframe') {
            var src = (child.src || (child.getAttribute && child.getAttribute('src')) || '');
            var isGateApproved = child.getAttribute && child.getAttribute('data-mrs-ad-approved') === '1';
            if ((win.MRS_AD_STATE || 'pending') !== 'free' && (isAdUrl(src) || (child.getAttribute && child.getAttribute('data-mrs-ad-injected') === '1'))) {
              return child;
            }
            if ((win.MRS_AD_STATE || 'pending') === 'vip' && isAdUrl(src) && !isGateApproved) {
              return child;
            }
          }
        }
        return origAppendChild.call(this, child);
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
