import type { EquipmentSlot } from "@magnolia/contracts"

type SignalTone = "lost" | "weak" | "moderate" | "strong" | "locked"

export function classifySignalStrength(
  strength: number,
): { label: string; tone: SignalTone } {
  if (strength <= 0.01) {
    return { label: "LOST", tone: "lost" }
  }
  if (strength < 0.25) {
    return { label: "WEAK", tone: "weak" }
  }
  if (strength < 0.55) {
    return { label: "MODERATE", tone: "moderate" }
  }
  if (strength < 0.85) {
    return { label: "STRONG", tone: "strong" }
  }
  return { label: "LOCKED", tone: "locked" }
}

export function readEquipmentSlotLabel(
  slot: EquipmentSlot,
  variant: "short" | "long" = "long",
): string {
  if (variant === "short") {
    switch (slot) {
      case "main":
        return "メイン"
      case "sub":
        return "サブ"
      case "os":
        return "OS"
      case "subsystem":
        return "サブシステム"
    }
  }

  switch (slot) {
    case "main":
      return "メイン装備"
    case "sub":
      return "サブ装備"
    case "os":
      return "OS"
    case "subsystem":
      return "サブシステム"
  }
}

export function formatPlayTime(playTimeMs: number): string {
  const totalSeconds = Math.floor(playTimeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
}

export function formatTimestamp(value: string | number | Date | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return new Date(value).toLocaleString("ja-JP")
}
