import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties, MouseEvent } from "react"
import type {
  ExploreSnapshot,
  ExploreTransitionSourceFrame,
  ShipVariant,
  WorldMapNodeId,
} from "@magnolia/contracts"
import type { ExploreRenderState } from "@magnolia/game-session"
import {
  REBOOT_SETTLE_BLACKOUT_RATIO,
  type ExplorePresentationState,
} from "@/app/explore-presentation"
import type {
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import type { DisplayOptions } from "@/app/display-options"
import { ExploreCanvas, type ExploreOverlayFrame } from "@/components/ExploreCanvas"
import {
  InteractionPromptCallout,
  type InteractionPromptPlacement,
} from "@/components/InteractionPrompt"
import { MiniMap } from "@/components/MiniMap"
import { isCanvasPointVisible, worldToCanvasPoint } from "@/render/shared/coordinates"
import { buildMiniMapViewModel } from "@/view-models/map-view-model"

type ExploreScreenProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  exploreEvents?: TimedPresentationRequest<ExploreChannelPresentationRequest>[]
  itemPopups?: Array<{ id: string; title: string; detail: string }>
  shipVariant: ShipVariant
  showEquipmentHint?: boolean
  onInteractNode?: (nodeId: WorldMapNodeId, context: ExploreInteractionContext) => void
  displayOptions: DisplayOptions
}

type ExploreInteractionContext = {
  nodeId: WorldMapNodeId
  worldPosition: { x: number; y: number }
  sourceFrame: ExploreTransitionSourceFrame
}

// signal パネルは非言語 User Interface（UI）を志向します。
// 波形は将来 Background Music（BGM）の実波形へ差し替えやすいよう、
// 距離スケールと波形プロファイルを分けます。
const WAVEFORM_BAR_COUNT = 136
const STRENGTH_SEGMENT_COUNT = 18
const WAVEFORM_FRAME_MS = 72
const TAU = Math.PI * 2
const OVERLAY_FRAME_EPSILON = 0.25

