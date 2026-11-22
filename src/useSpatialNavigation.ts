import { useEffect } from 'react';

export function useSpatialNavigation() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const focusableElements = Array.from(
          document.querySelectorAll('.channel-item, .nav-item, button, [tabindex="0"]')
        ).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el as HTMLElement).tabIndex >= 0;
        }) as HTMLElement[];

        if (focusableElements.length === 0) return;

        if (!active || !focusableElements.includes(active)) {
          // Focus first element if nothing is focused
          focusableElements[0].focus();
          e.preventDefault();
          return;
        }

        const activeRect = active.getBoundingClientRect();
        let nextEl: HTMLElement | null = null;
        let minDistance = Infinity;

        focusableElements.forEach(el => {
          if (el === active) return;
          const rect = el.getBoundingClientRect();
          let isCandidate = false;
          let distance = Infinity;
          
          const activeCenter = { x: activeRect.left + activeRect.width/2, y: activeRect.top + activeRect.height/2 };
          const rectCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
          const dx = rectCenter.x - activeCenter.x;
          const dy = rectCenter.y - activeCenter.y;

          switch (e.key) {
            case 'ArrowLeft':
              isCandidate = rectCenter.x < activeCenter.x;
              break;
            case 'ArrowRight':
              isCandidate = rectCenter.x > activeCenter.x;
              break;
            case 'ArrowUp':
              isCandidate = rectCenter.y < activeCenter.y;
              break;
            case 'ArrowDown':
              isCandidate = rectCenter.y > activeCenter.y;
              break;
          }

          if (isCandidate) {
            // Distance calculation prioritizing the direction
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              distance = Math.abs(dx) + Math.abs(dy) * 5; 
            } else {
              distance = Math.abs(dy) + Math.abs(dx) * 5;
            }

            if (distance < minDistance) {
              minDistance = distance;
              nextEl = el;
            }
          }
        });

        if (nextEl) {
          nextEl.focus();
          // scrollIntoView might be too aggressive, better to let browser handle focus scroll if possible, or use smooth nearest
          nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          e.preventDefault();
        }
      } else if (e.key === 'Enter') {
        if (active && (active.classList.contains('channel-item') || active.tagName === 'DIV')) {
          active.click();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
