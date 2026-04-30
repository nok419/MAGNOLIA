# 作業チケット 02: Battle 通信体験と renderer 分割

作成日: 2026-04-28
担当: 担当者B
主な対象: `apps/web/src/screens/battle/BattleScreen.tsx`, `apps/web/src/components/BattleCanvas.tsx`, `apps/web/src/components/battle-renderer.ts`, 新設する `apps/web/src/render/battle/*`

注記: この文書は閉じたレビュー履歴です。現行のコードマップは `docs/02_開発体制とディレクトリ構成.md`、データ契約は `docs/05_データ構造.md`、表示境界は `docs/08_表示と機能の境界.md`、design package は `docs/11_design_package/README.md` を参照してください。

# 目的

戦闘画面を、敵を倒す画面ではなく、通信の明瞭度を守り、欠損した言葉を拾い戻す画面として成立させます。

現状には、字幕欠損表示、fragment 描画、hazard 描画、support field、pickup などの入口があります。しかし、被弾、ノイズ突入、ノイズ復帰、fragment 出現、敵撃破が event として battle canvas に届かず、`battle-renderer.ts` も 1 ファイルに描画責務が集中しています。このチケットでは、battle channel の event を受けて画面に反映し、battle renderer を分割し、content の visual preset を描画側の入口にします。

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

- `BattleCanvas.tsx` は薄い host ですが、battle presentation event を受け取る props がありません。
- `BattleScreen.tsx` では `activeSubtitle.audible === false` の時に欠損表示へ変換する入口があります。ただし、被弾直後、ノイズ突入、復帰の時間差は表現しにくい状態です。
- `battle-renderer.ts` は 2,246 行あり、背景、敵、敵弾、自弾、hazard、support field、pickup、fragment、barrier、utility が同じファイルにあります。
- `drawBattleFrame()` は renderState の配列を順に描く入口としては良いですが、背景、敵、弾、hazard の詳細実装が同じファイルに続いています。
- `drawBattleFrame()` の背景は固定 gradient / grid で、mission content の `backgroundPresetId` を描画の入口にしていません。
- 敵と弾の renderer は `enemyId`、`projectileId`、`missionId` を候補 key にしており、content 上の `visualPresetId` と `hitboxPresetId` が描画の正本になっていません。
- `p.inversePhaseVisual && p.projectileId !== "proj_player_pulse_melee"` のように、core renderer 内に projectile ID 例外があります。
- content 上の敵には `analysisValue` がありますが、敵ごとにどの通信帯域を汚しているかはまだ見えにくい状態です。
- `BattleRenderState.fragments` は描画できますが、欠けた言葉が自機からこぼれるために必要な `createdAtMs`、`originX`、`originY` は現行の確認範囲では不足しています。

# 主担当範囲

- BattleScreen の HUD、字幕、結果表示のうち、通信明瞭度と fragment に関わる表示。
- BattleCanvas の props と draw call。
- battle renderer の分割、battle presentation layer、fragment / noise / hit / clear の見た目。
- battle 背景、敵、弾、hazard の preset dispatch。
- 敵撃破を「帯域が開いた」として見せる最小表現。

# 触らない範囲

- App 側で event を保持し、BattleCanvas へ渡す経路は担当者Aが主担当です。
- enemy / projectile / background preset の schema と JSON 正本は担当者Dが主担当です。このチケットでは、それらを受け取れる描画構造を先に用意します。
- Explore / Map の scan、signal hint、interactionTargets は担当者Cに渡します。
- fragment の生成、回収判定、save / archive 統合は session / persistence の責務です。このチケットでは必要な renderState と受け入れ条件を明記し、表示だけを実装します。

# 依頼内容

## P0: battle presentation event を描画する

担当者Aから渡される `battleEvents` を受け、`drawBattleFrame()` の入力に含めます。

想定:

```ts
type BattleCanvasProps = {
  renderState: BattleRenderState
  battleEvents: TimedPresentationRequest[]
  transparentBg?: boolean
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
}
```

作業:

- `BattleScreen` から `BattleCanvas` へ `battleEvents` を渡してください。
- `drawBattleFrame()` に `battleEvents` と `reduceFlashing` を渡してください。
- event 描画は `drawBattlePresentationLayer()` として、通常描画とは別の layer にしてください。
- `battle.player.hit`、`battle.noise.peak`、`battle.noise.clear` を最小実装で描いてください。
- event payload が不足している場合は、renderState から安全に fallback してください。ただし、gameplay 判定を描画側で行わないでください。

最小表現:

- `battle.player.hit`: 被弾位置または自機位置から短い信号線の裂け目、字幕 panel の微小なずれ、fragment 出現方向への残光。
- `battle.noise.peak`: 字幕 panel と背景走査線を一段濁らせる。高速点滅は使わない。
- `battle.noise.clear`: 字幕 mask がほどける短い再同期、背景粒子の密度低下、波形 cursor の安定。

## P1: fragment を「欠けた言葉」として見せる

必要な renderState 追加案:

```ts
type BattleFragmentViewModel = {
  fragmentId: string
  chunkId: string
  startRatio: number
  endRatio: number
  x: number
  y: number
  originX: number
  originY: number
  createdAtMs: number
  expiresAtMs: number
  strength: number
}
```

作業:

