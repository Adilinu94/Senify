/**
 * PROTOTYPE Page-Script-Layer (Ticket 20).
 * Kanonisches Muster: EIN rAF-Loop — gsap.ticker treibt Lenis,
 * Lenis-On-Scroll treibt ScrollTrigger + den Store.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { getScrollStore } from '../lib/scroll-store'

gsap.registerPlugin(ScrollTrigger)

export function initPageMotion(): () => void {
  const store = getScrollStore()
  store.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Sektionen tracken (harmlos auch bei reduced motion)
  const sections = gsap.utils.toArray<HTMLElement>('[data-section]')
  sections.forEach((el, i) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top center',
      end: 'bottom center',
      onToggle: (self) => {
        if (self.isActive) store.activeSection = i
      },
    })
  })

  if (store.reduced) {
    // Statische Pose, kein Smooth-Scroll, keine Reveals, kein Pin
    store.progress = 0.42
    return () => {}
  }

  // Gepinnte Showcase-Sektion → Fortschritt in den Store
  const pinEl = document.querySelector<HTMLElement>('#pin')
  if (pinEl) {
    ScrollTrigger.create({
      trigger: pinEl,
      start: 'top top',
      end: '+=160%',
      pin: true,
      onUpdate: (self) => {
        store.pinProgress = self.progress
      },
    })
  }

  // Reveals (scroll-getriggert) — prüft, dass ScrollTrigger mit Lenis feuert
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.fromTo(
      el,
      { y: 42, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%' },
      },
    )
  })

  // Lenis + GSAP: EIN Loop (das kanonische Muster)
  const lenis = new Lenis({ autoRaf: false })
  lenis.on('scroll', ScrollTrigger.update)

  const raf = (time: number) => {
    lenis.raf(time * 1000)
    store.progress = lenis.progress
    store.velocity = lenis.velocity
    store.direction = lenis.direction >= 0 ? 1 : -1
  }
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(raf)
    lenis.destroy()
    ScrollTrigger.getAll().forEach((t) => t.kill())
  }
}
