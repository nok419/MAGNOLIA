# 作業チケット 01: App / Presentation 境界の修正

作成日: 2026-04-28
担当: 担当者A
主な対象: `apps/web/src/app`, `apps/web/src/app/App.tsx`, `apps/web/src/components/PresentationOverlay.tsx`, 新設する `apps/web/src/app/presentation/*`, `apps/web/src/app/frame-loop/*`

# 目的

2枚のレビューで共通している問題は、設計上は PresentationRequest と renderState / snapshot を中心に進める方針がある一方で、現行 Web 側が overlay 以外の presentation を落とし、さらに `use-magnolia-app.ts` が session 接続、frame loop、入力、画面遷移、popup、localStorage、UI 用イベント合成をまとめて抱えている点です。

このチケットでは、表示層へ出来事を届ける経路を復旧し、App 層を薄くします。戦闘、探索、地図、content の具体的な見た目は他チケットに渡し、このチケットでは presentation event の保持、寿命管理、画面への受け渡し、domain event の境界だけを担当します。

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

- `use-magnolia-app.ts` は 981 行あり、content load、repository 作成、session 作成、frame loop、入力処理、screen command、overlay queue、item popup、seen equipment の localStorage 管理を同じファイルで扱っています。
- `syncFromSession()` は `filterOverlayPresentations()` で `channel === "overlay"` の request だけを残し、`battle`、`explore`、`transition` channel の request を state に保持していません。確認箇所は `use-magnolia-app.ts:690-699` と `775-780` です。
- `BattleCanvas` の props は `renderState`, `transparentBg`, `shipVariant`, `displayOptions` のみで、battle presentation event を受け取る入口がありません。
- `App.tsx` は overlay だけを `PresentationOverlay` として描画しています。transition layer はありません。
- `interactExploreNode()` の直前に UI 側で `buildExploreNodeInteractionEvents()` を呼び、collectible 取得 event を表示層で合成しています。確認箇所は `use-magnolia-app.ts:666-672` と `927-950` です。
- seen equipment は localStorage で profile と別管理です。UI preference として残すか、game progression に関わる状態として persistence に移すかを明確にする必要があります。

# 主担当範囲

- `use-magnolia-app.ts` の presentation state と frame loop 周辺。
- `App.tsx` の presentation layer 配置。
- overlay / battle / explore / transition の event queue と寿命管理。
- session から返る DomainEvent と UI popup の境界。
- App 層を分割するための新規 module の追加。

# 触らない範囲

- `battle-renderer.ts` の具体的な描画改善は担当者Bに渡します。
- `ExploreCanvas.tsx`, `MapScreen.tsx`, `MiniMap.tsx` の描画分割と scan 仕様は担当者Cに渡します。
- content JSON、preset JSON、validator、design package の作成は担当者Dに渡します。
- session / persistence package は今回のアーカイブ外です。必要な型と contract は記述しますが、実装担当が別にいる場合は package 側で確定してください。

# 依頼内容

## P0: overlay 以外の PresentationRequest を落とさない

`MagnoliaAppState` を次の考え方に変更します。

```ts
export type WebPresentationState = {
  activeOverlay: OverlayPresentationRequest | null
  pendingOverlay: OverlayPresentationRequest[]
  battleEvents: TimedPresentationRequest[]
  exploreEvents: TimedPresentationRequest[]
  transitionEvents: TimedPresentationRequest[]
}
```

作業:

- `filterOverlayPresentations()` を唯一の入口にしないでください。
- `syncFromSession()` で `incomingPresentationRequests` と `session.drainPresentationRequests()` を channel ごとに分類してください。
- `requestId` で重複登録を防いでください。
- non blocking event は `request.durationMs`、cue spec の duration、既定値の順に寿命を決めてください。
- 期限切れ event は `syncFromSession()` または presentation reducer で取り除いてください。
- `overlay` は既存の blocking queue を壊さず、現行 `PresentationOverlay` の挙動を維持してください。

想定する新規配置:

```text
apps/web/src/app/presentation/
  presentation-state.ts
  presentation-reducer.ts
  presentation-selectors.ts
  overlay-queue.ts
  event-lifetime.ts
```

## P0: battle / explore / transition へ event を渡す

