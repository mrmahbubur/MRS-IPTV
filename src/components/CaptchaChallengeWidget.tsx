import React, { useEffect, useRef } from 'react';

interface CaptchaChallengeWidgetProps {
  turnstileSiteKey?: string | null;
  hcaptchaSiteKey?: string | null;
  resetKey?: number;
  onTokenChange: (token: string) => void;
}

export const CaptchaChallengeWidget: React.FC<CaptchaChallengeWidgetProps> = ({
  turnstileSiteKey,
  hcaptchaSiteKey,
  resetKey = 0,
  onTokenChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const providerRef = useRef<'turnstile' | 'hcaptcha' | null>(null);
  const callbackRef = useRef(onTokenChange);

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    const provider: 'turnstile' | 'hcaptcha' | null = turnstileSiteKey
      ? 'turnstile'
      : hcaptchaSiteKey
        ? 'hcaptcha'
        : null;
    const sitekey = turnstileSiteKey || hcaptchaSiteKey || '';

    if (!provider || !sitekey) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    callbackRef.current('');

    const removeWidget = () => {
      const id = widgetIdRef.current;
      const prevProvider = providerRef.current;
      try {
        if (id !== null && prevProvider === 'turnstile' && (window as any).turnstile?.remove) {
          (window as any).turnstile.remove(id);
        } else if (id !== null && prevProvider === 'hcaptcha' && (window as any).hcaptcha?.remove) {
          (window as any).hcaptcha.remove(id);
        }
      } catch {}
      widgetIdRef.current = null;
      providerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };

    const tryRender = (): boolean => {
      if (cancelled) return true;
      const container = containerRef.current;
      if (!container) return false;

      if (provider === 'turnstile' && (window as any).turnstile?.render) {
        removeWidget();
        widgetIdRef.current = (window as any).turnstile.render(container, {
          sitekey,
          theme: 'dark',
          callback: (token: string) => callbackRef.current(token || ''),
          'expired-callback': () => callbackRef.current(''),
          'error-callback': () => callbackRef.current(''),
        });
        providerRef.current = 'turnstile';
        return true;
      }

      if (provider === 'hcaptcha' && (window as any).hcaptcha?.render) {
        removeWidget();
        widgetIdRef.current = (window as any).hcaptcha.render(container, {
          sitekey,
          theme: 'dark',
          callback: (token: string) => callbackRef.current(token || ''),
          'expired-callback': () => callbackRef.current(''),
          'error-callback': () => callbackRef.current(''),
        });
        providerRef.current = 'hcaptcha';
        return true;
      }

      return false;
    };

    const scriptId = provider === 'turnstile' ? 'cf-turnstile-script' : 'hcaptcha-script';
    const scriptSrc =
      provider === 'turnstile'
        ? 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        : 'https://js.hcaptcha.com/1/api.js?render=explicit';

    if (!tryRender()) {
      let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
      const onLoad = () => {
        if (!cancelled) tryRender();
      };

      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = scriptId;
        scriptEl.src = scriptSrc;
        scriptEl.async = true;
        scriptEl.defer = true;
        scriptEl.addEventListener('load', onLoad, { once: true });
        document.head.appendChild(scriptEl);
      } else {
        scriptEl.addEventListener('load', onLoad, { once: true });
      }

      // Fallback readiness check if script finished loading right before listener attached
      let attempts = 0;
      pollTimer = window.setInterval(() => {
        attempts += 1;
        if (tryRender() || attempts > 40) {
          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      removeWidget();
    };
  }, [turnstileSiteKey, hcaptchaSiteKey, resetKey]);

  if (!turnstileSiteKey && !hcaptchaSiteKey) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />
    </div>
  );
};
