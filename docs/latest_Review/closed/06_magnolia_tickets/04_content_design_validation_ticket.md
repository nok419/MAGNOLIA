# 作業チケット 04: Content / Design Package / Validator / Token 基盤

作成日: 2026-04-28
担当: 担当者D
主な対象: `content/gameplay`, `docs-tmp/11_design_package` または正式 `docs/11_design_package`, `tools/content-validator`, `packages/contracts` の content 型、`apps/web/src/styles`, `apps/web/src/render/shared/canvas-palette.ts`, repository / CI 設定

# 目的

大規模な見た目の変更を始める前に、content、design package、preset、validator、repository 衛生を整えます。

現状の content JSON は参照欠損が少なく、土台として使えます。一方で、`visualPresetId`, `hitboxPresetId`, `backgroundPresetId` は content 上に存在するのに、正本となる preset 定義が見当たりません。`docs-tmp/11_design_package` は `.DS_Store` のみで、デザイン規範が実装へ接続されていません。生成物や cache もアーカイブに混ざっています。このチケットでは、他3人が安全に描画と体験を直せるよう、検証と正本を作ります。

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

- アーカイブには `packages/contracts`, `packages/game-session`, `packages/persistence`, root workspace, lockfile, CI 定義が含まれていません。`apps/web/package.json` は `@magnolia/persistence` に依存していますが、`apps/web/tsconfig.json` の paths は `@magnolia/contracts` と `@magnolia/game-session` のみです。
- `apps/web/dist`, `apps/web/node_modules/.vite`, `apps/web/node_modules/.vite-temp`, `__MACOSX`, `.DS_Store`, `apps/web/tsconfig.tsbuildinfo` がアーカイブに含まれています。
- `docs-tmp/11_design_package` は `.DS_Store` のみで、design package 本文がありません。
- content の参照確認では、mission、transmission、enemy、bullet pattern、projectile、equipment/effect、condition、map node の ID 参照欠損は 0 件でした。
- content 件数は、areas 2、missions 3、enemies 7、bullet-patterns 9、projectiles 9、equipment 11、equipment/effects 10、progression conditions 2、transmissions 3 と chunks 3、map-logic 1 です。
- active mission で使われている敵は `enemy_scout` 43 出現、`enemy_standard` 22 出現、`enemy_heavy` 8 出現です。`a1`, `a2`, `b1`, `c1` は active mission では未使用です。
- active enemy が使う bullet pattern は `bp_scout_single`, `bp_standard_spread`, `bp_heavy_burst`, `bp_spiral_stream` です。
- mission timing は、`mission_good_morning` が 60 秒で本文 55 秒、`mission_evacuation` が 60 秒で本文 55.7 秒、`mission_where_are_you` が 90 秒で本文 85 秒まであります。
- `content/gameplay` には `visual-presets`, `hitbox-presets`, `background-presets` の正本ディレクトリがありません。
- `apps/web/src` 内の色指定は CSS / TS / TSX 合計で約 1,010 個確認されました。特に `battle-renderer.ts`, `ExploreCanvas.tsx`, `explore.css`, `menu-equipment.css`, `battle.css` に多くあります。

# 主担当範囲

- repository から生成物、cache、OS metadata を除外するルール。
- clean checkout での typecheck / build / content validation。
- content validator の作成。
- design package の復元または新規正本化。
- visual / hitbox / background preset の schema と content 正本。
- active / prototype / deprecated content の分類。
- canvas palette、CSS tokens、common UI component の基盤。
- mission beat 調整を content 側で表現するルール。

# 触らない範囲

- `use-magnolia-app.ts` の event queue と frame loop 分割は担当者Aに渡します。
- battle renderer の具体的な描画改善は担当者Bに渡します。
- ExploreCanvas、MapScreen、MiniMap の分割と scan 表示は担当者Cに渡します。
- 他チケットの renderer に直接大きく手を入れる場合は、preset / token の提供に留め、各担当と合意してから行ってください。

# 依頼内容

## P0: repository 衛生と clean build を戻す

作業:

- `.gitignore` またはアーカイブ作成手順で、次を除外してください。
  - `apps/web/dist`
  - `apps/web/node_modules`
  - `apps/web/node_modules/.vite`
  - `apps/web/node_modules/.vite-temp`
  - `__MACOSX`
  - `.DS_Store`
  - `*.tsbuildinfo`
