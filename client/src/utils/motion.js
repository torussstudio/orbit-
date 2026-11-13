import { useLayoutEffect, useRef } from 'react';

/*
 * Shared GSAP motion system (one place for every animation in the app).
 *
 * Rules
 * - GSAP is loaded lazily (its own chunk), so it is not part of the main
 *   bundle or the login page.
 * - Nothing ever waits for GSAP: if it hasn't loaded yet, content simply
 *   shows without animation (no hidden content, no delay).
 * - Only opacity/transform, short durations, small distances.
 * - Everything is disabled under prefers-reduced-motion (gsap.matchMedia),
 *   and every animation is reverted/killed on cleanup.
 * - Components never hard-code durations/eases: they use MOTION and the
 *   presets/hooks below, so members and admin screens feel identical.
 *
 * Opt out of automatic reveal/interaction motion on any element (or its
 * subtree) with data-motion="off".
 */

/* -------------------------------------------------------------------------- */
/* TOKENS                                                                     */
/* -------------------------------------------------------------------------- */

export const MOTION = Object.freeze({
  duration: { fast: 0.18, base: 0.28, slow: 0.4 },
  ease: { out: 'power2.out', inOut: 'power2.inOut', soft: 'power3.out' },
  distance: { sm: 6, md: 10 },
  stagger: 0.035,
  maxStaggerItems: 12,
});

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/* -------------------------------------------------------------------------- */
/* LOADING                                                                    */
/* -------------------------------------------------------------------------- */

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

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION).matches);
}

// Starts loading the GSAP chunk right away (call it once the user is signed
// in), so charts and lists can animate the first time they are shown.
export function preloadMotion() {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  loadGsap().catch(() => {});
}

/*
 * Runs `build(gsap)` inside a gsap.matchMedia context that only matches when
 * motion is allowed. Returns a cleanup function, or undefined when GSAP isn't
 * ready or motion is reduced (the element is then simply shown).
 */
function runMotion(build) {
  if (prefersReducedMotion()) return undefined;

  const gsap = gsapInstance;
  if (!gsap) {
    loadGsap().catch(() => {});
    return undefined;
  }

  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => build(gsap));
  return () => mm.revert();
}

/* -------------------------------------------------------------------------- */
/* PRESETS                                                                    */
/* -------------------------------------------------------------------------- */

// Fade-up for a set of elements. Shared by page entrance, list reveal, cards.
function fadeUp(gsap, targets, { distance = MOTION.distance.md, duration = MOTION.duration.base, stagger = MOTION.stagger } = {}) {
  return gsap.fromTo(
    targets,
    { opacity: 0, y: distance },
    {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      ease: MOTION.ease.out,
      clearProps: 'opacity,transform',
    },
  );
}

/*
 * Fade-up entrance for the children of `element` (first `maxItems` only).
 * Returns a cleanup function (or undefined when nothing was animated).
 */
export function animateEntrance(element, selector = ':scope > *', { maxItems = 8 } = {}) {
  if (!element) return undefined;

  return runMotion((gsap) => {
    const targets = Array.from(element.querySelectorAll(selector)).slice(0, maxItems);
    if (!targets.length) return undefined;
    fadeUp(gsap, targets, { distance: 8, duration: 0.28, stagger: 0.035 });
    return undefined;
  });
}

