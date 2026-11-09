import { useEffect, useState } from 'react';

export const BREAKPOINTS = { mobile: 768, desktop: 1100 };

export function layoutFor(width) {
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

/**
 * - `layout`: 'mobile' | 'tablet' | 'desktop' (single source of truth for structural changes).
 * - `keyboardOpen`: true while a soft keyboard covers part of the screen (touch devices only).
 * It also publishes the *visual* viewport as --sx-vvh / --sx-vvt, so the app shrinks above the soft keyboard
 * instead of being covered by it. The old "lock the height at mount" approach left inputs hidden.
 */
export function useViewport() {
  const [layout, setLayout] = useState(() => layoutFor(window.innerWidth));
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    let baseWidth = window.innerWidth;
    let baseHeight = vv ? vv.height : window.innerHeight;

    const update = () => {
      const width = window.innerWidth;
      const height = vv ? vv.height : window.innerHeight;
      if (width !== baseWidth) { baseWidth = width; baseHeight = height; } // rotation / window resize
      if (height > baseHeight) baseHeight = height;
      root.style.setProperty('--sx-vvh', `${Math.round(height)}px`);
      root.style.setProperty('--sx-vvt', `${Math.round(vv ? vv.offsetTop : 0)}px`);
      setLayout(layoutFor(width));
      setKeyboardOpen(touch && height < baseHeight - 140);
    };

    update();
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      root.style.removeProperty('--sx-vvh');
      root.style.removeProperty('--sx-vvt');
    };
  }, []);

  return { layout, keyboardOpen };
}

/** The editor owns all scrolling; the page itself must never scroll or rubber-band. */
export function useLockPageScroll() {
  useEffect(() => {
    document.documentElement.classList.add('sx-no-scroll');
    return () => document.documentElement.classList.remove('sx-no-scroll');
  }, []);
}
