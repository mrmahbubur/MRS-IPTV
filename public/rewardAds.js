/**
 * M R S IPTV - Official Rewarded Ad Flow (rewardAds.js)
 * Coordinates "Watch a short ad to unlock 1 hour of VIP (free)".
 * Server controls nonces, minWatchMs, cooldowns, caps, and HMAC reward1h tokens.
 */
(function (win, doc) {
  'use strict';

  var ENTITLE_KEY = 'mrs_vip_entitlement';
  var HINT_KEY = 'mrs_vip_ads_hint';
  var JUST_UNLOCKED_KEY = 'mrs_reward_just_unlocked';
  var COOLDOWN_UNTIL_KEY = 'mrs_reward_cooldown_until';
  var EXPIRED_NOTICE_PENDING_KEY = 'mrs_reward_expired_notice_pending';
  var DEVICE_KEY_PRIMARY = 'mrs_device_id';
  var DEVICE_KEY_LEGACY = 'shahintv_device_id';

  var expiryTimer = null;
  var activeWatchPromise = null;

  function lsGet(k) {
    try { return win.localStorage ? win.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (win.localStorage) win.localStorage.setItem(k, v); } catch (e) {}
  }
  function lsRemove(k) {
    try { if (win.localStorage) win.localStorage.removeItem(k); } catch (e) {}
  }

  function getApiBase() {
    var cfg = win.MRS_ADS_CONFIG || {};
    return (cfg.apiBaseUrl || '').replace(/\/+$/, '');
  }

  var FORBIDDEN_FN_SEGMENTS = {
    '__proto__': 1, '__defineGetter__': 1, '__defineSetter__': 1, '__lookupGetter__': 1,
    '__lookupSetter__': 1, '__dirname': 1, '__filename': 1,
    'prototype': 1, 'constructor': 1, 'toString': 1, 'valueOf': 1,
    'hasOwnProperty': 1, 'isPrototypeOf': 1, 'propertyIsEnumerable': 1, 'toLocaleString': 1,
    'eval': 1, 'Function': 1, 'AsyncFunction': 1, 'GeneratorFunction': 1, 'AsyncGeneratorFunction': 1,
    'Object': 1, 'Array': 1, 'Proxy': 1, 'Reflect': 1, 'Symbol': 1, 'BigInt': 1,
    'String': 1, 'Number': 1, 'Boolean': 1, 'Promise': 1, 'RegExp': 1, 'Error': 1, 'JSON': 1,
    'WeakRef': 1, 'FinalizationRegistry': 1,
    'setTimeout': 1, 'setInterval': 1, 'setImmediate': 1, 'clearTimeout': 1, 'clearInterval': 1, 'clearImmediate': 1,
    'requestAnimationFrame': 1, 'cancelAnimationFrame': 1, 'requestIdleCallback': 1, 'cancelIdleCallback': 1, 'queueMicrotask': 1,
    'execScript': 1, 'alert': 1, 'confirm': 1, 'prompt': 1, 'print': 1, 'focus': 1, 'blur': 1, 'find': 1, 'stop': 1,
    'fetch': 1, 'XMLHttpRequest': 1, 'sendBeacon': 1, 'EventSource': 1, 'RTCPeerConnection': 1, 'WebTransport': 1,
    'Request': 1, 'Response': 1, 'Headers': 1, 'URL': 1, 'URLSearchParams': 1,
    'Blob': 1, 'File': 1, 'FileReader': 1, 'FormData': 1, 'atob': 1, 'btoa': 1,
    'open': 1, 'close': 1, 'opener': 1, 'frameElement': 1,
    'location': 1, 'assign': 1, 'replace': 1, 'reload': 1, 'href': 1, 'origin': 1,
    'document': 1, 'documentElement': 1, 'body': 1, 'head': 1, 'scripts': 1, 'styleSheets': 1,
    'domain': 1, 'referrer': 1, 'cookie': 1, 'cookieStore': 1, 'caches': 1,
    'createElement': 1, 'createRange': 1, 'createContextualFragment': 1,
    'innerHTML': 1, 'outerHTML': 1, 'insertAdjacentHTML': 1, 'write': 1, 'writeln': 1, 'append': 1, 'appendChild': 1,
    'src': 1, 'srcdoc': 1, 'addEventListener': 1, 'removeEventListener': 1, 'dispatchEvent': 1,
    'window': 1, 'self': 1, 'top': 1, 'parent': 1, 'frames': 1, 'globalThis': 1, 'global': 1,
    'navigator': 1, 'serviceWorker': 1, 'ServiceWorker': 1, 'Notification': 1, 'Permissions': 1,
    'clipboard': 1, 'Clipboard': 1, 'geolocation': 1, 'credentials': 1,
    'localStorage': 1, 'sessionStorage': 1, 'indexedDB': 1, 'history': 1, 'pushState': 1, 'replaceState': 1,
    'crypto': 1, 'postMessage': 1, 'importScripts': 1,
    'WebSocket': 1, 'Worker': 1, 'SharedWorker': 1, 'BroadcastChannel': 1, 'MessageChannel': 1, 'MessagePort': 1,
    'defineProperty': 1, 'defineProperties': 1, 'getOwnPropertyDescriptor': 1, 'getPrototypeOf': 1, 'setPrototypeOf': 1,
    'freeze': 1, 'seal': 1, 'parse': 1, 'stringify': 1, 'Buffer': 1, 'process': 1, 'require': 1, 'module': 1, 'exports': 1,
    'caller': 1, 'callee': 1, 'arguments': 1, 'apply': 1, 'call': 1, 'bind': 1, 'name': 1, 'length': 1,
    'escape': 1, 'unescape': 1, 'encodeURI': 1, 'encodeURIComponent': 1, 'decodeURI': 1, 'decodeURIComponent': 1,
    'isFinite': 1, 'isNaN': 1, 'parseFloat': 1, 'parseInt': 1, 'structuredClone': 1, 'reportError': 1,
    'fetchLater': 1, 'openDatabase': 1, 'getComputedStyle': 1, 'matchMedia': 1, 'getSelection': 1,
    'scrollTo': 1, 'scrollBy': 1, 'moveTo': 1, 'resizeTo': 1, 'trustedTypes': 1, 'customElements': 1,
    'performance': 1, 'Intl': 1, 'WebAssembly': 1, 'Atomics': 1, 'SharedArrayBuffer': 1, 'ArrayBuffer': 1,
    'DataView': 1, 'WeakMap': 1, 'WeakSet': 1, 'Map': 1, 'Set': 1, 'Date': 1, 'Math': 1,
    'ShadowRoot': 1, 'MutationObserver': 1, 'ResizeObserver': 1, 'IntersectionObserver': 1, 'PerformanceObserver': 1,
    'DOMParser': 1, 'XMLSerializer': 1, 'Range': 1, 'Selection': 1, 'subtle': 1, 'inspect': 1
  };
  var FORBIDDEN_FN_LOWER = {};
  (function () {
    var k;
    for (k in FORBIDDEN_FN_SEGMENTS) {
      if (Object.prototype.hasOwnProperty.call(FORBIDDEN_FN_SEGMENTS, k)) {
        FORBIDDEN_FN_LOWER[k.toLowerCase()] = 1;
      }
    }
    var kw = [
      'this', 'super', 'class', 'import', 'export', 'await', 'async', 'delete', 'typeof', 'void',
      'new', 'in', 'instanceof', 'return', 'throw', 'try', 'catch', 'finally', 'with', 'yield',
      'let', 'const', 'var', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'default', 'debugger', 'enum', 'extends', 'implements', 'interface', 'package',
      'private', 'protected', 'public', 'static', 'null', 'undefined', 'true', 'false'
    ];
    for (var j = 0; j < kw.length; j++) {
      FORBIDDEN_FN_LOWER[kw[j]] = 1;
    }
  })();
  var FN_SEGMENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]{0,31}$/;

  function generateCryptoId() {
    var generated = '';
    var c = win.crypto || win.msCrypto;
    try {
      if (c && typeof c.getRandomValues === 'function') {
        var bytes = new Uint8Array(24);
        c.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) {
          generated += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
        return generated;
      }
      if (c && typeof c.randomUUID === 'function') {
        return c.randomUUID().replace(/-/g, '');
      }
    } catch (e) {}
    // Fallback only if Web Crypto is completely unavailable in an ancient runtime
    var timeHex = Date.now().toString(16);
    var perfHex = (win.performance && typeof win.performance.now === 'function')
      ? Math.floor(win.performance.now() * 1000).toString(16)
      : '0';
    var pool = timeHex + '_' + perfHex + '_';
    while (pool.length < 32) {
      pool += Math.floor(Math.random() * 0xffffffff).toString(16);
    }
    return 'dev_' + pool.slice(0, 32);
  }

  function getDeviceId() {
    var existing = lsGet(DEVICE_KEY_PRIMARY);
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
    var legacy = lsGet(DEVICE_KEY_LEGACY);
    if (legacy && /^[A-Za-z0-9_-]{16,128}$/.test(legacy)) {
      lsSet(DEVICE_KEY_PRIMARY, legacy);
      return legacy;
    }
    var generated = generateCryptoId();
    lsSet(DEVICE_KEY_PRIMARY, generated);
    return generated;
  }

  function getSavedEntitlement() {
    var raw = lsGet(ENTITLE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function isValidShowFnName(fnName) {
    if (typeof fnName !== 'string') return false;
    var trimmed = fnName.trim();
    if (!trimmed || trimmed.length > 64) return false;
    var parts = trimmed.split('.');
    if (parts.length < 1 || parts.length > 4) return false;
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!FN_SEGMENT_RE.test(seg)) return false;
      if (/^[_$]+$/.test(seg)) return false;
      if (/^__.*__$/.test(seg)) return false;
      if (Object.prototype.hasOwnProperty.call(FORBIDDEN_FN_SEGMENTS, seg)) return false;
      if (Object.prototype.hasOwnProperty.call(FORBIDDEN_FN_LOWER, seg.toLowerCase())) return false;
    }
    return true;
  }

  function resolveGlobalShowFn(fnName) {
    if (!isValidShowFnName(fnName)) return null;
    var parts = fnName.trim().split('.');
    var parent = null;
    var cur = win;
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!cur || (typeof cur !== 'object' && typeof cur !== 'function')) return null;
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return null;
      var desc = Object.getOwnPropertyDescriptor(cur, seg);
      if (!desc || !Object.prototype.hasOwnProperty.call(desc, 'value') || typeof desc.get === 'function' || typeof desc.set === 'function') {
        return null;
      }
      parent = cur;
      cur = desc.value;
      if (
        cur === win ||
        cur === doc ||
        (win.Node && cur instanceof win.Node) ||
        (win.Location && cur instanceof win.Location) ||
        (win.History && cur instanceof win.History) ||
        (win.Storage && cur instanceof win.Storage) ||
        (win.Navigator && cur instanceof win.Navigator)
      ) {
        return null;
      }
    }
    if (typeof cur !== 'function') return null;
    try {
      var fnSrc = Function.prototype.toString.call(cur);
      if (fnSrc.indexOf('[native code]') !== -1) return null;
    } catch (e) {
      return null;
    }
    return parent && parent !== win ? cur.bind(parent) : cur;
  }

  function getRuntimeState() {
    var serverCfg = win.__MRS_ADS_SERVER_CONFIG || {};
    var staticCfg = win.MRS_ADS_CONFIG || {};
    var testMode = typeof serverCfg.testMode === 'boolean'
      ? serverCfg.testMode
      : Boolean(staticCfg.testMode);

    var monetagCfg = staticCfg.monetag && staticCfg.monetag.rewarded ? staticCfg.monetag.rewarded : {};
    var resolvedServerFn = serverCfg.monetag && serverCfg.monetag.rewardedShowFn
      ? resolveGlobalShowFn(serverCfg.monetag.rewardedShowFn)
      : null;
    var resolvedShowFn = typeof monetagCfg.showFn === 'function'
      ? monetagCfg.showFn
      : typeof monetagCfg.showFn === 'string'
        ? resolveGlobalShowFn(monetagCfg.showFn)
        : resolvedServerFn;

    var monetagAvailable = Boolean(
      (serverCfg.monetag && serverCfg.monetag.rewardedEnabled) ||
      (monetagCfg.enabled && (testMode || resolvedShowFn || monetagCfg.snippet))
    );

    return {
      testMode: testMode,
      monetagAvailable: monetagAvailable,
      anyAvailable: monetagAvailable,
      monetagCfg: monetagCfg,
      resolvedShowFn: resolvedShowFn
    };
  }

  function getCooldownRemainingMinutes() {
    var raw = lsGet(COOLDOWN_UNTIL_KEY);
    if (!raw) return 0;
    var untilMs = parseInt(raw, 10) || 0;
    if (untilMs <= Date.now()) {
      lsRemove(COOLDOWN_UNTIL_KEY);
      return 0;
    }
    return Math.max(1, Math.ceil((untilMs - Date.now()) / 60000));
  }

  function isAvailable() {
    var gateState = (win.MRS_ADS && win.MRS_ADS.state && win.MRS_ADS.state()) || win.MRS_AD_STATE || 'pending';
    if (gateState !== 'free') {
      return { available: false, reason: 'vip_active', cooldownMinutes: 0 };
    }
    var rt = getRuntimeState();
    var cooldownMinutes = getCooldownRemainingMinutes();
    if (!rt.anyAvailable) {
      return { available: false, reason: 'no_rewarded_network', cooldownMinutes: cooldownMinutes };
    }
    return {
      available: true,
      testMode: rt.testMode,
      network: 'monetag',
      cooldownMinutes: cooldownMinutes
    };
  }

  /**
   * Renders an honest simulated rewarded ad player ONLY when testMode === true.
   * Never contacts ad networks; rejects cleanly if user closes/cancels early.
   */
  function runSimulatedTestWatch(minWatchMs) {
    return new Promise(function (resolve, reject) {
      var waitSec = Math.max(1, Math.ceil((minWatchMs || 15000) / 1000));
      var remaining = waitSec;
      var settled = false;

      var existing = doc.getElementById('mrs-reward-sim-modal');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      var overlay = doc.createElement('div');
      overlay.id = 'mrs-reward-sim-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Test Mode Simulated Rewarded Ad');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(5,8,22,0.94);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;';

      overlay.innerHTML = [
        '<div style="width:100%;max-width:440px;background:#0e131f;border:1px solid rgba(245,179,1,0.55);border-radius:16px;padding:20px;color:#fff;box-shadow:0 24px 60px rgba(0,0,0,0.85);">',
        '  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">',
        '    <span style="font-size:10px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#050816;background:#f5b301;padding:3px 8px;border-radius:6px;">Test Mode · Simulated Rewarded Ad</span>',
        '    <button type="button" id="mrs-sim-cancel" style="min-height:34px;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15);font-size:11px;font-weight:700;cursor:pointer;">Cancel</button>',
        '  </div>',
        '  <div style="aspect-ratio:16/9;background:#050816;border:1px dashed rgba(245,179,1,0.4);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px;margin-bottom:14px;">',
        '    <div style="font-size:13px;font-weight:800;color:#fbbf24;margin-bottom:6px;">Simulated Rewarded Video Preview</div>',
        '    <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;">Zero external network calls are made in Test Mode.</div>',
        '    <div id="mrs-sim-timer" style="font-family:monospace;font-size:22px;font-weight:900;color:#38bdf8;">' + remaining + 's</div>',
        '  </div>',
        '  <div style="font-size:11px;color:#94a3b8;text-align:center;">Closing early grants nothing. Wait for completion to unlock 1 hour of ad-free VIP.</div>',
        '</div>'
      ].join('');

      doc.body.appendChild(overlay);

      var timerId = null;
      var cleanup = function () {
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      };

      var cancelBtn = doc.getElementById('mrs-sim-cancel');
      if (cancelBtn) {
        cancelBtn.onclick = function () {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Rewarded ad closed before completion. No VIP time granted.'));
        };
      }

      timerId = setInterval(function () {
        remaining -= 1;
        var timerEl = doc.getElementById('mrs-sim-timer');
        if (timerEl) timerEl.textContent = Math.max(0, remaining) + 's';
        if (remaining <= 0) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ completed: true, simulated: true });
        }
      }, 1000);
    });
  }

  function runOfficialNetworkReward(network, minWatchMs) {
    var gateState = (win.MRS_ADS && win.MRS_ADS.state && win.MRS_ADS.state()) || win.MRS_AD_STATE || 'pending';
    if (gateState !== 'free') {
      return Promise.reject(new Error('VIP is already active.'));
    }

    var rt = getRuntimeState();
    if (rt.testMode) {
      return runSimulatedTestWatch(minWatchMs);
    }

    if (network !== 'monetag') {
      return Promise.reject(new Error('Unsupported reward network: ' + network));
    }
    var netCfg = rt.monetagCfg;
    var serverCfg = win.__MRS_ADS_SERVER_CONFIG || {};
    var isEnabled = Boolean(netCfg.enabled || (serverCfg.monetag && serverCfg.monetag.rewardedEnabled));
    if (!isEnabled) {
      return Promise.reject(new Error('Rewarded ad format is disabled for ' + network + '.'));
    }

    var showFn = rt.resolvedShowFn;
    if (typeof showFn === 'function') {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var finishOk = function () {
          if (settled) return;
          settled = true;
          resolve({ completed: true });
        };
        var finishErr = function (err) {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err || 'Rewarded ad closed or failed.')));
        };
        try {
          var maybePromise = showFn(finishOk, finishErr);
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(finishOk).catch(function (err) {
              finishErr(err instanceof Error ? err : new Error('Rewarded ad was not completed.'));
            });
          }
        } catch (err) {
          finishErr(err instanceof Error ? err : new Error('Rewarded ad SDK error.'));
        }
      });
    }

    return Promise.reject(new Error('Official rewarded completion handler is not configured.'));
  }

  function startAndWatch(preferredNetwork) {
    if (activeWatchPromise) return activeWatchPromise;

    var availability = isAvailable();
    if (!availability.available) {
      return Promise.reject(new Error(
        availability.reason === 'vip_active'
          ? 'VIP is already active.'
          : 'Rewarded video is currently unavailable.'
      ));
    }

    var base = getApiBase();
    var deviceId = getDeviceId();
    var network = preferredNetwork || availability.network || 'monetag';

    activeWatchPromise = fetch(base + '/api/rewards/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ deviceId: deviceId, network: network })
    })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (json) {
          return { ok: r.ok, status: r.status, json: json };
        });
      })
      .then(function (res) {
        var errObj = res.json && res.json.error;
        if (!res.ok || !res.json || !res.json.ok || !res.json.data) {
          if (errObj && errObj.availableAt) {
            var availMs = Date.parse(errObj.availableAt);
            if (!isNaN(availMs)) lsSet(COOLDOWN_UNTIL_KEY, String(availMs));
          }
          throw new Error((errObj && errObj.message) || 'Could not start rewarded ad session.');
        }

        var session = res.json.data;
        return runOfficialNetworkReward(session.network || network, session.minWatchMs).then(function () {
          return fetch(base + '/api/rewards/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ nonce: session.nonce, deviceId: deviceId })
          }).then(function (cr) {
            return cr.json().catch(function () { return null; }).then(function (cjson) {
              if (!cr.ok || !cjson || !cjson.ok || !cjson.data || !cjson.data.token) {
                var cErr = cjson && cjson.error;
                throw new Error((cErr && cErr.message) || 'Failed to claim 1-hour VIP reward.');
              }
              return cjson.data;
            });
          });
        });
      })
      .then(function (claimData) {
        var entitlement = {
          active: true,
          kind: 'reward',
          token: claimData.token,
          plan: claimData.plan || 'reward1h',
          planLabel: '1-Hour Free VIP (Reward)',
          months: 0,
          durationDays: 0,
          activatedAt: claimData.grantedAt || new Date().toISOString(),
          expiresAt: claimData.expiresAt,
          network: claimData.network || network
        };
        lsSet(ENTITLE_KEY, JSON.stringify(entitlement));
        if (claimData.expiresAt) {
          lsSet(HINT_KEY, JSON.stringify({ expiresAt: claimData.expiresAt }));
        }
        var adFreePayload = {
          isActive: true,
          isAdFree: true,
          code: 'REWARD_1H_VIP',
          deviceId: deviceId,
          activatedAt: entitlement.activatedAt,
          expiryDate: claimData.expiresAt,
          durationMonths: 0
        };
        lsSet('shahintv_adfree_activation', JSON.stringify(adFreePayload));
        lsSet(JUST_UNLOCKED_KEY, '1');
        lsRemove(EXPIRED_NOTICE_PENDING_KEY);
        try {
          win.dispatchEvent(new CustomEvent('shahintv_adfree_updated', { detail: adFreePayload }));
        } catch (e) {}

        if (win.MRS_ADS && typeof win.MRS_ADS.enterVipMode === 'function') {
          win.MRS_ADS.enterVipMode(claimData.expiresAt);
        }
        return entitlement;
      })
      .finally(function () {
        activeWatchPromise = null;
      });

    return activeWatchPromise;
  }

  function refreshStatus() {
    var base = getApiBase();
    var deviceId = getDeviceId();
    return fetch(base + '/api/rewards/status?deviceId=' + encodeURIComponent(deviceId), {
      method: 'GET',
      credentials: 'same-origin'
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var data = json && json.data ? json.data : null;
        if (!data) return null;
        if (data.availableAt) {
          var availMs = Date.parse(data.availableAt);
          if (!isNaN(availMs) && availMs > Date.now()) {
            lsSet(COOLDOWN_UNTIL_KEY, String(availMs));
          }
        } else if (data.cooldownMinutes === 0) {
          lsRemove(COOLDOWN_UNTIL_KEY);
        }
        try {
          win.dispatchEvent(new CustomEvent('mrs_reward_status_updated', { detail: data }));
        } catch (e) {}
        return data;
      })
      .catch(function () { return null; });
  }

  function scheduleExpiryCheck() {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    var ent = getSavedEntitlement();
    if (!ent || !ent.token || !ent.expiresAt) return;
    if (ent.plan !== 'reward1h' && ent.kind !== 'reward') return;

    var msLeft = Date.parse(ent.expiresAt) - Date.now();
    var delay = Math.max(1000, isNaN(msLeft) ? 5000 : msLeft + 1500);

    expiryTimer = setTimeout(function () {
      if (win.MRS_ADS && typeof win.MRS_ADS.refresh === 'function') {
        win.MRS_ADS.refresh().then(function (nextState) {
          if (nextState === 'free') {
            var cooldownMins = ((win.__MRS_ADS_SERVER_CONFIG && win.__MRS_ADS_SERVER_CONFIG.rewards && win.__MRS_ADS_SERVER_CONFIG.rewards.cooldownMinutes) || 180);
            lsSet(COOLDOWN_UNTIL_KEY, String(Date.now() + cooldownMins * 60000));
            lsSet(EXPIRED_NOTICE_PENDING_KEY, String(cooldownMins));
            try {
              win.dispatchEvent(new CustomEvent('mrs_reward_expired_once', {
                detail: { cooldownMinutes: cooldownMins }
              }));
            } catch (e) {}
          }
        });
      }
    }, Math.min(delay, 2147483647));
  }

  win.MRS_REWARD_ADS = {
    isAvailable: isAvailable,
    startAndWatch: startAndWatch,
    refreshStatus: refreshStatus,
    getCooldownRemainingMinutes: getCooldownRemainingMinutes,
    scheduleExpiryCheck: scheduleExpiryCheck
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', scheduleExpiryCheck);
  } else {
    scheduleExpiryCheck();
  }
  win.addEventListener('mrs_ads_state_change', scheduleExpiryCheck);
})(window, document);
