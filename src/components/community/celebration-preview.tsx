'use client'

import { useEffect, useRef, useState } from 'react'

function Fireworks() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const surface = canvas.current
    const context = surface?.getContext('2d')
    if (!surface || !context) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches) return
    let frame = 0, stopped = false
    let width = window.innerWidth, height = window.innerHeight
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      surface.width = width * scale; surface.height = height * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    resize()
    const colors = ['#ffcb05', '#fff1a6', '#ffffff', '#66b5ff', '#a4dbff']
    const bursts = [0.15, 0.82, 0.35, 0.68, 0.5].map((x, index) => ({ x, y: 0.2 + (index % 3) * 0.14, delay: index * 620,
      sparks: Array.from({ length: 48 }, (_, i) => ({ angle: i * Math.PI * 2 / 48, speed: 65 + Math.random() * 120, color: colors[i % colors.length] })) }))
    const start = performance.now()
    const draw = (now: number) => {
      if (stopped) return
      context.clearRect(0, 0, width, height)
      for (const burst of bursts) {
        const elapsed = now - start - burst.delay
        if (elapsed < 0 || elapsed > 2600) continue
        const x = burst.x * width, y = burst.y * height
        if (elapsed < 600) {
          const progress = elapsed / 600
          const rocketY = height - (height - y) * (1 - Math.pow(1 - progress, 2))
          const trail = context.createLinearGradient(x, rocketY, x, rocketY + 65)
          trail.addColorStop(0, '#ffdf70'); trail.addColorStop(1, 'transparent')
          context.fillStyle = trail; context.fillRect(x - 1.5, rocketY, 3, 65)
        } else {
          const age = (elapsed - 600) / 1000
          context.globalAlpha = Math.max(0, 1 - age / 2)
          for (const spark of burst.sparks) {
            const distance = spark.speed * (1 - Math.exp(-age * 1.5))
            context.fillStyle = spark.color
            context.beginPath(); context.arc(x + Math.cos(spark.angle) * distance, y + Math.sin(spark.angle) * distance + age * age * 28, 2.4, 0, Math.PI * 2); context.fill()
          }
          context.globalAlpha = 1
        }
      }
      if (now - start < 5300) frame = requestAnimationFrame(draw)
    }
    const stop = () => { if (preference.matches || document.hidden) { stopped = true; cancelAnimationFrame(frame); context.clearRect(0, 0, width, height) } }
    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize); preference.addEventListener('change', stop); document.addEventListener('visibilitychange', stop)
    return () => { stopped = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); preference.removeEventListener('change', stop); document.removeEventListener('visibilitychange', stop) }
  }, [])
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full"/>
}

export function Celebration({ firstName, onClose }: { firstName: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', escape) }
  }, [onClose])
  return <div className="pointer-events-none fixed inset-0 z-[10000] bg-[#00274c]/80">
      <Fireworks/>
      <div className="absolute inset-x-5 top-[42%] text-center text-white">
        <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#ffdf70]">Praise God!</p>
        <p role="status" className="mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">{firstName} received Christ!</p>
        <p className="mt-4 text-sm text-white/80">A new life in Christ. Let’s rejoice together.</p>
        <button type="button" onClick={onClose} className="pointer-events-auto mt-7 min-h-11 rounded-full border border-white/40 bg-[#00274c] px-6 py-2 text-sm font-bold">Dismiss</button>
      </div>
    </div>
}

export function CelebrationPreview() {
  const [show, setShow] = useState(false)
  return <>
    <button type="button" onClick={() => setShow(true)} className="min-h-11 rounded-xl bg-[#ffcb05] px-5 py-3 font-extrabold text-[#00274c]">Preview celebration</button>
    {show && <Celebration firstName="Alex" onClose={() => setShow(false)}/>}
  </>
}
