import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
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
import { ExploreCanvas, type ExploreOverlayFrame } from "@/render/explore/ExploreCanvas"
import {
  TutorialIconCallout,
  type TutorialIconPlacement,
} from "@/components/InteractionPrompt"
import { MiniMap } from "@/components/MiniMap"
import { isCanvasPointVisible, worldToCanvasPoint } from "@/render/shared/coordinates"
import { clamp01, seededUnit } from "@/render/shared/render-math"
import { buildMiniMapViewModel } from "@/view-models/map-view-model"

type ExploreScreenProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  exploreEvents?: TimedPresentationRequest<ExploreChannelPresentationRequest>[]
  itemPopups?: Array<{ id: string; title: string; detail: string }>
  shipVariant: ShipVariant
  showOsMagnoliaEquipPrompt?: boolean
  onInteractNode?: (nodeId: WorldMapNodeId, context: ExploreInteractionContext) => void
  onSetMoveTarget?: (worldPosition: { x: number; y: number } | null) => void
  onConsumePrimaryClick?: () => void
  displayOptions: DisplayOptions
}

type ExploreInteractionContext = {
  nodeId: WorldMapNodeId
  worldPosition: { x: number; y: number }
  sourceFrame: ExploreTransitionSourceFrame
}

type ExploreClickRipple = {
  id: number
  x: number
  y: number
}

type SignalGuidePopupState = {
  releaseRequestId: string
  visible: boolean
}

// signal パネルの波形は決定的に生成し、距離による強度は別の値として合成します。
const WAVEFORM_BAR_COUNT = 136
const STRENGTH_SEGMENT_COUNT = 18
const WAVEFORM_FRAME_MS = 72
const TAU = Math.PI * 2
const OVERLAY_FRAME_EPSILON = 0.25
const TRANSMISSION_ICON_CAPTURE_RADIUS_PX = 64
const WARP_ICON_CAPTURE_RADIUS_PX = 56
const EQUIPMENT_ICON_CAPTURE_RADIUS_PX = 52
const RESOURCE_ICON_CAPTURE_RADIUS_PX = 46
const NAV_CUE_CAPTURE_RADIUS_PX = 42
const NEARBY_ICON_INTERACT_RADIUS_PX = 72
const FIRST_MISSION_TUTORIAL_NODE_ID = "node_tx_good_morning"

