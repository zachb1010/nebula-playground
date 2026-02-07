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
}

interface Enemy {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hue: number
  health: number
}

const GRID_SIZE = 28
const CORE_RADIUS = 45

export default function NebulaDefender() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu')
  const [score, setScore] = useState(0)
  const [health, setHealth] = useState(100)
  const [wave, setWave] = useState(1)
  const [mode, setMode] = useState<'repel' | 'attract' | 'vortex'>('repel')
  
  const particlesRef = useRef<Particle[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const frameRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const killsRef = useRef(0)

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
      
      // Init particles
      particlesRef.current = []
      const cols = Math.floor(width / GRID_SIZE)
      const rows = Math.floor(height / GRID_SIZE)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = (width - (cols - 1) * GRID_SIZE) / 2 + x * GRID_SIZE
          const py = (height - (rows - 1) * GRID_SIZE) / 2 + y * GRID_SIZE
          particlesRef.current.push({
            x: px, y: py, baseX: px, baseY: py, vx: 0, vy: 0,
            hue: (Math.sqrt((px - width/2)**2 + (py - height/2)**2) * 0.3 + 200) % 360
          })
        }
      }
    }

    const spawnEnemy = () => {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.max(width, height) * 0.55
      enemiesRef.current.push({
        x: width/2 + Math.cos(angle) * dist,
        y: height/2 + Math.sin(angle) * dist,
        vx: 0, vy: 0,
        size: 12 + Math.random() * 8,
        hue: Math.random() < 0.5 ? 0 : 35,
        health: 1
      })
    }

    const loop = () => {
      frameRef.current++
      const cx = width / 2
      const cy = height / 2
      const mouse = mouseRef.current

      // Clear
      ctx.fillStyle = '#0a0515'
      ctx.fillRect(0, 0, width, height)

      // Only update game if playing
      if (gameState === 'playing') {
        // Spawn enemies
        if (frameRef.current - lastSpawnRef.current > Math.max(40, 100 - wave * 5)) {
          spawnEnemy()
          lastSpawnRef.current = frameRef.current
        }

        // Update enemies
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const e = enemiesRef.current[i]
          
          // Move toward center
          const dx = cx - e.x
          const dy = cy - e.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            e.vx += (dx / dist) * 0.08
            e.vy += (dy / dist) * 0.08
          }

          // Player force
          const mdx = e.x - mouse.x
          const mdy = e.y - mouse.y
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
          if (mdist < 140 && mdist > 0) {
            const force = ((140 - mdist) / 140) * 12
            const nx = mdx / mdist
            const ny = mdy / mdist
            
            if (mode === 'repel') {
              e.vx += nx * force * 0.12
              e.vy += ny * force * 0.12
            } else if (mode === 'attract') {
              e.vx -= nx * force * 0.06
              e.vy -= ny * force * 0.06
            } else {
              e.vx += (-ny * force * 0.1 + nx * force * 0.02)
              e.vy += (nx * force * 0.1 + ny * force * 0.02)
            }
            
            e.health -= force * 0.003
          }

          e.vx *= 0.96
          e.vy *= 0.96
          e.x += e.vx
          e.y += e.vy

          // Off screen = kill
          if (e.x < -30 || e.x > width + 30 || e.y < -30 || e.y > height + 30) {
            enemiesRef.current.splice(i, 1)
            killsRef.current++
            setScore(s => s + 10)
            if (killsRef.current % 10 === 0) setWave(w => w + 1)
            continue
          }

          // Hit core
          if (dist < CORE_RADIUS + e.size) {
            enemiesRef.current.splice(i, 1)
            setHealth(h => {
              const newH = h - 10
              if (newH <= 0) setGameState('gameover')
              return Math.max(0, newH)
            })
            continue
          }

          // Health depleted
          if (e.health <= 0) {
            enemiesRef.current.splice(i, 1)
            killsRef.current++
            setScore(s => s + 15)
            if (killsRef.current % 10 === 0) setWave(w => w + 1)
          }
        }
      }

      // Draw particles
      for (const p of particlesRef.current) {
        // Update
        const mdx = p.x - mouse.x
        const mdy = p.y - mouse.y
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
        if (mdist < 120 && mdist > 0 && gameState === 'playing') {
          const force = ((120 - mdist) / 120) * 5
          if (mode === 'repel') {
            p.vx += (mdx / mdist) * force * 0.1
            p.vy += (mdy / mdist) * force * 0.1
          } else if (mode === 'attract') {
            p.vx -= (mdx / mdist) * force * 0.05
            p.vy -= (mdy / mdist) * force * 0.05
          } else {
            p.vx += (-mdy / mdist * force * 0.08)
            p.vy += (mdx / mdist * force * 0.08)
          }
        }
        
        p.vx += (p.baseX - p.x) * 0.02
        p.vy += (p.baseY - p.y) * 0.02
        p.vx *= 0.94
        p.vy *= 0.94
        p.x += p.vx
        p.y += p.vy

        // Draw
        const disp = Math.sqrt((p.x - p.baseX)**2 + (p.y - p.baseY)**2)
        const int = Math.min(1, disp / 30)
        ctx.fillStyle = `hsla(${p.hue}, 60%, ${50 + int * 30}%, ${0.6 + int * 0.4})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2 + int * 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw core
      const pulse = 1 + Math.sin(frameRef.current * 0.05) * 0.03
      ctx.fillStyle = `hsla(200, 100%, 60%, 0.3)`
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 2 * pulse, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.strokeStyle = `hsla(200, 100%, 70%, 0.8)`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * pulse, 0, Math.PI * 2)
      ctx.stroke()

      // Draw enemies
      for (const e of enemiesRef.current) {
        ctx.fillStyle = `hsla(${e.hue}, 80%, 50%, 0.8)`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = `hsla(${e.hue}, 100%, 80%, 0.6)`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size * 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw cursor
      if (gameState === 'playing') {
        const hue = mode === 'repel' ? 0 : mode === 'attract' ? 120 : 200
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.5)`
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 140, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
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
  }, [gameState, mode, wave])

  const startGame = () => {
    enemiesRef.current = []
    killsRef.current = 0
    lastSpawnRef.current = 0
    setScore(0)
    setHealth(100)
    setWave(1)
    setGameState('playing')
  }

  return (
    <div className="w-full h-screen bg-[#0a0515] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {/* HUD */}
      {gameState === 'playing' && (
        <>
          <div className="absolute top-4 left-4 z-10">
            <div className="text-4xl font-bold text-white">{score}</div>
            <div className="text-white/50 text-sm">Wave {wave} • Health: {health}</div>
          </div>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {(['repel', 'attract', 'vortex'] as const).map((m, i) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-bold uppercase ${
                  mode === m
                    ? m === 'repel' ? 'bg-red-500 text-white'
                    : m === 'attract' ? 'bg-green-500 text-white'
                    : 'bg-cyan-500 text-white'
                    : 'bg-white/20 text-white/60'
                }`}
              >
                {m} ({i + 1})
              </button>
            ))}
          </div>
          
          <div className="absolute bottom-4 right-4 z-10 text-white/30 text-xs">
            Push enemies off screen to kill them
          </div>
        </>
      )}

      {/* Menu / Game Over */}
      {gameState !== 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
          <div className="text-center">
            <h1 className="text-5xl font-black text-white mb-4">
              {gameState === 'menu' ? 'NEBULA DEFENDER' : 'GAME OVER'}
            </h1>
            {gameState === 'gameover' && (
              <div className="text-2xl text-white mb-4">Score: {score}</div>
            )}
            <button
              onClick={startGame}
              className="px-8 py-3 bg-cyan-500 text-white font-bold text-lg rounded-xl hover:bg-cyan-400"
            >
              {gameState === 'menu' ? 'START' : 'PLAY AGAIN'}
            </button>
            <p className="text-white/40 text-sm mt-4 max-w-sm">
              Move your cursor to push enemies away from the core.
              <br />Use 1/2/3 keys to switch modes.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
