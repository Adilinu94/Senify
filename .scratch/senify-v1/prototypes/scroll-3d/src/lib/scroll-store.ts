/**
 * PROTOTYPE scroll-store (Ticket 20).
 * Window-gebundener Singleton: überbrückt Page-Script und React-Island,
 * auch wenn Astro beide getrennt bündelt (kein Modul-Identitätsproblem).
 */

export type ScrollState = {
  /** Gesamtfortschritt der Seite 0..1 (aus Lenis) */
  progress: number
  /** Geschwindigkeit (Lenis velocity) */
  velocity: number
  /** Scrollrichtung */
  direction: 1 | -1
  /** Index der aktiven Sektion (ScrollTrigger onToggle) */
  activeSection: number
  /** Fortschritt der gepinnten Showcase-Sektion 0..1 */
  pinProgress: number
  /** prefers-reduced-motion */
  reduced: boolean
}

const KEY = '__SENIFY_PROTO_SCROLL__'

export function getScrollStore(): ScrollState {
  const w = window as unknown as Record<string, unknown>
  if (!w[KEY]) {
    const initial: ScrollState = {
      progress: 0,
      velocity: 0,
      direction: 1,
      activeSection: 0,
      pinProgress: 0,
      reduced: false,
    }
    w[KEY] = initial
  }
  return w[KEY] as ScrollState
}