const ENTER_PRESETS = {
  // Dialog backdrop.
  overlay: (gsap, el) =>
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: MOTION.duration.base, ease: MOTION.ease.out, clearProps: 'opacity' }),

  // Dialog / sheet panel.
  dialog: (gsap, el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: MOTION.distance.md, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: MOTION.duration.base, ease: MOTION.ease.out, clearProps: 'opacity,transform' },
    ),

  // Dropdown / popover panels. `origin` follows the placement of the panel.
  popover: (gsap, el, { origin = 'top left' } = {}) =>
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.97, transformOrigin: origin },
      { opacity: 1, scale: 1, duration: MOTION.duration.fast, ease: MOTION.ease.out, clearProps: 'opacity,transform' },
    ),

  // Toasts and small floating notices.
  toast: (gsap, el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: MOTION.distance.md },
      { opacity: 1, y: 0, duration: MOTION.duration.base, ease: MOTION.ease.out, clearProps: 'opacity,transform' },
    ),

  // Side drawers (sidebar on mobile). Slides in from the left.
  drawer: (gsap, el) =>
    gsap.fromTo(
      el,
      { xPercent: -100 },
      { xPercent: 0, duration: MOTION.duration.slow, ease: MOTION.ease.soft, clearProps: 'transform' },
    ),

  // Side panel docked to the right edge (detail / edit panels).
  drawerRight: (gsap, el) =>
    gsap.fromTo(
      el,
      { xPercent: 100 },
      { xPercent: 0, duration: MOTION.duration.slow, ease: MOTION.ease.soft, clearProps: 'transform' },
    ),

  // Generic single element fade-up.
  fadeUp: (gsap, el) => fadeUp(gsap, el, { distance: MOTION.distance.sm, duration: MOTION.duration.base }),
};

/*
 * Plays an enter preset on `element`. Returns a cleanup function.
 * presets: overlay | dialog | popover | toast | drawer | drawerRight | fadeUp
 */
export function animateIn(element, preset, options) {
  const play = ENTER_PRESETS[preset];
  if (!element || !play) return undefined;
  return runMotion((gsap) => {
    play(gsap, element, options);
    return undefined;
  });
}

/*
 * Hook form of animateIn: plays when the element mounts (or when `deps`
 * change, e.g. [open]). `ref.current` may be a DOM node; for panels that are
 * mounted conditionally pass the node through state and put it in `deps`.
 *
 * Runs as a layout effect so the starting state is set before first paint.
 */
export function useEnterMotion(ref, preset, deps = [], options) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => animateIn(ref.current, preset, options), deps);
}

/*
 * Staggered reveal for a list/grid of children. Re-runs when `deps` change
 * (e.g. when data finishes loading).
 *
 * Usage: const listRef = useStaggerIn([items.length]); <div ref={listRef}>…</div>
 */
export function useStaggerIn(deps = [], { selector = ':scope > *', maxItems = MOTION.maxStaggerItems } = {}) {
  const ref = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => animateEntrance(ref.current, selector, { maxItems }), deps);
  return ref;
}

/* -------------------------------------------------------------------------- */
/* SCROLL-DRIVEN HELPERS                                                      */
/* -------------------------------------------------------------------------- */

// An element counts as "in view" a little before its bottom edge, so motion
// starts as it scrolls in, not when it is already half read. Works inside
// nested scroll containers (the app scrolls <main>, not the window).
const VIEW_MARGIN = '0px 0px -3% 0px';

// Calls `callback` once, the first time `target` enters the viewport.
function observeVisible(target, callback) {
  if (!target) return () => {};
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        io.disconnect();
        callback();
      }
    },
    { rootMargin: VIEW_MARGIN },
  );
  io.observe(target);
  return () => io.disconnect();
}

function isBelowOrOutOfView(el) {
  const rect = el.getBoundingClientRect();
  return rect.bottom <= 0 || rect.top >= window.innerHeight * 0.92;
}

const byPosition = (a, b) => {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  return ra.top - rb.top || ra.left - rb.left;
};

/* -------------------------------------------------------------------------- */
/* AUTOMATIC REVEAL (pages: members + admin)                                  */
/* -------------------------------------------------------------------------- */

// Things that appear once a page's data has loaded. Kept in one list so
// every page gets the same behaviour without per-page code.
const REVEAL_SELECTOR = [
  '.page-header',
  '.stats-grid > *',
  '.card-grid > *',
  '.card',
  '.stat-card',
  '.table-wrap',
  'tbody > tr',
  '.empty-state',
  '.comment',
  '.folder-item',
  '[data-motion="stagger"] > *',
  '[data-motion="reveal"]',
].join(',');

