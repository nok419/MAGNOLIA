import { useEffect, useMemo, useState } from "react"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState, ExploreRenderState } from "@magnolia/game-session"
import type { MapViewModel } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import type { VisualFixture } from "@/dev/visual-fixtures"
import { REBOOT_SETTLE_CUE_ID, type ExplorePresentationState } from "@/app/explore-presentation"
import { resolveTextSignalDistortion } from "@/app/signal-distortion"
import { BattleCanvas } from "@/components/BattleCanvas"
import { ModeTransitionLayer } from "@/components/ModeTransitionLayer"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import { ExploreScreen } from "@/screens/explore/ExploreScreen"
import { MapScreen } from "@/screens/map/MapScreen"
import {
  FIXED_BATTLE_RENDER_STATE_FIXTURES,
  FIXED_VISUAL_TIMESTAMPS_MS,
  VISUAL_FIXTURES,
} from "@/dev/visual-fixtures"

type VisualFixtureViewerProps = {
  initialFixtureId?: string | null
}

const FIXTURE_SHIP_VARIANT: ShipVariant = "solid"
const DEFAULT_FIXTURE_ID = VISUAL_FIXTURES[0]?.id ?? "title.seeded-backdrop"

export function readRequestedVisualFixtureId(search = window.location.search): string | null {
  const fixtureId = new URLSearchParams(search).get("visualFixture")
  return fixtureId && fixtureId.trim().length > 0 ? fixtureId : null
}

