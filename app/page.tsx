'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  vx: number
  vy: number
  size: number
  hue: number
  life: number
  maxLife: number
}

interface Nebula {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  hue: number
  strength: number
  type: 'attract' | 'repel' | 'vortex'
}

const GRID_SIZE = 20
const RETURN_SPEED = 0.03
const FRICTION = 0.92

export default function NebulaPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const nebulaeRef = useRef<Nebula[]>([])
  const mouseRef = useRef({ x: 0, y: 0, active: false, down: false })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const trailsRef = useRef<Array<{ x: number; y: number; hue: number; alpha: number }>>([])
  
  const [mode, setMode] = useState<'repel' | 'attract' | 'vortex' | 'paint' | 'spawn'>('vortex')
  const [forceRadius, setForceRadius] = useState(200)
  const [forceStrength, setForceStrength] = useState(10)
  const [showTrails, setShowTrails] = useState(true)
  const [autoNebulae, setAutoNebulae] = useState(true)
  const [colorSpeed, setColorSpeed] = useState(0.5)

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = []
    const cols = Math.floor(width / GRID_SIZE)
    const rows = Math.floor(height / GRID_SIZE)
    const offsetX = (width - (cols - 1) * GRID_SIZE) / 2
    const offsetY = (height - (rows - 1) * GRID_SIZE) / 2

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = offsetX + x * GRID_SIZE
        const py = offsetY + y * GRID_SIZE
        const hue = ((x * 3 + y * 5) * 2) % 360

        particles.push({
          x: px,
          y: py,
          baseX: px,
          baseY: py,
          vx: 0,
          vy: 0,
          size: 2.5,
          hue,
          life: 1,
          maxLife: 1
        })
      }
    }
    return particles
  }, [])

  const spawnNebula = useCallback((width: number, height: number) => {
    const types: Array<'attract' | 'repel' | 'vortex'> = ['attract', 'repel', 'vortex']
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: 100 + Math.random() * 150,
      hue: Math.random() * 360,
      strength: 3 + Math.random() * 5,
      type: types[Math.floor(Math.random() * types.length)]
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      particlesRef.current = initParticles(width, height)
      
      // Initialize autonomous nebulae
      nebulaeRef.current = []
      for (let i = 0; i < 3; i++) {
        nebulaeRef.current.push(spawnNebula(width, height))
      }
    }

    const applyForce = (
      p: Particle,
      fx: number,
      fy: number,
      radius: number,
      strength: number,
      type: 'repel' | 'attract' | 'vortex' | 'paint' | 'spawn'
    ) => {
      const dx = p.x - fx
      const dy = p.y - fy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius && dist > 0) {
        const force = ((radius - dist) / radius) * strength
        const nx = dx / dist
        const ny = dy / dist

        switch (type) {
          case 'repel':
            p.vx += nx * force
            p.vy += ny * force
            break
          case 'attract':
            p.vx -= nx * force * 0.6
            p.vy -= ny * force * 0.6
            break
          case 'vortex':
            p.vx += (-ny * force + nx * force * 0.2)
            p.vy += (nx * force + ny * force * 0.2)
            break
          case 'paint':
            // Shift hue based on interaction
            p.hue = (p.hue + force * 5) % 360
            p.vx += nx * force * 0.5
            p.vy += ny * force * 0.5
            break
        }
      }
    }

    const updateNebulae = () => {
      if (!autoNebulae) return

      const nebulae = nebulaeRef.current

      for (const n of nebulae) {
        // Gentle wandering
        n.vx += (Math.random() - 0.5) * 0.1
        n.vy += (Math.random() - 0.5) * 0.1
        n.vx *= 0.98
        n.vy *= 0.98
        n.x += n.vx
        n.y += n.vy

        // Wrap around edges
        if (n.x < -n.radius) n.x = width + n.radius
        if (n.x > width + n.radius) n.x = -n.radius
        if (n.y < -n.radius) n.y = height + n.radius
        if (n.y > height + n.radius) n.y = -n.radius

        // Slowly evolve hue
        n.hue = (n.hue + 0.1) % 360
      }

      // Occasionally spawn new nebula
      if (Math.random() < 0.002 && nebulae.length < 5) {
        nebulae.push(spawnNebula(width, height))
      }

      // Remove old nebulae
      if (nebulae.length > 5) {
        nebulae.shift()
      }
    }

    const updateParticles = () => {
      const particles = particlesRef.current
      const mouse = mouseRef.current
      const nebulae = nebulaeRef.current
      timeRef.current += 0.016 * colorSpeed

      for (const p of particles) {
        // Apply mouse force
        if (mouse.active) {
          applyForce(p, mouse.x, mouse.y, forceRadius, forceStrength, mode)
        }

        // Apply nebulae forces
        for (const n of nebulae) {
          applyForce(p, n.x, n.y, n.radius, n.strength, n.type)
        }

        // Natural color evolution
        p.hue = (p.hue + 0.1 * colorSpeed) % 360

        // Return to base position
        const returnX = p.baseX - p.x
        const returnY = p.baseY - p.y
        p.vx += returnX * RETURN_SPEED
        p.vy += returnY * RETURN_SPEED

        // Apply friction
        p.vx *= FRICTION
        p.vy *= FRICTION

        // Update position
        p.x += p.vx
        p.y += p.vy
      }

      // Update trails
      if (showTrails && mouse.active) {
        trailsRef.current.push({
          x: mouse.x,
          y: mouse.y,
          hue: (timeRef.current * 100) % 360,
          alpha: 1
        })
      }

      // Fade trails
      trailsRef.current = trailsRef.current
        .map(t => ({ ...t, alpha: t.alpha - 0.02 }))
        .filter(t => t.alpha > 0)
    }

    const draw = () => {
      // Subtle fade for trail effect
      ctx.fillStyle = 'rgba(5, 5, 15, 0.15)'
      ctx.fillRect(0, 0, width, height)

      const particles = particlesRef.current
      const mouse = mouseRef.current
      const nebulae = nebulaeRef.current
      const time = timeRef.current

      // Draw trails
      if (showTrails) {
        for (const t of trailsRef.current) {
          const gradient = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 30)
          gradient.addColorStop(0, `hsla(${t.hue}, 100%, 70%, ${t.alpha * 0.5})`)
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(t.x, t.y, 30, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw nebulae
      for (const n of nebulae) {
        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius)
        const alpha = 0.15
        gradient.addColorStop(0, `hsla(${n.hue}, 80%, 60%, ${alpha})`)
        gradient.addColorStop(0.5, `hsla(${n.hue + 30}, 70%, 50%, ${alpha * 0.5})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw connections
      ctx.lineWidth = 1
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const displaced = Math.sqrt(
          Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2)
        )

        for (let j = i + 1; j < particles.length; j++) {
          const other = particles[j]
          const dx = other.x - p.x
          const dy = other.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < GRID_SIZE * 2.5) {
            const alpha = (1 - dist / (GRID_SIZE * 2.5)) * 0.4
            const avgHue = (p.hue + other.hue) / 2
            const intensity = Math.min(1, displaced / 40)

            ctx.strokeStyle = `hsla(${avgHue}, 70%, ${50 + intensity * 20}%, ${alpha + intensity * 0.3})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(other.x, other.y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const displaced = Math.sqrt(
          Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2)
        )
        const intensity = Math.min(1, displaced / 60)
        const size = p.size + intensity * 4
        const saturation = 70 + intensity * 30
        const lightness = 50 + intensity * 30

        // Outer glow
        const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4)
        glowGradient.addColorStop(0, `hsla(${p.hue}, ${saturation}%, ${lightness}%, ${0.3 + intensity * 0.4})`)
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.fillStyle = `hsla(${p.hue}, ${saturation}%, ${lightness}%, ${0.8 + intensity * 0.2})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()

        // Bright center
        ctx.fillStyle = `hsla(${p.hue}, 50%, 90%, ${intensity * 0.5})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw cursor effect
      if (mouse.active) {
        const cursorHue = (time * 100) % 360
        
        // Outer ring
        ctx.strokeStyle = `hsla(${cursorHue}, 70%, 60%, 0.5)`
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, forceRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        // Animated rings
        for (let i = 0; i < 3; i++) {
          const phase = (time * 2 + i / 3) % 1
          const radius = forceRadius * phase
          const alpha = (1 - phase) * 0.4

          ctx.strokeStyle = `hsla(${cursorHue + i * 30}, 80%, 60%, ${alpha})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Center glow
        const centerGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 40)
        centerGradient.addColorStop(0, `hsla(${cursorHue}, 100%, 70%, 0.6)`)
        centerGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = centerGradient
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 40, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const animate = () => {
      updateNebulae()
      updateParticles()
      draw()
      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      mouseRef.current.active = true
    }

    const handleMouseLeave = () => {
      mouseRef.current.active = false
    }

    const handleMouseDown = () => {
      mouseRef.current.down = true
    }

    const handleMouseUp = () => {
      mouseRef.current.down = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      mouseRef.current.x = touch.clientX
      mouseRef.current.y = touch.clientY
      mouseRef.current.active = true
    }

    const handleTouchEnd = () => {
      mouseRef.current.active = false
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [forceRadius, forceStrength, mode, showTrails, autoNebulae, colorSpeed, initParticles, spawnNebula])

  return (
    <div className="w-full h-screen bg-[#05050f] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {/* Controls */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center gap-4 z-10">
        <div className="bg-black/50 backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-white/70 text-sm font-medium">Mode:</span>
          {(['repel', 'attract', 'vortex', 'paint'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${
                mode === m
                  ? m === 'repel'
                    ? 'bg-red-500/80 text-white shadow-lg shadow-red-500/30'
                    : m === 'attract'
                    ? 'bg-green-500/80 text-white shadow-lg shadow-green-500/30'
                    : m === 'vortex'
                    ? 'bg-cyan-500/80 text-white shadow-lg shadow-cyan-500/30'
                    : 'bg-purple-500/80 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="bg-black/50 backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-white/70 text-sm">Radius:</label>
            <input
              type="range"
              min="50"
              max="400"
              value={forceRadius}
              onChange={(e) => setForceRadius(Number(e.target.value))}
              className="w-20 accent-violet-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-white/70 text-sm">Force:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={forceStrength}
              onChange={(e) => setForceStrength(Number(e.target.value))}
              className="w-20 accent-violet-500"
            />
          </div>
        </div>

        <div className="bg-black/50 backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrails}
              onChange={(e) => setShowTrails(e.target.checked)}
              className="w-4 h-4 accent-violet-500"
            />
            <span className="text-white/70 text-sm">Trails</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoNebulae}
              onChange={(e) => setAutoNebulae(e.target.checked)}
              className="w-4 h-4 accent-violet-500"
            />
            <span className="text-white/70 text-sm">Auto Nebulae</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="text-white/70 text-sm">Color:</label>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={colorSpeed}
              onChange={(e) => setColorSpeed(Number(e.target.value))}
              className="w-16 accent-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="absolute bottom-6 left-6 z-10">
        <h1 className="text-4xl font-bold text-white/90 tracking-tight">
          Nebula<span className="text-violet-400">Playground</span>
        </h1>
        <p className="text-white/50 text-sm mt-1">Move your cursor to interact with the cosmic field</p>
      </div>
    </div>
  )
}