const REVEAL_OPT_OUT = '[data-motion="off"]';

// Loading states are never revealed (they are already moving).
const REVEAL_SKIP = '.orbit-loader, .orbit-skeleton, .animate-pulse, [aria-busy="true"]';

/*
 * Watches `root` and fades in elements that get added (a page loading, data
 * arriving, tabs switching). Elements are hidden straight away and revealed
 * as they scroll into view, in order, with a small stagger, so something
 * below the fold animates when you reach it, not before.
 * Returns a cleanup function.
 */
export function observeReveal(root) {
  if (
    !root ||
    typeof MutationObserver === 'undefined' ||
    typeof IntersectionObserver === 'undefined'
  ) {
    return undefined;
  }

  let pending = new Set();
  let frame = 0;
  let readyFrame = 0;
  let disposed = false;
  const hidden = new Set(); // waiting to scroll into view
  const ready = new Set(); // in view, about to play
  // Elements revealed (or hidden) once are never hidden again. GSAP can briefly
  // detach and re-attach an element while measuring it, which looks like a new
  // node to the MutationObserver; this keeps that from replaying the reveal.
  const seen = new WeakSet();

  const allowed = (el) =>
    !el.closest(REVEAL_OPT_OUT) && !el.matches(REVEAL_SKIP) && !el.style.transform;

  const show = (nodes) => {
    const gsap = gsapInstance;
    if (gsap && nodes.length) gsap.set(nodes, { clearProps: 'opacity,transform' });
  };

  const play = () => {
    readyFrame = 0;
    if (disposed) return;
    const gsap = gsapInstance;
    const nodes = Array.from(ready).filter((el) => el.isConnected).sort(byPosition);
    ready.clear();
    if (!nodes.length || !gsap) return;

    nodes.forEach((el, i) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: MOTION.duration.base,
        ease: MOTION.ease.out,
        delay: Math.min(i, MOTION.maxStaggerItems) * MOTION.stagger,
        clearProps: 'opacity,transform',
      });
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !hidden.has(entry.target)) return;
        io.unobserve(entry.target);
        hidden.delete(entry.target);
        ready.add(entry.target);
      });
      if (ready.size && !readyFrame) readyFrame = requestAnimationFrame(play);
    },
    { rootMargin: VIEW_MARGIN },
  );

  const flush = () => {
    frame = 0;
    if (disposed) return;

    // Forget elements that left the page.
    hidden.forEach((el) => {
      if (!el.isConnected) {
        io.unobserve(el);
        hidden.delete(el);
      }
    });

    const nodes = Array.from(pending).filter(
      (el) => el.isConnected && !seen.has(el) && allowed(el),
    );
    pending = new Set();
    if (!nodes.length || prefersReducedMotion()) return;

    const gsap = gsapInstance;
    if (!gsap) {
      // Not loaded yet: show everything now, and animate later arrivals.
      loadGsap().catch(() => {});
      return;
    }

    // Innermost matches only: a big wrapper never reveals as one block (that
    // would show everything below the fold at once), its panels/cards/rows do.
    const targets = nodes.filter(
      (el) => !nodes.some((other) => other !== el && el.contains(other)) && !hidden.has(el),
    );
    if (!targets.length) return;

    gsap.set(targets, { opacity: 0, y: MOTION.distance.sm });
    targets.forEach((el) => {
      seen.add(el);
      hidden.add(el);
      io.observe(el);
    });
  };

  // Pages are the direct child of <main>; their sections are its children.
  // This covers pages written with Tailwind only (no shared .card/.page-header).
  const isPageRoot = (el) => el.parentElement === root;
  const isPageSection = (el) => el.parentElement?.parentElement === root;

  const queue = (el) => {
    if (el.nodeType !== 1 || el.closest(REVEAL_OPT_OUT)) return;
    if (isPageRoot(el)) {
      Array.from(el.children).forEach((child) => pending.add(child));
    } else if (isPageSection(el)) {
      pending.add(el);
    }
    if (el.matches(REVEAL_SELECTOR)) pending.add(el);
    el.querySelectorAll?.(REVEAL_SELECTOR).forEach((child) => pending.add(child));
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(queue);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    disposed = true;
    observer.disconnect();
    io.disconnect();
    if (frame) cancelAnimationFrame(frame);
    if (readyFrame) cancelAnimationFrame(readyFrame);
    // Never leave anything hidden behind.
    const gsap = gsapInstance;
    if (gsap) {
      gsap.killTweensOf(Array.from(hidden));
      show(Array.from(hidden));
    }
    hidden.clear();
    ready.clear();
  };
}