export function VisualFixtureViewer({ initialFixtureId }: VisualFixtureViewerProps) {
  const firstFixtureId = resolveInitialFixtureId(initialFixtureId)
  const [activeFixtureId, setActiveFixtureId] = useState(firstFixtureId)
  const activeFixture = useMemo(() => {
    return VISUAL_FIXTURES.find((fixture) => fixture.id === activeFixtureId) ?? VISUAL_FIXTURES[0]
  }, [activeFixtureId])
  const displayOptions = useMemo(
    () => createFixtureDisplayOptions(activeFixture),
    [activeFixture],
  )

  function handleSelectFixture(fixtureId: string) {
    setActiveFixtureId(fixtureId)
    // fixture はスクリーンショット取得で URL を正本にするため、選択時に query も同期します。
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set("visualFixture", fixtureId)
    window.history.replaceState(null, "", nextUrl)
  }

  if (!activeFixture) {
    return null
  }

  return (
    <main className="fixture-viewer">
      <aside className="fixture-viewer__rail">
        <p className="screen-shell__eyebrow">visual fixture</p>
        <h1 className="screen-shell__title">design11</h1>
        <p className="screen-shell__subtitle">
          固定 seed と固定時刻で描画差分を確認します。
        </p>
        <nav className="fixture-viewer__nav" aria-label="visual fixture list">
          {VISUAL_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              className={[
                "fixture-viewer__nav-item",
                fixture.id === activeFixture.id ? "fixture-viewer__nav-item--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleSelectFixture(fixture.id)}
            >
              <span>{fixture.screen}</span>
              <strong>{fixture.id}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <section className="fixture-viewer__stage" data-fixture-screen={activeFixture.screen}>
        <FixtureHeader fixture={activeFixture} />
        <div className="fixture-viewer__surface">
          <FixtureSurface fixture={activeFixture} displayOptions={displayOptions} />
        </div>
      </section>
    </main>
  )
}

function FixtureHeader({ fixture }: { fixture: VisualFixture }) {
  return (
    <header className="fixture-viewer__header">
      <div>
        <p className="screen-shell__eyebrow">{fixture.screen}</p>
        <h2>{fixture.id}</h2>
      </div>
      <dl className="fixture-viewer__meta">
        <div>
          <dt>seed</dt>
          <dd>{fixture.seed}</dd>
        </div>
        <div>
          <dt>reduce flashing</dt>
          <dd>{fixture.reduceFlashing ? "on" : "off"}</dd>
        </div>
        <div>
          <dt>low frame rate</dt>
          <dd>{fixture.lowFrameRateMode ? "on" : "off"}</dd>
        </div>
      </dl>
      <p>{fixture.description}</p>
    </header>
  )
}

function FixtureSurface({
  fixture,
  displayOptions,
}: {
  fixture: VisualFixture
  displayOptions: DisplayOptions
}) {
  switch (fixture.screen) {
    case "title":
      return <TitleFixtureSurface displayOptions={displayOptions} />
    case "explore":
      return <ExploreFixtureSurface displayOptions={displayOptions} />
    case "map":
      return <MapFixtureSurface />
    case "battle":
      return <BattleFixtureSurface displayOptions={displayOptions} />
    case "archive":
      return <ArchiveFixtureSurface fixture={fixture} />
    case "menu":
      return <TransitionFixtureSurface displayOptions={displayOptions} />
    default:
      return null
  }
}

function TitleFixtureSurface({ displayOptions }: { displayOptions: DisplayOptions }) {
  return (
    <div className="fixture-title">
      <SignalBackdropCanvas displayOptions={displayOptions} />
      <div className="fixture-title__panel">
        <p className="title-screen__eyebrow">transmission system</p>
        <MagnoliaLogo reduceFlashing={displayOptions.reduceFlashing} />
        <p className="title-screen__summary">signal in the haze</p>
      </div>
    </div>
  )
}

function ExploreFixtureSurface({ displayOptions }: { displayOptions: DisplayOptions }) {
  const fixture = createExploreFixture()
  return (
    <div className="fixture-embed fixture-embed--fullscreen">
      <ExploreScreen
        snapshot={fixture.snapshot}
        renderState={fixture.renderState}
        presentation={fixture.presentation}
        shipVariant={FIXTURE_SHIP_VARIANT}
        displayOptions={displayOptions}
        itemPopups={[{ id: "fixture_pickup", title: "self repair", detail: "+12" }]}
        showEquipmentHint
      />
    </div>
  )
}

function MapFixtureSurface() {
  const viewModel = useMemo(createMapFixtureViewModel, [])
  return (
    <div className="fixture-embed fixture-embed--fullscreen">
      <MapScreen
        viewModel={viewModel}
        onBack={() => {}}
        onWarpToArea={() => {}}
        onOpenArchive={() => {}}
      />
    </div>
  )
}

function BattleFixtureSurface({ displayOptions }: { displayOptions: DisplayOptions }) {
  const renderState = resolveBattleFixtureRenderState()
  return (
    <div className="fixture-battle">
      <BattleCanvas
        renderState={renderState}
        shipVariant={FIXTURE_SHIP_VARIANT}
        displayOptions={displayOptions}
      />
    </div>
  )
}

function ArchiveFixtureSurface({ fixture }: { fixture: VisualFixture }) {
  const sample = "MAGNOLIA signal restored. Archive line remains partially damaged."
  const characters = Array.from(sample)
  return (
    <article className="fixture-archive">
      <p className="screen-shell__eyebrow">archive transcript</p>
      <p className="fixture-archive__speaker">MAGNOLIA</p>
      <p className="fixture-archive__line">
        {characters.map((character, index) => {
          const distortion = resolveTextSignalDistortion({
            seed: `${fixture.seed}:${FIXED_VISUAL_TIMESTAMPS_MS.archiveDamagedText}`,
            index,
            severity: 0.42,
            reduceFlashing: fixture.reduceFlashing,
          })
          return (
            <span
              key={`${character}:${index}`}
              className={distortion.hardMask ? "fixture-archive__mask" : undefined}
            >
              {distortion.visible ? distortion.replacement : character}
            </span>
          )
        })}
      </p>
    </article>
  )
}

function TransitionFixtureSurface({ displayOptions }: { displayOptions: DisplayOptions }) {
  const [screenKey, setScreenKey] = useState("explore")

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setScreenKey((current) => (current === "explore" ? "battle" : "explore"))
    }, 1400)
    return () => window.clearInterval(timerId)
  }, [])

  return (
    <div className="fixture-transition">
      <SignalBackdropCanvas displayOptions={displayOptions} />
      <div className="fixture-transition__panel">
        <p className="screen-shell__eyebrow">mode transition</p>
        <p>{screenKey}</p>
      </div>
      <ModeTransitionLayer screenKey={screenKey} displayOptions={displayOptions} />
    </div>
  )
}

function resolveInitialFixtureId(initialFixtureId: string | null | undefined): string {
  if (!initialFixtureId) {
    return DEFAULT_FIXTURE_ID
  }
  const matchedFixture = VISUAL_FIXTURES.find((fixture) => fixture.id === initialFixtureId)
  const matchedBattleFixture = FIXED_BATTLE_RENDER_STATE_FIXTURES.find(
    (fixture) => fixture.id === initialFixtureId,
  )
  if (matchedFixture) {
    return matchedFixture.id
  }
  return matchedBattleFixture ? "battle.roles" : DEFAULT_FIXTURE_ID
}