export function ExploreScreen({
  snapshot,
  renderState,
  presentation,
  exploreEvents = [],
  itemPopups = [],
  shipVariant,
  showOsMagnoliaEquipPrompt = false,
  onInteractNode,
  onSetMoveTarget,
  onConsumePrimaryClick,
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
  const [clickRipples, setClickRipples] = useState<ExploreClickRipple[]>([])
  const [signalGuidePopup, setSignalGuidePopup] = useState<SignalGuidePopupState | null>(null)
  const clickRippleIdRef = useRef(0)
  const pendingSignalGuideReleaseIdRef = useRef<string | null>(null)

  const emitExploreClickRipple = useCallback((point: { x: number; y: number }) => {
    const id = clickRippleIdRef.current + 1
    clickRippleIdRef.current = id
    setClickRipples((current) => [...current.slice(-7), { id, x: point.x, y: point.y }])
  }, [])

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
    if (presentation.kind === "release") {
      pendingSignalGuideReleaseIdRef.current = presentation.requestId
      return
    }
    if (presentation.kind !== "none") {
      return
    }

    const releaseRequestId = pendingSignalGuideReleaseIdRef.current
    if (!releaseRequestId) {
      return
    }

    // 境界解放ムービーの視界復帰後にだけ案内を出します。
    // cue 自体は一度きりなので、画面 local state で request 単位の重複だけ防ぎます。
    pendingSignalGuideReleaseIdRef.current = null
    setSignalGuidePopup((current) =>
      current?.releaseRequestId === releaseRequestId
        ? current
        : { releaseRequestId, visible: true },
    )
  }, [presentation])

  useEffect(() => {
    if (!signalGuidePopup?.visible) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Enter" && event.code !== "NumpadEnter" && event.code !== "Escape") {
        return
      }
      event.preventDefault()
      setSignalGuidePopup((current) => current ? { ...current, visible: false } : current)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [signalGuidePopup?.visible])

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
  const canShowOsMagnoliaEquipPrompt =
    showOsMagnoliaEquipPrompt && snapshot.featureAccess.hudEnabled && !presentation.hidesHud
  const shouldShowScanHint = canShowPrompts && overlayFrame !== null && renderState.shouldShowScanHint
  const shipPromptPlacement = overlayFrame
    ? resolveTutorialIconPlacement(overlayFrame.playerPoint, overlayFrame.width)
    : "right-up"
  const firstMissionTutorialIconTarget =
    canShowPrompts && overlayFrame
      ? readFirstMissionTutorialIconTarget(renderState, overlayFrame)
      : null
  const canShowSignalGuidePopup =
    signalGuidePopup?.visible === true && canShowPrompts && canShowStrengthMeter

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !canShowPrompts || !overlayFrame) {
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest(".ehud, .interaction-prompt, .explore-item-popup-stack")) {
        return
      }
      onConsumePrimaryClick?.()
      const rect = event.currentTarget.getBoundingClientRect()
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      // クリック位置の波紋は探索入力の結果ではなく、背景への短い手触りとして表示します。
      emitExploreClickRipple(point)
      const hitTarget = readNearbyInteractTarget(renderState, overlayFrame) ?? readExploreTargetAtPoint(renderState, overlayFrame, point)
      if (!hitTarget) {
        onSetMoveTarget?.(overlayPointToWorld(overlayFrame, point))
        return
      }
      // アイコン付近にいるとき、またはアイコン上を押したときはインタラクトを優先します。
      onSetMoveTarget?.(null)
      if (!onInteractNode) {
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
    [canShowPrompts, emitExploreClickRipple, onConsumePrimaryClick, onInteractNode, onSetMoveTarget, overlayFrame, renderState],
  )

  return (
    <main className="explore-fullscreen" onPointerDown={handleCanvasPointerDown}>
      <ExploreCanvas
        snapshot={snapshot}
        renderState={renderState}
        presentation={presentation}
        exploreEvents={exploreEvents}
        shipVariant={shipVariant}
        onOverlayFrame={handleOverlayFrame}
        displayOptions={displayOptions}
      />
      <div className="explore-click-ripples" aria-hidden="true">
        {clickRipples.map((ripple) => (
          <span
            key={ripple.id}
            className="explore-click-ripple"
            style={{
              ["--explore-ripple-x" as keyof CSSProperties]: `${ripple.x}px`,
              ["--explore-ripple-y" as keyof CSSProperties]: `${ripple.y}px`,
            }}
            onAnimationEnd={() => {
              setClickRipples((current) => current.filter((item) => item.id !== ripple.id))
            }}
          />
        ))}
      </div>

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

      {canShowStrengthMeter || canShowOsMagnoliaEquipPrompt ? (
        <section
          className={`ehud ehud--signal${canShowOsMagnoliaEquipPrompt ? " ehud--signal-prompt" : ""}${hudTransitionClass}`}
          style={signalPanelStyle}
          aria-label={canShowOsMagnoliaEquipPrompt ? "os magnolia equipment prompt" : "signal strength"}
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />
          <div className="ehud__scanline" />

          {canShowOsMagnoliaEquipPrompt ? (
            <div className="ehud-signal-prompt" role="status">
              <span className="ehud-signal-prompt__label">EQUIPMENT</span>
              <p className="ehud-signal-prompt__message">
                os magnoliaを装備してください
              </p>
              <span className="ehud-signal-prompt__hint">E / Esc</span>
            </div>
          ) : (
            <>
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
            </>
          )}
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
        <ControlHelpRow label="move" keys={["WASD", "↑←↓→"]} />
        <ControlHelpRow label="connect" keys={["Enter", "左クリック", "Z"]} />
        {renderState.shouldShowScanHint ? (
          <ControlHelpRow label="scan" keys={["Space", "右クリック", "X"]} />
        ) : null}
        <ControlHelpRow label="equipment" keys={["E", "Esc"]} />
        <ControlHelpRow label="map" keys={["M"]} />
      </section>

      {shouldShowScanHint ? (
        <TutorialIconCallout
          anchor={overlayFrame.playerPoint}
          placement={shipPromptPlacement}
          keyLabel={["Space", "右クリック", "X"]}
          label="scan"
          tone="warm"
          motion="static"
          ariaLabel="Space、右クリック、X でスキャンを出します"
        />
      ) : null}

      {firstMissionTutorialIconTarget && overlayFrame ? (
        <TutorialIconCallout
          anchor={firstMissionTutorialIconTarget.screenAnchor}
          placement={resolveTutorialIconPlacement(
            firstMissionTutorialIconTarget.screenAnchor,
            overlayFrame.width,
          )}
          keyLabel={["Enter", "左クリック", "Z"]}
          label="connect"
          tone="cyan"
          motion="static"
          ariaLabel="Enter、左クリック、Z で mission 01 を開始します"
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

      {canShowSignalGuidePopup ? (
        <section
          className="signal-guide-popup"
          role="dialog"
          aria-modal="false"
          aria-labelledby="signal-guide-popup-title"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="signal-guide-popup__bracket signal-guide-popup__bracket--tl" />
          <div className="signal-guide-popup__bracket signal-guide-popup__bracket--tr" />
          <div className="signal-guide-popup__bracket signal-guide-popup__bracket--bl" />
          <div className="signal-guide-popup__bracket signal-guide-popup__bracket--br" />
          <header className="signal-guide-popup__header">
            <span className="signal-guide-popup__diamond" aria-hidden="true">◇</span>
            <h2 id="signal-guide-popup-title">SIGNAL HUD</h2>
          </header>
          <div className="signal-guide-popup__body">
            <p>
              SIGNAL は、いま拾えている反応の種類と距離帯を示します。
              メーターが高いほど通信反応が近く、波形が強いほど周囲の反応が多い状態です。
            </p>
            <p>
              scan は <kbd>Space</kbd>、<kbd>click 2</kbd>（右クリック）、<kbd>X</kbd> で出します。
              反応は自機から見た方角に弧と短い線で表示されます。
            </p>
            <ul className="signal-guide-popup__legend" aria-label="視界範囲円の色">
              <li>
                <span className="signal-guide-popup__swatch signal-guide-popup__swatch--transmission" />
                赤は mission や通信反応です。
              </li>
              <li>
                <span className="signal-guide-popup__swatch signal-guide-popup__swatch--equipment" />
                黄は装備や収集物です。
              </li>
              <li>
                <span className="signal-guide-popup__swatch signal-guide-popup__swatch--repair" />
                緑は自己修復ポイントです。
              </li>
              <li>
                <span className="signal-guide-popup__swatch signal-guide-popup__swatch--vision" />
                青白い円が現在の視界範囲です。
              </li>
            </ul>
          </div>
          <button
            className="signal-guide-popup__button"
            type="button"
            onClick={() => {
              setSignalGuidePopup((current) => current ? { ...current, visible: false } : current)
            }}
          >
            understood
          </button>
        </section>
      ) : null}
    </main>
  )
}

function ControlHelpRow({ label, keys }: { label: string; keys: readonly string[] }) {
  return (
    <p className="ehud-help__row">
      <span className="ehud-help__label">{label}</span>
      <span className="ehud-help__keys" aria-label={keys.join(" or ")}>
        {keys.map((keyLabel) => (
          <kbd key={keyLabel} className="ehud-help__key">
            {keyLabel}
          </kbd>
        ))}
      </span>
    </p>
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
  clickDistance: number
  clickable: boolean
  distanceToPlayer: number
  worldPosition: { x: number; y: number }
  screenAnchor: { x: number; y: number }
}

function readExploreTargetAtPoint(
  renderState: ExploreRenderState,
  overlayFrame: ExploreOverlayFrame,
  clickPoint: { x: number; y: number },
): ExploreClickTarget | null {
  const candidates: ExploreClickTarget[] = renderState.interactionTargets
    .filter((target) => target.visible)
    .flatMap((target) => {
      const anchor = worldToOverlayPoint(overlayFrame, target.worldPosition.x, target.worldPosition.y)
      if (!isOverlayPointVisible(anchor, overlayFrame)) {
        return []
      }
      const targetDistance = worldDistance(renderState.playerPosition, target.worldPosition)
      const visibleCandidates = [buildExploreClickTarget({
        nodeId: target.nodeId,
        point: anchor,
        radius: readOverlayInteractionCaptureRadius(target),
        clickable: target.clickable,
        distanceToPlayer: targetDistance,
        worldPosition: target.worldPosition,
        clickPoint,
      })]
      const navCuePoint = readNavCueCapturePoint(overlayFrame, anchor)
      if (navCuePoint) {
        visibleCandidates.push(buildExploreClickTarget({
          nodeId: target.nodeId,
          point: navCuePoint,
          radius: NAV_CUE_CAPTURE_RADIUS_PX,
          clickable: target.clickable,
          distanceToPlayer: targetDistance,
          worldPosition: target.worldPosition,
          screenAnchor: anchor,
          clickPoint,
        }))
      }
      return visibleCandidates
    })

  const clicked = candidates.filter((candidate) => {
    return candidate.clickDistance <= candidate.radius
  })
  return clicked.sort((left, right) => {
    if (left.clickDistance !== right.clickDistance) {
      return left.clickDistance - right.clickDistance
    }
    if (left.clickable !== right.clickable) {
      return left.clickable ? -1 : 1
    }
    return left.distanceToPlayer - right.distanceToPlayer
  })[0] ?? null
}

function readNearbyInteractTarget(
  renderState: ExploreRenderState,
  overlayFrame: ExploreOverlayFrame,
): ExploreClickTarget | null {
  const candidates = renderState.interactionTargets
    .filter((target) => target.visible)
    .flatMap((target) => {
      const anchor = worldToOverlayPoint(overlayFrame, target.worldPosition.x, target.worldPosition.y)
      if (!isOverlayPointVisible(anchor, overlayFrame)) {
        return []
      }
      return [buildExploreClickTarget({
        nodeId: target.nodeId,
        point: anchor,
        radius: readOverlayInteractionCaptureRadius(target),
        clickable: target.clickable,
        distanceToPlayer: worldDistance(renderState.playerPosition, target.worldPosition),
        worldPosition: target.worldPosition,
        clickPoint: overlayFrame.playerPoint,
      })]
    })
    .filter((target) => target.clickable || target.clickDistance <= NEARBY_ICON_INTERACT_RADIUS_PX)

  return candidates.sort((left, right) => {
    if (left.clickable !== right.clickable) {
      return left.clickable ? -1 : 1
    }
    if (left.clickDistance !== right.clickDistance) {
      return left.clickDistance - right.clickDistance
    }
    return left.distanceToPlayer - right.distanceToPlayer
  })[0] ?? null
}

function buildExploreClickTarget(input: {
  nodeId: WorldMapNodeId
  point: { x: number; y: number }
  radius: number
  clickable: boolean
  distanceToPlayer: number
  worldPosition: { x: number; y: number }
  screenAnchor?: { x: number; y: number }
  clickPoint: { x: number; y: number }
}): ExploreClickTarget {
  const screenAnchor = input.screenAnchor ?? input.point
  return {
    nodeId: input.nodeId,
    x: input.point.x,
    y: input.point.y,
    radius: input.radius,
    clickDistance: Math.hypot(input.clickPoint.x - input.point.x, input.clickPoint.y - input.point.y),
    clickable: input.clickable,
    distanceToPlayer: input.distanceToPlayer,
    worldPosition: input.worldPosition,
    screenAnchor,
  }
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

function overlayPointToWorld(
  overlayFrame: ExploreOverlayFrame,
  point: { x: number; y: number },
) {
  const drawableWidth = Math.max(1, overlayFrame.width - overlayFrame.padding * 2)
  const drawableHeight = Math.max(1, overlayFrame.height - overlayFrame.padding * 2)
  const rx = Math.max(0, Math.min(1, (point.x - overlayFrame.padding) / drawableWidth))
  const ry = Math.max(0, Math.min(1, (point.y - overlayFrame.padding) / drawableHeight))
  return {
    x: overlayFrame.viewport.x + overlayFrame.viewport.width * rx,
    y: overlayFrame.viewport.y + overlayFrame.viewport.height * ry,
  }
}

function resolveTutorialIconPlacement(
  anchor: { x: number; y: number },
  width: number,
): TutorialIconPlacement {
  const horizontal = anchor.x > width - 260 ? "left" : "right"
  const vertical = anchor.y < 130 ? "down" : "up"
  return `${horizontal}-${vertical}` as TutorialIconPlacement
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

function readNavCueCapturePoint(
  overlayFrame: ExploreOverlayFrame,
  anchor: { x: number; y: number },
) {
  const dx = anchor.x - overlayFrame.playerPoint.x
  const dy = anchor.y - overlayFrame.playerPoint.y
  const distance = Math.hypot(dx, dy)
  if (distance <= overlayFrame.visionPx * 0.78 || distance <= 0.001) {
    return null
  }

  // 視界端の案内弧もクリック対象に見えるため、実ノード位置とは別に移動入力を抑止します。
  const scale = overlayFrame.visionPx / distance
  return {
    x: overlayFrame.playerPoint.x + dx * scale,
    y: overlayFrame.playerPoint.y + dy * scale,
  }
}

function worldDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function readOverlayInteractionCaptureRadius(
  target: ExploreRenderState["interactionTargets"][number],
) {
  // 描画上のマーカーは残響リングや衛星部が中心点より外へ出るため、
  // 背景クリック移動の判定では実アイコンより少し広い範囲を入力予約します。
  if (target.kind === "transmission") {
    return TRANSMISSION_ICON_CAPTURE_RADIUS_PX
  }
  if (target.kind === "warp") {
    return WARP_ICON_CAPTURE_RADIUS_PX
  }
  if (target.markerKind === "resource") {
    return RESOURCE_ICON_CAPTURE_RADIUS_PX
  }
  return EQUIPMENT_ICON_CAPTURE_RADIUS_PX
}

function readFirstMissionTutorialIconTarget(
  renderState: ExploreRenderState,
  overlayFrame: ExploreOverlayFrame,
): ExploreClickTarget | null {
  const target = renderState.interactionTargets.find(
    (entry) => entry.nodeId === FIRST_MISSION_TUTORIAL_NODE_ID && entry.visible,
  )
  if (!target) {
    return null
  }
  const distanceToPlayer = worldDistance(renderState.playerPosition, target.worldPosition)
  if (distanceToPlayer > renderState.visionRadius) {
    return null
  }
  const anchor = worldToOverlayPoint(overlayFrame, target.worldPosition.x, target.worldPosition.y)
  if (!isOverlayPointVisible(anchor, overlayFrame)) {
    return null
  }

  const visibleTransmission = renderState.visibleTransmissions.find(
    (node) => node.nodeId === FIRST_MISSION_TUTORIAL_NODE_ID,
  )
  // mission01 のチュートリアルアイコンは、視界内にある間だけ開始方法を示します。
  // クリア済み mission は探索目標ではないため、完了状態では再表示しません。
  if (visibleTransmission?.state === "complete") {
    return null
  }
  return buildExploreClickTarget({
    nodeId: target.nodeId,
    point: anchor,
    radius: readOverlayInteractionCaptureRadius(target),
    clickable: target.clickable,
    distanceToPlayer,
    worldPosition: target.worldPosition,
    clickPoint: overlayFrame.playerPoint,
  })
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

function smoothWaveNoise(x: number, salt: number): number {
  const left = Math.floor(x)
  const ratio = x - left
  const eased = ratio * ratio * (3 - 2 * ratio)
  const a = seededUnit(left * 97 + salt)
  const b = seededUnit((left + 1) * 97 + salt)

  // value noise として補間し、通信波形らしい不規則さを残しつつちらつきを抑えます。
  return a + (b - a) * eased
}
