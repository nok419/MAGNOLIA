import { useEffect, useRef, useState } from "react"

// スクランブル演出用のグリフ。重みは「ブロック系を多めに、しかしカナ・記号で個性を出す」狙い。
// ▮▯■□ などの縦長は等幅で並ばないことがあるので、安定して横揺れしない文字を選んでいます。
const BLOCK_GLYPHS = ["░", "▒", "▓", "█", "▚", "▞", "▙", "▟"]
const KANA_GLYPHS = [
  "ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ",
  "サ", "シ", "ス", "セ", "ソ", "タ", "チ", "ツ", "テ", "ト",
  "ノ", "ヰ", "ヱ", "ヲ", "ン",
]
const SYMBOL_GLYPHS = ["#", "%", "&", "@", "*", "+", "=", "/", "\\", ":", ";"]
const ALNUM_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")

const SCRAMBLE_POOL = [
  ...BLOCK_GLYPHS, ...BLOCK_GLYPHS,           // ブロック系を厚めに
  ...KANA_GLYPHS,
  ...SYMBOL_GLYPHS,
  ...ALNUM_GLYPHS,
]

type SegmentKind = "char" | "space"

type Segment = {
  kind: SegmentKind
  source: string
  target: string
  // フレーム単位の収束スケジュール。reduceMotion 時は使わない。
  startFrame: number
  endFrame: number
  // 直近に表示したスクランブル文字。連続フレームで完全ランダムにすると点滅が激しいので、保持して時々だけ更新する。
  currentScramble: string
}

export type ScrambleOptions = {
  /**
   * 1 文字あたりのスクランブル継続フレーム数の最大値。
   * フレーム間隔は requestAnimationFrame ベース（≒16ms）。
   * 既定 18 は大体 280ms 弱で 1 文字が落ち着く想定。
   */
  framesPerGlyph?: number
  /**
   * すべての文字が落ち着くまでにかける最大フレーム数。
   * 文字数が多いほど自動で広がるが、上限を設けて UX を一定に保つ。
   */
  maxFrames?: number
  /**
   * scramble 中、毎フレーム新しい文字に置き換える確率（0〜1）。
   * 値が小さいほど落ち着いた、anime.js テキストスクランブル風になる。
   */
  shuffleProbability?: number
  /**
   * reduceFlashing/reduceMotion 時にスクランブルを完全に無効化するか。
   * 既定 true。false にすると低密度スクランブルだけ残る（テストや導線用途）。
   */
  disableOnReduceMotion?: boolean
  /**
   * reduceFlashing が真のときに使う低密度スクランブル設定。
   * disableOnReduceMotion が false のときだけ意味を持つ。
   */
  reducedShuffleProbability?: number
}

const DEFAULT_OPTIONS: Required<Omit<ScrambleOptions, "reducedShuffleProbability">> & {
  reducedShuffleProbability: number
} = {
  framesPerGlyph: 18,
  maxFrames: 60,
  shuffleProbability: 0.32,
  disableOnReduceMotion: true,
  reducedShuffleProbability: 0.08,
}

function pickGlyph(): string {
  const idx = Math.floor(Math.random() * SCRAMBLE_POOL.length)
  return SCRAMBLE_POOL[idx] ?? "░"
}

function shouldDisableMotion(reduceFlashing: boolean | undefined): boolean {
  if (reduceFlashing) return true
  if (typeof window === "undefined") return false
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
  return Boolean(query?.matches)
}

function buildSegments(target: string, fromText: string, opts: typeof DEFAULT_OPTIONS): Segment[] {
  // 等幅前提の単純実装。target と fromText の長さが違う場合は target に合わせて切る/詰める。
  const length = target.length
  const baseDelay = Math.min(opts.maxFrames * 0.4, length * 0.6)
  return Array.from({ length }, (_, index) => {
    const targetChar = target[index] ?? " "
    const sourceChar = fromText[index] ?? " "
    if (/\s/u.test(targetChar)) {
      return {
        kind: "space" as const,
        source: sourceChar,
        target: targetChar,
        startFrame: 0,
        endFrame: 0,
        currentScramble: targetChar,
      }
    }
    // 文字ごとの収束開始/終了フレームをずらして「左から右に解錠」するような流れを作る。
    const stagger = (index / Math.max(1, length - 1)) * baseDelay
    const startFrame = Math.floor(stagger * 0.6)
    const endFrame = Math.min(
      opts.maxFrames,
      startFrame + Math.floor(opts.framesPerGlyph * (0.6 + Math.random() * 0.6)),
    )
    return {
      kind: "char" as const,
      source: sourceChar,
      target: targetChar,
      startFrame,
      endFrame,
      currentScramble: pickGlyph(),
    }
  })
}

export type UseScrambleTextInput = {
  text: string
  /**
   * このキーが変わるたびにスクランブルを発火する。
   * undefined のままだと初回のみ発火。
   */
  trigger?: string | number
  /** 表示オプション側の reduceFlashing と接続する想定。 */
  reduceFlashing?: boolean
  options?: ScrambleOptions
}

/**
 * 文字を ░▒▓█ などでシャッフルし、徐々に target に収束させていく React フック。
 * - reduceFlashing/prefers-reduced-motion 時は target を即時返す。
 * - 同じ text に対して trigger だけ変えれば再発火できるので、被弾などのイベントに同期させやすい。
 */
export function useScrambleText({
  text,
  trigger,
  reduceFlashing,
  options,
}: UseScrambleTextInput): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const motionDisabled = shouldDisableMotion(reduceFlashing) && opts.disableOnReduceMotion

  const [output, setOutput] = useState<string>(motionDisabled ? text : text)
  const segmentsRef = useRef<Segment[]>([])
  const frameRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const previousTextRef = useRef<string>(text)

  useEffect(() => {
    // motion 無効時はフェイル・ファストで target をそのまま返す。
    if (motionDisabled) {
      setOutput(text)
      previousTextRef.current = text
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (typeof requestAnimationFrame === "undefined") {
      setOutput(text)
      return
    }

    const fromText = previousTextRef.current
    segmentsRef.current = buildSegments(text, fromText, opts)
    frameRef.current = 0
    previousTextRef.current = text

    const shuffleProb = reduceFlashing
      ? opts.reducedShuffleProbability
      : opts.shuffleProbability

    const tick = (): void => {
      const segments = segmentsRef.current
      const currentFrame = frameRef.current
      let stillScrambling = false
      let buffer = ""

      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i]
        if (!segment) continue
        if (segment.kind === "space") {
          buffer += segment.target
          continue
        }
        if (currentFrame >= segment.endFrame) {
          buffer += segment.target
          continue
        }
        if (currentFrame < segment.startFrame) {
          // まだ「乱され始めていない」位置。元の文字を見せておく。長さが足りない場合は乱数で埋める。
          buffer += segment.source && !/\s/u.test(segment.source) ? segment.source : pickGlyph()
          stillScrambling = true
          continue
        }
        // scramble 区間。確率で文字を更新し、それ以外は前回の文字をキープ（点滅を抑える）。
        if (Math.random() < shuffleProb) {
          segment.currentScramble = pickGlyph()
        }
        buffer += segment.currentScramble
        stillScrambling = true
      }

      setOutput(buffer)
      frameRef.current = currentFrame + 1

      if (stillScrambling) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // text/trigger いずれかの変化で再発火。options は安定参照前提（呼び出し側が再生成してくる場合は trigger で同期する想定）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, trigger, motionDisabled])

  return output
}
