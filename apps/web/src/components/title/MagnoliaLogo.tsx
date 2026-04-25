import { useEffect, useRef } from "react"

type GlitchChannel = "r" | "c"

type GlitchFrame = {
  top: number
  bottom: number
  left: number
  right: number
  shift: number
  skew: number
  scale: number
  opacity: number
}

type MagnoliaLogoProps = {
  as?: "h1" | "div"
  className?: string
  text?: string
}

function hiddenGlitchFrame(): GlitchFrame {
  return {
    top: 100,
    bottom: 0,
    left: 0,
    right: 0,
    shift: 0,
    skew: 0,
    scale: 1,
    opacity: 0,
  }
}

function createRandomGlitchFrame(direction: -1 | 1): GlitchFrame {
  const bandHeight = 8 + Math.random() * 22
  const top = Math.random() * (78 - bandHeight)
  const bottom = 100 - top - bandHeight
  const bandWidth = 10 + Math.random() * 24
  const left = Math.random() * (100 - bandWidth)
  const right = 100 - left - bandWidth
  const shiftBase = 8 + Math.random() * 18
  return {
    top,
    bottom,
    left,
    right,
    shift: direction * shiftBase * (0.8 + Math.random() * 0.7),
    skew: direction * (0.6 + Math.random() * 2.8),
    scale: 1 + Math.random() * 0.035,
    opacity: 0.4 + Math.random() * 0.55,
  }
}

function applyGlitchFrame(
  wrap: HTMLDivElement,
  channel: GlitchChannel,
  frame: GlitchFrame,
): void {
  wrap.style.setProperty(`--title-glitch-${channel}-top`, `${frame.top.toFixed(2)}%`)
  wrap.style.setProperty(`--title-glitch-${channel}-bottom`, `${frame.bottom.toFixed(2)}%`)
  wrap.style.setProperty(`--title-glitch-${channel}-left`, `${frame.left.toFixed(2)}%`)
  wrap.style.setProperty(`--title-glitch-${channel}-right`, `${frame.right.toFixed(2)}%`)
  wrap.style.setProperty(`--title-glitch-${channel}-shift`, `${frame.shift.toFixed(1)}px`)
  wrap.style.setProperty(`--title-glitch-${channel}-skew`, `${frame.skew.toFixed(2)}deg`)
  wrap.style.setProperty(`--title-glitch-${channel}-scale`, frame.scale.toFixed(3))
  wrap.style.setProperty(`--title-glitch-${channel}-opacity`, frame.opacity.toFixed(3))
}

export function MagnoliaLogo({
  as = "h1",
  className,
  text = "MAGNOLIA",
}: MagnoliaLogoProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const HeadingTag = as

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let burstTimer = 0
    const frameTimers = new Set<number>()

    const clearGlitch = () => {
      applyGlitchFrame(wrap, "r", hiddenGlitchFrame())
      applyGlitchFrame(wrap, "c", hiddenGlitchFrame())
    }

    const scheduleBurst = () => {
      burstTimer = window.setTimeout(() => {
        const burstSteps = 2 + Math.floor(Math.random() * 4)
        let elapsed = 0

        for (let stepIndex = 0; stepIndex < burstSteps; stepIndex += 1) {
          elapsed += 24 + Math.random() * 56
          const stepTimer = window.setTimeout(() => {
            applyGlitchFrame(wrap, "r", createRandomGlitchFrame(1))
            applyGlitchFrame(wrap, "c", createRandomGlitchFrame(-1))
            frameTimers.delete(stepTimer)
          }, elapsed)
          frameTimers.add(stepTimer)
        }

        const settleTimer = window.setTimeout(() => {
          clearGlitch()
          frameTimers.delete(settleTimer)
          scheduleBurst()
        }, elapsed + 80 + Math.random() * 160)
        frameTimers.add(settleTimer)
      }, 700 + Math.random() * 2600)
    }

    // グリッチはロゴごとの局所演出なので、この部品内で完結させます。
    clearGlitch()
    scheduleBurst()

    return () => {
      window.clearTimeout(burstTimer)
      frameTimers.forEach((timerId) => window.clearTimeout(timerId))
      frameTimers.clear()
      clearGlitch()
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={["title-screen__logo-wrap", className].filter(Boolean).join(" ")}
    >
      <HeadingTag className="title-screen__logo">{text}</HeadingTag>
      <HeadingTag
        className="title-screen__logo title-screen__logo--glitch-r"
        aria-hidden="true"
      >
        {text}
      </HeadingTag>
      <HeadingTag
        className="title-screen__logo title-screen__logo--glitch-c"
        aria-hidden="true"
      >
        {text}
      </HeadingTag>
    </div>
  )
}
