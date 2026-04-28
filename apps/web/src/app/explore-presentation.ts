import type {
  ContentBundle,
  RebootSequencePresentationRequest,
  RebootSettlePresentationRequest,
  ReleasePresentationRequest,
  RestrictionPresentationRequest,
  SystemMessagePresentationRequest,
} from "@magnolia/contracts"

export const REBOOT_SEQUENCE_CUE_ID = "system.reboot.sequence"
export const REBOOT_SETTLE_CUE_ID = "system.reboot.settle"
export const RELEASE_SEQUENCE_CUE_ID = "tutorial.restriction.release"
export const REBOOT_SETTLE_BLACKOUT_RATIO = 0.42

const DEFAULT_OVERLAY_DURATION_MS = 1200
const DEFAULT_REBOOT_DURATION_MS = 5200
// reboot 本編終了直後の "一息" 区間。前半は「真っ暗 + 自機のみ」を保ち、
// 後半で HUD と視界フォグ/円/スキャンを立ち上げる。
const DEFAULT_REBOOT_SETTLE_DURATION_MS = 2200
const DEFAULT_RELEASE_DURATION_MS = 1200

export type OverlayPresentationRequest =
  | SystemMessagePresentationRequest
  | RebootSequencePresentationRequest
  | RebootSettlePresentationRequest
  | RestrictionPresentationRequest
  | ReleasePresentationRequest

export type ExplorePresentationState =
  | {
      kind: "none"
      blocksInput: false
      pausesWorld: false
      hidesHud: false
      hidesItemPopups: false
    }
  | {
      kind: "reboot"
      requestId: string
      durationMs: number
      blocksInput: true
      pausesWorld: true
      hidesHud: true
      hidesItemPopups: true
    }
  | {
      kind: "reboot-settle"
      requestId: string
      durationMs: number
      blocksInput: true
      pausesWorld: true
      hidesHud: false
      hidesItemPopups: true
    }
  | {
      kind: "release"
      requestId: string
      durationMs: number
      blocksInput: true
      pausesWorld: false
      hidesHud: false
      hidesItemPopups: false
    }

const NO_EXPLORE_PRESENTATION: ExplorePresentationState = {
  kind: "none",
  blocksInput: false,
  pausesWorld: false,
  hidesHud: false,
  hidesItemPopups: false,
}

export function readPresentationDurationMs(
  content: ContentBundle | null,
  cueId: string,
): number {
  const configuredDurationMs = (
    content?.presentationCues as Record<string, { defaultDurationMs?: number }> | undefined
  )?.[cueId]?.defaultDurationMs
  if (typeof configuredDurationMs === "number" && configuredDurationMs > 0) {
    return configuredDurationMs
  }

  switch (cueId) {
    case REBOOT_SEQUENCE_CUE_ID:
      return DEFAULT_REBOOT_DURATION_MS
    case REBOOT_SETTLE_CUE_ID:
      return DEFAULT_REBOOT_SETTLE_DURATION_MS
    case RELEASE_SEQUENCE_CUE_ID:
      return DEFAULT_RELEASE_DURATION_MS
    default:
      return DEFAULT_OVERLAY_DURATION_MS
  }
}

export function readExplorePresentationState(
  presentation: OverlayPresentationRequest | null,
  content: ContentBundle | null,
): ExplorePresentationState {
  if (!presentation) {
    return NO_EXPLORE_PRESENTATION
  }

  switch (presentation.cueId) {
    case REBOOT_SEQUENCE_CUE_ID:
      return {
        kind: "reboot",
        requestId: presentation.requestId,
        durationMs: readPresentationDurationMs(content, presentation.cueId),
        // reboot 中は世界も入力も止め、演出完了後にだけ通常探索へ戻します。
        blocksInput: true,
        pausesWorld: true,
        hidesHud: true,
        hidesItemPopups: true,
      }
    case REBOOT_SETTLE_CUE_ID:
      return {
        kind: "reboot-settle",
        requestId: presentation.requestId,
        durationMs: readPresentationDurationMs(content, presentation.cueId),
        // reboot 本編と operational の間の "一息" 区間。
        // HUD は CSS 側で blackout 後に浮上させたいので hidesHud=false のまま渡し、
        // ExploreScreen / ExploreCanvas が同じ duration を共有して描画をそろえます。
        blocksInput: true,
        pausesWorld: true,
        hidesHud: false,
        hidesItemPopups: true,
      }
    case RELEASE_SEQUENCE_CUE_ID:
      return {
        kind: "release",
        requestId: presentation.requestId,
        durationMs: readPresentationDurationMs(content, presentation.cueId),
        // release は世界を進めたまま境界解除を見せたいので、入力だけ止めます。
        blocksInput: true,
        pausesWorld: false,
        hidesHud: false,
        hidesItemPopups: false,
      }
    default:
      return NO_EXPLORE_PRESENTATION
  }
}

export function shouldAutoDismissOverlayPresentation(
  presentation: OverlayPresentationRequest | null,
): boolean {
  if (!presentation) {
    return false
  }

  return (
    !presentation.blocking ||
    presentation.cueId === REBOOT_SEQUENCE_CUE_ID ||
    presentation.cueId === REBOOT_SETTLE_CUE_ID ||
    presentation.cueId === RELEASE_SEQUENCE_CUE_ID
  )
}
