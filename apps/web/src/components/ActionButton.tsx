import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type ActionButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "primary" | "ghost" | "danger"
  }
>

export function ActionButton({
  children,
  className,
  tone = "primary",
  type = "button",
  ...rest
}: ActionButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={["action-button", `action-button--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  )
}
