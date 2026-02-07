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
  type: 'basic' | 'fast' | 'tank'
  stunned: number
}

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  hue: number
  value: number
  life: number
}

interface Explosion {
  x: number
  y: number
  radius: number
  maxRadius: number
  hue: number
  alpha: number
}

interface BlastWave {
  x: number
  y: number
  radius: number
  maxRadius: number
  strength: number
}

type Mode = 'repel' | 'attract' | 'vortex'

const GRID_SIZE = 24
const CORE_RADIUS = 50

export default function NebulaDefender() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const orbsRef = useRef<Orb[]>([])
  const blastsRef = useRef<BlastWave[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const mouseRef = useRef({ x: 0, y: 0, active: false })
  const animationRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const shakeRef = useRef({ x: 0, y: 0, intensity: 0 })
  const lastSpawnRef = useRef(0)
  const gameRef = useRef({
    width: 0,
    height: 0,
    score: 0,
    health: 100,
    wave: 1,
    kills: 0,
    killsForWave: 8,
    energy: 100,
    combo: 0,
    comboTimer: 0,
    state: 'menu' as 'menu' | 'playing' | 'gameover',
    highScore: 0
  })
  
  const [mode, setMode] = useState<Mode>('repel')
  const [forceRadius] = useState(140)
  const [forceStrength] = useState(12)
  const [, forceUpdate] = useState(0)

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
        const distFromCenter = Math.sqrt(Math.pow(px - width/2, 2) + Math.pow(py - height/2, 2))
        
        particles.push({
          x: px, y: py,
          baseX: px, baseY: py,
          vx: 0, vy: 0,
          size: 2.5,
          hue: (200 + distFromCenter * 0.2) % 360
        })
      }
    }
    return particles
  }, [])

  const spawnEnemy = useCallback(() => {
    const game = gameRef.current
    const angle = Math.random() * Math.PI * 2
    const dist = Math.max(game.width, game.height) * 0.55
    
    const types: Enemy['type'][] = ['basic', 'basic']
    if (game.wave >= 2) types.push('fast')
    if (game.wave >= 3) types.push('tank')
    
    const type = types[Math.floor(Math.random() * types.length)]
    const baseSpeed = 0.6 + game.wave * 0.08
    
    let speed = baseSpeed, health = 1, size = 14, hue = 0
    
    if (type === 'fast') { speed = baseSpeed * 1.6; health = 0.6; size = 10; hue = 35 }
    else if (type === 'tank') { speed = baseSpeed * 0.5; health = 2.5; size = 22; hue = 280 }
    
    return {
      x: game.width/2 + Math.cos(angle) * dist,
      y: game.height/2 + Math.sin(angle) * dist,
      vx: 0, vy: 0,
      size, hue, health, maxHealth: health,
      speed: Math.min(speed, 2.5),
      type, stunned: 0
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      gameRef.current.width = canvas.width = window.innerWidth
      gameRef.current.height = canvas.height = window.innerHeight
      particlesRef.current = initParticles(canvas.width, canvas.height)
    }

    const startGame = () => {
      const game = gameRef.current
      game.score = 0
      game.health = 100
      game.wave = 1
      game.kills = 0
      game.killsForWave = 8
      game.energy = 100
      game.combo = 0
      game.state = 'playing'
      enemiesRef.current = []
      orbsRef.current = []
      explosionsRef.current = []
      blastsRef.current = []
      lastSpawnRef.current = 0
      forceUpdate(n => n + 1)
    }

    const doBlast = () => {
      const game = gameRef.current
      const mouse = mouseRef.current
      
      if (game.state !== 'playing') return
      if (game.energy < 20) return
      
      game.energy -= 20
      
      const bx = mouse.active ? mouse.x : game.width / 2
      const by = mouse.active ? mouse.y : game.height / 2
      
      blastsRef.current.push({
        x: bx, y: by,
        radius: 0,
        maxRadius: 300,
        strength: 25
      })
      
      explosionsRef.current.push({
        x: bx, y: by,
        radius: 0,
        maxRadius: 200,
        hue: 45,
        alpha: 1
      })
      
      shakeRef.current.intensity = 12
    }

    const applyForce = (
      obj: { x: number; y: number; vx: number; vy: number },
      fx: number, fy: number,
      radius: number, strength: number, type: Mode
    ) => {
      const dx = obj.x - fx
      const dy = obj.y - fy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius && dist > 0) {
        const force = ((radius - dist) / radius) * strength
        const nx = dx / dist
        const ny = dy / dist

        if (type === 'repel') {
          obj.vx += nx * force * 1.4
          obj.vy += ny * force * 1.4
        } else if (type === 'attract') {
          obj.vx -= nx * force * 0.7
          obj.vy -= ny * force * 0.7
        } else {
          obj.vx += (-ny * force * 1.2 + nx * force * 0.15)
          obj.vy += (nx * force * 1.2 + ny * force * 0.15)
        }
        return force
      }
      return 0
    }

    const update = () => {
      const game = gameRef.current
      const mouse = mouseRef.current
      const cx = game.width / 2
      const cy = game.height / 2
      
      if (game.state !== 'playing') return

      // Energy regen
      game.energy = Math.min(100, game.energy + 0.12)

      // Combo decay
      game.comboTimer--
      if (game.comboTimer <= 0 && game.combo > 0) {
        game.combo = 0
      }

      // Spawn enemies
      const spawnRate = Math.max(50, 100 - game.wave * 8)
      if (frameRef.current - lastSpawnRef.current > spawnRate) {
        enemiesRef.current.push(spawnEnemy())
        if (game.wave >= 2 && Math.random() < 0.3) {
          enemiesRef.current.push(spawnEnemy())
        }
        lastSpawnRef.current = frameRef.current
      }

      // Update enemies
      const enemies = enemiesRef.current
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]
        
        if (e.stunned > 0) {
          e.stunned--
          e.vx *= 0.92
          e.vy *= 0.92
        } else {
          const dx = cx - e.x
          const dy = cy - e.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            e.vx += (dx / dist) * e.speed * 0.08
            e.vy += (dy / dist) * e.speed * 0.08
          }
        }

        // Player force - deals real damage!
        if (mouse.active) {
          const force = applyForce(e, mouse.x, mouse.y, forceRadius, forceStrength * 0.8, mode)
          if (force > forceStrength * 0.2) {
            e.stunned = Math.max(e.stunned, 15)
            e.health -= force * 0.04 // 4x more damage
          }
        }

        // Blast waves - deal heavy damage!
        for (const blast of blastsRef.current) {
          const bdx = e.x - blast.x
          const bdy = e.y - blast.y
          const bdist = Math.sqrt(bdx * bdx + bdy * bdy)
          
          if (Math.abs(bdist - blast.radius) < 60) {
            const force = blast.strength * (1 - Math.abs(bdist - blast.radius) / 60)
            if (bdist > 0) {
              e.vx += (bdx / bdist) * force * 0.8
              e.vy += (bdy / bdist) * force * 0.8
              e.health -= force * 0.08 // Heavy damage from blast
              e.stunned = Math.max(e.stunned, 25)
            }
          }
        }

        e.vx *= 0.96
        e.vy *= 0.96
        e.x += e.vx
        e.y += e.vy

        // Kill if pushed off screen!
        const margin = 50
        if (e.x < -margin || e.x > game.width + margin || 
            e.y < -margin || e.y > game.height + margin) {
          // Only count as kill if they were pushed (have velocity away from center)
          const awayFromCenter = (e.x < cx && e.vx < -1) || (e.x > cx && e.vx > 1) ||
                                  (e.y < cy && e.vy < -1) || (e.y > cy && e.vy > 1)
          if (awayFromCenter) {
            orbsRef.current.push({
              x: Math.max(20, Math.min(game.width - 20, e.x)),
              y: Math.max(20, Math.min(game.height - 20, e.y)),
              vx: 0, vy: 0, hue: 170, value: 1, life: 300
            })
            
            const baseScore = e.type === 'tank' ? 30 : e.type === 'fast' ? 12 : 8
            game.score += Math.floor(baseScore * (1 + game.combo * 0.15))
            game.combo = Math.min(game.combo + 1, 30)
            game.comboTimer = 90
            game.kills++
            
            if (game.kills >= game.killsForWave) {
              game.wave++
              game.killsForWave = game.kills + 6 + game.wave * 2
              lastSpawnRef.current = frameRef.current + 40
            }
            
            enemies.splice(i, 1)
            continue
          }
        }

        // Hit core
        const coreDist = Math.sqrt(Math.pow(e.x - cx, 2) + Math.pow(e.y - cy, 2))
        if (coreDist < CORE_RADIUS + e.size) {
          const dmg = e.type === 'tank' ? 12 : e.type === 'fast' ? 5 : 8
          game.health -= dmg
          
          explosionsRef.current.push({
            x: e.x, y: e.y,
            radius: 0, maxRadius: 40,
            hue: 0, alpha: 1
          })
          
          shakeRef.current.intensity = 6
          game.combo = 0
          enemies.splice(i, 1)
          
          if (game.health <= 0) {
            game.state = 'gameover'
            game.highScore = Math.max(game.highScore, game.score)
            forceUpdate(n => n + 1)
          }
          continue
        }

        // Killed
        if (e.health <= 0) {
          // Drop orb
          orbsRef.current.push({
            x: e.x, y: e.y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            hue: 170,
            value: e.type === 'tank' ? 3 : 1,
            life: 400
          })
          
          const baseScore = e.type === 'tank' ? 40 : e.type === 'fast' ? 15 : 10
          game.score += Math.floor(baseScore * (1 + game.combo * 0.15))
          game.combo = Math.min(game.combo + 1, 30)
          game.comboTimer = 90
          game.kills++
          
          // Wave progression
          if (game.kills >= game.killsForWave) {
            game.wave++
            game.killsForWave = game.kills + 6 + game.wave * 2
            lastSpawnRef.current = frameRef.current + 40
          }
          
          explosionsRef.current.push({
            x: e.x, y: e.y,
            radius: 0, maxRadius: e.size * 2.5,
            hue: e.hue, alpha: 1
          })
          
          enemies.splice(i, 1)
        }
      }

      // Update orbs
      const orbs = orbsRef.current
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i]
        
        if (mouse.active) {
          const dx = mouse.x - o.x
          const dy = mouse.y - o.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist < 120 && dist > 0) {
            o.vx += (dx / dist) * 1.5
            o.vy += (dy / dist) * 1.5
          }
          
          if (dist < 25) {
            game.score += o.value * 3
            game.energy = Math.min(100, game.energy + o.value * 4)
            orbs.splice(i, 1)
            continue
          }
        }
        
        o.vx *= 0.97
        o.vy *= 0.97
        o.x += o.vx
        o.y += o.vy
        o.life--
        
        if (o.life <= 0) orbs.splice(i, 1)
      }

      // Update blasts
      blastsRef.current = blastsRef.current.filter(b => {
        b.radius += 10
        b.strength *= 0.96
        return b.radius < b.maxRadius
      })

      // Update explosions
      explosionsRef.current = explosionsRef.current.filter(e => {
        e.radius += (e.maxRadius - e.radius) * 0.12
        e.alpha -= 0.035
        return e.alpha > 0
      })

      // Update particles
      for (const p of particlesRef.current) {
        if (mouse.active && game.state === 'playing') {
          applyForce(p, mouse.x, mouse.y, forceRadius, forceStrength * 0.4, mode)
        }
        
        for (const e of enemies) {
          const dx = p.x - e.x
          const dy = p.y - e.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < e.size * 2.5 && dist > 0) {
            const f = ((e.size * 2.5 - dist) / (e.size * 2.5)) * 1.5
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }
        
        for (const b of blastsRef.current) {
          const dx = p.x - b.x
          const dy = p.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (Math.abs(dist - b.radius) < 30 && dist > 0) {
            const f = b.strength * 0.2 * (1 - Math.abs(dist - b.radius) / 30)
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }
        
        p.vx += (p.baseX - p.x) * 0.02
        p.vy += (p.baseY - p.y) * 0.02
        p.vx *= 0.94
        p.vy *= 0.94
        p.x += p.vx
        p.y += p.vy
        
        const distFromCenter = Math.sqrt(Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2))
        p.hue = (200 + distFromCenter * 0.15 - (1 - game.health / 100) * 40) % 360
      }

      // Shake decay
      if (shakeRef.current.intensity > 0) {
        shakeRef.current.x = (Math.random() - 0.5) * shakeRef.current.intensity
        shakeRef.current.y = (Math.random() - 0.5) * shakeRef.current.intensity
        shakeRef.current.intensity *= 0.9
      } else {
        shakeRef.current.x = 0
        shakeRef.current.y = 0
      }
    }

    const draw = () => {
      const game = gameRef.current
      const shake = shakeRef.current
      const mouse = mouseRef.current
      const cx = game.width / 2
      const cy = game.height / 2
      
      ctx.save()
      ctx.translate(shake.x, shake.y)
      
      // Background
      const healthPct = game.health / 100
      ctx.fillStyle = `rgb(${8 + (1-healthPct)*12}, ${5 + healthPct*3}, ${18 + healthPct*4})`
      ctx.fillRect(-20, -20, game.width + 40, game.height + 40)

      // Blasts
      for (const b of blastsRef.current) {
        ctx.strokeStyle = `rgba(255, 200, 100, ${b.strength / 25})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
        ctx.stroke()
        
        const g = ctx.createRadialGradient(b.x, b.y, b.radius - 25, b.x, b.y, b.radius + 25)
        g.addColorStop(0, 'transparent')
        g.addColorStop(0.5, `rgba(255, 180, 50, ${b.strength / 50})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.radius + 25, 0, Math.PI * 2)
        ctx.fill()
      }

      // Explosions
      for (const e of explosionsRef.current) {
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius)
        g.addColorStop(0, `hsla(${e.hue}, 100%, 75%, ${e.alpha * 0.6})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Connections
      ctx.lineWidth = 1
      const particles = particlesRef.current
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const o = particles[j]
          const dx = o.x - p.x
          const dy = o.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < GRID_SIZE * 2) {
            const a = (1 - dist / (GRID_SIZE * 2)) * 0.25
            ctx.strokeStyle = `hsla(${(p.hue + o.hue) / 2}, 60%, 55%, ${a})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(o.x, o.y)
            ctx.stroke()
          }
        }
      }

      // Particles
      for (const p of particles) {
        const disp = Math.sqrt(Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2))
        const int = Math.min(1, disp / 40)
        const size = p.size + int * 2.5
        
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3)
        g.addColorStop(0, `hsla(${p.hue}, 65%, ${55 + int * 25}%, ${0.25 + int * 0.3})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = `hsla(${p.hue}, 65%, ${55 + int * 30}%, ${0.8 + int * 0.2})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Core
      const pulse = 1 + Math.sin(frameRef.current * 0.04) * 0.04
      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, CORE_RADIUS * 2.2 * pulse)
      coreG.addColorStop(0, `hsla(${200 + healthPct * 40}, 100%, 70%, 0.9)`)
      coreG.addColorStop(0.35, `hsla(${200 + healthPct * 40}, 80%, 50%, 0.4)`)
      coreG.addColorStop(0.7, `hsla(${200 + healthPct * 40}, 60%, 40%, 0.1)`)
      coreG.addColorStop(1, 'transparent')
      ctx.fillStyle = coreG
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 2.2 * pulse, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.strokeStyle = `hsla(${200 + healthPct * 40}, 100%, 70%, 0.7)`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * pulse, 0, Math.PI * 2)
      ctx.stroke()
      
      // Health arc
      ctx.strokeStyle = `hsl(${healthPct * 120}, 100%, 55%)`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 1.15, -Math.PI/2, -Math.PI/2 + healthPct * Math.PI * 2)
      ctx.stroke()

      // Orbs
      for (const o of orbsRef.current) {
        const a = Math.min(1, o.life / 80)
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 14)
        g.addColorStop(0, `hsla(${o.hue}, 100%, 80%, ${a})`)
        g.addColorStop(0.5, `hsla(${o.hue}, 90%, 60%, ${a * 0.5})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(o.x, o.y, 14, 0, Math.PI * 2)
        ctx.fill()
      }

      // Enemies
      for (const e of enemiesRef.current) {
        const stunA = e.stunned > 0 ? 0.6 : 1
        
        const eg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 2.5)
        eg.addColorStop(0, `hsla(${e.hue}, 100%, 55%, ${0.35 * stunA})`)
        eg.addColorStop(1, 'transparent')
        ctx.fillStyle = eg
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size * 2.5, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = `hsla(${e.hue}, 85%, ${50 + (e.stunned > 0 ? 20 : 0)}%, ${stunA})`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2)
        ctx.fill()
        
        if (e.health < e.maxHealth) {
          const hw = e.size * 1.6
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillRect(e.x - hw/2, e.y - e.size - 8, hw, 3)
          ctx.fillStyle = `hsl(${(e.health / e.maxHealth) * 120}, 100%, 50%)`
          ctx.fillRect(e.x - hw/2, e.y - e.size - 8, hw * (e.health / e.maxHealth), 3)
        }
        
        const eyeAngle = Math.atan2(cy - e.y, cx - e.x)
        ctx.fillStyle = `hsla(${e.hue}, 100%, 90%, ${stunA})`
        ctx.beginPath()
        ctx.arc(e.x + Math.cos(eyeAngle) * e.size * 0.3, e.y + Math.sin(eyeAngle) * e.size * 0.3, e.size * 0.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Cursor
      if (mouse.active && game.state === 'playing') {
        const hue = mode === 'repel' ? 0 : mode === 'attract' ? 120 : 200
        
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.5)`
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, forceRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        
        for (let i = 0; i < 2; i++) {
          const phase = (frameRef.current * 0.015 + i * 0.5) % 1
          ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${(1 - phase) * 0.4})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, forceRadius * phase, 0, Math.PI * 2)
          ctx.stroke()
        }
        
        const cg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 30)
        cg.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.6)`)
        cg.addColorStop(1, 'transparent')
        ctx.fillStyle = cg
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 30, 0, Math.PI * 2)
        ctx.fill()
      }
      
      ctx.restore()

      // UI
      if (game.state === 'playing') {
        // Score
        ctx.fillStyle = 'white'
        ctx.font = 'bold 42px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(game.score.toLocaleString(), 24, 52)
        
        // Wave + Progress
        ctx.font = '14px system-ui'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        const killsThisWave = game.kills - (game.killsForWave - 6 - game.wave * 2)
        const killsNeeded = 6 + game.wave * 2
        ctx.fillText(`WAVE ${game.wave}  •  ${Math.max(0, killsThisWave)}/${killsNeeded} kills`, 24, 74)
        
        // Combo
        if (game.combo > 0) {
          ctx.fillStyle = '#fbbf24'
          ctx.font = 'bold 16px system-ui'
          ctx.fillText(`${game.combo}x COMBO`, 24, 98)
        }
        
        // Energy bar
        const ew = 160, eh = 6
        const ex = game.width - ew - 20, ey = 20
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(ex, ey, ew, eh)
        ctx.fillStyle = `hsl(${40 + game.energy * 0.6}, 100%, 55%)`
        ctx.fillRect(ex, ey, ew * game.energy / 100, eh)
        ctx.font = '11px system-ui'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.textAlign = 'right'
        ctx.fillText('ENERGY (Space = blast)', ex - 8, ey + 6)
        
        // Controls hint
        ctx.font = '11px system-ui'
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.textAlign = 'right'
        ctx.fillText('1-3: Switch modes  •  Space: Blast', game.width - 20, game.height - 20)
      }
    }

    const loop = () => {
      frameRef.current++
      update()
      draw()
      animationRef.current = requestAnimationFrame(loop)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      mouseRef.current.active = true
    }
    
    const handleMouseLeave = () => { mouseRef.current.active = false }
    
    // Removed: clicking was breaking the game
    // Use Space key for blast instead
    
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      mouseRef.current.x = e.touches[0].clientX
      mouseRef.current.y = e.touches[0].clientY
      mouseRef.current.active = true
    }
    
    const handleTouchStart = (e: TouchEvent) => {
      mouseRef.current.x = e.touches[0].clientX
      mouseRef.current.y = e.touches[0].clientY
      mouseRef.current.active = true
    }
    
    const handleTouchEnd = () => { mouseRef.current.active = false }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') setMode('repel')
      if (e.key === '2') setMode('attract')
      if (e.key === '3') setMode('vortex')
      if (e.key === ' ') {
        e.preventDefault()
        if (gameRef.current.state === 'playing') {
          doBlast()
        } else {
          startGame()
        }
      }
      if (e.key === 'Enter' && gameRef.current.state !== 'playing') {
        startGame()
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', handleKeyDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)

    animationRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchend', handleTouchEnd)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [mode, forceRadius, forceStrength, initParticles, spawnEnemy])

  const game = gameRef.current

  return (
    <div className="w-full h-screen bg-[#050312] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-none" />
      
      {/* Mode buttons */}
      {game.state === 'playing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {(['repel', 'attract', 'vortex'] as Mode[]).map((m, i) => (
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
      )}

      {/* Menu / Game Over */}
      {game.state !== 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <h1 className="text-5xl font-black text-white mb-1">
              {game.state === 'menu' ? 'NEBULA' : 'GAME OVER'}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
                {game.state === 'menu' ? ' DEFENDER' : ''}
              </span>
            </h1>
            
            {game.state === 'gameover' && (
              <div className="my-6">
                <div className="text-4xl font-bold text-white">{game.score.toLocaleString()}</div>
                <div className="text-white/50">Wave {game.wave} • {game.kills} kills</div>
                {game.score >= game.highScore && game.score > 0 && (
                  <div className="text-amber-400 font-bold mt-2">NEW HIGH SCORE!</div>
                )}
              </div>
            )}

            <button
              onClick={() => {
                const game = gameRef.current
                game.score = 0; game.health = 100; game.wave = 1
                game.kills = 0; game.killsForWave = 8; game.energy = 100
                game.combo = 0; game.state = 'playing'
                enemiesRef.current = []; orbsRef.current = []
                explosionsRef.current = []; blastsRef.current = []
                forceUpdate(n => n + 1)
              }}
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold text-lg rounded-2xl hover:scale-105 transition-transform shadow-lg"
            >
              {game.state === 'menu' ? 'START' : 'PLAY AGAIN'}
            </button>
            
            <p className="text-white/30 text-sm mt-6 max-w-sm mx-auto">
              Move cursor to push enemies away from the core.<br/>
              Press Space or click for a blast attack (costs energy).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
