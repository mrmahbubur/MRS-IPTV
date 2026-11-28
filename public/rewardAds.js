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

  function getDeviceId() {
    var existing = lsGet(DEVICE_KEY_PRIMARY);
    if (existing && /^[A-Za-z0-9_-]{12,128}$/.test(existing)) return existing;
    var legacy = lsGet(DEVICE_KEY_LEGACY);
    if (legacy && /^[A-Za-z0-9_-]{12,128}$/.test(legacy)) {
      lsSet(DEVICE_KEY_PRIMARY, legacy);
      return legacy;
    }
    var generated = '';
    try {
      if (win.crypto && typeof win.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        win.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) {
          generated += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
      }
    } catch (e) {}
    if (!generated || generated.length < 16) {
      generated = 'dev_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    }
    lsSet(DEVICE_KEY_PRIMARY, generated);
    return generated;
  }

  function getSavedEntitlement() {
    var raw = lsGet(ENTITLE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function resolveGlobalShowFn(fnName) {
    if (typeof fnName !== 'string') return null;
    var trimmed = fnName.trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/.test(trimmed)) return null;
    var parts = trimmed.split('.');
    var cur = win;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return typeof cur === 'function' ? cur : null;
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
        try {
          var maybePromise = showFn(function onComplete() {
            resolve({ completed: true });
          }, function onAbort(reason) {
            reject(new Error(reason || 'Rewarded ad closed or failed.'));
          });
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(function () {
              resolve({ completed: true });
            }).catch(function (err) {
              reject(err instanceof Error ? err : new Error('Rewarded ad was not completed.'));
            });
          }
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Rewarded ad SDK error.'));
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