function createFixtureDisplayOptions(fixture: VisualFixture): DisplayOptions {
  return {
    reduceFlashing: fixture.reduceFlashing,
    lowFrameRateMode: fixture.lowFrameRateMode,
    targetFrameIntervalMs: fixture.lowFrameRateMode ? 1000 / 30 : 1000 / 60,
    canvasPixelRatio: fixture.lowFrameRateMode ? 1 : Math.min(window.devicePixelRatio || 1, 2),
  }
}

function resolveBattleFixtureRenderState(): BattleRenderState {
  return FIXED_BATTLE_RENDER_STATE_FIXTURES[0]?.renderState ?? createFallbackBattleRenderState()
}

function createExploreFixture(): {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
} {
  const playerPosition = { x: 240, y: 430 }
  const visibleAreaIds = ["area_central_tower", "area_residential_ring"]
  const visibleTransmissionIds = ["tx_good_morning", "tx_where_are_you"]

  return {
    snapshot: {
      screen: "explore",
      playerPosition,
      map: {
        playerPosition,
        visibleAreaNodeIds: ["node_area_central_tower", "node_area_residential_ring"],
        visibleTransmissionNodeIds: ["node_tx_good_morning", "node_tx_where_are_you"],
        visibleWarpNodeIds: ["node_warp_residential_ring"],
        visibleCollectibleNodeIds: ["node_collectible_self_repair"],
        fogBitmap: "fixture",
      },
      hud: {
        currentAreaId: "area_central_tower",
        equipped: {
          main: "eq_main_pulse",
          sub: "eq_sub_noise_canceller",
          os: "eq_os_magnolia",
          subsystems: [null, null],
        },
        communicationStrength: 0.72,
        compassTargetAreaId: "area_residential_ring",
        currentAreaCompletionRate: 0.34,
        selfRepairPoints: 24,
      },
      featureAccess: {
        hudEnabled: true,
        strengthMeterEnabled: true,
        minimapEnabled: true,
        compassEnabled: true,
        canOpenArchive: true,
        canOpenMap: true,
        canOpenEquipment: true,
        mapVisionUnlocked: true,
        infoPanelEnabled: true,
        visibleAreaIds,
        visibleTransmissionIds,
        accessibleTransmissionIds: visibleTransmissionIds,
        visibleEquipmentIds: ["eq_main_pulse", "eq_sub_noise_canceller", "eq_os_magnolia"],
        visibleMissionIds: ["mission_good_morning"],
        startableMissionIds: ["mission_good_morning"],
      },
    },
    renderState: {
      worldBounds: { x: 0, y: 0, width: 640, height: 640 },
      currentAreaId: "area_central_tower",
      currentAreaName: "中央管制塔",
      currentThemeId: "theme_signal_haze",
      playerPosition,
      playerFacing: { x: 0.3, y: -1 },
      visionRadius: 164,
      areaBounds: { x: 24, y: 24, width: 560, height: 560 },
      visibleTransmissions: [
        {
          nodeId: "node_tx_good_morning",
          x: 242,
          y: 184,
          label: "good morning",
          interactionRadius: 42,
          state: "partial",
          markerKind: "investigation",
        },
        {
          nodeId: "node_tx_where_are_you",
          x: 356,
          y: 296,
          label: "where are you",
          interactionRadius: 38,
          state: "available",
          markerKind: "investigation",
        },
      ],
      visibleWarps: [
        {
          nodeId: "node_warp_residential_ring",
          x: 486,
          y: 372,
          label: "residential ring",
          interactionRadius: 46,
          state: "available",
        },
      ],
      visibleCollectibles: [
        {
          nodeId: "node_collectible_self_repair",
          x: 174,
          y: 348,
          label: "self repair",
          interactionRadius: 34,
          state: "available",
          markerKind: "resource",
        },
      ],
      interactionTargets: [
        {
          nodeId: "node_tx_good_morning",
          x: 242,
          y: 184,
          radius: 42,
          distanceToPlayer: 142,
        },
      ],
      nearestTransmissionStrength: 0.72,
      nearestAnyTransmissionStrength: 0.86,
      elapsedMs: FIXED_VISUAL_TIMESTAMPS_MS.exploreRebootSettleHudRestore,
      signalHints: [
        {
          nodeId: "node_tx_good_morning",
          kind: "transmission",
          category: "automated",
          bearingRad: -0.74,
          distanceBand: "mid",
          strength: 0.72,
          confidence: 0.86,
        },
      ],
      scanPulses: [
        {
          pulseId: "fixture_scan",
          startedAtMs: FIXED_VISUAL_TIMESTAMPS_MS.exploreRebootSettleBlackout,
          radius: 184,
          durationMs: 1800,
        },
      ],
      shouldShowScanHint: false,
      tutorialRestricted: false,
    },
    presentation: {
      kind: "reboot-settle",
      requestId: `fixture:${REBOOT_SETTLE_CUE_ID}`,
      durationMs: 2200,
      blocksInput: true,
      pausesWorld: true,
      hidesHud: false,
      hidesItemPopups: true,
    },
  }
}