/* -------------------------------------------------------------------------- */
/* INTERACTION (press + hover feedback)                                       */
/* -------------------------------------------------------------------------- */

const PRESS_SELECTOR = '.btn, .tab-btn';
const LIFT_SELECTOR = '.card-grid > .card, .stats-grid > .stat-card';

/*
 * Delegated press feedback on buttons and a small lift on interactive cards.
 * One set of listeners on `root` covers every current and future element.
 * Returns a cleanup function.
 */
export function attachInteractions(root) {
  if (!root || prefersReducedMotion()) return undefined;

  const target = (event, selector) => {
    const el = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!el || el.closest(REVEAL_OPT_OUT) || el.disabled) return null;
    return el;
  };

  const to = (el, vars) => {
    const gsap = gsapInstance;
    if (!gsap) return;
    gsap.to(el, { ...vars, overwrite: 'auto' });
  };

  const onDown = (e) => {
    const el = target(e, PRESS_SELECTOR);
    if (el) to(el, { scale: 0.97, duration: 0.12, ease: MOTION.ease.out });
  };
  const onUp = (e) => {
    const el = target(e, PRESS_SELECTOR);
    if (el) to(el, { scale: 1, duration: MOTION.duration.fast, ease: MOTION.ease.out, clearProps: 'transform' });
  };
  const onOver = (e) => {
    const el = target(e, LIFT_SELECTOR);
    if (el && !el.contains(e.relatedTarget)) to(el, { y: -2, duration: MOTION.duration.fast, ease: MOTION.ease.out });
  };
  const onOut = (e) => {
    const el = target(e, LIFT_SELECTOR);
    if (el && !el.contains(e.relatedTarget)) to(el, { y: 0, duration: MOTION.duration.fast, ease: MOTION.ease.out, clearProps: 'transform' });
  };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('pointerleave', onUp, true);
  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);

  return () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    root.removeEventListener('pointerleave', onUp, true);
    root.removeEventListener('mouseover', onOver);
    root.removeEventListener('mouseout', onOut);
  };
}

/* -------------------------------------------------------------------------- */
/* CHARTS (bars, wipes, arcs, lines, heatmap cells)                           */
/* -------------------------------------------------------------------------- */

/*
 * Mark a chart element in the markup and Layout animates it when it scrolls
 * into view (no per-page code):
 *
 *   data-bar="x"     horizontal bar scaled with transform, grows from the left
 *                    (any element with an inline scaleX(...) counts as "x")
 *   data-bar="y"     vertical column, grows from the bottom
 *   data-bar="wipe"  segmented bar, revealed left to right
 *   data-bar="arc"   donut arc <circle> with a stroke-dasharray, draws round
 *   data-bar="draw"  line <path pathLength="1"> with stroke-dasharray 1
 *   data-bar="fade"  area / fill that fades in
 *   data-bar="cell"  small grid cells (heatmap), popped in as one ripple
 *
 * Every element keeps the exact inline styles React gave it: the tween only
 * plays between 0 and that value and then hands the element back, so later
 * value changes still use the element's own CSS transition.
 */
const BAR_SELECTOR = '[data-bar], [style*="scaleX("]';
const BAR_DURATION = 0.85;
const BAR_EASE = 'power3.out';
const BAR_STAGGER = 0.07;
const BAR_MAX_STAGGER_ITEMS = 14;