作業:

- `BattleScreen` と `BattleCanvas` に `battleEvents` を渡す prop を追加してください。
- `ExploreScreen` と `ExploreCanvas` に `exploreEvents` を渡す prop を追加してください。
- `App` 直下に `TransitionPresentationLayer` を追加し、`transitionEvents` を渡してください。
- `transmission.connect.sequence` は transition channel の event として扱ってください。
- transition 中は追加操作が次画面へ持ち越されないよう、入力処理側で短く lock するか、session dispatch の多重実行を防いでください。
- transition の描画内容そのものは最小実装で構いません。探索ノードから戦闘画面へ即時に切り替わって見える状態を避けることを優先してください。

## P1: `use-magnolia-app.ts` を役割ごとに分割する

まず次の単位に分けます。

```text
apps/web/src/app/
  magnolia-client.ts
  frame-loop/useMagnoliaFrameLoop.ts
  frame-loop/explore-frame.ts
  frame-loop/battle-frame.ts
  presentation/*
  storage/seen-equipment-store.ts
  popups/item-popups.ts
```

分割方針:

- `magnolia-client.ts` は `loadContentBundle`, repository, `MagnoliaGameSession` の生成だけを担当します。
- frame loop は `requestAnimationFrame`、低フレームレート設定、入力 edge sync を担当します。
- presentation module は queue と selector のみを担当します。
- popup module は session から返った DomainEvent を表示用 popup に変換するだけにします。
- App hook は public app state と command callback の公開に近づけます。

## P1: UI 側の DomainEvent 合成をやめる

作業:

- `buildExploreNodeInteractionEvents()` を削除する前提で、session が `collectibleCollected` などの DomainEvent を返す経路を定義してください。
- session package がまだ対応していない場合は、一時 adapter を置いても構いません。ただし adapter 名とコメントで「暫定」であることを明示し、UI が正本ではないことを残してください。
- popup 表示は session から返った event だけを入力にしてください。
- collectible が本当に取得されたか、重複取得ではないか、装備取得なのか自己修復なのかは UI で判断しないでください。

## P2: seen equipment の保存場所を決める

作業:

- seen equipment が純粋な UI preference なら、`seen-equipment-store.ts` に閉じ、profile import / export の対象外であることを明記してください。
- 装備獲得後の誘導や NEW badge がゲーム進行の一部なら、persistence の profile preference として保存する方針に変更してください。
- どちらの場合も、slot import / export 後に状態が矛盾しない確認項目を追加してください。

# 受け入れ条件

- session が `battle.player.hit` を含む battle channel の request を返した時、`BattleCanvas` まで event が届く。
- session が `battle.noise.peak` と `battle.noise.clear` を返した時、それぞれ別 event として保持される。
- session が `transmission.connect.sequence` を返した時、App 直下の transition layer が受け取る。
- overlay の既存 queue、自動 dismiss、reboot / release overlay は壊れない。
- 同じ `requestId` が複数回 state に入らない。
- event の寿命切れで state が増え続けない。
- `reduceFlashing` 有効時に、強い点滅を前提とした演出が各画面へ強制されない。
- `interactExploreNode` の成功/失敗を UI が独自に判断しない。
- `use-magnolia-app.ts` は一度に全削減できなくてもよいが、frame loop、presentation、popup、storage の責務が別 module に切り出されている。

# 他チケットとの受け渡し

- 担当者Bへ: `battleEvents` prop と `TimedPresentationRequest` 型を渡してください。B はその event を battle renderer で描画します。
- 担当者Cへ: `exploreEvents` prop、transition 起点に必要な node anchor 情報、interactionTargets の受け渡し方針を渡してください。
- 担当者Dへ: cue duration、presentation cue 定義、validator で確認すべき cue coverage の項目を渡してください。

# レビュー時に確認すること

- App 層が gameplay 判定を増やしていないか。
- content 全量から未発見情報や報酬を掘り起こしていないか。
- transition や battle event を mission ID の個別分岐で処理していないか。
- `reduceFlashing` と `lowFrameRateMode` が presentation event の選別や表示に反映されているか。
- session package がアーカイブ外で未実装の場合、暫定処理の場所と削除条件が明記されているか。