function createMapFixtureViewModel(): MapViewModel {
  return {
    canvasPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    reduceMotion: false,
    initialSelectedAreaId: "area_central_tower",
    fogBitmap: "fixture",
    worldBounds: { x: 0, y: 0, width: 640, height: 640 },
    playerPosition: { x: 240, y: 430 },
    playerFacing: { x: 0.3, y: -1 },
    visionRadius: 164,
    visibleAreas: [
      {
        areaId: "area_central_tower",
        name: "中央管制塔",
        completionPercent: 34,
        bounds: { x: 42, y: 64, width: 280, height: 260 },
      },
      {
        areaId: "area_residential_ring",
        name: "居住環",
        completionPercent: 12,
        bounds: { x: 320, y: 256, width: 220, height: 220 },
      },
    ],
    areasById: {
      area_central_tower: {
        areaId: "area_central_tower",
        name: "中央管制塔",
        completionPercent: 34,
        bounds: { x: 42, y: 64, width: 280, height: 260 },
      },
      area_residential_ring: {
        areaId: "area_residential_ring",
        name: "居住環",
        completionPercent: 12,
        bounds: { x: 320, y: 256, width: 220, height: 220 },
      },
    },
    areaNodes: [
      { areaId: "area_central_tower", x: 180, y: 190 },
      { areaId: "area_residential_ring", x: 430, y: 356 },
    ],
    collectibleNodes: [
      {
        nodeId: "node_collectible_self_repair",
        x: 174,
        y: 348,
        areaId: "area_central_tower",
        collectibleKind: "selfRepairPoints",
      },
    ],
    transmissionNodes: [
      {
        nodeId: "node_tx_good_morning",
        x: 242,
        y: 184,
        areaId: "area_central_tower",
        transmissionId: "tx_good_morning",
        state: "partial",
      },
      {
        nodeId: "node_tx_where_are_you",
        x: 356,
        y: 296,
        areaId: "area_residential_ring",
        transmissionId: "tx_where_are_you",
        state: "locked",
      },
    ],
    transmissionsById: {
      tx_good_morning: {
        transmissionId: "tx_good_morning",
        areaId: "area_central_tower",
        titleLabel: "good morning",
        senderLabel: "MAGNOLIA",
        recipientLabel: "operator",
        restorationPercent: 68,
      },
      tx_where_are_you: {
        transmissionId: "tx_where_are_you",
        areaId: "area_residential_ring",
        titleLabel: "where are you",
        senderLabel: "unknown",
        recipientLabel: "MAGNOLIA",
        restorationPercent: 24,
      },
    },
  }
}

function createFallbackBattleRenderState(): BattleRenderState {
  const elapsedMs = FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame

  return {
    missionId: "mission_good_morning",
    visualProfileId: "mission_good_morning",
    missionDurationMs: 60000,
    elapsedMs,
    player: {
      position: { x: 240, y: 430 },
      radius: 10,
      invincible: false,
      noiseLevel: 0.24,
      subCooldownMs: 1200,
      subMaxCooldownMs: 5000,
    },
    enemies: [],
    projectiles: [],
    supportFields: [],
    pickups: [],
    fragments: [
      {
        fragmentId: "fixture_fragment_eject",
        chunkId: "fixture_subtitle_01",
        startRatio: 0.1,
        endRatio: 0.24,
        originX: 240,
        originY: 430,
        x: 322,
        y: 292,
        spawnedAtMs: elapsedMs - 180,
        expiresAtMs: elapsedMs + 3200,
        strength: 0.82,
      },
    ],
    hazards: [],
    equippedMainId: "eq_main_pulse",
    equippedSubId: "eq_sub_noise_canceller",
  }
}
