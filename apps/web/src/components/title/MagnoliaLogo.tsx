import { useEffect, useRef } from "react"
import {
  resolveTitleSignalDistortion,
  type TitleSignalDistortionFrame,
  type TitleSignalGlitchChannel,
} from "@/app/signal-distortion"
import { seededRange, seededUnit } from "@/app/visual-seed"

type MagnoliaLogoProps = {
  as?: "h1" | "div"
  className?: string
  text?: string
  reduceFlashing?: boolean
}

function applyGlitchFrame(
  wrap: HTMLDivElement,
  channel: TitleSignalGlitchChannel,
  frame: TitleSignalDistortionFrame,
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
  reduceFlashing = false,
}: MagnoliaLogoProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const HeadingTag = as

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let burstTimer = 0
    let burstIndex = 0
    const frameTimers = new Set<number>()

    const clearGlitch = () => {
      const frames = resolveTitleSignalDistortion({
        seed: `title-logo:${text}:hidden`,
        severity: 0,
        reduceFlashing,
      })
      applyGlitchFrame(wrap, "r", frames.r)
      applyGlitchFrame(wrap, "c", frames.c)
    }

    const scheduleBurst = () => {
      if (reduceFlashing) {
        clearGlitch()
        return
      }
      burstTimer = window.setTimeout(() => {
        const burstSeed = `title-logo:${text}:${burstIndex}`
        burstIndex += 1
        const burstSteps = 2 + Math.floor(seededUnit(`${burstSeed}:steps`) * 3)
        let elapsed = 0

        for (let stepIndex = 0; stepIndex < burstSteps; stepIndex += 1) {
          elapsed += seededRange(`${burstSeed}:step:${stepIndex}:delay`, 42, 94)
          const stepTimer = window.setTimeout(() => {
            const frames = resolveTitleSignalDistortion({
              seed: `${burstSeed}:step:${stepIndex}`,
              severity: 3,
              reduceFlashing,
            })
            applyGlitchFrame(wrap, "r", frames.r)
            applyGlitchFrame(wrap, "c", frames.c)
            frameTimers.delete(stepTimer)
          }, elapsed)
          frameTimers.add(stepTimer)
        }

        const settleTimer = window.setTimeout(() => {
          clearGlitch()
          frameTimers.delete(settleTimer)
          scheduleBurst()
        }, elapsed + seededRange(`${burstSeed}:settle`, 90, 180))
        frameTimers.add(settleTimer)
      }, seededRange(`title-logo:${text}:wait:${burstIndex}`, 1200, 3600))
    }

    // DOM 操作は部品内で行い、グリッチ値の決定は SignalDistortion helper に寄せます。
    clearGlitch()
    scheduleBurst()

    return () => {
      window.clearTimeout(burstTimer)
      frameTimers.forEach((timerId) => window.clearTimeout(timerId))
      frameTimers.clear()
      clearGlitch()
    }
  }, [reduceFlashing, text])

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
