import { useEffect, RefObject } from 'react';

/**
 * Attaches passive touch event listeners ('touchstart', 'touchmove', 'wheel') to scrollable containers.
 * On mobile devices and lower-end Android hardware, attaching touch listeners with { passive: true }
 * informs the browser's compositor thread that scrolling can occur immediately without waiting for
 * JavaScript event cancellation (e.preventDefault()), preventing scrolling stutter and reducing input lag.
 */
export function usePassiveTouchScroll<T extends HTMLElement>(ref: RefObject<T | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const dummyListener = () => {};
    const options: AddEventListenerOptions = { passive: true };

    element.addEventListener('touchstart', dummyListener, options);
    element.addEventListener('touchmove', dummyListener, options);
    element.addEventListener('wheel', dummyListener, options);

    return () => {
      element.removeEventListener('touchstart', dummyListener);
      element.removeEventListener('touchmove', dummyListener);
      element.removeEventListener('wheel', dummyListener);
    };
  }, [ref]);
}

/**
 * Global helper function to attach passive touch event listeners to any scrollable element by selector.
 */
export function attachPassiveTouchListenersToSelector(selector: string): () => void {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  const dummyListener = () => {};
  const options: AddEventListenerOptions = { passive: true };

  elements.forEach(el => {
    el.addEventListener('touchstart', dummyListener, options);
    el.addEventListener('touchmove', dummyListener, options);
  });

  return () => {
    elements.forEach(el => {
      el.removeEventListener('touchstart', dummyListener);
      el.removeEventListener('touchmove', dummyListener);
    });
  };
}