export function ExploreScreen({
  snapshot,
  renderState,
  presentation,
  exploreEvents = [],
  itemPopups = [],
  shipVariant,
  showEquipmentHint = false,
  onInteractNode,
  displayOptions,
}: ExploreScreenProps) {
  const strength = renderState.nearestTransmissionStrength
  const clampedStrength = Math.max(0, Math.min(1, strength))
  const waveStrength = Math.max(0, Math.min(1, renderState.nearestAnyTransmissionStrength))
  const strongestSignalHint = renderState.signalHints[0]
  const miniMapViewModel = useMemo(
    () => buildMiniMapViewModel({ snapshot, renderState }),
    [snapshot, renderState],
  )
  const completionPct = Math.round(snapshot.hud.currentAreaCompletionRate * 100)
  // featureAccess に応じた "本来見せるべき" パネルの条件。
  // リブート中はこれらに `ehud--booting` クラスを付けて CSS transition で
  // 透明化 → 段階的に浮上させる。表示/非表示の binary 切替ではなく
  // 継続レンダリングで CSS 補間させる設計。
  const canShowInfoPanel =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.infoPanelEnabled
  const canShowStrengthMeter =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.strengthMeterEnabled
  const canShowMiniMap =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.minimapEnabled
  const hudTransitionClass = presentation.hidesHud
    ? " ehud--booting"
    : presentation.kind === "reboot-settle"
      ? " ehud--settling"
      : ""
  const hudTransitionStyle: CSSProperties | undefined =
    presentation.kind === "reboot-settle"
      ? {
          ["--ehud-settle-ms" as keyof CSSProperties]: `${presentation.durationMs}ms`,
          ["--ehud-blackout-ms" as keyof CSSProperties]:
            `${Math.round(presentation.durationMs * REBOOT_SETTLE_BLACKOUT_RATIO)}ms`,
        }
      : undefined
  const [waveformFrame, setWaveformFrame] = useState(0)
  const [overlayFrame, setOverlayFrame] = useState<ExploreOverlayFrame | null>(null)
  const [hasSeenFirstScan, setHasSeenFirstScan] = useState(false)

  const handleOverlayFrame = useCallback((nextFrame: ExploreOverlayFrame) => {
    setOverlayFrame((currentFrame) =>
      isSameOverlayFrame(currentFrame, nextFrame) ? currentFrame : nextFrame,
    )
  }, [])

  useEffect(() => {
    if (!canShowStrengthMeter || presentation.hidesHud) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setWaveformFrame((frame) => (frame + 1) % 100000)
    }, WAVEFORM_FRAME_MS)

    return () => window.clearInterval(timerId)
  }, [canShowStrengthMeter, presentation.hidesHud])

  useEffect(() => {
    // 初回だけ scan の実行を促し、scan pulse が生成されたら誘導を閉じます。
    if (renderState.scanPulses.length > 0) {
      setHasSeenFirstScan(true)
    }
  }, [renderState.scanPulses.length])

  // Background Music（BGM）同期前の仮プロファイルです。低速の包絡線と短いピークを分け、
  // 実波形へ差し替える際も User Interface（UI）側の距離スケールを変えずに済むようにします。
  const waveformBars = useMemo(() => {
    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) =>
      buildSignalWaveformAmplitude(i, waveformFrame),
    )
  }, [waveformFrame])

  const signalPanelStyle: CSSProperties = {
    ...hudTransitionStyle,
    ["--signal-strength" as keyof CSSProperties]: clampedStrength,
    ["--wave-strength" as keyof CSSProperties]: waveStrength,
  }
  const activeStrengthSegments = Math.round(clampedStrength * STRENGTH_SEGMENT_COUNT)
  const signalStabilityPct = Math.round(Math.max(0, Math.min(1, renderState.signalStability)) * 100)
  const scanCooldownPct = Math.round(Math.max(0, Math.min(1, renderState.scanCooldownRatio ?? 1)) * 100)
  const movementModeLabel = readMovementModeLabel(renderState.movementMode)
  const canShowPrompts = presentation.kind === "none"
  const shouldShowScanHint = canShowPrompts && overlayFrame !== null && !hasSeenFirstScan
  const shipPromptPlacement = overlayFrame
    ? resolveInteractionPromptPlacement(overlayFrame.playerPoint, overlayFrame.width, overlayFrame.height)
    : "right-up"

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!canShowPrompts || !overlayFrame || !onInteractNode) {
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest(".ehud, .interaction-prompt, .explore-item-popup-stack")) {
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const hitTarget = readClickableExploreTarget(renderState, overlayFrame, point)
      if (!hitTarget) {
        return
      }
      onInteractNode(hitTarget.nodeId, {
        nodeId: hitTarget.nodeId,
        worldPosition: hitTarget.worldPosition,
        sourceFrame: {
          screenAnchor: hitTarget.screenAnchor,
          playerPoint: overlayFrame.playerPoint,
          viewport: overlayFrame.viewport,
          screenSize: { width: overlayFrame.width, height: overlayFrame.height },
          padding: overlayFrame.padding,
          capturedAtMs: performance.now(),
        },
      })
    },
    [canShowPrompts, onInteractNode, overlayFrame, renderState],
  )

  return (
    <main className="explore-fullscreen" onClick={handleCanvasClick}>
      <ExploreCanvas
        snapshot={snapshot}
        renderState={renderState}
        presentation={presentation}
        exploreEvents={exploreEvents}
        shipVariant={shipVariant}
        onOverlayFrame={handleOverlayFrame}
        displayOptions={displayOptions}
      />

      {/* HUD overlays — OS スロットの有無ではなく、MAGNOLIA が解放した表示機能だけを出します。
           リブート演出中は `ehud--booting` で透明化し、完了後に CSS transition で段階フェードイン。 */}
      {canShowInfoPanel ? (
        <section
          className={`ehud ehud--status${hudTransitionClass}`}
          style={hudTransitionStyle}
          aria-label="status"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />
          <div className="ehud__scanline" />

          <header className="ehud__header">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">STATUS</span>
          </header>

          <h2 className="ehud-status__area">{renderState.currentAreaName}</h2>

          <div className="ehud-status__row">
            <span className="ehud-status__key">completion</span>
            <div className="ehud-status__bar-wrap">
              <div className="ehud-status__bar">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`ehud-status__seg ${i < Math.round(completionPct / 10) ? "ehud-status__seg--on" : ""}`}
                  />
                ))}
              </div>
              <span className="ehud-status__val">{completionPct}%</span>
            </div>
          </div>

          <div className="ehud-status__divider" />

          <div className="ehud-status__equip">
            <EquipSlotRow label="MAIN" value={snapshot.hud.equipped.main ?? "—"} />
            <EquipSlotRow label="SUB" value={snapshot.hud.equipped.sub ?? "—"} />
          </div>

          <div className="ehud-status__divider" />

          <div className="ehud-status__row">
            <span className="ehud-status__key">self-repair</span>
            <span className="ehud-status__val ehud-status__val--accent">
              {snapshot.hud.selfRepairPoints} pt
            </span>
          </div>

          <div className="ehud-status__divider" />

          <div className="ehud-status__receiver" aria-label="receiver posture">
            <div className="ehud-status__row">
              <span className="ehud-status__key">receive</span>
              <span className={`ehud-status__mode ehud-status__mode--${renderState.movementMode}`}>
                {movementModeLabel}
              </span>
            </div>
            <div className="ehud-status__row">
              <span className="ehud-status__key">stable</span>
              <span className="ehud-status__val">{signalStabilityPct}%</span>
            </div>
            <div className="ehud-status__cooldown" aria-hidden="true">
              <span style={{ width: `${scanCooldownPct}%` }} />
            </div>
          </div>
        </section>
      ) : null}

      {canShowStrengthMeter ? (
        <section
          className={`ehud ehud--signal${hudTransitionClass}`}
          style={signalPanelStyle}
          aria-label="signal strength"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />
          <div className="ehud__scanline" />

          <header className="ehud__header">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">SIGNAL</span>
          </header>

          <div className="ehud-signal__body">
            <div className="ehud-signal__frequency" aria-hidden="true">
              <div className="ehud-signal__waveform">
                <span className="ehud-signal__waveform-baseline" />
                <span className="ehud-signal__waveform-cursor" />
                <div className="ehud-signal__waveform-bars">
                  {waveformBars.map((amp, i) => (
                    <span
                      key={i}
                      className="ehud-signal__waveform-bar"
                      style={{
                        ["--bar-amp" as keyof CSSProperties]: amp,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="ehud-signal__strength" aria-hidden="true">
              <div className="ehud-signal__strength-readout">
                <span>{strongestSignalHint ? readSignalHintLabel(strongestSignalHint) : "UNFOUND"}</span>
              </div>
              <div className="ehud-signal__meter">
                <span className="ehud-signal__meter-fill" />
                <span className="ehud-signal__meter-needle" />
                {Array.from({ length: STRENGTH_SEGMENT_COUNT }, (_, index) => (
                  <span
                    key={index}
                    className={`ehud-signal__meter-seg ${
                      index < activeStrengthSegments ? "ehud-signal__meter-seg--on" : ""
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {canShowMiniMap ? (
        <section
          className={`ehud ehud--radar${hudTransitionClass}`}
          style={hudTransitionStyle}
          aria-label="radar"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />

          <header className="ehud__header ehud__header--center">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">RADAR</span>
          </header>

          <MiniMap viewModel={miniMapViewModel} displayOptions={displayOptions} />
        </section>
      ) : null}

      <section className={`ehud ehud--help${hudTransitionClass}`} style={hudTransitionStyle}>
        <p>move — wasd / arrows</p>
        <p>connect — enter / click</p>
        <p>scan — r / click 2</p>
        <p>equipment — e</p>
        <p>map — m</p>
      </section>

      {shouldShowScanHint ? (
        <InteractionPromptCallout
          anchor={overlayFrame.playerPoint}
          placement="left-down"
          keyLabel="R / click 2"
          label="scan"
          tone="cyan"
          ariaLabel="R または click 2 でスキャンを出します"
        />
      ) : null}

      {showEquipmentHint && canShowPrompts && overlayFrame ? (
        <InteractionPromptCallout
          anchor={overlayFrame.playerPoint}
          placement={shipPromptPlacement}
          keyLabel="E"
          label="equipment"
          tone="warm"
          ariaLabel="press E to open equipment"
        />
      ) : null}

      {!presentation.hidesItemPopups && itemPopups.length > 0 ? (
        <div className="explore-item-popup-stack" aria-live="polite">
          {itemPopups.map((popup) => (
            <section key={popup.id} className="explore-item-popup">
              <p className="explore-item-popup__title">{popup.title}</p>
              <p className="explore-item-popup__detail">{popup.detail}</p>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  )
}

function readSignalHintLabel(hint: ExploreRenderState["signalHints"][number]): string {
  const band = hint.distanceBand.toUpperCase()
  if (hint.kind === "equipment") {
    return `EQUIP ${band}`
  }
  if (hint.kind === "repair") {
    return `REPAIR ${band}`
  }
  return `${(hint.category ?? "SIGNAL").toUpperCase()} ${band}`
}

function readMovementModeLabel(mode: ExploreRenderState["movementMode"]): string {
  switch (mode) {
    case "wideScan":
      return "WIDE SCAN"
    case "precisionReceive":
      return "PRECISION"
    case "normal":
    default:
      return "NORMAL"
  }
}

type ExploreClickTarget = {
  nodeId: WorldMapNodeId
  x: number
  y: number
  radius: number
  distanceToPlayer: number
  worldPosition: { x: number; y: number }
  screenAnchor: { x: number; y: number }
}

function readClickableExploreTarget(
  renderState: ExploreRenderState,
  overlayFrame: ExploreOverlayFrame,
  clickPoint: { x: number; y: number },
): ExploreClickTarget | null {
  const candidates: ExploreClickTarget[] = renderState.interactionTargets
    .filter((target) => target.visible && target.clickable)
    .flatMap((target) => {
      const anchor = worldToOverlayPoint(overlayFrame, target.worldPosition.x, target.worldPosition.y)
      if (!isOverlayPointVisible(anchor, overlayFrame)) {
        return []
      }
      return [{
        nodeId: target.nodeId,
        x: anchor.x,
        y: anchor.y,
        radius: readOverlayInteractionRadius(target),
        distanceToPlayer: worldDistance(renderState.playerPosition, target.worldPosition),
        worldPosition: target.worldPosition,
        screenAnchor: anchor,
      }]
    })

  const clicked = candidates.filter((candidate) => {
    return Math.hypot(clickPoint.x - candidate.x, clickPoint.y - candidate.y) <= candidate.radius
  })
  return clicked.sort((left, right) => left.distanceToPlayer - right.distanceToPlayer)[0] ?? null
}

function isSameOverlayFrame(
  currentFrame: ExploreOverlayFrame | null,
  nextFrame: ExploreOverlayFrame,
) {
  if (!currentFrame) {
    return false
  }
  return (
    Math.abs(currentFrame.playerPoint.x - nextFrame.playerPoint.x) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.playerPoint.y - nextFrame.playerPoint.y) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.visionPx - nextFrame.visionPx) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.width - nextFrame.width) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.height - nextFrame.height) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.viewport.x - nextFrame.viewport.x) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.viewport.y - nextFrame.viewport.y) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.viewport.width - nextFrame.viewport.width) < OVERLAY_FRAME_EPSILON &&
    Math.abs(currentFrame.viewport.height - nextFrame.viewport.height) < OVERLAY_FRAME_EPSILON
  )
}

function worldToOverlayPoint(
  overlayFrame: ExploreOverlayFrame,
  worldX: number,
  worldY: number,
) {
  return worldToCanvasPoint({
    bounds: overlayFrame.viewport,
    size: { width: overlayFrame.width, height: overlayFrame.height },
    padding: overlayFrame.padding,
    worldPosition: { x: worldX, y: worldY },
  })
}

function resolveInteractionPromptPlacement(
  anchor: { x: number; y: number },
  width: number,
  height: number,
): InteractionPromptPlacement {
  const horizontal = anchor.x > width - 260 ? "left" : "right"
  const vertical = anchor.y < 130 ? "down" : "up"
  return `${horizontal}-${vertical}` as InteractionPromptPlacement
}

function isOverlayPointVisible(
  point: { x: number; y: number },
  overlayFrame: ExploreOverlayFrame,
) {
  return isCanvasPointVisible({
    point,
    size: { width: overlayFrame.width, height: overlayFrame.height },
    padding: overlayFrame.padding,
    margin: 20,
  })
}

function worldDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function readOverlayInteractionRadius(
  target: ExploreRenderState["interactionTargets"][number],
) {
  if (target.kind === "transmission") {
    return 24
  }
  if (target.kind === "warp") {
    return 22
  }
  return target.markerKind === "resource" ? 17 : 20
}

function EquipSlotRow({ label, value }: { label: string; value: string }) {
  const isEmpty = value === "—"
  return (
    <div className="ehud-status__equip-row">
      <span className="ehud-status__slot-label">{label}</span>
      <span className={`ehud-status__slot-value ${isEmpty ? "ehud-status__slot-value--empty" : ""}`}>
        {value}
      </span>
    </div>
  )
}

function buildSignalWaveformAmplitude(index: number, frame: number): number {
  const position = index / (WAVEFORM_BAR_COUNT - 1)
  const scroll = frame * 0.0048
  const sample = position + scroll
  const phrase =
    0.48 +
    0.22 * Math.sin((sample * 1.21 + 0.16) * TAU) +
    0.14 * Math.sin((sample * 2.63 + 0.53) * TAU)
  const phraseGate = clamp01(phrase)
  const syllableGate = Math.pow(Math.max(0, Math.sin((sample * 5.9 + frame * 0.009) * TAU)), 1.7)
  const quietPocket = Math.pow(Math.max(0, Math.sin((sample * 2.4 - 0.18) * TAU)), 6.5)
  const voicedGrain = smoothWaveNoise(sample * 22 + frame * 0.012, 19)
  const fineGrain = smoothWaveNoise(sample * 63 - frame * 0.021, 43)
  const transient = Math.pow(Math.max(0, Math.sin((sample * 17.7 - frame * 0.017) * TAU)), 5.2)
  const carrier =
    0.12 +
    phraseGate * (0.28 + voicedGrain * 0.3) +
    syllableGate * (0.2 + fineGrain * 0.18) +
    transient * (0.2 + voicedGrain * 0.14)
  const drop = 1 - quietPocket * 0.48
  const breathe = 0.9 + 0.1 * Math.sin(frame * 0.11 + position * TAU * 1.7)

  return clamp01(Math.max(0.028, carrier * drop * breathe))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothWaveNoise(x: number, salt: number): number {
  const left = Math.floor(x)
  const ratio = x - left
  const eased = ratio * ratio * (3 - 2 * ratio)
  const a = seededWaveNoise(left * 97 + salt)
  const b = seededWaveNoise((left + 1) * 97 + salt)

  // value noise として補間し、通信波形らしい不規則さを残しつつちらつきを抑えます。
  return a + (b - a) * eased
}

function seededWaveNoise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
