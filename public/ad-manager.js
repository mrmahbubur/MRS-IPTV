/**
 * M R S IPTV - Free-Only Monetag Ad Manager (ad-manager.js)
 * Loads Monetag banners, sticky mobile banner (when Monetag regular ads are enabled),
 * EU/UK consent banner, Monetag scripts (ONLY when showRegularAds === true),
 * safe popunder capping, and batched analytics ONLY when MRS_ADS.state() === "free".
 */
(function (win, doc) {
  'use strict';

  var NS = 'mrs_ads_';
  var CONSENT_KEY = NS + 'consent_v1';
  var VISITS_KEY = NS + 'visits';
  var POP_HIST_KEY = NS + 'pop_hist';
  var INTERSTITIAL_HIST_KEY = NS + 'interstitial_hist';
  var PUSH_NO_UNTIL_KEY = NS + 'push_no_until';
  var STICKY_CLOSED_KEY = NS + 'sticky_closed_session';
  var BLOCKER_NOTICE_COUNT_KEY = NS + 'blocker_notice_visits';

  var eventQueue = [];
  var flushTimer = null;
  var pushTimer = null;
  var managerBootedForFree = false;
  var popunderHandlerBound = false;
  var sessionPopNetworkUsed = false;
  var activeConfigFetch = null;

  var serverFormatConfig = {
    formats: {
      banner: true,
      sticky: true,
      popunder: false,
      interstitial: false,
      push: false
    },
    testMode: true,
    monetag: {
      verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
      vignetteZoneId: '11242067',
      interstitialZoneId: '11242067',
      popunderZoneId: '11226634',
      showRegularAds: false,
      rewardedEnabled: false,
      rewardedShowFn: null,
      rewardedZoneId: null,
      zones: null,
      caps: {
        popunderCooldownMs: 1800000,
        popunderMaxPerDay: 3,
        interstitialCooldownMs: 180000,
        interstitialMaxPerDay: 12,
        pushDelayMs: 60000,
        pushMinVisits: 2,
        pushDeclineDays: 30,
        emptySlotCollapseMs: 4000
      }
    },
    rewards: {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      unlocksVipChannels: true,
      anyRewardedAvailable: false
    }
  };

  var EU_UK_TIMEZONES = [
    'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
    'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich',
    'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw',
    'Europe/Prague', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Bucharest', 'Europe/Budapest',
    'Europe/Sofia', 'Europe/Zagreb', 'Europe/Bratislava', 'Europe/Ljubljana', 'Europe/Tallinn',
    'Europe/Riga', 'Europe/Vilnius', 'Europe/Luxembourg', 'Europe/Malta', 'Europe/Nicosia',
    'Atlantic/Reykjavik'
  ];

  function lsGet(k) {
    try { return win.localStorage ? win.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (win.localStorage) win.localStorage.setItem(k, v); } catch (e) {}
  }

  function isFreeState() {
    return Boolean(win.MRS_ADS && typeof win.MRS_ADS.state === 'function' && win.MRS_ADS.state() === 'free');
  }

  function isNativeWebView() {
    try {
      var ua = (win.navigator && win.navigator.userAgent) || '';
      if (/wv\)/i.test(ua) || /\bAndroid\b.*\bVersion\/[\d.]+\b/i.test(ua)) return true;
      if (win.ReactNativeWebView || win.AndroidInterface || win.__MRS_NATIVE_WEBVIEW) return true;
    } catch (e) {}
    return false;
  }

  function isExcludedPageOrContext() {
    try {
      var path = (win.location && win.location.pathname ? win.location.pathname : '/').toLowerCase();
      var hash = (win.location && win.location.hash ? win.location.hash : '').toLowerCase();
      var attrView = (doc.documentElement && doc.documentElement.getAttribute('data-mrs-view') || '').toLowerCase();
      var excluded = ['checkout', 'activate', 'account', 'support', 'legal', 'admin'];
      for (var i = 0; i < excluded.length; i++) {
        var token = excluded[i];
        if (path.indexOf(token) !== -1 || hash.indexOf(token) !== -1 || attrView === token) {
          return true;
        }
      }
      if (doc.documentElement && doc.documentElement.getAttribute('data-mrs-modal-open') === '1') {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function isPlayerActive() {
    try {
      return Boolean(doc.documentElement && doc.documentElement.getAttribute('data-mrs-player-active') === '1');
    } catch (e) {
      return false;
    }
  }

  function isEuOrUkVisitor() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (EU_UK_TIMEZONES.indexOf(tz) !== -1) return true;
      var lang = (win.navigator.language || '').toLowerCase();
      if (/-(gb|de|fr|es|it|nl|se|pl|pt|ie|at|be|dk|fi|gr|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|lu|mt|cy)$/i.test(lang)) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function getConsentStatus() {
    var raw = lsGet(CONSENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function hasAdConsent() {
    if (!isEuOrUkVisitor()) return true;
    var consent = getConsentStatus();
    if (!consent) return false;
    return consent.choice === 'accept';
  }

  function isMonetagRegularAllowed() {
    var cfg = win.MRS_ADS_CONFIG || {};
    return Boolean(
      (serverFormatConfig.monetag && serverFormatConfig.monetag.showRegularAds) ||
      (cfg.monetag && cfg.monetag.showRegularAds)
    );
  }

  function isSafeHttpsAdUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    var trimmed = rawUrl.trim();
    if (!trimmed || trimmed.length > 512) return false;
    try {
      var parsed = new win.URL(trimmed);
      if (parsed.protocol !== 'https:') return false;
      if (parsed.username || parsed.password) return false;
      var host = String(parsed.hostname || '').toLowerCase();
      return (
        host === 'uplcm.com' ||
        host.slice(-10) === '.uplcm.com' ||
        host === 'monetag.com' ||
        host.slice(-12) === '.monetag.com'
      );
    } catch (e) {
      return /^https:\/\/([a-z0-9-]+\.)?(uplcm\.com|monetag\.com)(\/|$)/i.test(trimmed);
    }
  }

  function getEffectiveCaps() {
    var cfg = win.MRS_ADS_CONFIG || {};
    return Object.assign({}, cfg.caps || {}, (serverFormatConfig.monetag && serverFormatConfig.monetag.caps) || {});
  }

  function canShowNetworkInterstitial(caps) {
    var effectiveCaps = caps || getEffectiveCaps();
    var maxPerDay = typeof effectiveCaps.interstitialMaxPerDay === 'number'
      ? Math.max(0, effectiveCaps.interstitialMaxPerDay)
      : 12;
    if (maxPerDay === 0) return false;

    var cooldown = typeof effectiveCaps.interstitialCooldownMs === 'number'
      ? Math.max(15000, effectiveCaps.interstitialCooldownMs)
      : 180000;
    var now = Date.now();
    var today = new Date(now).toISOString().slice(0, 10);
    var hist = { day: today, count: 0, lastAt: 0 };
    try {
      var raw = lsGet(INTERSTITIAL_HIST_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.day === today) hist = parsed;
      }
    } catch (e) {}
    if (Number(hist.count || 0) >= maxPerDay) return false;
    if (hist.lastAt && (now - Number(hist.lastAt)) < cooldown) return false;
    return true;
  }

  function markNetworkInterstitialShown() {
    var now = Date.now();
    var today = new Date(now).toISOString().slice(0, 10);
    var hist = { day: today, count: 0, lastAt: 0 };
    try {
      var raw = lsGet(INTERSTITIAL_HIST_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.day === today) hist = parsed;
      }
    } catch (e) {}
    hist.count = Number(hist.count || 0) + 1;
    hist.lastAt = now;
    lsSet(INTERSTITIAL_HIST_KEY, JSON.stringify(hist));
  }

  function enqueueAdEvent(ev) {
    if (!isFreeState() || !ev) return;
    eventQueue.push({
      eventType: ev.eventType === 'click' ? 'click' : 'view',
      format: String(ev.format || 'banner').slice(0, 32),
      placement: String(ev.placement || 'general').slice(0, 64),
      offerId: String(ev.offerId || ev.zoneId || 'unknown').slice(0, 64),
      network: String(ev.network || 'Monetag Direct').slice(0, 40),
      ts: Date.now()
    });
    if (eventQueue.length >= 10) {
      flushAdEvents(false);
    } else if (!flushTimer) {
      flushTimer = setTimeout(function () {
        flushAdEvents(false);
      }, 4000);
    }
  }

  function flushAdEvents(useBeacon) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!isFreeState() || eventQueue.length === 0) {
      eventQueue = [];
      return;
    }
    var batch = eventQueue.splice(0, 25);
    var cfg = win.MRS_ADS_CONFIG || {};
    var endpoint = (cfg.apiBaseUrl || '') + '/api/ads/event';
    var payload = JSON.stringify({ events: batch });

    try {
      if (useBeacon && win.navigator && typeof win.navigator.sendBeacon === 'function') {
        var blob = new Blob([payload], { type: 'application/json' });
        win.navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  var ALLOWED_EXTERNAL_SCRIPT_ATTRS = {
    'data-zone': 1,
    'data-cfasync': 1,
    'crossorigin': 1,
    'referrerpolicy': 1,
    'type': 1,
    'charset': 1,
    'async': 1,
    'defer': 1
  };

  function hasExistingExternalScript(src) {
    try {
      var list = doc.querySelectorAll ? doc.querySelectorAll('script[src]') : [];
      for (var i = 0; i < list.length; i++) {
        var existingSrc = list[i] && (list[i].src || (list[i].getAttribute && list[i].getAttribute('src')));
        if (existingSrc === src) return true;
      }
    } catch (e) {}
    return false;
  }

  function injectExternalScript(src, attrs) {
    if (!isFreeState() || !hasAdConsent() || !src || !isSafeHttpsAdUrl(src)) return null;
    if (hasExistingExternalScript(src)) return null;
    var s = doc.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-mrs-ad-injected', '1');
    s.setAttribute('data-mrs-ad-approved', '1');
    s.setAttribute('referrerpolicy', 'strict-origin-when-downgrade');
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach(function (k) {
        var lowerKey = String(k || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_EXTERNAL_SCRIPT_ATTRS, lowerKey)) return;
        var rawVal = attrs[k];
        if (rawVal === undefined || rawVal === null) return;
        var strVal = String(rawVal).trim();
        if (!strVal) return;
        if (lowerKey === 'data-zone' && !/^[A-Za-z0-9_-]{1,32}$/.test(strVal)) return;
        if (lowerKey === 'data-cfasync' && strVal !== 'true' && strVal !== 'false') return;
        if (lowerKey === 'type' && strVal !== 'text/javascript' && strVal !== 'application/javascript') return;
        s.setAttribute(lowerKey, strVal);
      });
    }
    s.onerror = function () { /* silently ignore blocked networks */ };
    var parent = doc.body || doc.head || doc.documentElement;
    if (parent) parent.appendChild(s);
    if (win.MRS_ADS && win.MRS_ADS._trackLoadedScript) {
      win.MRS_ADS._trackLoadedScript(src);
    }
    return s;
  }

  function isSafeInlineAdSnippet(code) {
    if (typeof code !== 'string') return false;
    var trimmed = code.trim();
    if (!trimmed || trimmed.length > 4096) return false;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.test(trimmed)) {
      return false;
    }
    if (/(?:&#(?:x[0-9a-f]+|\d+);|&(?:colon|tab|newline);|\\(?:x[0-9a-f]{2}|u[0-9a-f]{4}|u\{[0-9a-f]+\}|[0-7]{1,3})|<!--|-->)/i.test(trimmed)) {
      return false;
    }
    var disallowed = [
      /\b(?:javascript|vbscript)\s*:/i,
      /\bdata\s*:\s*(?:text\/html|application\/|image\/svg)/i,
      /\bblob\s*:/i,
      /<\/?[a-z!?/]/i,
      /\bon[a-z]{2,}\s*=/i,
      /\$\{/,
      /\[\s*['"`]/,
      /\b(?:eval|Function|AsyncFunction|GeneratorFunction|AsyncGeneratorFunction|execScript|setTimeout|setInterval|setImmediate|importScripts)\s*(?:\(|`|\b)/,
      /\bnew\s+(?:Function|Proxy|WebSocket|Worker|SharedWorker|BroadcastChannel|EventSource|XMLHttpRequest|ActiveXObject|DOMParser|XMLSerializer)\b/i,
      /\b(?:Reflect|Proxy|DOMParser|XMLSerializer|ShadowRoot|MutationObserver|WebAssembly|trustedTypes|customElements)\b/,
      /\bimport\s*(?:\(|['"`])/i,
      /(?:^|[^\w$])(?:__proto__|prototype|constructor|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)\b/,
      /\bString\s*\.\s*(?:fromCharCode|fromCodePoint)\b/,
      /\b(?:atob|unescape|decodeURI|decodeURIComponent)\s*\(/,
      /\b(?:fetch|fetchLater|XMLHttpRequest|sendBeacon|EventSource|WebSocket)\b/,
      /\b(?:window|self|top|parent|frames|globalThis|document|localStorage|sessionStorage|indexedDB|caches|cookieStore|navigator|history)\s*(?:\[|\.)/,
      /\blocation\s*(?:\[|\.\s*(?:assign|replace|reload|href))/,
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|srcdoc|cookie)\s*(?:=|\+=)/,
      /\blocation\s*(?:=|\+=)/,
      /\b(?:localStorage|sessionStorage|indexedDB|cookieStore)\b/i,
      /\bwith\s*\(/
    ];
    for (var i = 0; i < disallowed.length; i++) {
      if (disallowed[i].test(trimmed)) return false;
    }
    return true;
  }

  function injectInlineSnippet(code, id) {
    if (!isFreeState() || !hasAdConsent() || !isSafeInlineAdSnippet(code)) return null;
    if (id && doc.getElementById(id)) return null;
    var s = doc.createElement('script');
    if (id) s.id = id;
    s.setAttribute('data-mrs-ad-injected', '1');
    s.setAttribute('data-mrs-ad-approved', '1');
    s.textContent = code.trim();
    var parent = doc.body || doc.head || doc.documentElement;
    if (parent) parent.appendChild(s);
    return s;
  }

  function teardownAllAdsUi() {
    managerBootedForFree = false;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    eventQueue = [];
    var idsToRemove = [
      'mrs-sticky-mobile-ad',
      'mrs-consent-banner',
      'mrs-push-preprompt',
      'mrs-reward-sim-modal',
      'mrs-monetag-interstitial',
      'mrs-popunder-script',
      'monetag-midnight-vignette',
      'monetag-tag-script'
    ];
    for (var i = 0; i < idsToRemove.length; i++) {
      var el = doc.getElementById(idsToRemove[i]);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    try {
      var injectedNodes = doc.querySelectorAll([
        '[data-zone]',
        '[data-ad-zone]',
        '[data-monetag-zone]',
        'ins[data-zone]',
        'script[data-mrs-ad-injected="1"]',
        'script[src*="uplcm.com"]',
        'script[src*="monetag.com"]',
        'script[src*="5gvci.com"]',
        'script[src*="al5sm.com"]',
        'script[src*="whomeehe.com"]',
        'script[src*="acscdn.com"]',
        'script[src*="tzegilo.com"]',
        'script[src*="madurird.com"]',
        'iframe[data-mrs-ad-frame="1"]',
        'iframe[src*="uplcm.com"]',
        'iframe[src*="monetag"]',
        'iframe[src*="5gvci.com"]',
        'iframe[src*="al5sm.com"]',
        'iframe[src*="whomeehe.com"]',
        'iframe[src*="acscdn.com"]',
        'iframe[src*="tzegilo.com"]',
        'iframe[src*="madurird.com"]',
        'iframe[id*="monetag"]',
        'iframe[class*="monetag"]',
        'iframe[id*="vignette"]',
        'iframe[id*="interstitial"]',
        'iframe[id*="popunder"]',
        'div[id*="monetag"]',
        'div[class*="monetag"]',
        'aside[id*="monetag"]',
        'section[id*="monetag"]',
        'div[id*="vignette"]',
        'div[class*="vignette"]',
        'div[id*="interstitial"]',
        'div[class*="interstitial"]',
        'div[id*="popunder"]',
        'div[class*="popunder"]'
      ].join(','));
      for (var j = 0; j < injectedNodes.length; j++) {
        if (injectedNodes[j] && injectedNodes[j].parentNode) {
          injectedNodes[j].parentNode.removeChild(injectedNodes[j]);
        }
      }
    } catch (e) {}
  }

  function renderConsentBanner(forceOpen) {
    if (!isFreeState()) return;
    if (!forceOpen && (!isEuOrUkVisitor() || getConsentStatus() !== null)) return;
    if (doc.getElementById('mrs-consent-banner')) return;

    var bar = doc.createElement('div');
    bar.id = 'mrs-consent-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Ad and Privacy Settings');
    bar.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;margin:0 auto;z-index:9990;background:#0c1228;color:#e2e8f0;border:1px solid rgba(56,189,248,0.45);border-radius:14px;padding:14px 16px;box-shadow:0 16px 40px rgba(0,0,0,0.75);font-family:inherit;font-size:12px;';

    bar.innerHTML = [
      '<div style="font-weight:800;font-size:13px;color:#fff;margin-bottom:4px;">Ad &amp; Privacy Settings</div>',
      '<div style="color:#cbd5e1;line-height:1.45;margin-bottom:10px;">M R S IPTV is free thanks to Monetag advertising. Choose whether to allow Monetag cookies &amp; personalized ads in Free Mode (VIP members never see ads).</div>',
      '<div id="mrs-consent-manage-panel" style="display:none;background:rgba(255,255,255,0.04);padding:8px 10px;border-radius:8px;margin-bottom:10px;">',
      '  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="mrs-consent-chk-ads" checked /> <span>Allow Monetag Ads</span></label>',
      '</div>',
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">',
      '  <button type="button" id="mrs-consent-manage" style="min-height:36px;padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.2);font-weight:700;cursor:pointer;">Manage</button>',
      '  <button type="button" id="mrs-consent-reject" style="min-height:36px;padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.08);color:#e2e8f0;border:1px solid rgba(255,255,255,0.2);font-weight:700;cursor:pointer;">Reject</button>',
      '  <button type="button" id="mrs-consent-accept" style="min-height:36px;padding:6px 14px;border-radius:8px;background:#f5b301;color:#050816;border:none;font-weight:800;cursor:pointer;">Accept</button>',
      '</div>'
    ].join('');

    doc.body.appendChild(bar);

    var closeBar = function (choice) {
      lsSet(CONSENT_KEY, JSON.stringify({ choice: choice, updatedAt: new Date().toISOString() }));
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      if (choice === 'accept') {
        bootFreeAds();
      } else {
        var sticky = doc.getElementById('mrs-sticky-mobile-ad');
        if (sticky && sticky.parentNode) sticky.parentNode.removeChild(sticky);
      }
      try {
        win.dispatchEvent(new CustomEvent('mrs_ads_consent_changed', { detail: { choice: choice } }));
      } catch (e) {}
    };

    var acceptBtn = doc.getElementById('mrs-consent-accept');
    var rejectBtn = doc.getElementById('mrs-consent-reject');
    var manageBtn = doc.getElementById('mrs-consent-manage');
    var managePanel = doc.getElementById('mrs-consent-manage-panel');

    if (acceptBtn) acceptBtn.onclick = function () {
      var chk = doc.getElementById('mrs-consent-chk-ads');
      var choice = (!chk || chk.checked) ? 'accept' : 'reject';
      closeBar(choice);
    };
    if (rejectBtn) rejectBtn.onclick = function () { closeBar('reject'); };
    if (manageBtn && managePanel) manageBtn.onclick = function () {
      managePanel.style.display = managePanel.style.display === 'none' ? 'block' : 'none';
    };
  }

  function setupSafePopunderCap() {
    if (popunderHandlerBound || !isFreeState() || !hasAdConsent()) return;
    if (isNativeWebView() || !serverFormatConfig.formats.popunder) return;
    if (Boolean(serverFormatConfig.testMode)) return;

    var cfg = win.MRS_ADS_CONFIG || {};
    var rawPopSnippet = isMonetagRegularAllowed() && cfg.monetag && cfg.monetag.popunder
      ? (cfg.monetag.popunder.scriptSrc || cfg.monetag.popunder.inlineSnippet)
      : null;
    var popSnippet = typeof rawPopSnippet === 'string' ? rawPopSnippet.trim() : '';

    // Only bind if that network's showRegularAds is true and an explicit popunder script exists
    if (!popSnippet) return;

    popunderHandlerBound = true;
    doc.addEventListener('click', function (e) {
      if (!isFreeState() || !hasAdConsent() || isExcludedPageOrContext() || isPlayerActive() || sessionPopNetworkUsed) {
        return;
      }
      var target = e && e.target;
      if (!target || !target.closest) return;
      if (target.closest('button, [role="button"], .player-ctrl-btn, video, [data-player-control], form, input, select, a[href], [data-channel-card]')) {
        return;
      }

      var now = Date.now();
      var caps = Object.assign({}, cfg.caps || {}, (serverFormatConfig.monetag && serverFormatConfig.monetag.caps) || {});
      var cooldown = caps.popunderCooldownMs || 1800000;
      var maxPerDay = typeof caps.popunderMaxPerDay === 'number' ? caps.popunderMaxPerDay : 3;

      var hist = { day: new Date().toISOString().slice(0, 10), count: 0, lastAt: 0 };
      try {
        var raw = lsGet(POP_HIST_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.day === hist.day) hist = parsed;
        }
      } catch (err) {}

      if (hist.count >= maxPerDay || (now - hist.lastAt) < cooldown) return;

      sessionPopNetworkUsed = true;
      hist.count += 1;
      hist.lastAt = now;
      lsSet(POP_HIST_KEY, JSON.stringify(hist));

      if (popSnippet.indexOf('https://') === 0) {
        injectExternalScript(popSnippet);
      } else {
        injectInlineSnippet(popSnippet, 'mrs-popunder-script');
      }
      enqueueAdEvent({ eventType: 'view', format: 'popunder', placement: 'page-body', offerId: 'popunder-cap' });
    }, { passive: true });
  }

  function pickStickyMonetagZone() {
    var cfg = win.MRS_ADS_CONFIG || {};
    var serverZones = serverFormatConfig.monetag && Array.isArray(serverFormatConfig.monetag.zones)
      ? serverFormatConfig.monetag.zones
      : null;
    var rawList = (serverZones && serverZones.length > 0)
      ? serverZones
      : (cfg.monetag && Array.isArray(cfg.monetag.directZones) ? cfg.monetag.directZones : []);
    var zoneList = rawList.filter(function (item) {
      return item && typeof item.zoneId === 'string' && isSafeHttpsAdUrl(item.url);
    });
    if (isMonetagRegularAllowed() && zoneList.length > 0) {
      var z = zoneList[0];
      return {
        offerId: z.zoneId,
        label: z.label,
        network: 'Monetag Direct',
        url: z.url
      };
    }
    return null;
  }

  function renderStickyMobileBanner() {
    if (!isFreeState() || !hasAdConsent()) return;
    if (!serverFormatConfig.formats.sticky) return;
    if (isExcludedPageOrContext() || isPlayerActive()) {
      var ex = doc.getElementById('mrs-sticky-mobile-ad');
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      return;
    }
    try {
      if (win.sessionStorage && win.sessionStorage.getItem(STICKY_CLOSED_KEY) === '1') return;
    } catch (e) {}
    if (win.innerWidth >= 1024) return;
    if (doc.getElementById('mrs-sticky-mobile-ad')) return;

    var cfg = win.MRS_ADS_CONFIG || {};
    var zone = pickStickyMonetagZone();
    if (!zone) return;
    var zoneId = zone.offerId;
    var label = zone.label || 'Monetag Live TV Ad';
    var network = zone.network || 'Monetag Direct';
    var useTest = typeof serverFormatConfig.testMode === 'boolean'
      ? serverFormatConfig.testMode
      : Boolean(cfg.testMode);

    var href = isSafeHttpsAdUrl(zone.url) ? zone.url : '';
    if (!href && !useTest) return;

    var wrap = doc.createElement('div');
    wrap.id = 'mrs-sticky-mobile-ad';
    wrap.className = 'ad-slot ad-sticky-banner ad-banner-mobile';
    wrap.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);width:320px;max-width:calc(100vw - 16px);height:50px;z-index:45;background:#0c1228;border:1px solid rgba(245,179,1,0.45);border-radius:10px;display:flex;align-items:center;justify-content:space-between;padding:0 4px 0 10px;box-shadow:0 10px 28px rgba(0,0,0,0.75);overflow:hidden;';

    var anchor = null;
    if (useTest) {
      var testBox = doc.createElement('div');
      testBox.style.cssText = 'flex:1;min-width:0;display:flex;align-items:center;gap:8px;color:#fbbf24;font-size:11px;font-weight:700;';
      var testSpan = doc.createElement('span');
      testSpan.textContent = '[TEST 320x50] Monetag · ' + network;
      testBox.appendChild(testSpan);
      wrap.appendChild(testBox);
    } else {
      anchor = doc.createElement('a');
      anchor.setAttribute('href', href);
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'nofollow noopener noreferrer');
      anchor.setAttribute('data-ad-link', 'true');
      anchor.style.cssText = 'flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff;';

      var badgeSpan = doc.createElement('span');
      badgeSpan.style.cssText = 'font-size:9px;font-weight:800;color:#fbbf24;text-transform:uppercase;flex-shrink:0;';
      badgeSpan.textContent = 'Ad';

      var labelSpan = doc.createElement('span');
      labelSpan.style.cssText = 'font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      labelSpan.textContent = label;

      anchor.appendChild(badgeSpan);
      anchor.appendChild(labelSpan);
      wrap.appendChild(anchor);
    }

    var closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'mrs-sticky-close-btn';
    closeBtn.setAttribute('aria-label', 'Close banner');
    closeBtn.style.cssText = 'width:44px;height:44px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#cbd5e1;font-size:18px;font-weight:700;cursor:pointer;flex-shrink:0;';
    closeBtn.textContent = '\u00d7';
    wrap.appendChild(closeBtn);

    doc.body.appendChild(wrap);

    enqueueAdEvent({
      eventType: 'view',
      format: 'sticky',
      placement: 'sticky-mobile-320x50',
      offerId: zoneId,
      network: network
    });

    closeBtn.onclick = function () {
      try { if (win.sessionStorage) win.sessionStorage.setItem(STICKY_CLOSED_KEY, '1'); } catch (e) {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    if (anchor) {
      anchor.addEventListener('click', function () {
        enqueueAdEvent({
          eventType: 'click',
          format: 'sticky',
          placement: 'sticky-mobile-320x50',
          offerId: zoneId,
          network: network
        });
      });
    }
  }

  function schedulePushPrePrompt() {
    if (!isFreeState() || !hasAdConsent() || !serverFormatConfig.formats.push) return;
    if (!isMonetagRegularAllowed() || Boolean(serverFormatConfig.testMode)) return;
    if (isNativeWebView() || !('Notification' in win)) return;
    if (win.Notification.permission !== 'default') return;

    var cfg = win.MRS_ADS_CONFIG || {};
    var caps = Object.assign({}, cfg.caps || {}, (serverFormatConfig.monetag && serverFormatConfig.monetag.caps) || {});
    var noUntil = parseInt(lsGet(PUSH_NO_UNTIL_KEY) || '0', 10) || 0;
    if (noUntil > Date.now()) return;

    var visits = parseInt(lsGet(VISITS_KEY) || '1', 10) || 1;
    var showPrePrompt = function () {
      if (!isFreeState() || isExcludedPageOrContext() || isPlayerActive()) return;
      if (doc.getElementById('mrs-push-preprompt')) return;

      var box = doc.createElement('div');
      box.id = 'mrs-push-preprompt';
      box.style.cssText = 'position:fixed;top:76px;right:16px;max-width:340px;z-index:9980;background:#0c1228;color:#fff;border:1px solid rgba(245,179,1,0.45);border-radius:12px;padding:12px 14px;box-shadow:0 16px 36px rgba(0,0,0,0.8);font-size:12px;';
      box.innerHTML = [
        '<div style="font-weight:800;margin-bottom:4px;">Match Alerts &amp; Free Stream Notices</div>',
        '<div style="color:#cbd5e1;line-height:1.4;margin-bottom:10px;">Receive live sports kick-off reminders in Free Mode. VIP members never receive push promos.</div>',
        '<div style="display:flex;gap:8px;justify-content:flex-end;">',
        '  <button type="button" id="mrs-push-no" style="min-height:36px;padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.08);color:#cbd5e1;border:none;font-weight:700;cursor:pointer;">No thanks</button>',
        '  <button type="button" id="mrs-push-yes" style="min-height:36px;padding:6px 12px;border-radius:8px;background:#f5b301;color:#050816;border:none;font-weight:800;cursor:pointer;">Allow</button>',
        '</div>'
      ].join('');
      doc.body.appendChild(box);

      doc.getElementById('mrs-push-no').onclick = function () {
        var daysMs = (caps.pushDeclineDays || 30) * 86400000;
        lsSet(PUSH_NO_UNTIL_KEY, String(Date.now() + daysMs));
        if (box.parentNode) box.parentNode.removeChild(box);
      };
      doc.getElementById('mrs-push-yes').onclick = function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        if (win.Notification && win.Notification.requestPermission) {
          win.Notification.requestPermission().then(function (perm) {
            if (perm === 'granted' && cfg.monetag && cfg.monetag.push && cfg.monetag.push.workerPath && win.navigator.serviceWorker) {
              win.navigator.serviceWorker.register(cfg.monetag.push.workerPath).catch(function () {});
            }
          }).catch(function () {});
        }
      };
    };

    var pushDelayMs = typeof caps.pushDelayMs === 'number' && caps.pushDelayMs > 0 ? caps.pushDelayMs : 60000;
    var pushMinVisits = typeof caps.pushMinVisits === 'number' && caps.pushMinVisits >= 1 ? caps.pushMinVisits : 2;
    if (visits >= pushMinVisits) {
      pushTimer = setTimeout(showPrePrompt, Math.min(3500, pushDelayMs));
    } else {
      pushTimer = setTimeout(showPrePrompt, pushDelayMs);
    }
  }

  function monitorEmptyDynamicSlots() {
    var cfg = win.MRS_ADS_CONFIG || {};
    var serverCaps = (serverFormatConfig.monetag && serverFormatConfig.monetag.caps) || {};
    var waitMs = serverCaps.emptySlotCollapseMs || (cfg.caps && cfg.caps.emptySlotCollapseMs) || 4000;
    setTimeout(function () {
      if (!isFreeState()) return;
      var slots = doc.querySelectorAll('.ad-slot[data-dynamic-slot="1"]');
      for (var i = 0; i < slots.length; i++) {
        var el = slots[i];
        if (!el) continue;
        var hasContent = el.children.length > 0 && el.innerText.trim().length > 0;
        if (!hasContent) {
          el.style.display = 'none';
          var seenVisits = parseInt(lsGet(BLOCKER_NOTICE_COUNT_KEY) || '0', 10) || 0;
          if (seenVisits % 5 === 0) {
            lsSet(BLOCKER_NOTICE_COUNT_KEY, String(seenVisits + 1));
          }
        }
      }
    }, waitMs);
  }

  function loadConfiguredNetworkScripts() {
    if (!isFreeState() || !hasAdConsent() || isExcludedPageOrContext()) return;
    if (Boolean(serverFormatConfig.testMode)) return;

    var cfg = win.MRS_ADS_CONFIG || {};
    var formats = serverFormatConfig.formats || {};
    var caps = getEffectiveCaps();

    // Monetag Vignette / Interstitial ONLY when monetag.showRegularAds === true and within cooldown + daily cap
    var serverInterstitial = serverFormatConfig.monetag && serverFormatConfig.monetag.interstitial;
    var staticInterstitial = cfg.monetag && (cfg.monetag.interstitial || cfg.monetag.vignette);
    var interstitialCfg = staticInterstitial || serverInterstitial || null;
    if (
      isMonetagRegularAllowed() &&
      formats.interstitial &&
      !isPlayerActive() &&
      interstitialCfg &&
      canShowNetworkInterstitial(caps)
    ) {
      var activeInterstitialZone =
        (serverFormatConfig.monetag && (serverFormatConfig.monetag.interstitialZoneId || (serverInterstitial && serverInterstitial.zoneId) || serverFormatConfig.monetag.vignetteZoneId)) ||
        interstitialCfg.zoneId;
      var injected = null;
      if (interstitialCfg.scriptSrc) {
        injected = injectExternalScript(interstitialCfg.scriptSrc, { 'data-zone': activeInterstitialZone });
      } else if (interstitialCfg.inlineSnippet) {
        injected = injectInlineSnippet(interstitialCfg.inlineSnippet, 'mrs-monetag-interstitial');
      }
      if (injected) {
        markNetworkInterstitialShown();
        enqueueAdEvent({
          eventType: 'view',
          format: 'interstitial',
          placement: 'network-interstitial',
          offerId: activeInterstitialZone,
          network: 'Monetag Direct'
        });
      }
    }
  }

  function syncCentralizedMonetagMetadata() {
    try {
      var m = serverFormatConfig.monetag || {};
      if (m.verificationId && doc && doc.querySelector) {
        var meta = doc.querySelector('meta[name="monetag"]');
        if (meta && meta.getAttribute('content') !== m.verificationId) {
          meta.setAttribute('content', m.verificationId);
        }
      }
      if (win.MRS_ADS_CONFIG && win.MRS_ADS_CONFIG.monetag) {
        if (m.verificationId) {
          win.MRS_ADS_CONFIG.monetag.verificationId = m.verificationId;
          if (win.MRS_ADS_CONFIG.publisherMeta) {
            win.MRS_ADS_CONFIG.publisherMeta.monetag = m.verificationId;
          }
        }
        if (m.vignette && win.MRS_ADS_CONFIG.monetag.vignette && isSafeHttpsAdUrl(m.vignette.url)) {
          win.MRS_ADS_CONFIG.monetag.vignette.zoneId = m.vignette.zoneId;
          win.MRS_ADS_CONFIG.monetag.vignette.url = m.vignette.url;
        }
        if (m.interstitial && win.MRS_ADS_CONFIG.monetag.interstitial && isSafeHttpsAdUrl(m.interstitial.url)) {
          win.MRS_ADS_CONFIG.monetag.interstitial.zoneId = m.interstitial.zoneId;
          win.MRS_ADS_CONFIG.monetag.interstitial.url = m.interstitial.url;
        }
        if (m.popunder && win.MRS_ADS_CONFIG.monetag.popunder && isSafeHttpsAdUrl(m.popunder.url)) {
          win.MRS_ADS_CONFIG.monetag.popunder.zoneId = m.popunder.zoneId;
          win.MRS_ADS_CONFIG.monetag.popunder.directZoneUrl = m.popunder.url;
        }
        if (Array.isArray(m.zones) && m.zones.length > 0) {
          var safeZones = m.zones.filter(function (z) {
            return z && typeof z.zoneId === 'string' && isSafeHttpsAdUrl(z.url);
          });
          if (safeZones.length > 0) {
            win.MRS_ADS_CONFIG.monetag.directZones = safeZones;
          }
        }
        if (m.caps) {
          win.MRS_ADS_CONFIG.caps = Object.assign({}, win.MRS_ADS_CONFIG.caps || {}, m.caps);
        }
      }
    } catch (e) {}
  }

  function applyServerAdConfigPayload(json) {
    var data = json && json.data ? json.data : json;
    if (data && data.formats) {
      serverFormatConfig.formats = Object.assign({}, serverFormatConfig.formats, data.formats);
    }
    if (data && typeof data.testMode === 'boolean') {
      serverFormatConfig.testMode = data.testMode;
    }
    if (data && data.monetag) {
      serverFormatConfig.monetag = Object.assign({}, serverFormatConfig.monetag, data.monetag, {
        caps: Object.assign({}, serverFormatConfig.monetag.caps || {}, data.monetag.caps || {})
      });
    }
    if (data && data.rewards) {
      serverFormatConfig.rewards = Object.assign({}, serverFormatConfig.rewards, data.rewards);
    }
    syncCentralizedMonetagMetadata();
    win.__MRS_ADS_SERVER_CONFIG = serverFormatConfig;
    try {
      win.dispatchEvent(new CustomEvent('mrs_ads_config_loaded', { detail: serverFormatConfig }));
    } catch (e) {}
    return serverFormatConfig;
  }

  function fetchDynamicAdConfig() {
    if (activeConfigFetch) return activeConfigFetch;
    var cfg = win.MRS_ADS_CONFIG || {};
    var endpoint = (cfg.apiBaseUrl || '') + '/api/ads/config';
    activeConfigFetch = fetch(endpoint, { method: 'GET', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (json) return applyServerAdConfigPayload(json);
        return serverFormatConfig;
      })
      .catch(function () { return serverFormatConfig; })
      .finally(function () {
        activeConfigFetch = null;
      });
    return activeConfigFetch;
  }

  function bootFreeAds() {
    if (!isFreeState()) {
      teardownAllAdsUi();
      return;
    }

    if (managerBootedForFree) return;
    managerBootedForFree = true;

    var prevVisits = parseInt(lsGet(VISITS_KEY) || '0', 10) || 0;
    lsSet(VISITS_KEY, String(prevVisits + 1));

    fetchDynamicAdConfig().finally(function () {
      if (!isFreeState()) {
        teardownAllAdsUi();
        return;
      }
      renderConsentBanner(false);
      if (hasAdConsent()) {
        loadConfiguredNetworkScripts();
        setupSafePopunderCap();
        renderStickyMobileBanner();
        schedulePushPrePrompt();
        monitorEmptyDynamicSlots();
      }
    });
  }

  win.MRS_ADS_REFRESH_CONFIG = function () {
    return fetchDynamicAdConfig();
  };

  win.MRS_ADS_OPEN_CONSENT = function () {
    if (!isFreeState()) return;
    renderConsentBanner(true);
  };

  win.MRS_ADS_TRACK_EVENT = enqueueAdEvent;

  win.addEventListener('mrs_ads_state_change', function (e) {
    var next = e && e.detail ? e.detail.state : (win.MRS_ADS && win.MRS_ADS.state());
    if (next === 'free') {
      bootFreeAds();
    } else {
      teardownAllAdsUi();
    }
  });

  win.addEventListener('pagehide', function () {
    flushAdEvents(true);
  });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () {
      if (isFreeState()) bootFreeAds();
      else teardownAllAdsUi();
    });
  } else {
    if (isFreeState()) bootFreeAds();
    else teardownAllAdsUi();
  }
})(window, document);