// Builds the "hidden" state for one element and returns how to play and
// restore it. `gsap` is already loaded here.
function prepareBar(gsap, el, kind) {
  if (kind === 'x' || kind === 'y') {
    const prop = kind === 'y' ? 'scaleY' : 'scaleX';
    const savedTransform = el.style.transform;
    const savedTransition = el.style.transition;
    // The value React set (inline scaleX(0.4)), else whatever GSAP reads (1).
    const inline = /scale[XY]\(\s*([-\d.eE]+)\s*\)/.exec(el.style.transform);
    const final = inline ? Number(inline[1]) : Number(gsap.getProperty(el, prop));
    const target = Number.isFinite(final) ? final : 1;

    // A CSS transition (kept for later value changes) would fight GSAP here.
    el.style.transition = 'none';
    gsap.set(el, {
      [prop]: 0,
      transformOrigin: kind === 'y' ? 'center bottom' : 'left center',
    });

    return {
      play: (delay) =>
        gsap.to(el, { [prop]: target, duration: BAR_DURATION, ease: BAR_EASE, delay, onComplete: () => restore() }),
      restore,
    };

    // Hands the element back exactly as React rendered it. The transform is
    // written straight over GSAP's (never cleared first: clearing for a moment
    // shows a full-width bar, which the CSS transition then animates back).
    function restore() {
      gsap.killTweensOf(el);
      el.style.transform = savedTransform;
      el.style.removeProperty('translate');
      el.style.removeProperty('rotate');
      el.style.removeProperty('scale');
      el.style.removeProperty('transform-origin');
      void el.offsetWidth; // commit this state while the transition is still off
      el.style.transition = savedTransition;
    }
  }

  if (kind === 'wipe') {
    gsap.set(el, { clipPath: 'inset(0% 100% 0% 0% round 999px)' });
    const restore = () => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'clipPath' });
    };
    return {
      play: (delay) =>
        gsap.to(el, {
          clipPath: 'inset(0% 0% 0% 0% round 999px)',
          duration: BAR_DURATION,
          ease: BAR_EASE,
          delay,
          onComplete: restore,
        }),
      restore,
    };
  }

  if (kind === 'arc') {
    const finalDash = el.getAttribute('stroke-dasharray') || '';
    const [dash, gap] = finalDash.split(/[\s,]+/).map(Number);
    if (!Number.isFinite(dash) || !Number.isFinite(gap)) return null;

    el.setAttribute('stroke-dasharray', `0 ${dash + gap}`);
    const restore = () => {
      gsap.killTweensOf(el);
      el.setAttribute('stroke-dasharray', finalDash);
    };
    return {
      play: (delay) =>
        gsap.to(el, {
          attr: { 'stroke-dasharray': finalDash },
          duration: 1.1,
          ease: BAR_EASE,
          delay,
          onComplete: restore,
        }),
      restore,
    };
  }

  if (kind === 'draw') {
    gsap.set(el, { strokeDashoffset: 1 });
    const restore = () => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'strokeDashoffset' });
    };
    return {
      play: (delay) =>
        gsap.to(el, { strokeDashoffset: 0, duration: 1.1, ease: BAR_EASE, delay, onComplete: restore }),
      restore,
    };
  }

  if (kind === 'fade') {
    gsap.set(el, { opacity: 0 });
    const restore = () => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'opacity' });
    };
    return {
      play: (delay) =>
        gsap.to(el, { opacity: 1, duration: 0.9, ease: MOTION.ease.out, delay: delay + 0.2, onComplete: restore }),
      restore,
    };
  }

  if (kind === 'cell') {
    gsap.set(el, { opacity: 0, scale: 0.4 });
    return {
      cell: true,
      restore: () => {
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: 'opacity,transform' });
      },
    };
  }

  return null;
}

/*
 * Finds chart elements added to `root` and animates each group when its
 * container scrolls into view. Returns a cleanup function.
 */
