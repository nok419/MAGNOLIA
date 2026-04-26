import { useEffect, useRef } from "react"

type MenuParticle = {
  x: number
  y: number
  vx: number
  vy: number
  a: number
  r: number
  phase: number
}

export function MenuBackdropCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let animId: number
    const dpr = window.devicePixelRatio || 1

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    resize()

    // 背景粒子は menu 全体の装飾であり、装備や archive の state とは独立させます。
    const particles: MenuParticle[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.05 - Math.random() * 0.15,
      a: 0.05 + Math.random() * 0.15,
      r: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
    }))

    function step(t: number) {
      if (!ctx || !canvas) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      const grad = ctx.createLinearGradient(0, window.innerHeight, 0, 0)
      grad.addColorStop(0, "rgba(93, 164, 209, 0.04)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy
        if (particle.y < -10) {
          particle.y = window.innerHeight + 10
          particle.x = Math.random() * window.innerWidth
        }
        if (particle.x < -10) particle.x = window.innerWidth + 10
        if (particle.x > window.innerWidth + 10) particle.x = -10

        const flicker = 0.6 + 0.4 * Math.sin(t * 0.001 + particle.phase)
        ctx.fillStyle = `rgba(140, 200, 255, ${particle.a * flicker})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        ctx.fill()
      }
      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
  }, [])

  return <canvas ref={canvasRef} className="menu-screen__bg" />
}
