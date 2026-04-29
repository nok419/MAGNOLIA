import type {
  CollectibleMapNode,
  ContentBundle,
  DomainEvent,
} from "@magnolia/contracts"
import { readEquipmentSlotLabel } from "@/app/display-helpers"
import type { ExploreItemPopup } from "@/app/app-state"

export const ITEM_POPUP_DURATION_MS = 2200

export function createExplorePopup(title: string, detail: string): ExploreItemPopup {
  return {
    id: `${title}:${detail}:${Date.now()}`,
    title,
    detail,
    expiresAt: Date.now() + ITEM_POPUP_DURATION_MS,
  }
}

export function pushExplorePopup(
  currentPopups: ExploreItemPopup[],
  popup: ExploreItemPopup,
): ExploreItemPopup[] {
  const activePopups = currentPopups.filter((entry) => entry.expiresAt > Date.now())

  // 同じ通知を短時間に重ね過ぎると読みにくいので、同内容は入れ替えます。
  const deduped = activePopups.filter(
    (entry) => !(entry.title === popup.title && entry.detail === popup.detail),
  )

  return [...deduped, popup].slice(-3)
}

export function buildCollectiblePopups(
  events: DomainEvent[],
  content: ContentBundle,
): { popups: ExploreItemPopup[]; equipmentModalNodeId: string | null } {
  if (events.length === 0) {
    return { popups: [], equipmentModalNodeId: null }
  }

  const now = Date.now()
  let equipmentModalNodeId: string | null = null
  const popups = events.flatMap((event) => {
    if (event.type !== "collectibleCollected") {
      return []
    }

    const node = findCollectibleNode(content, event.nodeId)
    if (!node) {
      return []
    }

    if (node.collectibleKind === "hiddenEquipment") {
      equipmentModalNodeId = node.nodeId
      return []
    }

    const popup = describeCollectiblePopup(node, content)
    return [
      {
        id: `${event.nodeId}:${now}`,
        title: popup.title,
        detail: popup.detail,
        expiresAt: now + ITEM_POPUP_DURATION_MS,
      },
    ]
  })

  return { popups, equipmentModalNodeId }
}

export function findCollectibleNode(
  content: ContentBundle,
  nodeId: string,
): CollectibleMapNode | null {
  for (const mapLogic of Object.values(content.mapLogic)) {
    const node = mapLogic.collectibleNodes.find((candidate) => candidate.nodeId === nodeId)
    if (node) {
      return node
    }
  }
  return null
}

function describeCollectiblePopup(
  node: CollectibleMapNode,
  content: ContentBundle,
): { title: string; detail: string } {
  if (node.collectibleKind === "selfRepairPoints") {
    return {
      title: "自己修復ポイントを取得",
      detail: `+${node.selfRepairPointAmount ?? 0} pt`,
    }
  }

  const equipment = node.equipmentId ? content.equipment[node.equipmentId] : undefined
  return {
    title: equipment?.name ?? "装備を取得",
    detail: equipment ? `${readEquipmentSlotLabel(equipment.slot)}を取得` : "装備を取得",
  }
}
