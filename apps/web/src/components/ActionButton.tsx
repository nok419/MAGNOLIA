import { forwardRef } from "react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type ActionButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "primary" | "ghost" | "danger"
  }
>

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({
  children,
  className,
  tone = "primary",
  type = "button",
  ...rest
}, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      type={type}
      className={["action-button", `action-button--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  )
})
