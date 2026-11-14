/** True when the user asked the OS to minimise motion (WCAG 2.3.3). Skip GSAP animations in that case. */
export const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