- root workspace、packages、tsconfig、lockfile、CI 定義を正規 repository に戻してください。
- clean checkout で `tsc --noEmit` と build が通ることを確認してください。
- `@magnolia/persistence` の path 解決が workspace と references の両方で問題ないか確認してください。

## P0: content validator を必須化する

最低限、次を検証します。

- JSON の ID とファイル名の対応。
- 全 ID の一意性。
- mission から transmission、condition、enemy、hazard、background preset への参照。
- transmission から area、mission、chunk、reward equipment への参照。
- enemy から bullet pattern、visual preset、hitbox preset への参照。
- bullet pattern から projectile への参照。
- projectile から visual preset、hitbox preset への参照。
- equipment から effect への参照。
- map node から area、transmission、equipment、target area への参照。
- mission duration に対して wave、hazard、subtitle chunk が範囲内にあること。
- `audioStartDelayMs`, `outroMs`, `hearingThresholdOverride`, `repeatDecayRate` の境界値。
- active / prototype / deprecated content の分類。
- visual / hitbox / background preset の coverage。
- presentation cue の channel、duration、`reduceFlashing` variant の有無。

出力:

```text
tools/content-validator/
  validate-content.ts
  reference-rules.ts
  timing-rules.ts
  preset-rules.ts
  presentation-cue-rules.ts
```

## P0: design package を実体として復元する

`docs-tmp/11_design_package` または正式な `docs/11_design_package` に、抽象語だけでなく実装へ接続できる文書を置いてください。

最低限の章:

- visual-axis: 儚さ、瀟洒さ、非言語性、人工性、温かみの残り、脅威ノイズを、色、線、余白、密度、motion、alpha の観点で定義する。
- palette: CSS token と canvas palette の semantic name を定義する。
- motion: 予兆、衝撃、余波、保存の duration、easing、点滅制限を定義する。
- surface: panel、border、blur、scanline、vignette の使い方を定義する。
- iconography: transmission、collectible、fragment、enemy、hazard、repair の記号を定義する。
- screen grammar: title、explore、battle、map、menu の情報階層を定義する。
- accessibility: reduceFlashing、lowFrameRate、字幕欠損、aria-label の扱いを定義する。

## P1: visual / hitbox / background preset を正本化する

content 側の推奨配置:

```text
content/gameplay/
  visual-presets/
    enemies/
    projectiles/
    hazards/
    backgrounds/
    ui-themes/
  hitbox-presets/
    enemies/
    projectiles/
    hazards/
  active/
  prototypes/
  deprecated/
  migrated-id-map.json
```

想定型:

```ts
type EnemyVisualPreset = {
  presetId: string
  rendererKind: "circleSignal" | "shardCore" | "bossLattice"
  paletteRole: string
  orbitScale?: number
  glyphCount?: number
  glowIntensity?: number
  motionProfile?: string
  accessibilityVariant?: string
}

type ProjectileVisualPreset = {
  presetId: string
  rendererKind: "orb" | "shard" | "lance" | "pulse" | "carrier"
  trailKind?: string
  auraKind?: string
  radiusScale?: number
  glowIntensity?: number
  motionSmear?: number
}

type BackgroundPreset = {
  presetId: string
  theme: "centralTower" | "broadcastFacility" | "voidField"
  residualWarmth: number
  structureDensity: number
  dustDensity: number
  scanlineIntensity: number
  vignetteStrength: number
}
```

作業:

- 既存 content の `visualPresetId`, `hitboxPresetId`, `backgroundPresetId` が正本 preset に解決できるようにしてください。
- 未使用または将来用の `a1`, `a2`, `b1`, `c1` と関連 pattern / projectile は active から分けるか、prototype として明示してください。
- `proj_enemy_petal` のように ID 名と現在の見た目がずれているものは、description、migration、または ID 変更方針を決めてください。
- renderer coverage を validator に入れてください。

## P1: UI token と canvas palette を接続する

作業:

- `styles/tokens.css` と `render/shared/canvas-palette.ts` を semantic name で対応させてください。
- 直接色指定を今後増やさない lint / review rule を作ってください。
- common UI component の基盤を用意してください。

候補:

```text
apps/web/src/components/common/
  PanelFrame.tsx
  Meter.tsx
  SignalBadge.tsx
  TabList.tsx
  ModalShell.tsx
  StatusChip.tsx
  CaptionText.tsx
```

注意:

