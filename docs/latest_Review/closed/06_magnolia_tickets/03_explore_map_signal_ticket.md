# 作業チケット 03: Explore / Map 信号探索と表示境界の修正

作成日: 2026-04-28
担当: 担当者C
主な対象: `apps/web/src/components/ExploreCanvas.tsx`, `apps/web/src/screens/explore/ExploreScreen.tsx`, `apps/web/src/components/MiniMap.tsx`, `apps/web/src/screens/map/MapScreen.tsx`, 新設する `apps/web/src/render/explore/*`, `apps/web/src/render/map/*`, `apps/web/src/render/shared/*`

注記: この文書は閉じたレビュー履歴です。現行のコードマップは `docs/02_開発体制とディレクトリ構成.md`、データ契約は `docs/05_データ構造.md`、表示境界は `docs/08_表示と機能の境界.md`、design package は `docs/11_design_package/README.md` を参照してください。

# 目的

探索を「見えているアイコンへ移動する画面」から、「信号の反応を読み、通信の位置を絞る画面」へ寄せます。同時に、探索、地図、ミニマップが content 全量や独自 projection に依存しすぎている状態を修正します。

このチケットは、scan、signal hint、interactionTargets、map / minimap view model、ExploreCanvas 分割、trail state の instance-local 化を担当します。battle の被弾や fragment 表現は担当者B、App 直下の presentation queue と transition layer は担当者A、preset と validator は担当者Dに渡します。

# 全員に共有するレビュー整理

- MAGNOLIA の現在の問題は、敵、弾、HUD の量ではなく、被弾、ノイズ閾値超過、復帰、通信接続、fragment 回収がプレイヤーに出来事として届きにくい点にあります。
- 全担当は、演出を「予兆、衝撃、余波、保存」の短い時間構造で扱います。
- gameplay の正しさは session、save は persistence、content は content JSON、表示は renderState / ViewModel を描画する層として扱います。
- 画面側で full `ContentBundle`、保存データ、session 内部状態を読んで、未発見情報、報酬、衝突、復元、開放条件を推測しないでください。
- mission ID、enemy ID、projectile ID を見て、表示層に新しい個別分岐を増やさないでください。
- `reduceFlashing` と `lowFrameRateMode` は、すべての新規演出の受け入れ条件に含めます。
- `packages/contracts`, `packages/game-session`, `packages/persistence` は今回のアーカイブ外です。必要な変更は、想定型、session から返る値、受け入れ条件を明記してから該当 package 側で実装してください。
- content の参照整合性は現時点では大きく崩れていません。今後の変更で崩れないよう、検証はチケット04と連携します。

# 4人の分担

- 担当者A: App / Presentation 境界、event queue、frame loop、UI event 合成の撤去。
- 担当者B: Battle 画面での被弾、ノイズ、fragment、敵撃破、battle renderer 分割。
- 担当者C: Explore / Map 画面での scan、信号探索、interactionTargets、projection、explore renderer 分割。
- 担当者D: content validator、design package、visual / hitbox / background preset、repository 衛生、UI token / palette。

# 確認済みの問題

- `ExploreCanvas.tsx` は 3,622 行あり、canvas host、resize、camera、background、fog、vision、scan、reboot、release、trail、boundary、nav cue、player / marker 描画が同じファイルにあります。
- `ExploreCanvas.tsx` には `prevPlayerX`, `prevPlayerY`, `trailInitialized`, `trailNodes`, `lightMotes` などの module global state があります。複数 instance、preview、test、画面再生成で状態が混線する恐れがあります。
- 探索には `scanPulses` と `signalHints` の描画入口がありますが、confidence の蓄積、ghost 反応、識別済みへの昇格、map / minimap への保存という流れはまだ十分に見えません。
- `ExploreScreen.tsx` は `visibleCollectibles` と `visibleTransmissions` から click candidate を再構成し、range と vision を screen 側で再判定しています。
- `MapScreen.tsx` は full `ContentBundle` と profile を受け取り、`computeAreaCompletionRate` や `readTransmissionCompletionState` を直接使っています。
- `MapScreen.tsx` は `Object.keys(content.mapLogic)[0]` で最初の map を暗黙に選んでいます。map が増えると不安定です。
- `MiniMap.tsx` は独自 projection と直接色を持ち、探索画面や地図との共通契約が弱い状態です。

