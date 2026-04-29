import { useEffect, useMemo } from "react"
import type { ReactNode } from "react"
import { TitleScreen } from "@/screens/title/TitleScreen"
import { ExploreScreen } from "@/screens/explore/ExploreScreen"
import { BattleScreen } from "@/screens/battle/BattleScreen"
import { MapScreen } from "@/screens/map/MapScreen"
import { MenuScreen } from "@/screens/menu/MenuScreen"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { PresentationOverlay } from "@/components/PresentationOverlay"
import { EquipmentModal } from "@/components/EquipmentModal"
import { applyAudioSettings } from "@/app/audio-controller"
import { resolveDisplayOptions } from "@/app/display-options"
import { TransitionPresentationLayer } from "@/app/presentation/TransitionPresentationLayer"
import { useMagnoliaApp } from "@/app/use-magnolia-app"

export function App() {
  const app = useMagnoliaApp()
  const displayOptions = useMemo(
    () => (app.settings ? resolveDisplayOptions(app.settings) : null),
    [
      app.settings?.lowFrameRateMode,
      app.settings?.reduceFlashing,
    ],
  )
  useEffect(() => {
    if (!app.settings) {
      return
    }
    applyAudioSettings(app.settings)
  }, [app.settings])

  if (!app.ready || !app.snapshot || !app.content || !app.settings || !displayOptions) {
    return (
      <main className="title-screen">
        <div className="title-screen__backdrop" />
        <section className="title-screen__panel">
          <MagnoliaLogo />
          {app.errorMessage ? <p className="muted-text">{app.errorMessage}</p> : null}
        </section>
      </main>
    )
  }

  let screen: ReactNode = null

  switch (app.screen) {
    // タイトルとスロット選択は同一コンポーネントでシームレスに切り替えます。
    case "title":
    case "slotSelect":
      screen = (
        <TitleScreen
          slots={app.saveSlots}
          slotSelectMode={app.slotSelectMode}
          displayOptions={displayOptions}
          onOpenSlotSelect={app.openSlotSelect}
          onCloseSlotSelect={app.closeSlotSelect}
          onConfirmSlot={(slotId) => void app.confirmSlot(slotId)}
          onOpenSettings={() => void app.runCommand("settings")}
        />
      )
      break
    case "explore":
      if (!app.snapshot.explore || !app.exploreRenderState || !app.profile) {
        screen = null
        break
      }
      screen = (
        <ExploreScreen
          snapshot={app.snapshot.explore}
          renderState={app.exploreRenderState}
          presentation={app.explorePresentation}
          exploreEvents={app.exploreEvents}
          itemPopups={app.itemPopups}
          shipVariant={app.settings.shipVariant}
          showEquipmentHint={app.shouldShowEquipmentHint}
          onInteractNode={(nodeId, context) => void app.interactExploreNode(nodeId, context)}
          displayOptions={displayOptions}
        />
      )
      break
    case "map":
      if (!app.worldMapViewModel) {
        screen = null
        break
      }
      screen = (
        <MapScreen
          viewModel={app.worldMapViewModel}
          displayOptions={displayOptions}
          onBack={() => void app.runCommand("closePanel")}
          onWarpToArea={(areaId) => void app.warpToArea(areaId)}
          onOpenArchive={(areaId, transmissionId) => void app.openArchiveAt(areaId, transmissionId)}
        />
      )
      break
    case "battle":
      if (!app.snapshot.battle || !app.battleRenderState) {
        screen = null
        break
      }
      screen = (
        <BattleScreen
          renderState={app.battleRenderState}
          battleEvents={app.battleEvents}
          shipVariant={app.settings.shipVariant}
          displayOptions={displayOptions}
          onReturnToExplore={() => void app.returnToExplore()}
        />
      )
      break
    // archive / equipment / settings は 1 つの menu 画面へ集約します。
    case "archive":
    case "equipment":
    case "settings":
      if (!app.profile && app.screen !== "settings") {
        screen = null
        break
      }
      screen = (
        <MenuScreen
          menuViewModel={app.snapshot.menu}
          content={app.content}
          equipmentViewModel={app.snapshot.equipment}
          archiveViewModel={app.archiveSnapshot?.viewModel}
          settings={app.settings}
          saveSlots={app.snapshot.saveSlots.slots}
          initialTab={app.screen === "archive" ? "archive" : app.screen === "settings" ? "settings" : "equipment"}
          unseenEquipmentIds={app.unseenEquipmentIds}
          onMarkEquipmentSeen={app.markEquipmentSeen}
          onEquip={(equipmentId: string, slot: string, subsystemIndex?: 0 | 1) => {
            if (slot === "subsystem") {
              void app.equipSubsystem(subsystemIndex ?? 0, equipmentId)
            } else {
              void app.equipPrimary(slot as "main" | "sub" | "os", equipmentId)
            }
          }}
          onPurchase={(equipmentId: string) => void app.purchaseEquipment(equipmentId)}
          onUpgrade={(equipmentId: string) => void app.upgradeEquipment(equipmentId)}
          onSelectTransmission={(areaId: string, transmissionId: string) =>
            app.selectArchive(areaId, transmissionId)
          }
          onSetVolume={(channel, nextValue) => void app.setVolume(channel, nextValue)}
          onSetDifficulty={(difficulty) => void app.setDifficulty(difficulty)}
          onToggleSwitch={(path, nextValue) => void app.toggleSwitch(path, nextValue)}
          onSetShipVariant={(variant) => void app.setShipVariant(variant)}
          onSaveCurrent={() => void app.runCommand("saveCurrentSlot")}
          onSaveToSlot={(slotId) => void app.saveToSlot(slotId)}
          onReturnToTitle={() => void app.runCommand("returnToTitle")}
          onBack={() => void app.runCommand("closePanel")}
          displayOptions={displayOptions}
        />
      )
      break
  }

  const appClassName = [
    "magnolia-app",
    displayOptions.reduceFlashing ? "magnolia-app--reduce-flashing" : "",
    displayOptions.lowFrameRateMode ? "magnolia-app--low-frame-rate" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={appClassName}>
      {screen}
      <TransitionPresentationLayer
        events={app.transitionEvents}
        displayOptions={displayOptions}
      />
      {app.activeOverlayPresentation ? (
        <PresentationOverlay
          presentation={app.activeOverlayPresentation}
          cueSpec={app.content.presentationCues[app.activeOverlayPresentation.cueId]}
          onDismiss={app.dismissActiveOverlayPresentation}
          displayOptions={displayOptions}
        />
      ) : null}
      {app.equipmentModalNodeId && app.content && (
        <EquipmentModal
          content={app.content}
          nodeId={app.equipmentModalNodeId}
          onDismiss={app.dismissEquipmentModal}
        />
      )}
    </div>
  )
}
