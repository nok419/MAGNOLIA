import { useEffect, useRef } from "react"

type SignalBackdropCanvasProps = {
  className?: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  len: number
  a: number
  layer: number
}

function randomEdgePos(): number {
  return Math.random() < 0.5
    ? -0.15 + Math.random() * 0.2
    : 0.95 + Math.random() * 0.2
}

export function SignalBackdropCanvas({ className }: SignalBackdropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvasCandidate = canvasRef.current
    if (!canvasCandidate) return
    const canvasElement: HTMLCanvasElement = canvasCandidate

    const contextCandidate = canvasElement.getContext("2d")
    if (!contextCandidate) return
    const context: CanvasRenderingContext2D = contextCandidate

    let animationFrameId = 0
    let dpr = window.devicePixelRatio || 1
    const size = { width: 1, height: 1 }
    const layoutTarget = canvasElement.parentElement ?? canvasElement

    function resize() {
      dpr = window.devicePixelRatio || 1
      // title 全画面と modal 内の両方で使うため、viewport 固定ではなく
      // 親の実寸から canvas 解像度を決めます。
      // 自分自身の style.width / height を測ると、前回値で固定されて右端が追従しなくなります。
      const rect = layoutTarget.getBoundingClientRect()
      size.width = Math.max(1, rect.width)
      size.height = Math.max(1, rect.height)
      canvasElement.width = size.width * dpr
      canvasElement.height = size.height * dpr
      canvasElement.style.width = `${size.width}px`
      canvasElement.style.height = `${size.height}px`
    }

    resize()
    const resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(layoutTarget)
    window.addEventListener("resize", resize)

    const particles: Particle[] = []

    for (let i = 0; i < 160; i += 1) {
      particles.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.04 - Math.random() * 0.06,
        len: 1,
        a: 0.04 + Math.random() * 0.14,
        layer: 0,
      })
    }

    for (let i = 0; i < 55; i += 1) {
      particles.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        vx: 0.15 + Math.random() * 0.35,
        vy: -0.2 - Math.random() * 0.35,
        len: 3 + Math.random() * 10,
        a: 0.08 + Math.random() * 0.18,
        layer: 1,
      })
    }

    for (let i = 0; i < 10; i += 1) {
      particles.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        vx: 1.2 + Math.random() * 1.8,
        vy: -1.0 - Math.random() * 1.5,
        len: 40 + Math.random() * 80,
        a: 0,
        layer: 2,
      })
    }

    for (let i = 0; i < 30; i += 1) {
      particles.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.015 - Math.random() * 0.04,
        len: 2 + Math.random() * 8,
        a: 0.025 + Math.random() * 0.055,
        layer: 3,
      })
    }

    for (let i = 0; i < 12; i += 1) {
      particles.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        vx: (Math.random() - 0.5) * 0.01,
        vy: -0.005 - Math.random() * 0.01,
        len: 2 + Math.random() * 3,
        a: Math.random() * Math.PI * 2,
        layer: 4,
      })
    }

    const scanSources = [
      { id: 0, x: randomEdgePos(), y: Math.random(), intervalMs: 12000, maxRadiusRatio: 0.62, tint: "93, 164, 209" },
      { id: 1, x: randomEdgePos(), y: Math.random(), intervalMs: 15000, maxRadiusRatio: 0.52, tint: "134, 198, 232" },
      { id: 2, x: randomEdgePos(), y: Math.random(), intervalMs: 18500, maxRadiusRatio: 0.44, tint: "200, 230, 255" },
    ]
    const panelRipples = [
      { intervalMs: 13200, phaseOffsetMs: 0, xRatio: 0.5, yRatio: 0.46, maxRadiusRatio: 0.2, tint: "170, 220, 245" },
      { intervalMs: 17800, phaseOffsetMs: 4200, xRatio: 0.54, yRatio: 0.43, maxRadiusRatio: 0.16, tint: "93, 164, 209" },
    ] as const
    const scanCycleMap = new Map<number, number>()

    function step(t: number) {
      const w = size.width
      const h = size.height
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, w, h)

      const nebulaSeeds = [
        { bx: 0.2, by: 0.6, r: 0.22, hue: 210, spd: 0.00003 },
        { bx: 0.7, by: 0.3, r: 0.18, hue: 240, spd: 0.000025 },
        { bx: 0.5, by: 0.8, r: 0.2, hue: 195, spd: 0.000035 },
      ]

      for (const n of nebulaSeeds) {
        const nx = (n.bx + Math.sin(t * n.spd) * 0.04) * w
        const ny = (n.by + Math.cos(t * n.spd * 0.7) * 0.03) * h
        const nr = n.r * w
        const gradient = context.createRadialGradient(nx, ny, 0, nx, ny, nr)
        gradient.addColorStop(0, `hsla(${n.hue}, 50%, 55%, 0.025)`)
        gradient.addColorStop(0.5, `hsla(${n.hue}, 40%, 50%, 0.012)`)
        gradient.addColorStop(1, "transparent")
        context.fillStyle = gradient
        context.fillRect(nx - nr, ny - nr, nr * 2, nr * 2)
      }

      for (const particle of particles) {
        if (particle.layer === 2) {
          particle.x += particle.vx
          particle.y += particle.vy
          particle.a *= 0.975
          if (particle.a < 0.01 && Math.random() < 0.004) {
            particle.x = Math.random() * w * 0.5 - 50
            particle.y = h * 0.3 + Math.random() * h * 0.6
            particle.a = 0.35 + Math.random() * 0.45
          }
        } else if (particle.layer === 3) {
          particle.x += particle.vx
          particle.y += particle.vy
          if (particle.y < -20) {
            particle.y = h + 20
            particle.x = Math.random() * w
          }
          if (particle.x < -20) particle.x = w + 20
          if (particle.x > w + 20) particle.x = -20
          const flicker = Math.random() < 0.015 ? 0.4 : 1
          context.fillStyle = `rgba(93, 164, 209, ${particle.a * flicker})`
          context.fillRect(particle.x, particle.y, particle.len, 1.5)
          continue
        } else if (particle.layer === 4) {
          particle.x += particle.vx
          particle.y += particle.vy
          if (particle.y < -10) {
            particle.y = h + 10
            particle.x = Math.random() * w
          }
          const brightness = 0.06 + 0.1 * Math.sin(t * 0.0008 + particle.a)
          const radius = particle.len * (0.8 + 0.2 * Math.sin(t * 0.0012 + particle.a))
          context.fillStyle = `rgba(200, 230, 255, ${brightness})`
          context.beginPath()
          context.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
          context.fill()
          context.fillStyle = `rgba(140, 190, 240, ${brightness * 0.3})`
          context.beginPath()
          context.arc(particle.x, particle.y, radius * 2.5, 0, Math.PI * 2)
          context.fill()
          continue
        } else {
          particle.x += particle.vx
          particle.y += particle.vy
          if (particle.y < -50) {
            particle.y = h + 50
            particle.x = Math.random() * w
          }
          if (particle.x < -50) particle.x = w + 50
          if (particle.x > w + 50) particle.x = -50
        }

        if (particle.layer === 0) {
          if (particle.a > 0.005) {
            const flicker = 0.7 + 0.3 * Math.sin(t * 0.002 + particle.x)
            context.fillStyle = `rgba(130, 190, 240, ${particle.a * flicker})`
            context.fillRect(particle.x, particle.y, 1.5, 1.5)
          }
        } else if (particle.layer === 1 || (particle.layer === 2 && particle.a > 0.01)) {
          context.beginPath()
          context.moveTo(particle.x, particle.y)
          const trailMultiplier = particle.layer === 2 ? 6 : 2
          context.lineTo(
            particle.x - particle.vx * trailMultiplier,
            particle.y - particle.vy * trailMultiplier,
          )
          const gradient = context.createLinearGradient(
            particle.x,
            particle.y,
            particle.x - particle.vx * trailMultiplier,
            particle.y - particle.vy * trailMultiplier,
          )
          gradient.addColorStop(0, `rgba(180, 220, 255, ${particle.a})`)
          gradient.addColorStop(1, "rgba(180, 220, 255, 0)")
          context.strokeStyle = gradient
          context.lineWidth = particle.layer === 2 ? 1.5 : 1
          context.stroke()
        }
      }

      // 超長周期 (約 22 秒 / 27 秒) で呼吸する 2 つの大域的なグロー。
      // 静謐さを保ちつつ、画面全体に「息づく空気」を加える。
      const horizonBreathe = 0.85 + 0.15 * Math.sin(t * 0.00029)
      const horizonCenterX = w * (0.5 + Math.sin(t * 0.000045) * 0.03)
      const horizonGlow = context.createRadialGradient(
        horizonCenterX, h * 0.36, 0,
        horizonCenterX, h * 0.36, w * (0.44 + 0.03 * horizonBreathe),
      )
      horizonGlow.addColorStop(0, `rgba(80, 140, 200, ${(0.06 * horizonBreathe).toFixed(3)})`)
      horizonGlow.addColorStop(1, "transparent")
      context.fillStyle = horizonGlow
      context.fillRect(0, 0, w, h)

      const warmBreathe = 0.7 + 0.3 * Math.sin(t * 0.00023 + 1.8)
      const warmGlow = context.createRadialGradient(w * 0.75, h * 0.25, 0, w * 0.75, h * 0.25, w * 0.3)
      warmGlow.addColorStop(0, `rgba(200, 160, 100, ${(0.015 * warmBreathe).toFixed(3)})`)
      warmGlow.addColorStop(1, "transparent")
      context.fillStyle = warmGlow
      context.fillRect(0, 0, w, h)

      const auroraY = h * 0.75 + Math.sin(t * 0.0002) * h * 0.05
      const auroraGradient = context.createLinearGradient(0, auroraY - h * 0.08, 0, auroraY + h * 0.08)
      auroraGradient.addColorStop(0, "transparent")
      auroraGradient.addColorStop(0.5, `rgba(80, 160, 200, ${0.012 + 0.008 * Math.sin(t * 0.0003)})`)
      auroraGradient.addColorStop(1, "transparent")
      context.fillStyle = auroraGradient
      context.fillRect(0, auroraY - h * 0.08, w, h * 0.16)

      for (const source of scanSources) {
        const currentCycle = Math.floor(t / source.intervalMs)
        if (scanCycleMap.get(source.id) !== currentCycle) {
          scanCycleMap.set(source.id, currentCycle)
          source.x = randomEdgePos()
          source.y = Math.random()
        }

        for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
          const progress = ((t + ringIndex * (source.intervalMs / 3)) % source.intervalMs) / source.intervalMs
          const maxRadius = w * source.maxRadiusRatio
          const radius = 36 + progress * maxRadius
          const alpha = (1 - progress) * 0.085
          context.beginPath()
          context.arc(
            source.x * w,
            source.y * h,
            radius,
            Math.PI * (0.14 + ringIndex * 0.08),
            Math.PI * (1.58 + ringIndex * 0.08),
          )
          context.strokeStyle = `rgba(${source.tint}, ${alpha.toFixed(3)})`
          context.lineWidth = 1.2 + (1 - progress) * 0.9
          context.stroke()
        }
      }

      for (const ripple of panelRipples) {
        const progress = ((t + ripple.phaseOffsetMs) % ripple.intervalMs) / ripple.intervalMs
        const eased = progress * progress
        const centerX = w * ripple.xRatio
        const centerY = h * ripple.yRatio
        const maxRadius = w * ripple.maxRadiusRatio
        const radius = 28 + eased * maxRadius
        const edgeAlpha = (1 - progress) * 0.08

        // 中央パネル背後でも見えるよう、title の中心付近専用の低速波紋を重ねる。
        // 画面全体の走査波とは別に、ロゴ周辺の「受信感」を少しだけ足す。
        context.beginPath()
        context.arc(centerX, centerY, radius, Math.PI * 0.1, Math.PI * 1.9)
        context.strokeStyle = `rgba(${ripple.tint}, ${edgeAlpha.toFixed(3)})`
        context.lineWidth = 1.4 + (1 - progress) * 0.8
        context.stroke()

        const glow = context.createRadialGradient(centerX, centerY, radius * 0.55, centerX, centerY, radius * 1.2)
        glow.addColorStop(0, "rgba(170, 220, 245, 0)")
        glow.addColorStop(0.7, `rgba(${ripple.tint}, ${(edgeAlpha * 0.35).toFixed(3)})`)
        glow.addColorStop(1, "rgba(170, 220, 245, 0)")
        context.fillStyle = glow
        context.fillRect(centerX - radius * 1.25, centerY - radius * 1.25, radius * 2.5, radius * 2.5)
      }

      const interferenceBands = [
        { intervalMs: 18000, phaseOffsetMs: 0, centerYRatio: 0.24, tilt: -0.16, thickness: 68 },
        { intervalMs: 22000, phaseOffsetMs: 4800, centerYRatio: 0.6, tilt: 0.12, thickness: 82 },
        { intervalMs: 16000, phaseOffsetMs: 9200, centerYRatio: 0.42, tilt: -0.05, thickness: 54 },
        { intervalMs: 26000, phaseOffsetMs: 12800, centerYRatio: 0.78, tilt: 0.04, thickness: 112 },
      ] as const

      for (const band of interferenceBands) {
        const progress = ((t + band.phaseOffsetMs) % band.intervalMs) / band.intervalMs
        const centerX = (-0.42 + progress * 1.84) * w
        const centerY =
          h * band.centerYRatio +
          Math.sin((t + band.phaseOffsetMs) * 0.00022) * h * 0.05
        const bandWidth = w * 0.72

        context.save()
        context.translate(centerX, centerY)
        context.rotate(band.tilt)

        const bandGradient = context.createLinearGradient(-bandWidth / 2, 0, bandWidth / 2, 0)
        bandGradient.addColorStop(0, "rgba(93, 164, 209, 0)")
        bandGradient.addColorStop(0.18, "rgba(93, 164, 209, 0.015)")
        bandGradient.addColorStop(0.5, "rgba(164, 216, 244, 0.05)")
        bandGradient.addColorStop(0.82, "rgba(93, 164, 209, 0.015)")
        bandGradient.addColorStop(1, "rgba(93, 164, 209, 0)")
        context.fillStyle = bandGradient
        context.fillRect(-bandWidth / 2, -band.thickness / 2, bandWidth, band.thickness)

        for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
          const y = -band.thickness / 2 + (band.thickness / 5) * lineIndex + Math.sin(t * 0.0018 + lineIndex) * 2
          context.strokeStyle = `rgba(188, 228, 250, ${0.016 + ((lineIndex + 1) % 2) * 0.012})`
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(-bandWidth * 0.45, y)
          context.lineTo(bandWidth * 0.45, y - 3)
          context.stroke()
        }

        context.restore()
      }

      const panelBands = [
        { intervalMs: 14800, phaseOffsetMs: 1800, centerYRatio: 0.47, tilt: -0.025, thickness: 96, widthRatio: 0.62 },
        { intervalMs: 19600, phaseOffsetMs: 7600, centerYRatio: 0.53, tilt: 0.018, thickness: 72, widthRatio: 0.56 },
      ] as const

      for (const band of panelBands) {
        const progress = ((t + band.phaseOffsetMs) % band.intervalMs) / band.intervalMs
        const pulse = 0.55 + 0.45 * Math.sin((t + band.phaseOffsetMs) * 0.00022)
        const centerX = w * (0.5 + Math.sin((t + band.phaseOffsetMs) * 0.00015) * 0.04)
        const centerY = h * band.centerYRatio + Math.sin((t + band.phaseOffsetMs) * 0.00031) * h * 0.015
        const bandWidth = w * band.widthRatio

        // 干渉帯は title の中心にも常に少し残し、ロゴ付近が静かすぎないようにする。
        context.save()
        context.translate(centerX, centerY)
        context.rotate(band.tilt)

        const bandGradient = context.createLinearGradient(-bandWidth / 2, 0, bandWidth / 2, 0)
        bandGradient.addColorStop(0, "rgba(93, 164, 209, 0)")
        bandGradient.addColorStop(0.18, `rgba(93, 164, 209, ${(0.016 * pulse).toFixed(3)})`)
        bandGradient.addColorStop(0.5, `rgba(210, 240, 255, ${(0.055 * pulse).toFixed(3)})`)
        bandGradient.addColorStop(0.82, `rgba(93, 164, 209, ${(0.016 * pulse).toFixed(3)})`)
        bandGradient.addColorStop(1, "rgba(93, 164, 209, 0)")
        context.fillStyle = bandGradient
        context.fillRect(-bandWidth / 2, -band.thickness / 2, bandWidth, band.thickness)

        for (let lineIndex = 0; lineIndex < 6; lineIndex += 1) {
          const lineY =
            -band.thickness / 2 +
            (band.thickness / 6) * lineIndex +
            Math.sin(t * 0.0012 + lineIndex * 0.8 + progress * Math.PI * 2) * 2.4
          context.strokeStyle = `rgba(225, 244, 255, ${(0.012 + (lineIndex % 2) * 0.01).toFixed(3)})`
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(-bandWidth * 0.46, lineY)
          context.lineTo(bandWidth * 0.46, lineY - 2.2)
          context.stroke()
        }

        context.restore()
      }

      const rollingBands = [
        { intervalMs: 14500, phaseOffsetMs: 2600, baseYRatio: 0.18, bandHeight: 42 },
        { intervalMs: 19800, phaseOffsetMs: 9100, baseYRatio: 0.68, bandHeight: 58 },
        { intervalMs: 23800, phaseOffsetMs: 14100, baseYRatio: 0.48, bandHeight: 30 },
      ] as const

      for (const band of rollingBands) {
        const progress = ((t + band.phaseOffsetMs) % band.intervalMs) / band.intervalMs
        const centerY = (-0.24 + progress * 1.52) * h + h * band.baseYRatio
        const bandGradient = context.createLinearGradient(0, centerY - band.bandHeight / 2, 0, centerY + band.bandHeight / 2)
        bandGradient.addColorStop(0, "rgba(170, 220, 245, 0)")
        bandGradient.addColorStop(0.2, "rgba(170, 220, 245, 0.018)")
        bandGradient.addColorStop(0.5, "rgba(210, 240, 255, 0.055)")
        bandGradient.addColorStop(0.8, "rgba(170, 220, 245, 0.018)")
        bandGradient.addColorStop(1, "rgba(170, 220, 245, 0)")
        context.fillStyle = bandGradient
        context.fillRect(0, centerY - band.bandHeight / 2, w, band.bandHeight)

        for (let lineIndex = 0; lineIndex < 8; lineIndex += 1) {
          const lineY =
            centerY -
            band.bandHeight * 0.4 +
            lineIndex * (band.bandHeight / 7) +
            Math.sin(t * 0.0022 + lineIndex * 0.9) * 1.5
          context.strokeStyle = `rgba(225, 244, 255, ${0.012 + (lineIndex % 3) * 0.007})`
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(0, lineY)
          context.lineTo(w, lineY + Math.sin(t * 0.0015 + lineIndex) * 2.4)
          context.stroke()
        }
      }

      if (Math.random() < 0.01) {
        const sy = Math.random() * h
        context.fillStyle = `rgba(93, 164, 209, ${0.03 + Math.random() * 0.04})`
        context.fillRect(0, sy, w, 1 + Math.random() * 2)
      }

      if (Math.random() < 0.003) {
        const ty = Math.random() * h
        const tw = 60 + Math.random() * 200
        const tx = Math.random() * w
        context.fillStyle = `rgba(93, 164, 209, ${0.02 + Math.random() * 0.03})`
        context.fillRect(tx, ty, tw, 1)
      }

      animationFrameId = window.requestAnimationFrame(step)
    }

    animationFrameId = window.requestAnimationFrame(step)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={["title-screen__particles", className].filter(Boolean).join(" ")}
    />
  )
}