# 主担当範囲

- ExploreScreen の click / interaction 表示境界。
- ExploreCanvas の分割、scan / signal hint / trail / background / fog / boundary / nav cue。
- MapScreen の ViewModel 化、mapId 明示化、content access 削減。
- MiniMap の ViewModel 化、shared projection、semantic palette への移行。
- 探索 movement mode と scan confidence の表示。

# 触らない範囲

- App 側の presentation queue と transition event の寿命管理は担当者Aが主担当です。
- Battle 画面の focus、ノイズ、fragment、敵撃破表現は担当者Bが主担当です。
- content schema、preset JSON、validator、design package は担当者Dが主担当です。
- session package が必要な `interactionTargets`, `WorldMapViewModel`, `MiniMapViewModel` を返す実装は、アーカイブ外の package で確定してください。このチケットでは必要な型と画面側の受け入れ方を明記します。

# 依頼内容

## P0: interactionTargets を表示層の入口にする

現状の screen 側再判定をやめ、session / renderState から click 可能 target を受け取る構造にします。

想定:

```ts
type ExploreInteractionTargetViewModel = {
  nodeId: WorldMapNodeId
  kind: "transmission" | "collectible" | "warp"
  worldPosition: { x: number; y: number }
  visible: boolean
  clickable: boolean
  interactionRadius: number
  screenHintPriority: number
  markerKind?: string
}
```

作業:

- `ExploreScreen` は `interactionTargets` を受け取り、projection と click radius の UI 変換だけを行ってください。
- `visibleCollectibles` と `visibleTransmissions` から screen が独自に range / vision を判定する処理を減らしてください。
- session へ `interactExploreNode` を送った後の成否は session の結果だけを見てください。
- 未発見通信の正確な座標を content から逆引きして描画しないでください。

## P0: MapScreen を WorldMapViewModel に寄せる

想定:

```ts
type WorldMapViewModel = {
  mapId: string
  worldBounds: Rect
  selectedAreaId?: AreaId
  areas: WorldMapAreaViewModel[]
  transmissions: WorldMapTransmissionViewModel[]
  collectibles: WorldMapCollectibleViewModel[]
  warps: WorldMapWarpViewModel[]
  player: { areaId: AreaId; position: { x: number; y: number } }
}
```

作業:

- `MapScreen` が full `ContentBundle` と profile を直接読む範囲を減らしてください。
- `Object.keys(content.mapLogic)[0]` による暗黙の map 選択をやめ、`mapId` を view model または snapshot から受け取ってください。
- `computeAreaCompletionRate` と `readTransmissionCompletionState` は screen ではなく view model builder 側へ寄せてください。
- 地図上に表示できる情報は、session が公開した view model の範囲に限ってください。

## P1: ExploreCanvas を分割し、trail state を instance-local にする

新規配置案:

```text
apps/web/src/render/explore/
  ExploreCanvas.tsx
  draw-explore-frame.ts
  camera.ts
  background.ts
  fog.ts
  vision.ts
  scan-pulse.ts
  signal-hints.ts
  trail.ts
  reboot-sequence.ts
  release-sequence.ts
  restricted-boundary.ts
  nav-cues.ts

apps/web/src/render/shared/
  coordinates.ts
  seeded-random.ts
  easing.ts
  canvas-palette.ts
  draw-context.ts
```

作業:

- `ExploreCanvas.tsx` を canvas host と draw call に近づけてください。
- camera、background、fog、vision、scan、trail、reboot、release、boundary、nav cue を別 module に移してください。
- `trailNodes` と `lightMotes` は module global ではなく `useRef` または renderer state factory に閉じてください。
- trail の lifetime、alpha、最大数は displayOptions と visual preset から決められるようにしてください。
- shared `coordinates.ts` を作り、ExploreScreen、MapScreen、MiniMap の projection 重複を減らしてください。

## P1: scan を confidence の蓄積として扱う

想定:

