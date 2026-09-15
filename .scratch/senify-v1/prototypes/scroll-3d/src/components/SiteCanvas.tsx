/**
 * PROTOTYPE Site-Canvas (Ticket 20).
 * Ein persistenter WebGL-Canvas für die ganze Seite; Kamera/Objekt lesen
 * den window-gebundenen Store in useFrame (pull, keine Events).
 * Client-only gerendert (client:only="react") — WebGL braucht den Browser.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { getScrollStore } from '../lib/scroll-store'

/* ---------- Kamera-Wegpunkte (scroll-getrieben) ---------- */

const WAYPOINTS = [
  { p: 0.0, pos: new THREE.Vector3(0, 0.35, 8.2), look: new THREE.Vector3(0, 0, 0) },
  { p: 0.3, pos: new THREE.Vector3(0, 0.55, 6.4), look: new THREE.Vector3(0, 0.2, 0) },
  { p: 0.52, pos: new THREE.Vector3(2.8, 0.3, 4.8), look: new THREE.Vector3(0, -0.1, 0) },
  { p: 0.78, pos: new THREE.Vector3(-0.6, 1.4, 9.4), look: new THREE.Vector3(0, 0.1, 0) },
  { p: 1.0, pos: new THREE.Vector3(0, 0.2, 11.0), look: new THREE.Vector3(0, 0.3, 0) },
]

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function sampleWaypoints(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i]
    const b = WAYPOINTS[i + 1]
    if (p >= a.p && p <= b.p) {
      const t = smoothstep((p - a.p) / (b.p - a.p))
      outPos.copy(a.pos).lerp(b.pos, t)
      outLook.copy(a.look).lerp(b.look, t)
      return
    }
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1]
  outPos.copy(last.pos)
  outLook.copy(last.look)
}

/* ---------- Maus-Parallaxe (window-Listener, da Canvas pointer-events:none) ---------- */

function useMouse() {
  const mouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return mouse
}

/* ---------- Kamera-Rig: liest den Store jeden Frame, dämpft ---------- */

function CameraRig() {
  const { camera } = useThree()
  const mouse = useMouse()
  const target = useRef(new THREE.Vector3(0, 0.35, 8.2))
  const look = useRef(new THREE.Vector3(0, 0, 0))
  const curLook = useRef(new THREE.Vector3(0, 0, 0))

  useFrame((_, dt) => {
    const s = getScrollStore()
    const t = s.reduced ? 0.42 : s.progress
    sampleWaypoints(t, target.current, look.current)

    // Pin-Phase: zusätzliche seitliche Fahrt (startet/endet bei 0 → glatt)
    const pin = s.reduced ? 0 : s.pinProgress
    const pinArc = Math.sin(pin * Math.PI)
    target.current.x += pinArc * 1.6
    target.current.z -= pinArc * 0.9

    // Maus-Parallaxe
    target.current.x += mouse.current.x * 0.35
    target.current.y += mouse.current.y * 0.2

    // Frame-rate-unabhängiges Damping
    const k = 1 - Math.exp(-dt * 3.2)
    camera.position.lerp(target.current, k)
    curLook.current.lerp(look.current, k)
    camera.lookAt(curLook.current)
  })

  return null
}

/* ---------- Szene ---------- */

function Orb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mat = useRef<any>(null)
  const wire = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    const s = getScrollStore()
    if (mat.current) {
      mat.current.distort = THREE.MathUtils.damp(mat.current.distort, 0.22 + s.pinProgress * 0.6, 4, dt)
      mat.current.speed = 1.4 + s.pinProgress * 1.6
    }
    if (wire.current) {
      wire.current.rotation.y += dt * 0.12
      wire.current.rotation.x = s.progress * 1.4
    }
  })

  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.35, 64, 64]} />
        <MeshDistortMaterial ref={mat} color="#6f7bff" roughness={0.15} metalness={0.35} distort={0.22} speed={1.4} />
      </mesh>
      <mesh ref={wire}>
        <icosahedronGeometry args={[1.95, 1]} />
        <meshBasicMaterial color="#9aa4ff" wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

const PARTICLE_POSITIONS = (() => {
  const count = 900
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3 + 0] = (Math.random() - 0.5) * 22
    arr[i * 3 + 1] = (Math.random() - 0.5) * 12
    arr[i * 3 + 2] = -12 + Math.random() * 14
  }
  return arr
})()

function Particles() {
  const ref = useRef<THREE.Points>(null)
  useFrame(() => {
    const s = getScrollStore()
    if (ref.current) {
      ref.current.rotation.y = s.progress * Math.PI * 0.6
      ref.current.rotation.x = s.pinProgress * 0.4
    }
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[PARTICLE_POSITIONS, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#8b93ff" transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  )
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#07080c']} />
      <fog attach="fog" args={['#07080c', 9, 20]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 6]} intensity={1.1} />
      <pointLight position={[-6, -3, 4]} intensity={14} color="#4455ff" distance={30} />
      <pointLight position={[6, 4, -6]} intensity={10} color="#ff5a8a" distance={30} />
      <CameraRig />
      <Particles />
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.6}>
        <Orb />
      </Float>
    </>
  )
}

/* ---------- HUD (Prototype-Regel: Zustand sichtbar machen) ---------- */

function Hud() {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    let fps = 0
    const loop = () => {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        fps = Math.round((frames * 1000) / (now - last))
        frames = 0
        last = now
      }
      const s = getScrollStore()
      if (ref.current) {
        ref.current.textContent =
          `progress  ${s.progress.toFixed(3)}\n` +
          `pin       ${s.pinProgress.toFixed(3)}\n` +
          `section   ${s.activeSection}\n` +
          `velocity  ${s.velocity.toFixed(2)}\n` +
          `reduced   ${s.reduced}\n` +
          `fps       ${fps}`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <pre className="hud" ref={ref} />
}

/* ---------- Export ---------- */

export default function SiteCanvas() {
  return (
    <div className="canvas-wrap" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 42, near: 0.1, far: 60, position: [0, 0.35, 8.2] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene />
      </Canvas>
      <Hud />
    </div>
  )
}
