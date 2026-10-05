import { useLayoutEffect, useRef } from 'react';

/*
 * Shared GSAP helpers.
 *
 * - GSAP is loaded lazily (its own chunk), so it is not part of the main
 *   bundle or the login page.
 * - Nothing ever waits for GSAP: if it hasn't loaded yet, content simply
 *   shows without animation (no hidden content, no delay).
 * - Only opacity/transform, short durations, small distances.
 * - Everything is disabled under prefers-reduced-motion (gsap.matchMedia),
 *   and every animation is reverted/killed on cleanup.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const MOTION_OK = '(prefers-reduced-motion: no-preference)';

let gsapInstance = null;
let gsapPromise = null;

export function loadGsap() {
  if (!gsapPromise) {
    gsapPromise = import('gsap').then((mod) => {
      gsapInstance = mod.gsap || mod.default;
      return gsapInstance;
    });
    gsapPromise.catch(() => {
      // Allow a later retry if the chunk failed to load (e.g. offline).
      gsapPromise = null;
    });
  }
  return gsapPromise;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION).matches);
}

// Warm the GSAP chunk once the browser is idle, so later animations can run.
export function preloadMotion() {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  const start = () => { loadGsap().catch(() => {}); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 });
  else window.setTimeout(start, 1200);
}

/*
 * Fade-up entrance for the children of `element` (first `maxItems` only).
 * Returns a cleanup function (or undefined when nothing was animated).
 */
export function animateEntrance(element, selector = ':scope > *', { maxItems = 8 } = {}) {
  if (!element || prefersReducedMotion()) return undefined;

  const gsap = gsapInstance;
  if (!gsap) {
    loadGsap().catch(() => {});
    return undefined;
  }

  const targets = Array.from(element.querySelectorAll(selector)).slice(0, maxItems);
  if (!targets.length) return undefined;

  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(
      targets,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.035,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      },
    );
  });

  return () => mm.revert();
}

/*
 * Counts a rendered number up to `value` (from 0 on first show, then from
 * the previous value).
 *
 * Usage: const ref = useCountUp(value); <span ref={ref}>{value}</span>
 *
 * React keeps owning the text: we only change the existing text node's
 * value during the tween, and the tween always ends on the exact value.
 * Runs as a layout effect so the starting number is set before paint.
 */
export function useCountUp(value, { duration = 0.6 } = {}) {
  const ref = useRef(null);
  const fromRef = useRef(0);

  useLayoutEffect(() => {
    const target = Number(value);
    const node = ref.current?.firstChild;
    const gsap = gsapInstance;
    const from = fromRef.current;
    fromRef.current = Number.isFinite(target) ? target : 0;

    if (!node || node.nodeType !== Node.TEXT_NODE) return undefined;

    const finalText = String(value);

    if (
      !gsap ||
      !Number.isFinite(target) ||
      target === from ||
      prefersReducedMotion()
    ) {
      node.nodeValue = finalText;
      return undefined;
    }

    const counter = { n: from };
    node.nodeValue = String(Math.round(from));

    const tween = gsap.to(counter, {
      n: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        node.nodeValue = String(Math.round(counter.n));
      },
      onComplete: () => {
        node.nodeValue = finalText;
      },
    });

    // On a value change the next run sets the text again, so only stop here.
    return () => tween.kill();
  }, [value, duration]);

  return ref;
}