```ts
type ExploreSignalHintViewModel = {
  nodeId: string
  kind: "transmission" | "collectible" | "equipment" | "repair"
  category?: "private" | "broadcast" | "automated" | "maintenance"
  bearingRad: number
  distanceBand: "near" | "mid" | "far"
  strength: number
  confidence: number
  expiresAtMs?: number
  detectedState?: "hint" | "ghost" | "identified"
}
```

作業:

- scan pulse が未識別ノードに触れた時、方角、距離帯、信号強度だけを見せてください。
- confidence が低い間は正確なアイコンを出さず、視界円の縁、波形、ghost 円弧で反応を示してください。
- confidence が閾値を超えたら疑似検出、近距離到達または上限到達で識別済みにしてください。
- 一度識別した通信・収集物は map / minimap に残るようにしてください。
- scan を使わなくても近づけば兆候を追えるようにしてください。
- scan 後 300〜500ms 程度は HUD 波形や視界円に軽い乱れを出し、操作に意味を持たせてください。

## P2: 移動を受信姿勢として見せる

探索側の想定:

```ts
type ExploreRenderState = {
  playerVelocity: { x: number; y: number }
  movementMode: "normal" | "wideScan" | "precisionReceive"
  signalStability: number
  scanCooldownRatio?: number
}
```

作業:

- 通常移動は標準の受信状態として見せてください。
- dash は広域走査として、速度は高いが signal hint の反応が粗くなる見え方にしてください。
- 停止または低速移動は精密受信として、bearing が安定し confidence が上がりやすい見え方にしてください。
- movementMode の gameplay 効果を UI が決めないでください。UI は session が返した mode と stability を描くだけにしてください。

## P2: MiniMap を ViewModel と shared projection に寄せる

作業:

- `MiniMapViewModel` を受け取る構造にし、MiniMap が content 全量を読まないようにしてください。
- 探索画面、地図、ミニマップで projection helper を共有してください。
- 未識別ノードは exact marker ではなく、signal hint や ghost 状態に応じた表現にしてください。
- `reduceFlashing` 有効時に sweep や scanline が強く動きすぎないようにしてください。

## P2: connection transition に必要な探索側情報を渡す

transition layer 自体は担当者Aの主担当です。このチケットでは、探索側から transition の起点に必要な情報を渡せるようにします。

作業:

- `interactionTargets` または explore event に、接続対象 node の world position と画面上 anchor を渡せるようにしてください。
- `transmission.connect.sequence` が発火した時、探索側の最後の renderState を 1 frame 参照できる構造を担当者Aと確認してください。
- 探索側で独自に screen を battle へ切り替える処理を増やさないでください。

# 受け入れ条件

- 未識別通信の正確なアイコンが、最初から常時表示されない。
- scan により方角、距離帯、カテゴリ、信号強度が分かる。
- scan を繰り返す、または近づくことで ghost 反応から識別済みに進む。
- 識別済みの通信・収集物は map / minimap に残る。
- `ExploreScreen` は range / vision / 取得可否を独自に再判定しない。
- `MapScreen` は `Object.keys(content.mapLogic)[0]` を使わない。
- `MapScreen` と `MiniMap` は full content を読まず、ViewModel を主入力にする。
- `ExploreCanvas` の trail / light mote 状態は module global ではない。
- ExploreCanvas は host と frame draw に近づき、background、fog、scan、trail、reboot、release、boundary、nav cue が別 module にある。
- `reduceFlashing` 有効時、scan や sweep が強く点滅しない。

# 他チケットとの受け渡し

- 担当者Aへ: transition 起点に必要な node anchor、last explore renderState の保持方針を渡してください。
- 担当者Bへ: shared coordinate、easing、seeded random の配置を合わせてください。
- 担当者Dへ: scan / signal hint / movementMode / map view model の型を validator と docs に反映できるよう渡してください。

# レビュー時に確認すること

- screen 側が content から未発見ノードの正確な座標を推測していないか。
- click 可能かどうかを UI が独自に決めていないか。
- scan が面倒な再探索になっていないか。一度識別したものは残っているか。
- 探索の速さ、停止、scan がそれぞれ見た目として区別できるか。
- map / minimap が今後の複数 map に耐える `mapId` を持っているか。
