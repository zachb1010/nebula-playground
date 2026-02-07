'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ==================== CONSTANTS ====================
const GRID_SIZE = 22
const RETURN_SPEED = 0.02
const FRICTION = 0.94
const CORE_RADIUS = 60
const FORCE_RADIUS = 150
const FORCE_STRENGTH = 15
const BLAST_ENERGY_COST = 20
const ENERGY_REGEN_RATE = 0.15
const MAX_ENERGY = 100
const MAX_COMBO = 50
const COMBO_DURATION = 180
const BASE_SPAWN_RATE = 150
const MIN_SPAWN_RATE = 40
const MAX_ENEMY_SPEED = 2.5
const ORB_LIFETIME = 300
const ORB_ATTRACT_RANGE = 150
const ORB_COLLECT_RANGE = 30
const WAVE_PROGRESS_THRESHOLD = 700
const SPAWN_INVULN_FRAMES = 60
const VELOCITY_DAMAGE_THRESHOLD = 2
const VELOCITY_DAMAGE_MULT = 0.08  // Buffed - pushing hard actually hurts
// Energy drain per frame when using force modes
const REPEL_ENERGY_COST = 0.15
const VORTEX_ENERGY_COST = 0.12
const ATTRACT_ENERGY_COST = 0.08
const LOCAL_STORAGE_HIGH_SCORE_KEY = 'nebula-defender-high-score'

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  vx: number
  vy: number
  size: number
  hue: number
  layer: number
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
  type: 'basic' | 'fast' | 'tank' | 'swarm'
  stunned: number
  spawnFrames: number  // Invulnerability frames after spawn
}

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  hue: number
  size: number
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

interface Wave {
  x: number
  y: number
  radius: number
  maxRadius: number
  hue: number
  strength: number
  damage: number
}

type Mode = 'repel' | 'attract' | 'vortex' | 'blast'

