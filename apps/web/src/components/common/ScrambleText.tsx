import { useScrambleText, type ScrambleOptions } from "@/hooks/useScrambleText"

type ScrambleTextProps = {
  text: string
  /** trigger を変えるたびに再スクランブルさせる（被弾などのイベント用）。 */
  trigger?: string | number
  reduceFlashing?: boolean
  className?: string
  /** aria-label を明示しないとき、最終 text を読み上げ用に利用する。 */
  ariaLabel?: string
  options?: ScrambleOptions
}

/**
 * 文字をシャッフルしながら target に収束させて表示する。
 * 視覚効果なので aria-hidden は付けず、最終テキストを aria-label で読み上げに渡す（スクリーンリーダーは scramble を聞かない）。
 */
export function ScrambleText({
  text,
  trigger,
  reduceFlashing,
  className,
  ariaLabel,
  options,
}: ScrambleTextProps) {
  const display = useScrambleText({ text, trigger, reduceFlashing, options })
  return (
    <span
      className={["scramble-text", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel ?? text}
    >
      {/* 子要素は視覚専用。ARIA は親 span が担当する。 */}
      <span aria-hidden="true">{display}</span>
    </span>
  )
}
