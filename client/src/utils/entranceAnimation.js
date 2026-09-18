import { gsap } from 'gsap';

export function animateEntrance(element, selector = ':scope > *') {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
  const targets = element.querySelectorAll(selector);
  if (!targets.length) return undefined;
  const context = gsap.context(() => {
    gsap.fromTo(targets, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, stagger: 0.035, ease: 'power2.out', clearProps: 'transform' });
  }, element);
  return () => context.revert();
}
