/**
 * M R S IPTV - Free-Only Ad Manager (ad-manager.js)
 * Loads ad scripts, sticky mobile banner, EU/UK consent banner, push pre-prompt,
 * safe popunder capping, and batched analytics ONLY when MRS_ADS.state() === "free".
 */
(function (win, doc) {
  'use strict';

  var NS = 'mrs_ads_';
  var CONSENT_KEY = NS + 'consent_v1';
  var VISITS_KEY = NS + 'visits';
  var POP_HIST_KEY = NS + 'pop_hist';
  var PUSH_NO_UNTIL_KEY = NS + 'push_no_until';
  var STICKY_CLOSED_KEY = NS + 'sticky_closed_session';
  var BLOCKER_NOTICE_COUNT_KEY = NS + 'blocker_notice_visits';

  var eventQueue = [];
  var flushTimer = null;
  var pushTimer = null;
  var managerBootedForFree = false;
  var popunderHandlerBound = false;
  var sessionPopNetworkUsed = false;

  var serverFormatConfig = {
    formats: {
      banner: true,
      sticky: true,
      popunder: true,
      interstitial: true,
      push: false,
      affiliate: true
    },
    hideOffersForVip: true,
    testMode: false
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
      var parsed = JSON.parse(raw);
      return parsed;
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

  function injectExternalScript(src, attrs) {
    if (!isFreeState() || !hasAdConsent() || !src) return null;
    if (doc.querySelector('script[src="' + src + '"]')) return null;
    var s = doc.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-mrs-ad-injected', '1');
    s.setAttribute('data-mrs-ad-approved', '1');
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        s.setAttribute(k, String(attrs[k]));
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

  function injectInlineSnippet(code, id) {
    if (!isFreeState() || !hasAdConsent() || !code) return null;
    if (id && doc.getElementById(id)) return null;
    var s = doc.createElement('script');
    if (id) s.id = id;
    s.setAttribute('data-mrs-ad-injected', '1');
    s.setAttribute('data-mrs-ad-approved', '1');
    s.textContent = code;
    var parent = doc.body || doc.head || doc.documentElement;
    if (parent) parent.appendChild(s);
    return s;
  }

  function teardownAllAdsUi() {
    managerBootedForFree = false;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    eventQueue = [];
    var sticky = doc.getElementById('mrs-sticky-mobile-ad');
    if (sticky && sticky.parentNode) sticky.parentNode.removeChild(sticky);
    var consent = doc.getElementById('mrs-consent-banner');
    if (consent && consent.parentNode) consent.parentNode.removeChild(consent);
    var pushEl = doc.getElementById('mrs-push-preprompt');
    if (pushEl && pushEl.parentNode) pushEl.parentNode.removeChild(pushEl);
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
      '<div style="color:#cbd5e1;line-height:1.45;margin-bottom:10px;">M R S IPTV is free thanks to partner sponsors. Choose whether to allow sponsor cookies &amp; personalized offers in Free Mode (VIP members never see ads).</div>',
      '<div id="mrs-consent-manage-panel" style="display:none;background:rgba(255,255,255,0.04);padding:8px 10px;border-radius:8px;margin-bottom:10px;">',
      '  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="mrs-consent-chk-ads" checked /> <span>Allow Sponsor Banners &amp; Offers</span></label>',
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
        // Rejected: suppress ad networks for this visitor
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

    var cfg = win.MRS_ADS_CONFIG || {};
    var popSnippet = (cfg.monetag && cfg.monetag.popunder && (cfg.monetag.popunder.scriptSrc || cfg.monetag.popunder.inlineSnippet))
      || (cfg.adsterra && cfg.adsterra.popunder);

    // Note: Only bind if an actual popunder tag is configured; do not invent extra popups.
    if (!popSnippet) return;

    popunderHandlerBound = true;
    doc.addEventListener('click', function (e) {
      if (!isFreeState() || !hasAdConsent() || isExcludedPageOrContext() || isPlayerActive() || sessionPopNetworkUsed) {
        return;
      }
      var target = e && e.target;
      if (!target || !target.closest) return;
      // Never fire on Play buttons, Close buttons, buttons, inputs, forms, or channel cards
      if (target.closest('button, [role="button"], .player-ctrl-btn, video, [data-player-control], form, input, select, a[href], [data-channel-card]')) {
        return;
      }

      var now = Date.now();
      var caps = cfg.caps || {};
      var cooldown = caps.popunderCooldownMs || 1800000;
      var maxPerDay = caps.popunderMaxPerDay || 3;

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

      if (typeof popSnippet === 'string' && popSnippet.indexOf('http') === 0) {
        injectExternalScript(popSnippet);
      } else if (typeof popSnippet === 'string') {
        injectInlineSnippet(popSnippet, 'mrs-popunder-script');
      }
      enqueueAdEvent({ eventType: 'view', format: 'popunder', placement: 'page-body', offerId: 'popunder-cap' });
    }, { passive: true });
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
    var zones = (cfg.monetag && cfg.monetag.directZones) || [];
    var zone = zones[0] || { zoneId: '11226634', label: 'Featured Sports Sponsor' };
    var useTest = Boolean(cfg.testMode || serverFormatConfig.testMode);

    var wrap = doc.createElement('div');
    wrap.id = 'mrs-sticky-mobile-ad';
    wrap.className = 'ad-slot ad-sticky-banner ad-banner-mobile';
    wrap.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);width:320px;max-width:calc(100vw - 16px);height:50px;z-index:45;background:#0c1228;border:1px solid rgba(245,179,1,0.45);border-radius:10px;display:flex;align-items:center;justify-content:space-between;padding:0 4px 0 10px;box-shadow:0 10px 28px rgba(0,0,0,0.75);overflow:hidden;';

    var href = useTest ? '#ad-preview' : ('/api/ads/redirect?placement=sticky-mobile&zoneId=' + encodeURIComponent(zone.zoneId));
    var linkHtml = useTest
      ? '<div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;color:#fbbf24;font-size:11px;font-weight:700;"><span>[TEST 320x50] Sponsor Banner</span></div>'
      : '<a href="' + href + '" target="_blank" rel="sponsored nofollow noopener" data-ad-link="true" style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff;"><span style="font-size:9px;font-weight:800;color:#fbbf24;text-transform:uppercase;flex-shrink:0;">Sponsored</span><span style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + zone.label + '</span></a>';

    wrap.innerHTML = linkHtml + '<button type="button" id="mrs-sticky-close-btn" aria-label="Close banner" style="width:44px;height:44px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#cbd5e1;font-size:18px;font-weight:700;cursor:pointer;flex-shrink:0;">&times;</button>';
    doc.body.appendChild(wrap);

    enqueueAdEvent({ eventType: 'view', format: 'sticky', placement: 'sticky-mobile-320x50', offerId: zone.zoneId });

    var closeBtn = doc.getElementById('mrs-sticky-close-btn');
    if (closeBtn) {
      closeBtn.onclick = function () {
        try { if (win.sessionStorage) win.sessionStorage.setItem(STICKY_CLOSED_KEY, '1'); } catch (e) {}
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      };
    }
    var anchor = wrap.querySelector('a[data-ad-link="true"]');
    if (anchor) {
      anchor.addEventListener('click', function () {
        enqueueAdEvent({ eventType: 'click', format: 'sticky', placement: 'sticky-mobile-320x50', offerId: zone.zoneId });
      });
    }
  }

  function schedulePushPrePrompt() {
    if (!isFreeState() || !hasAdConsent() || !serverFormatConfig.formats.push) return;
    if (isNativeWebView() || !('Notification' in win)) return;
    if (win.Notification.permission !== 'default') return;

    var cfg = win.MRS_ADS_CONFIG || {};
    var caps = cfg.caps || {};
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

    if (visits >= (caps.pushMinVisits || 2)) {
      pushTimer = setTimeout(showPrePrompt, 3500);
    } else {
      pushTimer = setTimeout(showPrePrompt, caps.pushDelayMs || 60000);
    }
  }

  function monitorEmptyDynamicSlots() {
    var cfg = win.MRS_ADS_CONFIG || {};
    var waitMs = (cfg.caps && cfg.caps.emptySlotCollapseMs) || 4000;
    setTimeout(function () {
      if (!isFreeState()) return;
      var slots = doc.querySelectorAll('.ad-slot[data-dynamic-slot="1"]');
      for (var i = 0; i < slots.length; i++) {
        var el = slots[i];
        if (!el) continue;
        var hasContent = el.children.length > 0 && el.innerText.trim().length > 0;
        if (!hasContent) {
          el.style.display = 'none';
          // Polite ad-blocker telemetry (no blocking wall)
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
    var cfg = win.MRS_ADS_CONFIG || {};
    var formats = serverFormatConfig.formats || {};

    // Monetag Vignette / Popunder (never while video is playing, never stacked with Adsterra Social Bar)
    var vignetteAdded = false;
    if (formats.interstitial && !isPlayerActive() && cfg.monetag && cfg.monetag.vignette) {
      if (cfg.monetag.vignette.scriptSrc) {
        injectExternalScript(cfg.monetag.vignette.scriptSrc, { 'data-zone': cfg.monetag.vignette.zoneId });
        vignetteAdded = true;
      } else if (cfg.monetag.vignette.inlineSnippet) {
        injectInlineSnippet(cfg.monetag.vignette.inlineSnippet, 'mrs-monetag-vignette');
        vignetteAdded = true;
      }
    }

    // Adsterra Social Bar (do not stack with Monetag Vignette on same page)
    if (!vignetteAdded && formats.interstitial && !isPlayerActive() && cfg.adsterra && cfg.adsterra.socialBar) {
      if (typeof cfg.adsterra.socialBar === 'string' && cfg.adsterra.socialBar.indexOf('http') === 0) {
        injectExternalScript(cfg.adsterra.socialBar);
      } else if (typeof cfg.adsterra.socialBar === 'string') {
        injectInlineSnippet(cfg.adsterra.socialBar, 'mrs-adsterra-social');
      }
    }
  }

  function bootFreeAds() {
    if (!isFreeState()) {
      teardownAllAdsUi();
      return;
    }

    if (managerBootedForFree) return;
    managerBootedForFree = true;

    // Count visit for free-user push cadence
    var prevVisits = parseInt(lsGet(VISITS_KEY) || '0', 10) || 0;
    lsSet(VISITS_KEY, String(prevVisits + 1));

    var cfg = win.MRS_ADS_CONFIG || {};
    var endpoint = (cfg.apiBaseUrl || '') + '/api/ads/config';

    fetch(endpoint, { method: 'GET', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var data = json && json.data ? json.data : json;
        if (data && data.formats) {
          serverFormatConfig.formats = Object.assign({}, serverFormatConfig.formats, data.formats);
        }
        if (data && typeof data.hideOffersForVip === 'boolean') {
          serverFormatConfig.hideOffersForVip = data.hideOffersForVip;
        }
        if (data && typeof data.testMode === 'boolean') {
          serverFormatConfig.testMode = data.testMode;
        }
        win.__MRS_ADS_SERVER_CONFIG = serverFormatConfig;
        try {
          win.dispatchEvent(new CustomEvent('mrs_ads_config_loaded', { detail: serverFormatConfig }));
        } catch (e) {}
      })
      .catch(function () { /* fail quietly if blocked */ })
      .finally(function () {
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