export function observeBars(root) {
  if (
    !root ||
    typeof MutationObserver === 'undefined' ||
    typeof IntersectionObserver === 'undefined'
  ) {
    return undefined;
  }

  let pending = new Set();
  let frame = 0;
  let disposed = false;
  const claimed = new WeakSet();
  const groups = new Map(); // trigger element -> [{ el, bar }]

  const triggerFor = (el, kind) => {
    if (kind === 'wipe') return el;
    if (kind === 'arc' || kind === 'draw' || kind === 'fade') return el.closest('svg') || el;
    return el.parentElement || el;
  };

  const playGroup = (trigger) => {
    const items = groups.get(trigger);
    groups.delete(trigger);
    io.unobserve(trigger);
    const gsap = gsapInstance;
    if (!items || !gsap || disposed) return;

    const live = items.filter((item) => item.el.isConnected);
    live.filter((item) => item.bar.play).forEach((item, i) => {
      item.bar.play(Math.min(i, BAR_MAX_STAGGER_ITEMS) * BAR_STAGGER);
    });

    const cells = live.filter((item) => item.bar.cell).map((item) => item.el);
    if (cells.length) {
      gsap.to(cells, {
        opacity: 1,
        scale: 1,
        duration: 0.35,
        ease: MOTION.ease.out,
        stagger: { amount: 0.7, from: 'start' },
        clearProps: 'opacity,transform',
      });
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && groups.has(entry.target)) playGroup(entry.target);
      });
    },
    { rootMargin: VIEW_MARGIN },
  );

  const flush = () => {
    frame = 0;
    if (disposed) return;

    // Forget groups that left the page.
    groups.forEach((items, trigger) => {
      if (!trigger.isConnected) {
        io.unobserve(trigger);
        groups.delete(trigger);
      }
    });

    const nodes = Array.from(pending).filter(
      (el) => el.isConnected && !claimed.has(el) && !el.closest(REVEAL_OPT_OUT),
    );
    pending = new Set();
    if (!nodes.length || prefersReducedMotion()) return;

    const gsap = gsapInstance;
    if (!gsap) {
      // GSAP is still loading: bars that are on screen stay as they are; the
      // rest are picked up again once it is ready.
      loadGsap()
        .then(() => {
          nodes.filter(isBelowOrOutOfView).forEach((el) => pending.add(el));
          if (pending.size && !frame && !disposed) frame = requestAnimationFrame(flush);
        })
        .catch(() => {});
      return;
    }

    nodes.sort(byPosition).forEach((el) => {
      const kind = el.dataset.bar || 'x';
      const bar = prepareBar(gsap, el, kind);
      if (!bar) return;

      claimed.add(el);
      const trigger = triggerFor(el, kind);
      if (!groups.has(trigger)) {
        groups.set(trigger, []);
        io.observe(trigger);
      }
      groups.get(trigger).push({ el, bar });
    });
  };

  const queue = (el) => {
    if (el.nodeType !== 1) return;
    if (el.matches(BAR_SELECTOR)) pending.add(el);
    el.querySelectorAll?.(BAR_SELECTOR).forEach((child) => pending.add(child));
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(queue);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    disposed = true;
    observer.disconnect();
    io.disconnect();
    if (frame) cancelAnimationFrame(frame);
    // Never leave a chart half hidden.
    groups.forEach((items) => items.forEach((item) => item.bar.restore()));
    groups.clear();
  };
}

/* -------------------------------------------------------------------------- */
/* NUMBERS                                                                    */
/* -------------------------------------------------------------------------- */

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

    // Counts when the number is actually on screen, not while it is below the fold.
    const tween = gsap.to(counter, {
      n: target,
      duration,
      ease: MOTION.ease.out,
      paused: true,
      onUpdate: () => {
        node.nodeValue = String(Math.round(counter.n));
      },
      onComplete: () => {
        node.nodeValue = finalText;
      },
    });
    const stopWatching = observeVisible(ref.current, () => tween.play());

    // On a value change the next run sets the text again, so only stop here.
    return () => {
      stopWatching();
      tween.kill();
      node.nodeValue = finalText;
    };
  }, [value, duration]);

  return ref;
}