- `createdAtMs` と `originX/Y` がある場合は、出現直後に origin から現在位置へこぼれるように描いてください。
- 情報がない場合も、既存 `x/y` と `expiresAtMs` で残光を描き、単なる pickup icon に見えないようにしてください。
- 回収 event `battle.fragment.recovered` が渡された場合は、字幕 panel または result preview 側で短い復元表現を出してください。
- fragment の回収判定や保存統合は描画側で行わないでください。

## P1: battle renderer を分割する

現在の `battle-renderer.ts` を、最低限次のように分けます。

```text
apps/web/src/render/battle/
  BattleCanvas.tsx
  draw-battle-frame.ts
  presentation-layer.ts
  backgrounds/
    background-renderer.ts
    central-tower.ts
    broadcast-facility.ts
  enemies/
    enemy-renderer.ts
    enemy-presets.ts
  projectiles/
    projectile-renderer.ts
    projectile-trails.ts
  hazards/
    magnetic-disaster.ts
  fragments.ts
  pickups.ts
  support-fields.ts
  barrier.ts
```

分割方針:

- `draw-battle-frame.ts` は描画順の orchestration に近づけてください。
- background、enemy、projectile、hazard、fragment は別 module にしてください。
- 既存の関数名を急にすべて変えず、まず移動してから整理してください。
- `reduceFlashing` は `presentation-layer` と `hazards` の両方で有効にしてください。
- `KeyVisualModal` が battle renderer に依存している場合は、暫定 adapter を置いて破壊を避けてください。恒久対応は担当者Dの design / visual QA と連携します。

## P1: renderer の dispatch を preset 中心に変える

作業:

- `BattleRenderState.enemies[]` に `visualPresetId`, `hitboxPresetId`, 必要なら `visualParams` を含める想定で renderer を準備してください。
- `BattleRenderState.projectiles[]` に `visualPresetId`, `hitboxPresetId`, `renderEffects[]` を含める想定で renderer を準備してください。
- `BattleRenderState` または battle view model に `backgroundPresetId` を含める想定で背景 renderer を準備してください。
- `enemyId`, `projectileId`, `missionId` による新しい例外分岐を増やさないでください。
- `inversePhaseVisual` のような boolean は、将来 `renderEffects[]` や `auraPresetId` に移せるようにしてください。

## P2: 敵撃破を通信回復と結びつける

担当者Dが content / schema 側で `enemy.noiseBandKind` などを用意する想定です。このチケットでは、renderState にその値が来た時に見た目へ反映できるようにします。

想定:

```ts
type NoiseBandKind = "subtitle" | "speaker" | "metadata" | "fragment" | "waveform"

type NoiseSourceClearPresentationRequest = {
  cueId: "battle.noiseSource.clear"
  channel: "battle"
  requestId: string
  enemyId: string
  worldPosition: { x: number; y: number }
  noiseBandKind?: NoiseBandKind
  analysisDelta: number
}
```

作業:

- `battle.noiseSource.clear` を受け取った場合、撃破位置から背景波形または字幕 panel へ短い清澄化表現を出してください。
- scout / standard / heavy の差は、enemy ID ではなく `noiseBandKind` または preset で表現してください。
- 敵を倒した瞬間に、score 表示だけでなく通信が少し戻ったことが分かるようにしてください。

## P2: BattleScreen の content access を削減する

現状の `BattleScreen` は reward 表示のために content を受け取っています。

作業:

- `BattleResultViewModel` に表示済みの reward name、slot label、result transcript preview を含める方針を記述してください。
- 実装可能なら、`BattleScreen` から full `ContentBundle` を外してください。
- まだ package 側の ViewModel が未実装なら、暫定で props を残し、削除条件を明記してください。

# 受け入れ条件

- `battle.player.hit` event が届くと、被弾が数値変化だけでなく短い出来事として見える。
- `battle.noise.peak` と `battle.noise.clear` は別の見た目になっている。
- `reduceFlashing` 有効時に高速点滅、強い明滅、読みづらい揺れが出ない。
- fragment は単なる回収 item ではなく、欠けた言葉がこぼれたものとして見える。
- fragment に触れた後の復元結果は、session / persistence から渡された結果だけを表示する。
- `drawBattleFrame()` は描画順を管理する役割に近づき、背景、敵、弾、hazard、fragment が別 module にある。
- renderer の core に新しい `enemyId`, `projectileId`, `missionId` の個別例外が増えていない。
- `backgroundPresetId`、`visualPresetId`、`renderEffects[]` への移行先がコード上で分かる。
- 敵撃破時に「ノイズ源が消えた」ことが画面上で確認できる。

# 他チケットとの受け渡し

- 担当者Aから: `battleEvents` の型、寿命、dedupe 済み event 配列を受け取ります。
- 担当者Dから: `VisualPreset`, `HitboxPreset`, `BackgroundPreset`, `noiseBandKind`, canvas palette の正本を受け取ります。
- 担当者Cへ: shared coordinate / seeded random / easing を共通化する場合、命名と配置を合わせてください。

# レビュー時に確認すること

- 描画側が当たり判定、ノイズ加算、解析率、復元率、報酬計算を行っていないか。
- 字幕欠損の aria-label 方針が、アクセシビリティと未聴取本文の扱いの両面で明記されているか。
- 背景や fragment が敵弾視認性を下げていないか。
- `lowFrameRateMode` でも event の寿命や進行が破綻しないか。
- content / session 側が未実装の項目に対して、暫定 fallback と削除条件が書かれているか。