- renderer 内の全色置換をこのチケットだけで完了させる必要はありません。担当者B/Cが分割した module から palette へ寄せられるよう、基盤とルールを先に用意してください。
- `threatNoise` に相当する赤系は、警告や聴取不能に使う量を制限してください。

## P1: state transition table と save normalizer の確認項目を作る

アーカイブ外の package に実装があるため、このチケットでは table と test 要件をまとめます。

最低限の command:

- `startMission`
- `completeMission`
- `interactExploreNode`
- `equipItem`
- `purchaseEquipment`
- `upgradeEquipment`
- `saveToSlot`
- `openArchive`
- `changeSetting`

各 command について、precondition、mutation、events、persistence、UI がしてはいけない判断を表にしてください。

save normalizer の確認項目:

- 古い save を import して新 schema に normalize できる。
- 削除された equipment ID を migrated-id-map で代替または安全に無効化できる。
- enemy / projectile / mission ID 変更が save に影響しないか、影響する場合は migration できる。
- seen equipment を localStorage に残すか profile に入れるかが明記されている。
- export / import 後に slot summary、profile、archive、equipment、settings が一致する。

## P2: mission beat を content で調整する

Web 側の TypeScript に mission 固有分岐を増やさず、まず content で調整してください。

`mission_good_morning`:

- 0〜7 秒: 起動、移動確認。敵なし、または弾なしの弱いノイズ源。
- 7〜17 秒: main の確認。前方ノイズ源を消す。
- 17〜23 秒: 近接攻撃の確認。
- 23〜30 秒: sub の確認。敵弾を消す。
- 30〜37 秒: 被弾ノイズの確認。失敗しても大きく壊れない。
- 37〜44 秒: magnetic disaster。予兆と継続ノイズを見せる。
- 44〜55 秒: 探索へ戻る準備。

`mission_where_are_you`:

- 90 秒のままにするか、45〜65 秒程度へ圧縮するかを決めてください。
- カナ、タクミ、ミサキの speaker ごとに弾幕と hazard の性格を変えてください。
- 最後の「絶対。」は短いが守る価値の高い区間にしてください。

`mission_evacuation`:

- 本文は 55.7 秒まであるため、空白時間を埋めるのではなく、壊れた公共放送として断続、繰り返し、部分欠損を調整してください。
- 後半は fragment 回収で一部が戻る前提にしてください。

必要になった場合だけ追加する汎用フィールド:

- `wave.intentTag`
- `enemy.noiseBandKind`
- `enemy.clearEffectStrength`
- `transcriptChunk.importance`
- `transcriptChunk.protectionWeight`

追加する場合は、contracts、loader validation、session、UI の順で変更してください。

# 受け入れ条件

- clean checkout で typecheck と build が通る。
- repository / archive に生成物、cache、OS metadata が混ざらない。
- `content:validate` が CI で実行され、参照欠損、未定義 preset、duration 範囲外、chunk 不一致を検出できる。
- `docs-tmp/11_design_package` または正式 `docs/11_design_package` に本文が存在し、token / preset / accessibility と接続されている。
- `visualPresetId`, `hitboxPresetId`, `backgroundPresetId` が正本 preset に解決できる。
- active / prototype / deprecated content の分類が明示されている。
- direct color literal を今後増やさないルールがある。
- common UI component と canvas palette の入口ができている。
- mission beat 調整は content 中心で行われ、Web 側に mission 固有分岐が増えていない。
- `reduceFlashing` と `lowFrameRateMode` の design rule が文書と validator / review checklist に入っている。

# 他チケットとの受け渡し

- 担当者Aへ: presentation cue の duration、channel、blocking、reduceFlashing variant の検証項目を渡してください。
- 担当者Bへ: `BackgroundPreset`, `EnemyVisualPreset`, `ProjectileVisualPreset`, `noiseBandKind`, canvas palette を渡してください。
- 担当者Cへ: scan / signal hint / map / minimap の semantic color、movementMode、interactionTargets に必要な型と docs を渡してください。

# レビュー時に確認すること

- design package が抽象語だけで終わらず、色、線、motion、density、duration、accessibility に落ちているか。
- validator が「今は問題ない」状態を確認するだけでなく、今後の欠損を検出できるか。
- preset を入れた結果、renderer の ID 分岐が減る方向になっているか。
- content 調整で Web 側に mission 専用 TypeScript 分岐を増やしていないか。
- generated artifact が再びレビュー対象に混ざらない仕組みがあるか。
