'use client'

import { useEffect, useRef, useState } from 'react'

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  vx: number
  vy: number
  hue: number
  size: number
}

interface Enemy {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hue: number
  health: number
  maxHealth: number
  speed: number
  stunned: number
}

const GRID_SIZE = 20
const CORE_RADIUS = 50
const FORCE_RADIUS = 160
const FORCE_STRENGTH = 14

export default function NebulaDefender() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu')
  const [score, setScore] = useState(0)
  const [health, setHealth] = useState(100)
  const [wave, setWave] = useState(1)
  const [mode, setMode] = useState<'repel' | 'attract' | 'vortex'>('repel')
  const [kills, setKills] = useState(0)
  
  const particlesRef = useRef<Particle[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const frameRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const modeRef = useRef(mode)

  // Keep mode ref in sync
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Keyboard handler - separate effect
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '1') setMode('repel')
      if (e.key === '2') setMode('attract')
      if (e.key === '3') setMode('vortex')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let animationId: number

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      
      // Init particles - beautiful grid
      particlesRef.current = []
      const cols = Math.floor(width / GRID_SIZE)
      const rows = Math.floor(height / GRID_SIZE)
      const offsetX = (width - (cols - 1) * GRID_SIZE) / 2
      const offsetY = (height - (rows - 1) * GRID_SIZE) / 2
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offsetX + x * GRID_SIZE
          const py = offsetY + y * GRID_SIZE
          const dist = Math.sqrt((px - width/2)**2 + (py - height/2)**2)
          
          particlesRef.current.push({
            x: px, y: py, 
            baseX: px, baseY: py, 
            vx: 0, vy: 0,
            hue: (dist * 0.25 + 200) % 360,
            size: 2.5
          })
        }
      }
    }

    const spawnEnemy = () => {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.max(width, height) * 0.55
      const waveNum = wave
      
      // Different enemy types based on wave
      const types = ['basic', 'basic']
      if (waveNum >= 2) types.push('fast', 'fast')
      if (waveNum >= 3) types.push('tank')
      
      const type = types[Math.floor(Math.random() * types.length)]
      
      let size = 14, hue = 0, hp = 1, speed = 0.8 + waveNum * 0.1
      if (type === 'fast') { size = 10; hue = 35; hp = 0.7; speed *= 1.5 }
      if (type === 'tank') { size = 22; hue = 280; hp = 2.5; speed *= 0.6 }
      
      enemiesRef.current.push({
        x: width/2 + Math.cos(angle) * dist,
        y: height/2 + Math.sin(angle) * dist,
        vx: 0, vy: 0,
        size, hue,
        health: hp, maxHealth: hp,
        speed: Math.min(speed, 2.2),
        stunned: 0
      })
    }

    const applyForce = (obj: {x:number,y:number,vx:number,vy:number}, fx: number, fy: number, strength: number) => {
      const dx = obj.x - fx
      const dy = obj.y - fy
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist < FORCE_RADIUS && dist > 0) {
        const force = ((FORCE_RADIUS - dist) / FORCE_RADIUS) * strength
        const nx = dx / dist
        const ny = dy / dist
        const m = modeRef.current
        
        if (m === 'repel') {
          obj.vx += nx * force * 0.15
          obj.vy += ny * force * 0.15
        } else if (m === 'attract') {
          obj.vx -= nx * force * 0.08
          obj.vy -= ny * force * 0.08
        } else {
          obj.vx += (-ny * force * 0.12 + nx * force * 0.02)
          obj.vy += (nx * force * 0.12 + ny * force * 0.02)
        }
        return force
      }
      return 0
    }

    const loop = () => {
      frameRef.current++
      const cx = width / 2
      const cy = height / 2
      const mouse = mouseRef.current
      const currentWave = wave
      const isPlaying = gameState === 'playing'

      // Background with subtle gradient
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.7)
      grad.addColorStop(0, '#0c0618')
      grad.addColorStop(1, '#050210')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      if (isPlaying) {
        // Spawn enemies - FAST
        const spawnRate = Math.max(25, 70 - currentWave * 8)
        if (frameRef.current - lastSpawnRef.current > spawnRate) {
          spawnEnemy()
          // Extra enemy on later waves
          if (currentWave >= 2 && Math.random() < 0.4) spawnEnemy()
          if (currentWave >= 4 && Math.random() < 0.3) spawnEnemy()
          lastSpawnRef.current = frameRef.current
        }

        // Update enemies
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const e = enemiesRef.current[i]
          
          if (e.stunned > 0) {
            e.stunned--
            e.vx *= 0.92
            e.vy *= 0.92
          } else {
            // Move toward center
            const dx = cx - e.x
            const dy = cy - e.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 0) {
              e.vx += (dx / dist) * e.speed * 0.06
              e.vy += (dy / dist) * e.speed * 0.06
            }
          }

          // Player force
          const force = applyForce(e, mouse.x, mouse.y, FORCE_STRENGTH)
          if (force > FORCE_STRENGTH * 0.2) {
            e.stunned = Math.max(e.stunned, 12)
            e.health -= force * 0.025 // Damage from force
          }

          e.vx *= 0.96
          e.vy *= 0.96
          e.x += e.vx
          e.y += e.vy

          // Off screen = kill
          const margin = 40
          if (e.x < -margin || e.x > width + margin || e.y < -margin || e.y > height + margin) {
            const moving = Math.abs(e.vx) > 0.5 || Math.abs(e.vy) > 0.5
            if (moving) {
              enemiesRef.current.splice(i, 1)
              setKills(k => k + 1)
              setScore(s => s + 12)
              continue
            }
          }

          // Hit core
          const coreDist = Math.sqrt((e.x - cx)**2 + (e.y - cy)**2)
          if (coreDist < CORE_RADIUS + e.size) {
            enemiesRef.current.splice(i, 1)
            const dmg = e.size > 20 ? 15 : e.size < 12 ? 6 : 10
            setHealth(h => {
              const newH = h - dmg
              if (newH <= 0) setGameState('gameover')
              return Math.max(0, newH)
            })
            continue
          }

          // Health depleted
          if (e.health <= 0) {
            enemiesRef.current.splice(i, 1)
            setKills(k => k + 1)
            setScore(s => s + (e.size > 20 ? 30 : e.size < 12 ? 12 : 18))
          }
        }

        // Wave progression
        if (kills > 0 && kills % 12 === 0) {
          setWave(w => Math.floor(kills / 12) + 1)
        }
      }

      // Draw connections between particles
      ctx.lineWidth = 1
      const particles = particlesRef.current
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        
        // Update particle
        if (isPlaying) {
          applyForce(p, mouse.x, mouse.y, FORCE_STRENGTH * 0.5)
          
          // React to enemies
          for (const e of enemiesRef.current) {
            const dx = p.x - e.x
            const dy = p.y - e.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < e.size * 2.5 && dist > 0) {
              const f = ((e.size * 2.5 - dist) / (e.size * 2.5)) * 2
              p.vx += (dx / dist) * f
              p.vy += (dy / dist) * f
            }
          }
        }
        
        p.vx += (p.baseX - p.x) * 0.025
        p.vy += (p.baseY - p.y) * 0.025
        p.vx *= 0.92
        p.vy *= 0.92
        p.x += p.vx
        p.y += p.vy
        
        // Update hue based on health
        const healthPct = health / 100
        p.hue = (Math.sqrt((p.baseX - cx)**2 + (p.baseY - cy)**2) * 0.25 + 200 - (1 - healthPct) * 50) % 360

        // Draw connections to nearby particles
        const disp = Math.sqrt((p.x - p.baseX)**2 + (p.y - p.baseY)**2)
        
        for (let j = i + 1; j < particles.length; j++) {
          const o = particles[j]
          const dx = o.x - p.x
          const dy = o.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist < GRID_SIZE * 2.2) {
            const alpha = (1 - dist / (GRID_SIZE * 2.2)) * 0.35
            const intensity = Math.min(1, disp / 30)
            ctx.strokeStyle = `hsla(${(p.hue + o.hue) / 2}, 65%, ${50 + intensity * 30}%, ${alpha + intensity * 0.2})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(o.x, o.y)
            ctx.stroke()
          }
        }
      }

      // Draw particles with glow
      for (const p of particles) {
        const disp = Math.sqrt((p.x - p.baseX)**2 + (p.y - p.baseY)**2)
        const intensity = Math.min(1, disp / 35)
        const size = p.size + intensity * 3
        
        // Glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4)
        glow.addColorStop(0, `hsla(${p.hue}, 70%, ${55 + intensity * 30}%, ${0.25 + intensity * 0.35})`)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2)
        ctx.fill()
        
        // Core
        ctx.fillStyle = `hsla(${p.hue}, 70%, ${55 + intensity * 35}%, ${0.8 + intensity * 0.2})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw core
      const pulse = 1 + Math.sin(frameRef.current * 0.04) * 0.04
      const healthPct = health / 100
      
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CORE_RADIUS * 2.5 * pulse)
      coreGlow.addColorStop(0, `hsla(${200 + healthPct * 40}, 100%, 70%, 0.8)`)
      coreGlow.addColorStop(0.4, `hsla(${200 + healthPct * 40}, 80%, 50%, 0.3)`)
      coreGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 2.5 * pulse, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.strokeStyle = `hsla(${200 + healthPct * 40}, 100%, 70%, 0.8)`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * pulse, 0, Math.PI * 2)
      ctx.stroke()
      
      // Health ring
      ctx.strokeStyle = `hsl(${healthPct * 120}, 100%, 55%)`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 1.2, -Math.PI/2, -Math.PI/2 + healthPct * Math.PI * 2)
      ctx.stroke()

      // Draw enemies
      for (const e of enemiesRef.current) {
        const stunAlpha = e.stunned > 0 ? 0.6 : 1
        
        // Glow
        const eGlow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 2.5)
        eGlow.addColorStop(0, `hsla(${e.hue}, 100%, 55%, ${0.4 * stunAlpha})`)
        eGlow.addColorStop(1, 'transparent')
        ctx.fillStyle = eGlow
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size * 2.5, 0, Math.PI * 2)
        ctx.fill()
        
        // Body
        ctx.fillStyle = `hsla(${e.hue}, 85%, ${50 + (e.stunned > 0 ? 15 : 0)}%, ${stunAlpha})`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2)
        ctx.fill()
        
        // Health bar
        if (e.health < e.maxHealth) {
          const hw = e.size * 1.8
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(e.x - hw/2, e.y - e.size - 8, hw, 4)
          ctx.fillStyle = `hsl(${(e.health / e.maxHealth) * 120}, 100%, 50%)`
          ctx.fillRect(e.x - hw/2, e.y - e.size - 8, hw * (e.health / e.maxHealth), 4)
        }
        
        // Eye
        const eyeAngle = Math.atan2(cy - e.y, cx - e.x)
        ctx.fillStyle = `hsla(${e.hue}, 100%, 85%, ${stunAlpha})`
        ctx.beginPath()
        ctx.arc(e.x + Math.cos(eyeAngle) * e.size * 0.3, e.y + Math.sin(eyeAngle) * e.size * 0.3, e.size * 0.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw cursor effect
      if (isPlaying) {
        const hue = modeRef.current === 'repel' ? 0 : modeRef.current === 'attract' ? 120 : 200
        
        // Animated rings
        for (let i = 0; i < 3; i++) {
          const phase = (frameRef.current * 0.015 + i * 0.33) % 1
          ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${(1 - phase) * 0.4})`
          ctx.lineWidth = 2 - phase
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, FORCE_RADIUS * phase, 0, Math.PI * 2)
          ctx.stroke()
        }
        
        // Outer ring
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.5)`
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, FORCE_RADIUS, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Center glow
        const cg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 35)
        cg.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.6)`)
        cg.addColorStop(1, 'transparent')
        ctx.fillStyle = cg
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 35, 0, Math.PI * 2)
        ctx.fill()
      }

      animationId = requestAnimationFrame(loop)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)
    animationId = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animationId)
    }
  }, [gameState, wave, health, kills])

  const startGame = () => {
    enemiesRef.current = []
    lastSpawnRef.current = 0
    setScore(0)
    setHealth(100)
    setWave(1)
    setKills(0)
    setGameState('playing')
  }

  return (
    <div className="w-full h-screen bg-[#050210] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {/* HUD */}
      {gameState === 'playing' && (
        <>
          <div className="absolute top-4 left-4 z-10">
            <div className="text-5xl font-black text-white">{score}</div>
            <div className="text-white/50 text-sm mt-1">
              Wave {wave} • {kills} kills • {health} HP
            </div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {(['repel', 'attract', 'vortex'] as const).map((m, i) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-all ${
                  mode === m
                    ? m === 'repel' ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
                    : m === 'attract' ? 'bg-green-500 text-white shadow-lg shadow-green-500/40'
                    : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'bg-white/10 text-white/50 hover:bg-white/20'
                }`}
              >
                {m} ({i + 1})
              </button>
            ))}
          </div>
          
          <div className="absolute bottom-6 right-6 z-10 text-white/30 text-xs text-right">
            Push enemies off screen or damage them with force<br/>
            1/2/3 to switch modes
          </div>
        </>
      )}

      {/* Menu / Game Over */}
      {gameState !== 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50 backdrop-blur-sm">
          <div className="text-center">
            <h1 className="text-6xl font-black text-white mb-2">
              {gameState === 'menu' ? 'NEBULA' : 'GAME OVER'}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
                {gameState === 'menu' ? ' DEFENDER' : ''}
              </span>
            </h1>
            {gameState === 'gameover' && (
              <div className="my-4">
                <div className="text-4xl font-bold text-white">{score}</div>
                <div className="text-white/50">Wave {wave} • {kills} kills</div>
              </div>
            )}
            <button
              onClick={startGame}
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold text-lg rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-violet-500/30 mt-4"
            >
              {gameState === 'menu' ? 'START GAME' : 'PLAY AGAIN'}
            </button>
            <p className="text-white/30 text-sm mt-6 max-w-md mx-auto">
              Move cursor to push enemies. Use 1/2/3 to switch force modes.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
