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
  layer: number // 0 = background, 1 = mid, 2 = foreground
  shape: 'circle' | 'diamond' | 'star'
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
  pulsePhase: number
}

interface GravityWell {
  x: number
  y: number
  radius: number
  strength: number
  hue: number
  life: number
  maxLife: number
}

interface Trail {
  x: number
  y: number
  hue: number
  alpha: number
  size: number
}

interface Explosion {
  x: number
  y: number
  radius: number
  maxRadius: number
  hue: number
  alpha: number
}

const GRID_SIZE = 18
const RETURN_SPEED = 0.025
const FRICTION = 0.93

export default function NebulaPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const nebulaeRef = useRef<Nebula[]>([])
  const gravityWellsRef = useRef<GravityWell[]>([])
  const mouseRef = useRef({ x: 0, y: 0, active: false, down: false, prevX: 0, prevY: 0 })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const trailsRef = useRef<Trail[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const shakeRef = useRef({ x: 0, y: 0, intensity: 0 })
  
  const [mode, setMode] = useState<'repel' | 'attract' | 'vortex' | 'paint' | 'gravity'>('vortex')
  const [forceRadius, setForceRadius] = useState(180)
  const [forceStrength, setForceStrength] = useState(12)
  const [showTrails, setShowTrails] = useState(true)
  const [autoNebulae, setAutoNebulae] = useState(true)
  const [colorSpeed, setColorSpeed] = useState(0.5)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [showUI, setShowUI] = useState(true)

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = []
    const shapes: Array<'circle' | 'diamond' | 'star'> = ['circle', 'circle', 'circle', 'diamond', 'star']
    
    // Create multiple layers
    for (let layer = 0; layer < 3; layer++) {
      const layerGridSize = GRID_SIZE * (1 + layer * 0.5) // Larger grid for background
      const cols = Math.floor(width / layerGridSize)
      const rows = Math.floor(height / layerGridSize)
      const offsetX = (width - (cols - 1) * layerGridSize) / 2
      const offsetY = (height - (rows - 1) * layerGridSize) / 2

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offsetX + x * layerGridSize
          const py = offsetY + y * layerGridSize
          const hue = ((x * 4 + y * 6 + layer * 40) * 2) % 360

          particles.push({
            x: px,
            y: py,
            baseX: px,
            baseY: py,
            vx: 0,
            vy: 0,
            size: 2 + (2 - layer) * 1.5, // Foreground particles are bigger
            hue,
            layer,
            shape: shapes[Math.floor(Math.random() * shapes.length)]
          })
        }
      }
    }
    return particles
  }, [])

  const spawnNebula = useCallback((width: number, height: number) => {
    const types: Array<'attract' | 'repel' | 'vortex'> = ['attract', 'repel', 'vortex']
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      radius: 120 + Math.random() * 180,
      hue: Math.random() * 360,
      strength: 4 + Math.random() * 6,
      type: types[Math.floor(Math.random() * types.length)],
      pulsePhase: Math.random() * Math.PI * 2
    }
  }, [])

  const enableAudio = useCallback(async () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      audioDataRef.current = new Uint8Array(analyser.frequencyBinCount)
      setAudioEnabled(true)
    } catch (err) {
      console.log('Audio not available:', err)
    }
  }, [])

  const getAudioLevel = useCallback(() => {
    if (!analyserRef.current || !audioDataRef.current) return 0
    analyserRef.current.getByteFrequencyData(audioDataRef.current)
    const sum = audioDataRef.current.reduce((a, b) => a + b, 0)
    return sum / audioDataRef.current.length / 255
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
      type: 'repel' | 'attract' | 'vortex' | 'paint' | 'gravity',
      audioMultiplier: number = 1
    ) => {
      const dx = p.x - fx
      const dy = p.y - fy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const layerMultiplier = 1 + (2 - p.layer) * 0.3 // Foreground reacts more

      if (dist < radius && dist > 0) {
        const force = ((radius - dist) / radius) * strength * layerMultiplier * audioMultiplier
        const nx = dx / dist
        const ny = dy / dist

        switch (type) {
          case 'repel':
            p.vx += nx * force * 1.2
            p.vy += ny * force * 1.2
            break
          case 'attract':
            p.vx -= nx * force * 0.7
            p.vy -= ny * force * 0.7
            break
          case 'vortex':
            p.vx += (-ny * force * 1.1 + nx * force * 0.15)
            p.vy += (nx * force * 1.1 + ny * force * 0.15)
            break
          case 'paint':
            p.hue = (p.hue + force * 8) % 360
            p.vx += nx * force * 0.4
            p.vy += ny * force * 0.4
            break
          case 'gravity':
            p.vx -= nx * force * 0.5
            p.vy -= ny * force * 0.5
            break
        }
      }
    }

    const spawnGravityWell = (x: number, y: number) => {
      gravityWellsRef.current.push({
        x,
        y,
        radius: 150 + Math.random() * 100,
        strength: 8 + Math.random() * 6,
        hue: Math.random() * 360,
        life: 1,
        maxLife: 300 + Math.random() * 200
      })

      // Trigger explosion
      explosionsRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: 200,
        hue: Math.random() * 360,
        alpha: 1
      })

      // Screen shake
      shakeRef.current.intensity = 15
    }

    const updateNebulae = () => {
      if (!autoNebulae) return
      const nebulae = nebulaeRef.current
      const audioLevel = getAudioLevel()

      for (const n of nebulae) {
        n.pulsePhase += 0.02
        const pulse = 1 + Math.sin(n.pulsePhase) * 0.2
        
        n.vx += (Math.random() - 0.5) * 0.08
        n.vy += (Math.random() - 0.5) * 0.08
        n.vx *= 0.98
        n.vy *= 0.98
        n.x += n.vx * (1 + audioLevel)
        n.y += n.vy * (1 + audioLevel)

        if (n.x < -n.radius) n.x = width + n.radius
        if (n.x > width + n.radius) n.x = -n.radius
        if (n.y < -n.radius) n.y = height + n.radius
        if (n.y > height + n.radius) n.y = -n.radius

        n.hue = (n.hue + 0.15) % 360
        n.radius = (120 + Math.random() * 180) * pulse
      }

      if (Math.random() < 0.003 && nebulae.length < 6) {
        nebulae.push(spawnNebula(width, height))
      }
      if (nebulae.length > 6) {
        nebulae.shift()
      }
    }

    const updateGravityWells = () => {
      gravityWellsRef.current = gravityWellsRef.current.filter(well => {
        well.life -= 1 / well.maxLife
        return well.life > 0
      })
    }

    const updateExplosions = () => {
      explosionsRef.current = explosionsRef.current.filter(exp => {
        exp.radius += (exp.maxRadius - exp.radius) * 0.1
        exp.alpha -= 0.03
        return exp.alpha > 0
      })
    }

    const updateShake = () => {
      if (shakeRef.current.intensity > 0) {
        shakeRef.current.x = (Math.random() - 0.5) * shakeRef.current.intensity
        shakeRef.current.y = (Math.random() - 0.5) * shakeRef.current.intensity
        shakeRef.current.intensity *= 0.9
      } else {
        shakeRef.current.x = 0
        shakeRef.current.y = 0
      }
    }

    const updateParticles = () => {
      const particles = particlesRef.current
      const mouse = mouseRef.current
      const nebulae = nebulaeRef.current
      const gravityWells = gravityWellsRef.current
      const audioLevel = audioEnabled ? getAudioLevel() : 0
      const audioMultiplier = 1 + audioLevel * 3
      timeRef.current += 0.016 * colorSpeed

      for (const p of particles) {
        if (mouse.active) {
          applyForce(p, mouse.x, mouse.y, forceRadius, forceStrength, mode, audioMultiplier)
        }

        for (const n of nebulae) {
          applyForce(p, n.x, n.y, n.radius, n.strength * 0.5, n.type, audioMultiplier)
        }

        for (const well of gravityWells) {
          const wellStrength = well.strength * well.life
          applyForce(p, well.x, well.y, well.radius, wellStrength, 'attract', audioMultiplier)
        }

        // Color evolution with audio
        const colorEvolution = 0.1 * colorSpeed * (1 + audioLevel * 5)
        p.hue = (p.hue + colorEvolution) % 360

        const returnX = p.baseX - p.x
        const returnY = p.baseY - p.y
        const layerReturn = RETURN_SPEED * (1 + p.layer * 0.3) // Background returns slower
        p.vx += returnX * layerReturn
        p.vy += returnY * layerReturn

        p.vx *= FRICTION
        p.vy *= FRICTION

        p.x += p.vx
        p.y += p.vy
      }

      // Update trails
      if (showTrails && mouse.active) {
        const speed = Math.sqrt(
          Math.pow(mouse.x - mouse.prevX, 2) + 
          Math.pow(mouse.y - mouse.prevY, 2)
        )
        if (speed > 2) {
          trailsRef.current.push({
            x: mouse.x,
            y: mouse.y,
            hue: (timeRef.current * 100) % 360,
            alpha: 1,
            size: 10 + speed * 0.5
          })
        }
        mouse.prevX = mouse.x
        mouse.prevY = mouse.y
      }

      trailsRef.current = trailsRef.current
        .map(t => ({ ...t, alpha: t.alpha - 0.015 }))
        .filter(t => t.alpha > 0)
    }

    const drawShape = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      shape: 'circle' | 'diamond' | 'star'
    ) => {
      ctx.beginPath()
      switch (shape) {
        case 'circle':
          ctx.arc(x, y, size, 0, Math.PI * 2)
          break
        case 'diamond':
          ctx.moveTo(x, y - size)
          ctx.lineTo(x + size, y)
          ctx.lineTo(x, y + size)
          ctx.lineTo(x - size, y)
          ctx.closePath()
          break
        case 'star':
          for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
            const r = i % 2 === 0 ? size : size * 0.5
            if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
            else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
          }
          ctx.closePath()
          break
      }
      ctx.fill()
    }

    const draw = () => {
      const shake = shakeRef.current

      // Save context and apply shake
      ctx.save()
      ctx.translate(shake.x, shake.y)

      // Background fade with subtle gradient
      const bgGradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, width * 0.7
      )
      bgGradient.addColorStop(0, 'rgba(10, 5, 20, 0.12)')
      bgGradient.addColorStop(1, 'rgba(3, 3, 10, 0.15)')
      ctx.fillStyle = bgGradient
      ctx.fillRect(-20, -20, width + 40, height + 40)

      const particles = particlesRef.current
      const mouse = mouseRef.current
      const nebulae = nebulaeRef.current
      const gravityWells = gravityWellsRef.current
      const time = timeRef.current
      const audioLevel = audioEnabled ? getAudioLevel() : 0

      // Draw explosions
      for (const exp of explosionsRef.current) {
        const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius)
        gradient.addColorStop(0, `hsla(${exp.hue}, 100%, 80%, ${exp.alpha * 0.5})`)
        gradient.addColorStop(0.5, `hsla(${exp.hue + 30}, 90%, 60%, ${exp.alpha * 0.3})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw trails
      if (showTrails) {
        for (const t of trailsRef.current) {
          const gradient = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.size)
          gradient.addColorStop(0, `hsla(${t.hue}, 100%, 70%, ${t.alpha * 0.6})`)
          gradient.addColorStop(0.5, `hsla(${t.hue + 20}, 90%, 60%, ${t.alpha * 0.3})`)
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw nebulae
      for (const n of nebulae) {
        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius)
        const alpha = 0.12 + audioLevel * 0.1
        gradient.addColorStop(0, `hsla(${n.hue}, 80%, 60%, ${alpha})`)
        gradient.addColorStop(0.4, `hsla(${n.hue + 40}, 70%, 50%, ${alpha * 0.5})`)
        gradient.addColorStop(0.7, `hsla(${n.hue + 80}, 60%, 40%, ${alpha * 0.2})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw gravity wells
      for (const well of gravityWells) {
        const pulseRadius = well.radius * (1 + Math.sin(time * 10) * 0.1)
        const gradient = ctx.createRadialGradient(well.x, well.y, 0, well.x, well.y, pulseRadius)
        gradient.addColorStop(0, `hsla(${well.hue}, 100%, 70%, ${well.life * 0.4})`)
        gradient.addColorStop(0.3, `hsla(${well.hue + 30}, 90%, 50%, ${well.life * 0.2})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(well.x, well.y, pulseRadius, 0, Math.PI * 2)
        ctx.fill()

        // Event horizon ring
        ctx.strokeStyle = `hsla(${well.hue}, 100%, 80%, ${well.life * 0.6})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(well.x, well.y, pulseRadius * 0.3, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Sort particles by layer for proper depth
      const sortedParticles = [...particles].sort((a, b) => a.layer - b.layer)

      // Draw connections (only for foreground and mid layer)
      ctx.lineWidth = 1
      for (let i = 0; i < sortedParticles.length; i++) {
        const p = sortedParticles[i]
        if (p.layer === 0) continue // Skip background for connections

        const displaced = Math.sqrt(
          Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2)
        )

        for (let j = i + 1; j < sortedParticles.length; j++) {
          const other = sortedParticles[j]
          if (other.layer !== p.layer) continue // Only connect same layer

          const dx = other.x - p.x
          const dy = other.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = GRID_SIZE * (p.layer === 2 ? 2.5 : 2)

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.35
            const avgHue = (p.hue + other.hue) / 2
            const intensity = Math.min(1, displaced / 40)

            ctx.strokeStyle = `hsla(${avgHue}, 75%, ${55 + intensity * 25}%, ${alpha + intensity * 0.25})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(other.x, other.y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of sortedParticles) {
        const displaced = Math.sqrt(
          Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2)
        )
        const intensity = Math.min(1, displaced / 60)
        const layerOpacity = 0.3 + (2 - p.layer) * 0.35 // Background more transparent
        const size = p.size + intensity * (p.layer === 2 ? 5 : 3) + audioLevel * 3
        const saturation = 70 + intensity * 30
        const lightness = 50 + intensity * 35

        // Outer glow
        const glowSize = size * (4 + p.layer)
        const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize)
        glowGradient.addColorStop(0, `hsla(${p.hue}, ${saturation}%, ${lightness}%, ${(0.25 + intensity * 0.35) * layerOpacity})`)
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.fillStyle = `hsla(${p.hue}, ${saturation}%, ${lightness}%, ${(0.8 + intensity * 0.2) * layerOpacity})`
        drawShape(ctx, p.x, p.y, size, p.shape)

        // Bright center for displaced particles
        if (intensity > 0.2) {
          ctx.fillStyle = `hsla(${p.hue}, 40%, 95%, ${intensity * 0.6 * layerOpacity})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, size * 0.25, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw cursor effect
      if (mouse.active) {
        const cursorHue = (time * 100) % 360
        const pulseSize = forceRadius * (1 + Math.sin(time * 5) * 0.05)

        // Outer ring
        ctx.strokeStyle = `hsla(${cursorHue}, 70%, 60%, 0.4)`
        ctx.lineWidth = 2
        ctx.setLineDash([8, 8])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, pulseSize, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        // Animated rings
        for (let i = 0; i < 4; i++) {
          const phase = (time * 1.5 + i / 4) % 1
          const radius = pulseSize * phase
          const alpha = (1 - phase) * 0.35

          ctx.strokeStyle = `hsla(${cursorHue + i * 25}, 85%, 65%, ${alpha})`
          ctx.lineWidth = 2 - phase
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Center glow
        const centerGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 50)
        centerGradient.addColorStop(0, `hsla(${cursorHue}, 100%, 75%, 0.7)`)
        centerGradient.addColorStop(0.5, `hsla(${cursorHue + 30}, 90%, 60%, 0.3)`)
        centerGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = centerGradient
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 50, 0, Math.PI * 2)
        ctx.fill()

        // Mode indicator
        const modeColors = {
          repel: '#ef4444',
          attract: '#22c55e',
          vortex: '#06b6d4',
          paint: '#a855f7',
          gravity: '#f59e0b'
        }
        ctx.fillStyle = modeColors[mode]
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 8, 0, Math.PI * 2)
        ctx.fill()
      }

      // Audio visualization ring
      if (audioEnabled && audioLevel > 0.01) {
        const ringRadius = 100 + audioLevel * 200
        ctx.strokeStyle = `hsla(${(time * 50) % 360}, 100%, 70%, ${audioLevel})`
        ctx.lineWidth = 3 + audioLevel * 5
        ctx.beginPath()
        ctx.arc(width / 2, height / 2, ringRadius, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.restore()
    }

    const animate = () => {
      updateNebulae()
      updateGravityWells()
      updateExplosions()
      updateShake()
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

    const handleMouseDown = (e: MouseEvent) => {
      mouseRef.current.down = true
      if (mode === 'gravity') {
        spawnGravityWell(e.clientX, e.clientY)
      }
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

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (mode === 'gravity') {
        spawnGravityWell(touch.clientX, touch.clientY)
      }
    }

    const handleTouchEnd = () => {
      mouseRef.current.active = false
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setShowUI(prev => !prev)
      }
      if (e.key >= '1' && e.key <= '5') {
        const modes: Array<typeof mode> = ['repel', 'attract', 'vortex', 'paint', 'gravity']
        setMode(modes[parseInt(e.key) - 1])
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', handleKeyDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart)
    canvas.addEventListener('touchend', handleTouchEnd)

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchend', handleTouchEnd)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [forceRadius, forceStrength, mode, showTrails, autoNebulae, colorSpeed, audioEnabled, initParticles, spawnNebula, getAudioLevel])

  return (
    <div className="w-full h-screen bg-[#030310] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-none" />
      
      {/* Controls */}
      {showUI && (
        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center gap-3 z-10">
          <div className="bg-black/60 backdrop-blur-lg rounded-2xl px-4 py-2.5 flex items-center gap-2 border border-white/10">
            <span className="text-white/60 text-xs font-medium uppercase tracking-wider">Mode</span>
            {(['repel', 'attract', 'vortex', 'paint', 'gravity'] as const).map((m, i) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  mode === m
                    ? m === 'repel'
                      ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/40'
                      : m === 'attract'
                      ? 'bg-green-500/90 text-white shadow-lg shadow-green-500/40'
                      : m === 'vortex'
                      ? 'bg-cyan-500/90 text-white shadow-lg shadow-cyan-500/40'
                      : m === 'paint'
                      ? 'bg-purple-500/90 text-white shadow-lg shadow-purple-500/40'
                      : 'bg-amber-500/90 text-white shadow-lg shadow-amber-500/40'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                {m} <span className="opacity-50 ml-1">{i + 1}</span>
              </button>
            ))}
          </div>

          <div className="bg-black/60 backdrop-blur-lg rounded-2xl px-4 py-2.5 flex items-center gap-4 border border-white/10">
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs uppercase tracking-wider">Size</label>
              <input
                type="range"
                min="50"
                max="400"
                value={forceRadius}
                onChange={(e) => setForceRadius(Number(e.target.value))}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs uppercase tracking-wider">Power</label>
              <input
                type="range"
                min="1"
                max="25"
                value={forceStrength}
                onChange={(e) => setForceStrength(Number(e.target.value))}
                className="w-20"
              />
            </div>
          </div>

          <div className="bg-black/60 backdrop-blur-lg rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-white/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrails}
                onChange={(e) => setShowTrails(e.target.checked)}
              />
              <span className="text-white/60 text-xs uppercase tracking-wider">Trails</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoNebulae}
                onChange={(e) => setAutoNebulae(e.target.checked)}
              />
              <span className="text-white/60 text-xs uppercase tracking-wider">Nebulae</span>
            </label>
            {!audioEnabled ? (
              <button
                onClick={enableAudio}
                className="px-3 py-1 rounded-lg text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
              >
                🎤 Enable Audio
              </button>
            ) : (
              <span className="text-xs text-green-400">🎤 Audio Active</span>
            )}
          </div>

          <div className="bg-black/60 backdrop-blur-lg rounded-2xl px-4 py-2.5 flex items-center gap-2 border border-white/10">
            <label className="text-white/50 text-xs uppercase tracking-wider">Color</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={colorSpeed}
              onChange={(e) => setColorSpeed(Number(e.target.value))}
              className="w-16"
            />
          </div>
        </div>
      )}

      {/* Title */}
      {showUI && (
        <div className="absolute bottom-6 left-6 z-10">
          <h1 className="text-5xl font-black text-white/90 tracking-tight">
            Nebula<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Playground</span>
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Move to interact • Click to spawn gravity wells • Press H to hide UI • Keys 1-5 for modes
          </p>
        </div>
      )}

      {/* Mode indicator when UI hidden */}
      {!showUI && (
        <div className="absolute bottom-6 left-6 z-10 bg-black/40 backdrop-blur rounded-lg px-3 py-1.5">
          <span className={`text-sm font-medium capitalize ${
            mode === 'repel' ? 'text-red-400' :
            mode === 'attract' ? 'text-green-400' :
            mode === 'vortex' ? 'text-cyan-400' :
            mode === 'paint' ? 'text-purple-400' : 'text-amber-400'
          }`}>
            {mode}
          </span>
          <span className="text-white/30 text-xs ml-2">Press H for controls</span>
        </div>
      )}
    </div>
  )
}