export default function NebulaDefender() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const orbsRef = useRef<Orb[]>([])
  const wavesRef = useRef<Wave[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const mouseRef = useRef({ x: 0, y: 0, active: false })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const shakeRef = useRef({ x: 0, y: 0, intensity: 0 })
  const lastSpawnRef = useRef(0)
  
  const [mode, setMode] = useState<Mode>('repel')
  const [score, setScore] = useState(0)
  const [coreHealth, setCoreHealth] = useState(100)
  const [wave, setWave] = useState(1)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu')
  const [combo, setCombo] = useState(0)
  const [energy, setEnergy] = useState(100)
  const [highScore, setHighScore] = useState(0)
  const [showUI, setShowUI] = useState(true)

  // Refs for animation loop access (updated directly before setState)
  const modeRef = useRef<Mode>('repel')
  const scoreRef = useRef(0)
  const coreHealthRef = useRef(100)
  const waveRef = useRef(1)
  const gameStateRef = useRef<'menu' | 'playing' | 'gameover'>('menu')
  const comboRef = useRef(0)
  const energyRef = useRef(100)
  const comboTimerRef = useRef(0)
  const highScoreRef = useRef(0)

  // Sync modeRef separately (doesn't trigger particle reinit)
  useEffect(() => { modeRef.current = mode }, [mode])

  // Load high score from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_HIGH_SCORE_KEY)
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed)) {
        highScoreRef.current = parsed
        setHighScore(parsed)
      }
    }
  }, [])

  // Save high score to localStorage when it changes
  useEffect(() => {
    if (highScore > 0) {
      localStorage.setItem(LOCAL_STORAGE_HIGH_SCORE_KEY, highScore.toString())
    }
  }, [highScore])

  const startGame = useCallback(() => {
    scoreRef.current = 0
    coreHealthRef.current = 100
    waveRef.current = 1
    comboRef.current = 0
    energyRef.current = 100
    gameStateRef.current = 'playing'
    
    setScore(0)
    setCoreHealth(100)
    setWave(1)
    setCombo(0)
    setEnergy(100)
    setGameState('playing')
    
    enemiesRef.current = []
    orbsRef.current = []
    explosionsRef.current = []
    wavesRef.current = []
    lastSpawnRef.current = 0
  }, [])

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = []
    
    for (let layer = 0; layer < 2; layer++) {
      const layerGridSize = GRID_SIZE * (1 + layer * 0.6)
      const cols = Math.floor(width / layerGridSize)
      const rows = Math.floor(height / layerGridSize)
      const offsetX = (width - (cols - 1) * layerGridSize) / 2
      const offsetY = (height - (rows - 1) * layerGridSize) / 2

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offsetX + x * layerGridSize
          const py = offsetY + y * layerGridSize
          const distFromCenter = Math.sqrt(
            Math.pow(px - width / 2, 2) + Math.pow(py - height / 2, 2)
          )
          
          // Color based on distance from center
          const hue = (distFromCenter * 0.3 + 200) % 360

          particles.push({
            x: px,
            y: py,
            baseX: px,
            baseY: py,
            vx: 0,
            vy: 0,
            size: 2.5 + (1 - layer) * 1,
            hue,
            layer
          })
        }
      }
    }
    return particles
  }, [])

  const spawnEnemy = useCallback((width: number, height: number, waveNum: number) => {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.max(width, height) * 0.6
    const cx = width / 2
    const cy = height / 2
    
    // Earlier enemy type unlocks
    const types: Array<Enemy['type']> = ['basic', 'basic', 'basic']
    if (waveNum >= 2) types.push('fast', 'fast')
    if (waveNum >= 3) types.push('tank')
    if (waveNum >= 5) types.push('swarm', 'swarm', 'swarm')
    
    const type = types[Math.floor(Math.random() * types.length)]
    
    const baseSpeed = 1.0 + waveNum * 0.12  // Faster base speed
    let speed = baseSpeed
    let health = 1  // Reverted - was too tanky
    let size = 15
    let hue = 0
    
    switch (type) {
      case 'fast':
        speed = baseSpeed * 1.8
        health = 0.5  // Reverted
        size = 10
        hue = 40 // Orange
        break
      case 'tank':
        speed = baseSpeed * 0.5
        health = 3  // Reverted
        size = 25
        hue = 280 // Purple
        break
      case 'swarm':
        speed = baseSpeed * 1.2
        health = 0.3  // Reverted
        size = 8
        hue = 120 // Green
        break
      default: // basic
        hue = 0 // Red
    }

    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      size,
      hue,
      health,
      maxHealth: health,
      speed: Math.min(speed, MAX_ENEMY_SPEED),
      type,
      stunned: 0,
      spawnFrames: SPAWN_INVULN_FRAMES  // 1 second of spawn protection
    }
  }, [])

  const spawnOrb = useCallback((x: number, y: number, value: number) => {
    orbsRef.current.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      hue: 180 + Math.random() * 60,
      size: 8 + value * 2,
      value,
      life: ORB_LIFETIME
    })
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
    }

    const applyForce = (
      obj: { x: number; y: number; vx: number; vy: number },
      fx: number,
      fy: number,
      radius: number,
      strength: number,
      type: Mode
    ) => {
      const dx = obj.x - fx
      const dy = obj.y - fy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius && dist > 0) {
        const force = ((radius - dist) / radius) * strength
        const nx = dx / dist
        const ny = dy / dist

        switch (type) {
          case 'repel':
            obj.vx += nx * force * 1.5
            obj.vy += ny * force * 1.5
            break
          case 'attract':
            obj.vx -= nx * force * 0.8
            obj.vy -= ny * force * 0.8
            break
          case 'vortex':
            // Pure spin - no outward push (prevents orbit trap)
            obj.vx += -ny * force * 1.0
            obj.vy += nx * force * 1.0
            break
        }
        return force
      }
      return 0
    }

    const triggerBlast = (x: number, y: number) => {
      if (energyRef.current < BLAST_ENERGY_COST) return false
      
      const newEnergy = energyRef.current - BLAST_ENERGY_COST
      energyRef.current = newEnergy
      setEnergy(newEnergy)
      
      wavesRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: FORCE_RADIUS * 2.5,
        hue: 50,
        strength: FORCE_STRENGTH * 2.5,
        damage: 1.5  // Buffed back up
      })

      explosionsRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: FORCE_RADIUS * 1.5,
        hue: 50,
        alpha: 1
      })

      shakeRef.current.intensity = 10
      return true
    }

    const updateGame = () => {
      if (gameStateRef.current !== 'playing') return
      
      const cx = width / 2
      const cy = height / 2
      const mouse = mouseRef.current
      const currentMode = modeRef.current

      // Regenerate energy (only when not using force)
      if (!mouseRef.current.active || currentMode === 'blast') {
        const newEnergy = Math.min(MAX_ENERGY, energyRef.current + ENERGY_REGEN_RATE)
        energyRef.current = newEnergy
        setEnergy(newEnergy)
      }
      
      // Drain energy when using force modes
      if (mouseRef.current.active && currentMode !== 'blast' && energyRef.current > 0) {
        const drainRate = currentMode === 'repel' ? REPEL_ENERGY_COST : 
                          currentMode === 'vortex' ? VORTEX_ENERGY_COST : ATTRACT_ENERGY_COST
        const newEnergy = Math.max(0, energyRef.current - drainRate)
        energyRef.current = newEnergy
        setEnergy(newEnergy)
      }
      
      // Calculate force effectiveness (weaker near core center)
      const cursorDistFromCore = Math.sqrt(Math.pow(mouse.x - cx, 2) + Math.pow(mouse.y - cy, 2))
      const forceEffectiveness = Math.max(0.3, Math.min(1, cursorDistFromCore / 100))

      // Combo decay
      comboTimerRef.current -= 1
      if (comboTimerRef.current <= 0 && comboRef.current > 0) {
        comboRef.current = 0
        setCombo(0)
      }

      // Spawn enemies
      const spawnRate = Math.max(MIN_SPAWN_RATE, BASE_SPAWN_RATE - waveRef.current * 12)
      if (timeRef.current - lastSpawnRef.current > spawnRate) {
        const count = Math.min(1 + Math.floor(waveRef.current / 3), 8)  // Cap raised to 8
        for (let i = 0; i < count; i++) {
          enemiesRef.current.push(spawnEnemy(width, height, waveRef.current))
        }
        lastSpawnRef.current = timeRef.current
      }

      // Wave progression
      if (scoreRef.current > waveRef.current * WAVE_PROGRESS_THRESHOLD) {
        const newWave = waveRef.current + 1
        waveRef.current = newWave
        setWave(newWave)
      }

      // Update enemies
      const enemies = enemiesRef.current
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]
        
        // Stun countdown
        if (e.stunned > 0) {
          e.stunned -= 1
          e.vx *= 0.9
          e.vy *= 0.9
        } else {
          // Move toward core
          const dx = cx - e.x
          const dy = cy - e.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0) {
            e.vx += (dx / dist) * e.speed * 0.15  // Stronger core-seek
            e.vy += (dy / dist) * e.speed * 0.15
          }
        }

        // Apply player force (only if we have energy)
        if (mouse.active && currentMode !== 'blast' && energyRef.current > 0) {
          // Attract penalty: if pulling enemy away from core, reduce effectiveness
          let effectiveMult = forceEffectiveness
          if (currentMode === 'attract') {
            const enemyToCoreX = cx - e.x
            const enemyToCoreY = cy - e.y
            const enemyToCursorX = mouse.x - e.x
            const enemyToCursorY = mouse.y - e.y
            const attractDot = enemyToCoreX * enemyToCursorX + enemyToCoreY * enemyToCursorY
            if (attractDot < 0) {
              // Pulling away from core - heavily penalize
              effectiveMult *= 0.2
            }
          }
          
          const force = applyForce(e, mouse.x, mouse.y, FORCE_RADIUS, FORCE_STRENGTH * 0.8 * effectiveMult, currentMode)
          if (force > FORCE_STRENGTH * 0.3) {
            e.stunned = Math.max(e.stunned, 10)
            // DAMAGE from force - the harder you push, the more it hurts
            // Only if past spawn invulnerability
            if (e.spawnFrames <= 0) {
              const velocity = Math.sqrt(e.vx * e.vx + e.vy * e.vy)
              if (velocity > VELOCITY_DAMAGE_THRESHOLD) {
                e.health -= velocity * VELOCITY_DAMAGE_MULT
              }
            }
          }
        }
        
        // Decrement spawn invulnerability
        if (e.spawnFrames > 0) {
          e.spawnFrames--
        }

        // Kill enemies pushed off-screen (only if moving AWAY from center)
        // Skip if still in spawn invulnerability
        const margin = 50
        if (e.spawnFrames <= 0 && (e.x < -margin || e.x > width + margin || e.y < -margin || e.y > height + margin)) {
          // Check if moving away from center
          const toCenterX = cx - e.x
          const toCenterY = cy - e.y
          const dotProduct = e.vx * toCenterX + e.vy * toCenterY
          const velocity = Math.sqrt(e.vx * e.vx + e.vy * e.vy)
          
          // dotProduct < 0 means moving away from center
          if (dotProduct < 0 && velocity > 3) {
            // Flung off screen = REDUCED rewards (50% score, no orbs, +0.5 combo)
            const baseScore = e.type === 'tank' ? 50 : e.type === 'fast' ? 20 : e.type === 'swarm' ? 10 : 15
            const comboMultiplier = 1 + comboRef.current * 0.1
            const newScore = scoreRef.current + Math.floor((baseScore * comboMultiplier) / 2)  // Half score
            scoreRef.current = newScore
            setScore(newScore)
            
            // Reduced combo gain
            const comboGain = e.type === 'tank' ? 1 : 0.5  // Only tanks give full combo
            const newCombo = Math.min(comboRef.current + comboGain, MAX_COMBO)
            comboRef.current = newCombo
            setCombo(Math.floor(newCombo))
            comboTimerRef.current = COMBO_DURATION
            
            // NO orbs for off-screen kills (anti-exploit)
            
            enemies.splice(i, 1)
            continue
          }
        }

        // Apply waves (BLAST DAMAGE)
        for (const wave of wavesRef.current) {
          const wdx = e.x - wave.x
          const wdy = e.y - wave.y
          const wdist = Math.sqrt(wdx * wdx + wdy * wdy)
          const waveWidth = 80
          
          if (Math.abs(wdist - wave.radius) < waveWidth) {
            const force = wave.strength * (1 - Math.abs(wdist - wave.radius) / waveWidth)
            if (wdist > 0) {
              e.vx += (wdx / wdist) * force * 1.2
              e.vy += (wdy / wdist) * force * 1.2
              // Significant blast damage
              e.health -= wave.damage * 0.4
              e.stunned = Math.max(e.stunned, 20)
            }
          }
        }

        // Apply friction
        e.vx *= 0.96
        e.vy *= 0.96

        // Update position
        e.x += e.vx
        e.y += e.vy

        // Check core collision
        const coreDist = Math.sqrt(Math.pow(e.x - cx, 2) + Math.pow(e.y - cy, 2))
        if (coreDist < CORE_RADIUS + e.size) {
          const damage = e.type === 'tank' ? 12 : e.type === 'swarm' ? 2 : 6  // Reduced damage
          const newHealth = Math.max(0, coreHealthRef.current - damage)
          coreHealthRef.current = newHealth
          setCoreHealth(newHealth)
          
          if (newHealth <= 0) {
            gameStateRef.current = 'gameover'
            setGameState('gameover')
            const newHighScore = Math.max(highScoreRef.current, scoreRef.current)
            highScoreRef.current = newHighScore
            setHighScore(newHighScore)
          }
          
          // Explosion effect
          explosionsRef.current.push({
            x: e.x,
            y: e.y,
            radius: 0,
            maxRadius: 50,
            hue: 0,
            alpha: 1
          })
          
          shakeRef.current.intensity = 8
          enemies.splice(i, 1)
          comboRef.current = 0
          setCombo(0)
          continue
        }

        // Check if dead
        if (e.health <= 0) {
          // Spawn orbs
          const orbCount = e.type === 'tank' ? 3 : e.type === 'swarm' ? 1 : 2
          for (let j = 0; j < orbCount; j++) {
            spawnOrb(e.x, e.y, e.type === 'tank' ? 2 : 1)
          }
          
          // Score with combo
          const baseScore = e.type === 'tank' ? 50 : e.type === 'fast' ? 20 : e.type === 'swarm' ? 10 : 15
          const comboMultiplier = 1 + comboRef.current * 0.1
          const newScore = scoreRef.current + Math.floor(baseScore * comboMultiplier)
          scoreRef.current = newScore
          setScore(newScore)
          
          // Combo gain based on enemy type
          const comboGain = e.type === 'tank' ? 2 : e.type === 'swarm' ? 0.5 : 1
          const newCombo = Math.min(comboRef.current + comboGain, MAX_COMBO)
          comboRef.current = newCombo
          setCombo(Math.floor(newCombo))
          comboTimerRef.current = COMBO_DURATION

          // Death explosion
          explosionsRef.current.push({
            x: e.x,
            y: e.y,
            radius: 0,
            maxRadius: e.size * 3,
            hue: e.hue,
            alpha: 1
          })

          enemies.splice(i, 1)
        }
      }

      // Update orbs
      const orbs = orbsRef.current
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i]
        
        // Attract to cursor when close
        if (mouse.active) {
          const dx = mouse.x - o.x
          const dy = mouse.y - o.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist < ORB_ATTRACT_RANGE) {
            o.vx += (dx / dist) * 2
            o.vy += (dy / dist) * 2
          }
          
          // Collect
          if (dist < ORB_COLLECT_RANGE) {
            const newScore = scoreRef.current + o.value * 5
            scoreRef.current = newScore
            setScore(newScore)
            
            const newEnergy = Math.min(MAX_ENERGY, energyRef.current + o.value * 3)
            energyRef.current = newEnergy
            setEnergy(newEnergy)
            orbs.splice(i, 1)
            continue
          }
        }

        o.vx *= 0.98
        o.vy *= 0.98
        o.x += o.vx
        o.y += o.vy
        o.life -= 1

        if (o.life <= 0) {
          orbs.splice(i, 1)
        }
      }

      // Update waves
      wavesRef.current = wavesRef.current.filter(wave => {
        wave.radius += 12
        wave.strength *= 0.97
        return wave.radius < wave.maxRadius && wave.strength > 0.5
      })

      // Update explosions
      explosionsRef.current = explosionsRef.current.filter(exp => {
        exp.radius += (exp.maxRadius - exp.radius) * 0.15
        exp.alpha -= 0.04
        return exp.alpha > 0
      })
    }

    const updateParticles = () => {
      const particles = particlesRef.current
      const mouse = mouseRef.current
      const enemies = enemiesRef.current
      const cx = width / 2
      const cy = height / 2
      const currentMode = modeRef.current

      for (const p of particles) {
        // Player force
        if (mouse.active && gameStateRef.current === 'playing' && currentMode !== 'blast') {
          applyForce(p, mouse.x, mouse.y, FORCE_RADIUS, FORCE_STRENGTH * 0.5, currentMode)
        }

        // Enemy influence
        for (const e of enemies) {
          const dx = p.x - e.x
          const dy = p.y - e.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < e.size * 3 && dist > 0) {
            const force = ((e.size * 3 - dist) / (e.size * 3)) * 2
            p.vx += (dx / dist) * force
            p.vy += (dy / dist) * force
          }
        }

        // Wave influence
        for (const wave of wavesRef.current) {
          const dx = p.x - wave.x
          const dy = p.y - wave.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const waveWidth = 40
          
          if (Math.abs(dist - wave.radius) < waveWidth) {
            const force = wave.strength * 0.3 * (1 - Math.abs(dist - wave.radius) / waveWidth)
            if (dist > 0) {
              p.vx += (dx / dist) * force
              p.vy += (dy / dist) * force
            }
          }
        }

        // Return to base
        const returnX = p.baseX - p.x
        const returnY = p.baseY - p.y
        p.vx += returnX * RETURN_SPEED
        p.vy += returnY * RETURN_SPEED

        p.vx *= FRICTION
        p.vy *= FRICTION

        p.x += p.vx
        p.y += p.vy

        // Color shift based on game state
        const distFromCenter = Math.sqrt(Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2))
        const healthRatio = coreHealthRef.current / 100
        p.hue = (200 + distFromCenter * 0.2 - (1 - healthRatio) * 60) % 360
      }
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

    const draw = () => {
      const shake = shakeRef.current
      const cx = width / 2
      const cy = height / 2
      const mouse = mouseRef.current
      const currentMode = modeRef.current

      ctx.save()
      ctx.translate(shake.x, shake.y)

      // Background
      const healthRatio = coreHealthRef.current / 100
      ctx.fillStyle = `rgb(${5 + (1 - healthRatio) * 15}, ${3 + healthRatio * 5}, ${15 + healthRatio * 5})`
      ctx.fillRect(-20, -20, width + 40, height + 40)

      const particles = particlesRef.current
      const enemies = enemiesRef.current
      const orbs = orbsRef.current
      const waves = wavesRef.current
      const time = timeRef.current

      // Draw waves
      for (const wave of waves) {
        ctx.strokeStyle = `hsla(${wave.hue}, 100%, 70%, ${wave.strength / 30})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
        ctx.stroke()

        const gradient = ctx.createRadialGradient(wave.x, wave.y, wave.radius - 30, wave.x, wave.y, wave.radius + 30)
        gradient.addColorStop(0, 'transparent')
        gradient.addColorStop(0.5, `hsla(${wave.hue}, 100%, 80%, ${wave.strength / 60})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(wave.x, wave.y, wave.radius + 30, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw explosions
      for (const exp of explosionsRef.current) {
        const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius)
        gradient.addColorStop(0, `hsla(${exp.hue}, 100%, 80%, ${exp.alpha * 0.6})`)
        gradient.addColorStop(0.5, `hsla(${exp.hue + 20}, 90%, 60%, ${exp.alpha * 0.3})`)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw connections
      ctx.lineWidth = 1
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.layer === 1) continue

        const displaced = Math.sqrt(Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2))

        for (let j = i + 1; j < particles.length; j++) {
          const other = particles[j]
          if (other.layer !== p.layer) continue

          const dx = other.x - p.x
          const dy = other.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < GRID_SIZE * 2.2) {
            const alpha = (1 - dist / (GRID_SIZE * 2.2)) * 0.3
            const intensity = Math.min(1, displaced / 40)
            const avgHue = (p.hue + other.hue) / 2

            ctx.strokeStyle = `hsla(${avgHue}, 70%, ${50 + intensity * 30}%, ${alpha + intensity * 0.2})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(other.x, other.y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const displaced = Math.sqrt(Math.pow(p.x - p.baseX, 2) + Math.pow(p.y - p.baseY, 2))
        const intensity = Math.min(1, displaced / 50)
        const layerOpacity = p.layer === 0 ? 1 : 0.4
        const size = p.size + intensity * 3

        const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4)
        glowGradient.addColorStop(0, `hsla(${p.hue}, 70%, ${55 + intensity * 30}%, ${(0.25 + intensity * 0.3) * layerOpacity})`)
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `hsla(${p.hue}, 70%, ${55 + intensity * 35}%, ${(0.8 + intensity * 0.2) * layerOpacity})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw core
      const corePulse = 1 + Math.sin(time * 0.05) * 0.05
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CORE_RADIUS * 2.5 * corePulse)
      coreGlow.addColorStop(0, `hsla(${200 + healthRatio * 40}, 100%, 70%, 0.8)`)
      coreGlow.addColorStop(0.3, `hsla(${200 + healthRatio * 40}, 80%, 50%, 0.4)`)
      coreGlow.addColorStop(0.6, `hsla(${200 + healthRatio * 40}, 60%, 40%, 0.1)`)
      coreGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 2.5 * corePulse, 0, Math.PI * 2)
      ctx.fill()

      // Core ring
      ctx.strokeStyle = `hsla(${200 + healthRatio * 40}, 100%, 70%, 0.6)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * corePulse, 0, Math.PI * 2)
      ctx.stroke()

      // Health ring
      const healthAngle = (coreHealthRef.current / 100) * Math.PI * 2
      ctx.strokeStyle = `hsla(${120 * healthRatio}, 100%, 60%, 0.8)`
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(cx, cy, CORE_RADIUS * 1.2, -Math.PI / 2, -Math.PI / 2 + healthAngle)
      ctx.stroke()

      // Draw orbs
      for (const o of orbs) {
        const orbGlow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.size * 2)
        orbGlow.addColorStop(0, `hsla(${o.hue}, 100%, 80%, ${Math.min(1, o.life / 100)})`)
        orbGlow.addColorStop(0.5, `hsla(${o.hue}, 90%, 60%, ${Math.min(0.5, o.life / 200)})`)
        orbGlow.addColorStop(1, 'transparent')
        ctx.fillStyle = orbGlow
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.size * 2, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `hsla(${o.hue}, 100%, 85%, ${Math.min(1, o.life / 50)})`
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw enemies
      for (const e of enemies) {
        const stunAlpha = e.stunned > 0 ? 0.5 : 1
        
        // Danger glow
        const enemyGlow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 3)
        enemyGlow.addColorStop(0, `hsla(${e.hue}, 100%, 60%, ${0.4 * stunAlpha})`)
        enemyGlow.addColorStop(0.5, `hsla(${e.hue}, 80%, 50%, ${0.2 * stunAlpha})`)
        enemyGlow.addColorStop(1, 'transparent')
        ctx.fillStyle = enemyGlow
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size * 3, 0, Math.PI * 2)
        ctx.fill()

        // Body
        ctx.fillStyle = `hsla(${e.hue}, 90%, ${50 + (e.stunned > 0 ? 20 : 0)}%, ${stunAlpha})`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2)
        ctx.fill()

        // Health indicator
        if (e.health < e.maxHealth) {
          const healthWidth = e.size * 2
          const healthHeight = 4
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
          ctx.fillRect(e.x - healthWidth / 2, e.y - e.size - 10, healthWidth, healthHeight)
          ctx.fillStyle = `hsl(${120 * (e.health / e.maxHealth)}, 100%, 50%)`
          ctx.fillRect(e.x - healthWidth / 2, e.y - e.size - 10, healthWidth * (e.health / e.maxHealth), healthHeight)
        }

        // Eye effect
        const eyeX = e.x + Math.cos(Math.atan2(cy - e.y, cx - e.x)) * e.size * 0.3
        const eyeY = e.y + Math.sin(Math.atan2(cy - e.y, cx - e.x)) * e.size * 0.3
        ctx.fillStyle = `hsla(${e.hue}, 100%, 90%, ${stunAlpha})`
        ctx.beginPath()
        ctx.arc(eyeX, eyeY, e.size * 0.25, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw cursor
      if (mouse.active && gameStateRef.current === 'playing') {
        const cursorHue = currentMode === 'repel' ? 0 : currentMode === 'attract' ? 120 : currentMode === 'vortex' ? 200 : 50

        ctx.strokeStyle = `hsla(${cursorHue}, 80%, 60%, 0.5)`
        ctx.lineWidth = 2
        ctx.setLineDash([8, 8])
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, FORCE_RADIUS, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        for (let i = 0; i < 3; i++) {
          const phase = (time * 0.02 + i / 3) % 1
          const radius = FORCE_RADIUS * phase
          const alpha = (1 - phase) * 0.4

          ctx.strokeStyle = `hsla(${cursorHue}, 90%, 65%, ${alpha})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2)
          ctx.stroke()
        }

        const centerGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 40)
        centerGradient.addColorStop(0, `hsla(${cursorHue}, 100%, 70%, 0.6)`)
        centerGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = centerGradient
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 40, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()

      // Draw UI overlay
      if (showUI) {
        // Energy bar
        const energyWidth = 200
        const energyHeight = 8
        const energyX = width - energyWidth - 20
        const energyY = 20
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(energyX, energyY, energyWidth, energyHeight)
        ctx.fillStyle = `hsl(${50 + energyRef.current}, 100%, 50%)`
        ctx.fillRect(energyX, energyY, energyWidth * (energyRef.current / 100), energyHeight)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.strokeRect(energyX, energyY, energyWidth, energyHeight)

        ctx.fillStyle = 'white'
        ctx.font = '12px system-ui'
        ctx.textAlign = 'right'
        ctx.fillText('ENERGY', energyX - 10, energyY + 8)
      }
    }

    const animate = () => {
      timeRef.current += 1
      updateGame()
      updateParticles()
      updateShake()
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
      if (modeRef.current === 'blast') {
        triggerBlast(mouseRef.current.x, mouseRef.current.y)
      }
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
      mouseRef.current.x = touch.clientX
      mouseRef.current.y = touch.clientY
      mouseRef.current.active = true
      if (modeRef.current === 'blast') {
        triggerBlast(touch.clientX, touch.clientY)
      }
    }

    const handleTouchEnd = () => {
      mouseRef.current.active = false
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') setShowUI(prev => !prev)
      if (e.key === '1') setMode('repel')
      if (e.key === '2') setMode('attract')
      if (e.key === '3') setMode('vortex')
      if (e.key === '4') setMode('blast')
      if (e.key === ' ' && gameStateRef.current === 'playing') {
        e.preventDefault()
        triggerBlast(mouseRef.current.x, mouseRef.current.y)
      }
      if ((e.key === 'Enter' || e.key === ' ') && gameStateRef.current !== 'playing') {
        e.preventDefault()
        startGame()
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', handleKeyDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchend', handleTouchEnd)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [showUI, initParticles, spawnEnemy, spawnOrb, startGame])

  return (
    <div className="w-full h-screen bg-[#050312] overflow-hidden relative">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-none" />
      
      {/* Game UI */}
      {showUI && gameState === 'playing' && (
        <>
          {/* Score */}
          <div className="absolute top-4 left-4 z-10">
            <div className="text-5xl font-black text-white tracking-tight">
              {score.toLocaleString()}
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-white/50 text-sm">WAVE {wave}</span>
              {combo > 0 && (
                <span className="text-amber-400 text-sm font-bold animate-pulse">
                  {combo}x COMBO
                </span>
              )}
            </div>
          </div>

          {/* Mode selector */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {(['repel', 'attract', 'vortex', 'blast'] as Mode[]).map((m, i) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                  mode === m
                    ? m === 'repel' ? 'bg-red-500 text-white shadow-lg shadow-red-500/50'
                    : m === 'attract' ? 'bg-green-500 text-white shadow-lg shadow-green-500/50'
                    : m === 'vortex' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                    : 'bg-amber-500 text-white shadow-lg shadow-amber-500/50'
                    : 'bg-white/10 text-white/50 hover:bg-white/20'
                }`}
              >
                {m} <span className="opacity-50">{i + 1}</span>
              </button>
            ))}
          </div>

          {/* Controls hint */}
          <div className="absolute bottom-6 right-6 z-10 text-white/30 text-xs text-right">
            <div>Move to push enemies</div>
            <div>Space/Click for blast (costs energy)</div>
            <div>Collect orbs for points & energy</div>
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
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">{score.toLocaleString()}</div>
                <div className="text-white/50">Wave {wave}</div>
                {score >= highScore && score > 0 && (
                  <div className="text-amber-400 font-bold mt-2">NEW HIGH SCORE!</div>
                )}
                {highScore > 0 && (
                  <div className="text-white/30 text-sm mt-1">Best: {highScore.toLocaleString()}</div>
                )}
              </div>
            )}

            <button
              onClick={startGame}
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold text-xl rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-violet-500/30"
            >
              {gameState === 'menu' ? 'START GAME' : 'PLAY AGAIN'}
            </button>
            
            <p className="text-white/30 text-sm mt-6 max-w-md mx-auto">
              Protect the core from enemies using your force field powers.<br />
              Use 1-4 or buttons to switch modes. Space for blast attack.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
