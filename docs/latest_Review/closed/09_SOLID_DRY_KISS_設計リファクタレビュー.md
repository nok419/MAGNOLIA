# MAGNOLIA SOLID / DRY / KISS 設計リファクタレビュー

作成日: 2026-04-28
対象アーカイブ: `/mnt/data/アーカイブ.zip`
対象範囲: `apps/web`, `content/gameplay`, `docs`
判定: 小修正ではなく、段階的な大規模リファクタが必要

注記: この文書は作成時点のレビュー記録です。ファイル名や行番号はコードマップとして意図的に残しています。現在の正本は `02_開発体制とディレクトリ構成`、データ契約は `05_データ構造`、表示境界は `08_表示と機能の境界` を参照してください。

## 1. 結論

現在のプロジェクトは、ドキュメント上では「gameplay は `packages/game-session`、save/settings は `packages/persistence`、表示は `apps/web`、描画入力は renderState」という境界を明確に定めています。しかし、今回渡されたアーカイブ実体には `packages/contracts`、`packages/game-session`、`packages/persistence`、`tsconfig.base.json` が含まれていません。`apps/web/package.json` と `apps/web/tsconfig.json` はこれらの package を前提にしているため、アーカイブ単体では型検査およびビルドが成立しません。

このため、軽微な修正を当てて安全に直す段階ではありません。特に、今後予定されている「描画、敵配置、敵弾位置」に関する大規模なデザイン変更は、現状のまま進めると `ExploreCanvas.tsx`、`battle-renderer.ts`、`use-magnolia-app.ts`、`MapScreen.tsx` に変更が集中し、表示変更が gameplay・進行条件・秘匿情報・presentation event の扱いに波及しやすくなります。

主な判定は次の通りです。

- SOLID: 部分的に未達。特に単一責任、インターフェース分離、依存関係の向きに問題があります。
- DRY: 部分的に未達。座標変換、fog/scan/noise 描画、色・alpha・乱数処理、map/explore/minimap の描画判断が重複しています。
- KISS: 表面上はファイル数が少なく見えますが、1 ファイルへ責務が詰め込まれており、実際には変更点の特定が難しい構造です。

設計の良い部分もあります。`BattleCanvas.tsx` は canvas 要素の初期化に絞られており、`canvas-markers.ts` は transmission/collectible marker の見た目定義を共通化しています。`ship-renderer.ts` も自機描画を共通化し、当たり判定に影響しないことを明示しています。これらは残し、同じ考え方を enemy/projectile/hazard/explore/map/key visual へ広げるのが最短の改善方針です。

## 2. レビュー上の制約

今回のアーカイブには、ドキュメントと `apps/web` が参照する monorepo package が含まれていません。

確認した欠落:

- `packages/contracts`
- `packages/game-session`
- `packages/persistence`
- `tsconfig.base.json`
- `apps/web/node_modules` の通常依存関係

`apps/web/tsconfig.json` は `../../tsconfig.base.json` を extends し、`../../packages/contracts`、`../../packages/game-session`、`../../packages/persistence` を project reference として参照しています。また、`apps/web/src/app/use-magnolia-app.ts` は `@magnolia/contracts`、`@magnolia/game-session`、`@magnolia/persistence` を import しています。

型検査の確認では、少なくとも次のエラーが出ます。

```text
error TS2688: Cannot find type definition file for 'vite/client'.
error TS5083: Cannot read file '/mnt/data/review_work/tsconfig.base.json'.
tsconfig.json(24,5): error TS6053: File '/mnt/data/review_work/packages/contracts' not found.
tsconfig.json(27,5): error TS6053: File '/mnt/data/review_work/packages/game-session' not found.
tsconfig.json(30,5): error TS6053: File '/mnt/data/review_work/packages/persistence' not found.
```

したがって、このレビューは `apps/web` と `content/gameplay` の実体、および `docs` が定める境界から見た設計レビューです。`packages/*` の内部実装そのものは確認できていないため、package 内部の詳細な責務分割までは断定していません。

## 3. 現在のコードマップ

### 3.1 アーカイブ内に実在する構造

```text
MAGNOLIA/
├─ apps/
│  └─ web/
│     ├─ dist/                         # build artifact。レビュー対象ソースとしては除外すべき
│     ├─ node_modules/.vite            # cache。リポジトリ配布物としては除外すべき
│     ├─ package.json
│     ├─ tsconfig.json                 # 欠落 package と base tsconfig を参照
│     ├─ vite.config.ts
│     └─ src/
│        ├─ app/
│        │  ├─ App.tsx
│        │  ├─ app-types.ts
│        │  ├─ audio-controller.ts
│        │  ├─ canvas-markers.ts
│        │  ├─ display-helpers.ts
│        │  ├─ display-options.ts
│        │  ├─ explore-presentation.ts
│        │  ├─ ship-renderer.ts
│        │  ├─ use-magnolia-app.ts
│        │  └─ use-magnolia-input.ts
│        ├─ components/
│        │  ├─ ActionButton.tsx
│        │  ├─ BattleCanvas.tsx
│        │  ├─ EquipmentModal.tsx
│        │  ├─ ExploreCanvas.tsx
│        │  ├─ InteractionPrompt.tsx
│        │  ├─ KeyVisualModal.tsx
│        │  ├─ MiniMap.tsx
│        │  ├─ PresentationOverlay.tsx
│        │  ├─ ScreenShell.tsx
│        │  ├─ battle-renderer.ts
│        │  └─ title/
│        │     ├─ MagnoliaLogo.tsx
│        │     └─ SignalBackdropCanvas.tsx
│        ├─ hooks/
│        │  └─ useMenuNavigation.ts
│        ├─ screens/
│        │  ├─ battle/BattleScreen.tsx
│        │  ├─ explore/ExploreScreen.tsx
│        │  ├─ map/MapScreen.tsx
│        │  ├─ menu/*Panel.tsx
│        │  └─ title/TitleScreen.tsx
│        └─ styles/
│           ├─ base.css
│           ├─ global.css
│           ├─ battle.css
│           ├─ explore.css
│           ├─ explore-map.css
│           ├─ menu-equipment.css
│           └─ ...
├─ content/
│  └─ gameplay/
│     ├─ areas/
│     ├─ bullet-patterns/
│     ├─ enemies/
│     ├─ equipment/
│     ├─ map-logic/
│     ├─ missions/
│     ├─ progression/
│     ├─ projectiles/
│     └─ transmissions/
└─ docs/
   ├─ 00_rules.md
   ├─ 02_開発体制とディレクトリ構成.md
   ├─ 04_描画ルール.md
   ├─ 08_表示と機能の境界.md
   └─ ...
```

### 3.2 ドキュメントが前提にしているが、今回アーカイブには含まれていない構造

`docs/02_開発体制とディレクトリ構成.md` は、実際の構成として次を定義しています。

```text
MAGNOLIA/
├─ apps/web/src/...
├─ packages/
│  ├─ contracts/src/
│  ├─ game-session/src/
│  └─ persistence/src/
├─ content/gameplay/...
└─ docs/
```

同ドキュメントは参照関係も次のように定めています。

```text
content/gameplay/*.json
        ↓
packages/persistence/load-content-bundle.ts
        ↓
packages/contracts
        ↓
packages/game-session
        ↓
apps/web/src/app/use-magnolia-app.ts
        ↓
apps/web/App.tsx
        ↓
apps/web/screens/* + components/*
        ↓
Canvas 2D / DOM
```

`docs/08_表示と機能の境界.md` では、表示側が repository や session 内部状態に直接触らないこと、画面側で missionId を見てゲームルールを分岐しないこと、mission ごとの敵配置や弾幕を TypeScript 側の専用関数にしないことが明記されています。

このドキュメント上の方針は妥当です。問題は、現在の `apps/web` 実装がこの方針を完全には守れておらず、さらに今回のアーカイブでは正本 package が欠落していることです。

## 4. ファイル規模と責務集中

確認した主なファイル規模は次の通りです。

```text
19,078 total lines in apps/web/src
3,493 apps/web/src/components/ExploreCanvas.tsx
2,162 apps/web/src/components/battle-renderer.ts
1,051 apps/web/src/styles/menu-equipment.css
  972 apps/web/src/app/use-magnolia-app.ts
  938 apps/web/src/styles/explore.css
  682 apps/web/src/screens/map/MapScreen.tsx
  649 apps/web/src/app/ship-renderer.ts
  631 apps/web/src/components/KeyVisualModal.tsx
  534 apps/web/src/styles/explore-map.css
  526 apps/web/src/components/title/SignalBackdropCanvas.tsx
  520 apps/web/src/screens/menu/EquipmentPanel.tsx
  498 apps/web/src/screens/explore/ExploreScreen.tsx
  475 apps/web/src/app/canvas-markers.ts
```

規模だけで悪いとは言えませんが、今回の上位ファイルは「大きいが単純」ではなく、複数の変更理由を同時に持っています。今後のデザイン変更で触る頻度が高い箇所が、すでに大きな単一ファイルに集まっています。

## 5. SOLID 評価

### 5.1 Single Responsibility Principle

未達の箇所があります。

`use-magnolia-app.ts` は、次の責務を同時に持っています。

- content load と Dexie repository 生成
- `MagnoliaGameSession` の生成と initialize
- requestAnimationFrame による frame loop
- input edge sync とキー分岐
- screen command dispatch
- overlay queue merge
- item popup 生成
- equipment modal 制御
- localStorage による既読装備管理
- UI 側での collectible event 補完
- mission/equipment ID に基づく探索中ヒント判定

該当箇所:

- state 定義: `apps/web/src/app/use-magnolia-app.ts:47-64`
- 定数と hard-coded mission ID: `75-81`
- content/repository/session 接続: `198-213`
- frame loop: `254-370`
- `interactExploreNode` と UI 側 event 補完: `657-662`
- session 同期と overlay/popup merge: `681-699`
- collectible event 補完関数: `918-954`

`ExploreCanvas.tsx` は、Canvas component、resize、rAF tick、camera、座標変換、背景、fog、vision scan、reboot sequence、release sequence、trail、boundary、nav cue、marker 描画を同じファイルで持っています。`battle-renderer.ts` は、背景、enemy、player projectile、enemy projectile、pickup、barrier、support field、hazard、registry、seeded random を同じファイルで持っています。

この状態では、敵の見た目や敵弾の位置表現を変えるだけでも、アプリ接続・表示状態・演出・UI 表示条件のファイルに同時に手が入りやすくなります。

### 5.2 Open/Closed Principle

部分的に未達です。

`battle-renderer.ts` には renderer registry があり、拡張の入口自体はあります。これは良い方針です。しかし registry が同じ巨大ファイル内にあり、entity ID や projectile ID に直接結び付いています。

該当箇所:

- enemy renderer registry: `apps/web/src/components/battle-renderer.ts:48-60`
- player projectile renderer registry: `62-70`
- enemy projectile renderer registry: `72-82`
- renderer key resolution: `135-156`

たとえば `enemy_scout`、`enemy_standard`、`enemy_heavy` の描画は content の `visualPresetId` ではなく TypeScript 側の registry key と visual profile によって決まっています。`content/gameplay/enemies/*.json` には `visualPresetId` があるため、本来は `visualPresetId` を描画入力へ渡し、renderer は visual preset を選ぶべきです。

また、`drawPlayerProjectile` には `p.inversePhaseVisual && p.projectileId !== "proj_player_pulse_melee"` という projectile ID 例外があります。これは装備や visual effect の拡張時に core renderer を編集させる構造です。

### 5.3 Liskov Substitution Principle

大きな継承階層はなく、ここは重大な問題ではありません。ただし、見た目バリアントや visual preset が型として十分に分離されていない箇所では、将来「同じインターフェースで差し替えられる」保証が弱くなります。

例として、`ship-renderer.ts` は `ShipVariant` によって solid/art を差し替えていますが、`enemy` や `projectile` は同じ水準の差し替え契約になっていません。自機描画だけで成立している差し替え契約を、敵・弾・hazard へ展開するべきです。

### 5.4 Interface Segregation Principle

未達の箇所があります。

`MapScreen.tsx` は `ContentBundle`、`ProfileAggregate`、`ExploreSnapshot`、`ExploreRenderState` を丸ごと受け取っています。Map 画面は本来、表示済みの area、transmission、collectible、player marker、fog 表示用の情報、hit target だけを受け取れば十分です。

該当箇所:

- Map props: `apps/web/src/screens/map/MapScreen.tsx:24-33`
- `ContentBundle` / `ProfileAggregate` / `ExploreRenderState` import: `3-16`
- `drawMapCanvas` input: `338-352`

`App.tsx` も各 screen に `content`、`profile`、`snapshot`、`renderState` を広く渡す構造です。これにより UI 側が「見えてよい ViewModel」ではなく「全データから必要なものを自分で選ぶ」構造になり、秘匿情報の保護や表示条件の統一が難しくなります。

### 5.5 Dependency Inversion Principle

部分的に未達です。

`docs/02` の参照関係では `apps/web` は `game-session` が返す snapshot/renderState を描画する層です。しかし実装では、`MapScreen.tsx` が `@magnolia/game-session` から `computeAreaCompletionRate` と `readTransmissionCompletionState` を直接 import しています。pure function の共有自体は悪くありませんが、screen が game-session package に直接依存すると、表示の調整が session API の知識を要求する形になります。

また、`use-magnolia-app.ts` は `createDexieSaveRepository` と `MagnoliaGameSession` の具象を直接生成しています。アプリの composition root として許容できる部分はありますが、同じ hook が frame loop と UI state も抱えているため、依存の向きが見えにくくなっています。

## 6. DRY 評価

### 6.1 座標変換の重複

`worldToCanvas` が `ExploreCanvas.tsx` と `MapScreen.tsx` に別々にあります。MiniMap 側にも同種の座標変換があります。

該当箇所:

- `apps/web/src/components/ExploreCanvas.tsx:295`
- `apps/web/src/screens/map/MapScreen.tsx:666-673`
- `apps/web/src/components/MiniMap.tsx` にも world/canvas 変換系処理あり

探索、全体マップ、ミニマップは同じ world coordinate を扱うため、座標変換は `render/canvas/coordinates.ts` のような shared utility に寄せるべきです。これを分けたまま敵配置・弾位置・マップ演出を変えると、画面ごとに 1px〜数px のずれや、padding/aspect ratio の解釈差が出やすくなります。

### 6.2 fog / scan / noise / random の重複

`ExploreCanvas.tsx`、`MapScreen.tsx`、`MiniMap.tsx`、`SignalBackdropCanvas.tsx`、`battle-renderer.ts` には、背景ノイズ、fog、scan line、seeded random、glitch 表現が散らばっています。見た目の一貫性を保つには、共通 primitive と preset に分ける必要があります。

### 6.3 色と alpha の重複

`apps/web/src/styles/base.css` には design token が定義されています。これは良い構造です。一方で、CSS と Canvas renderer の各所には `rgba(93, 164, 209, ...)`、`#5da4d1`、`#ff5a6e`、`#f0c674` などが直接書かれています。Canvas 側は CSS custom properties を直接読むのが難しい場合もありますが、その場合でも `canvas-palette.ts` のような palette module を置き、CSS token と対応させるべきです。

### 6.4 marker 共通化は良い例

`canvas-markers.ts` は良い構造です。`apps/web/src/app/canvas-markers.ts:57-58` で「見た目定義を置き、表示条件やゲームルールは他レイヤへ持ち込まない」と明記され、transmission/collectible marker の見た目が共通化されています。

この方針を enemy visual、projectile visual、hazard visual、map fog、explore nav cue にも適用するべきです。

## 7. KISS 評価

現在の実装は、ファイル分割を抑えているため一見単純です。しかし実際には、1 ファイル内に多くの責務が入り、変更するたびに広い文脈を読む必要があります。これは KISS ではなく、短期的なファイル数削減による複雑化です。

KISS の観点で望ましい形は、抽象クラスや過剰な factory を増やすことではありません。安定した変更理由ごとにファイルを分け、入口は少数に保つことです。

たとえば、`BattleCanvas.tsx` は 42 行で canvas 初期化に集中しており、`drawBattleFrame` へ委譲しています。これは良い KISS です。一方、`drawBattleFrame` の先にある `battle-renderer.ts` が 2,162 行で全描画責務を抱えているため、分離が途中で止まっています。

## 8. 主要な問題と改善提案

### 問題 1: ドキュメント上の正本とアーカイブ実体が一致していない

何が問題か:

`docs/02` と `docs/08` は `packages/*` を正本として定義していますが、今回のアーカイブには含まれていません。`apps/web` はそれらを import/reference しているため、アーカイブ単体では検証できません。さらに `dist`、`node_modules/.vite`、`.DS_Store`、`__MACOSX` が含まれており、配布物として source と artifact が混在しています。

なぜ問題か:

大規模リファクタでは、まず「どこが正本か」を開発チーム全員が一致させる必要があります。正本 package が欠落した状態では、表示側が守るべき契約や session 側が出す renderState の実体を検証できません。

どうすべきか:

- monorepo の正しい root を復元する。
- `packages/contracts`、`packages/game-session`、`packages/persistence`、`tsconfig.base.json` をレビュー対象に含める。
- `.gitignore` または配布手順を修正し、`dist`、`node_modules`、`.vite`、`.DS_Store`、`__MACOSX`、`*.tsbuildinfo` をアーカイブから除外する。
- CI で `npm run build` または monorepo build が通ることを最低条件にする。

改善後の状態:

デザイン変更を入れる前に、契約・session・persistence・web の全体が同じ構造で検証できるようになります。レビュー対象と実行対象のずれがなくなります。

### 問題 2: `use-magnolia-app.ts` がアプリ接続、frame loop、presentation、popup、UI 補完を抱えすぎている

何が問題か:

`use-magnolia-app.ts` は 972 行あり、composition root と app state hook と frame loop と presentation queue と UI event 補完を同時に持っています。

特に、`interactExploreNode` で session dispatch 前に `buildExploreNodeInteractionEvents` を呼び、UI 側で `collectibleCollected` event を補完してから popup を作っています。これは session が domain event を出す責務と UI が表示する責務の境界を曖昧にします。

なぜ問題か:

今後、探索画面の collectible、装備導線、演出を変えるたびに、UI 側が domain event の発火条件を再実装する危険があります。session 側の検証結果と UI 側の補完結果がずれると、実際には取れていないものの popup が出る、または取れたのに popup が出ない、という不整合が起きます。

どうすべきか:

`use-magnolia-app.ts` を次に分割します。

```text
apps/web/src/app/
├─ use-magnolia-app.ts                 # public hook。薄い facade
├─ magnolia-client.ts                  # content/repository/session 接続
├─ frame-loop/useMagnoliaFrameLoop.ts  # rAF、dt、input → session step
├─ presentation/overlay-queue.ts       # overlay queue merge / dismiss
├─ presentation/item-popups.ts         # DomainEvent → popup ViewModel
├─ storage/seen-equipment-store.ts     # localStorage 既読管理
└─ selectors/equipment-hint.ts         # renderState または viewModel からヒント判定
```

さらに、collectible 取得 event は session の dispatch/step result から返すようにします。UI 側は `DomainEvent[]` を表示に変換するだけにします。

改善後の状態:

アプリ接続、時間更新、表示 queue、popup 表示、localStorage が独立します。デザイン変更時に session 接続や frame loop を触る必要が減ります。

### 問題 3: screen が full content/profile を直接読み、ViewModel 境界が薄い

何が問題か:

`MapScreen.tsx` は `ContentBundle`、`ProfileAggregate`、`ExploreSnapshot`、`ExploreRenderState` を受け取り、map logic、visible area、transmission progress、completion state、hit target を画面内で組み立てています。

なぜ問題か:

`docs/04` は「描画側は未探索マップの全景、未発見ノード、未聴取本文を直接読まない」「UI パネルや演出の都合で追加情報が必要な場合は、先に contract を増やしてから使う」としています。screen に full content/profile を渡す構造は、この方針に対して弱いです。現在のコードは access check を行っていますが、画面側が全情報を持っている時点で accidental leak の余地が残ります。

どうすべきか:

Map 用 ViewModel を session または app selector で作ります。

```ts
export type MapViewModel = {
  focusBounds: Rect
  player: MapPlayerMarker
  fog: FogViewModel
  areas: MapAreaMarker[]
  transmissions: MapTransmissionMarker[]
  collectibles: MapCollectibleMarker[]
  hitTargets: MapHitTarget[]
  selectedPanelItems: MapPanelItem[]
}
```

`MapScreen` は `MapViewModel` と callbacks だけを受け取ります。`ContentBundle` や `ProfileAggregate` は直接受け取りません。

改善後の状態:

Map の見た目を変える作業は `MapViewModel` と `render/map/*` に閉じます。未開放情報の保護も一箇所で確認できます。

### 問題 4: `ExploreCanvas.tsx` が巨大で、描画変更の単位が分からない

何が問題か:

`ExploreCanvas.tsx` は 3,493 行で、85 個程度の top-level function を持っています。component 本体には resize、rAF tick、canvas setup、presentation state、camera、worldToCanvas、scene 分岐、overlay frame 通知が入っています。また、`prevPlayerX`、`prevPlayerY`、`trailInitialized`、`smoothTrailX`、`smoothTrailY`、`lastMoteEmissionMs` が module global として定義されています。

該当箇所:

- module global trail state: `apps/web/src/components/ExploreCanvas.tsx:51-58`
- component 本体: `76-290`
- main drawing effect: `120-289`
- worldToCanvas: `295`
- drawExploreScene: `856`
- drawRebootSequence: `1046`
- trail functions: `2263` 以降
- boundary release functions: `2746` 以降
- nav cue functions: `3302` 以降

なぜ問題か:

module global の trail state は、複数 canvas instance が存在した場合や key visual / preview / test render で状態が漏れます。また、reboot、release、trail、nav cue、fog、markers が同じファイルにあるため、デザイン変更の影響範囲を見積もりにくくなっています。

どうすべきか:

`ExploreCanvas` を canvas host と描画 modules に分けます。

```text
apps/web/src/render/explore/
├─ ExploreCanvas.tsx                   # canvas host。resize / dpr / effect のみ
├─ drawExploreFrame.ts                 # frame orchestration
├─ explore-camera.ts                   # camera viewport / release focus
├─ explore-scene.ts                    # background/fog/markers/player 呼び出し
├─ explore-background.ts
├─ explore-fog.ts
├─ explore-vision.ts
├─ explore-trail.ts                    # TrailState を明示的に受け取る
├─ explore-reboot-sequence.ts
├─ explore-release-sequence.ts
├─ explore-boundary.ts
├─ explore-nav-cues.ts
└─ explore-types.ts
```

trail state は module global ではなく `useRef<TrailState>` または `ExploreRendererState` として instance に持たせます。

改善後の状態:

探索画面の見た目変更は対象 module に閉じます。reboot 演出の調整、境界解除演出の調整、nav cue の調整が互いに干渉しにくくなります。

### 問題 5: `battle-renderer.ts` が敵・弾・hazard の拡張点をすべて抱えている

何が問題か:

`battle-renderer.ts` は 2,162 行で、背景、enemy、projectile、hazard、support field、pickup、barrier、registry を 1 ファイルで持っています。敵・敵弾・hazard のデザイン変更が予定されている状況では、このファイルが最も変更衝突を起こしやすい場所です。

さらに、content 側には `visualPresetId` があるにもかかわらず、renderer は `enemyId` / `projectileId` を直接見て描画を選んでいます。

なぜ問題か:

敵を追加するたびに core renderer を編集する構造は Open/Closed に弱いです。敵 ID と見た目 ID が密結合しているため、同じ敵ロジックで別の見た目を使う、または同じ見た目を複数 enemy に適用する、といったデザイン作業がしづらくなります。

どうすべきか:

battle renderer を module 化し、content の `visualPresetId` を renderState に含めます。

```text
apps/web/src/render/battle/
├─ BattleCanvas.tsx
├─ drawBattleFrame.ts                  # 描画順だけを持つ
├─ battle-render-context.ts
├─ battle-layout.ts
├─ background/
│  ├─ draw-battle-background.ts
│  └─ transparent-atmosphere.ts
├─ enemies/
│  ├─ enemy-renderer-registry.ts
│  ├─ draw-enemy.ts
│  ├─ circle-enemy.ts
│  ├─ boss-enemy.ts
│  └─ enemy-visual-presets.ts
├─ projectiles/
│  ├─ projectile-renderer-registry.ts
│  ├─ player-projectiles.ts
│  ├─ enemy-projectiles.ts
│  └─ projectile-visual-presets.ts
├─ hazards/
│  ├─ draw-hazard.ts
│  ├─ magnetic-storm.ts
│  ├─ hazard-warning-rim.ts
│  └─ hazard-visual-presets.ts
├─ support-fields/
├─ pickups/
├─ barrier/
└─ shared/
   ├─ seeded-random.ts
   ├─ easing.ts
   └─ canvas-palette.ts
```

`drawBattleFrame.ts` は描画順だけを持ち、個別描画は registry/preset へ委譲します。

改善後の状態:

敵の見た目変更、敵弾の見た目変更、hazard の見た目変更を別ファイルで進められます。敵配置や弾幕密度を content で調整し、見た目は visual preset で調整する流れが明確になります。

### 問題 6: `KeyVisualModal.tsx` が runtime battle state を疑似生成している

何が問題か:

`KeyVisualModal.tsx` の `buildKeyVisualRenderState` は、poster/key visual 用に `BattleRenderState` を手組みしています。`enemy_heavy`、`enemy_standard`、`proj_enemy_basic`、`proj_enemy_geo`、`eq_main_pulse`、`eq_sub_noise_canceller`、`mission_key_visual_poster` などの runtime ID が直接書かれています。

該当箇所:

- `apps/web/src/components/KeyVisualModal.tsx:313-450`

なぜ問題か:

key visual は marketing/display 用の composition であり、runtime の mission state とは別の責務です。runtime state を偽装して key visual を描くと、battle renderState の型変更が poster に波及します。また、poster 用の派手な演出が runtime renderer の制約や例外処理を増やす可能性があります。

どうすべきか:

key visual 用の composition model を定義します。

```text
apps/web/src/render/key-visual/
├─ KeyVisualCanvas.tsx
├─ key-visual-composition.ts
├─ draw-key-visual.ts
└─ key-visual-presets.ts
```

または、battle renderer を利用する場合でも `BattleRenderState` 全体を偽装せず、`BattlePosterViewModel` のような専用型から `drawBattlePoster` を呼びます。

改善後の状態:

battle runtime の変更と key visual の変更が分離されます。タイトル画面や広報用の演出追加で runtime battle の描画契約を汚さずに済みます。

### 問題 7: content と renderer の対応がずれている

何が問題か:

content には enemy が 7 件ありますが、現在 mission から参照されるのは `enemy_scout`、`enemy_standard`、`enemy_heavy` の 3 種です。`a1`、`a2`、`b1`、`c1` は mission から参照されていません。一方、`battle-renderer.ts` の registry には `a1`、`a2`、`b1`、`c1` が残っています。

確認結果:

```text
content/gameplay/missions: 3
content/gameplay/enemies: 7
content/gameplay/bullet-patterns: 9
content/gameplay/projectiles: 9
content/gameplay/equipment: 11
content/gameplay/areas: 2
content/gameplay/map-logic: 1
content/gameplay/transmissions: 6

mission_good_morning: enemy_scout 10, enemy_standard 4
mission_where_are_you: enemy_scout 18, enemy_standard 8, enemy_heavy 2
mission_evacuation: enemy_scout 15, enemy_standard 10, enemy_heavy 6

mission から参照されない enemy:
a1, a2, b1, c1

active enemy から参照される bullet pattern:
bp_scout_single, bp_standard_spread, bp_heavy_burst, bp_spiral_stream

active enemy から参照されない bullet pattern:
bp_a2_lance_spread, bp_b1_core_burst, bp_b1_lance_stream, bp_c1_pressure_ring, bp_radial_burst
```

なぜ問題か:

使われていない prototype ID が active content と同じ場所に残ると、デザイン変更時に「どれを直すべきか」が分かりにくくなります。また、renderer registry が legacy ID を持ち続けるため、obsolete な見た目が実装上の制約として残ります。

どうすべきか:

- `a1`、`a2`、`b1`、`c1` を本当に残すか判断する。
- 残す場合は `content/gameplay/prototypes`、`fixtures`、`legacy` などに分け、loader が active mission へ混ぜないようにする。
- 残さない場合は削除し、renderer registry からも削除する。
- `bp_radial_burst` など完全未使用の pattern は削除、または future-use として明示する。
- `visualPresetId` と `hitboxPresetId` の schema を loader validation に含める。

改善後の状態:

design team は active content だけを見て調整できます。legacy/prototype が active runtime に混ざらず、敵追加や弾幕変更の判断が簡単になります。

### 問題 8: click target と interaction 判定が UI 側で再計算されている

何が問題か:

`ExploreScreen.tsx` は click 位置から `readClickableExploreNodeId` を呼び、`renderState.visibleCollectibles` と `renderState.visibleTransmissions` を見て interaction target を再構築しています。

該当箇所:

- click handler: `apps/web/src/screens/explore/ExploreScreen.tsx:114-134`
- click target 再構築: `319-364`

なぜ問題か:

session 側が interaction 可否を持っているにもかかわらず、UI が距離・視界・complete 状態を再計算すると、キーボード interaction と mouse click interaction がずれる可能性があります。見た目上の marker radius を変えたときにも、interaction radius と表示 radius の関係が不明確になります。

どうすべきか:

`ExploreRenderState` に `clickTargets` または `interactionTargets` を追加します。

```ts
export type ExploreInteractionTarget = {
  nodeId: WorldMapNodeId
  kind: "collectible" | "transmission"
  worldPosition: Vec2
  markerRadiusPxHint: number
  available: boolean
  priority: number
}
```

UI は world → overlay 座標変換と hit test のみ行い、対象の可否や優先度は renderState から受け取ります。

改善後の状態:

入力方法による interaction 可否の差がなくなります。marker デザイン変更時も、見た目半径と hit 半径の関係を一箇所で管理できます。

### 問題 9: mission/equipment 固有 ID が UI logic に残っている

何が問題か:

`use-magnolia-app.ts` に `MISSION_GOOD_MORNING_ID = "mission_good_morning"` があり、探索中の equipment hint 表示で `eq_os_magnolia` を直接見ています。

該当箇所:

- mission ID 定数: `apps/web/src/app/use-magnolia-app.ts:81`
- equipment hint 判定: `397-401`

なぜ問題か:

`docs/08` は「画面側で missionId を見て独自にゲームルールを分岐する変更」を避けるとしています。現在の判定は UI hint であり直接 gameplay ではありませんが、progression の条件と UI 表示条件が別々に存在するため、将来 mission 順や装備解放条件が変わったときに同期漏れが起きます。

どうすべきか:

session または selector が `showEquipmentHint`、`newEquipmentIds`、`recommendedPanel` のような UI hint ViewModel を返します。UI は ID を知らずに表示だけ行います。

改善後の状態:

mission 順や装備解放条件を変えても UI hook を編集しなくて済みます。

### 問題 10: CSS は token があるが、画面別 CSS が大きく重複が残る

何が問題か:

`base.css` には design token があり、良い土台があります。一方で `menu-equipment.css` は 1,051 行、`explore.css` は 938 行、`explore-map.css` は 534 行あり、色・alpha・panel・border・glow の直接指定が残っています。

なぜ問題か:

デザイン改修で palette や contrast を調整すると、CSS と Canvas renderer の両方を広く grep して直す必要があります。reduce flashing / low frame rate の設定とも整合が取りにくくなります。

どうすべきか:

- `styles/tokens.css` と `styles/components/*.css` を分ける。
- panel、tab、badge、meter、modal、hud、map-card など再利用単位で class を整理する。
- Canvas 側は `render/shared/canvas-palette.ts` に CSS token と対応する値を置く。
- alpha scale を命名する。例: `accentMist`, `accentGlowLow`, `dangerWarning`, `dangerActive`。

改善後の状態:

色や glow の変更が token/palette に集まり、画面単位 CSS は layout と state class に集中します。

## 9. 改修後の推奨コードマップ

次の構成を推奨します。重要なのは package を増やしすぎることではなく、変更理由が安定している単位で分けることです。

```text
MAGNOLIA/
├─ apps/
│  └─ web/
│     └─ src/
│        ├─ app/
│        │  ├─ App.tsx
│        │  ├─ magnolia-client.ts
│        │  ├─ use-magnolia-app.ts
│        │  ├─ frame-loop/
│        │  │  └─ useMagnoliaFrameLoop.ts
│        │  ├─ presentation/
│        │  │  ├─ overlay-queue.ts
│        │  │  ├─ item-popups.ts
│        │  │  └─ explore-presentation.ts
│        │  ├─ storage/
│        │  │  └─ seen-equipment-store.ts
│        │  ├─ selectors/
│        │  │  ├─ app-view-model.ts
│        │  │  ├─ equipment-hint.ts
│        │  │  └─ display-options.ts
│        │  └─ audio-controller.ts
│        ├─ input/
│        │  └─ use-magnolia-input.ts
│        ├─ view-models/
│        │  ├─ map-view-model.ts
│        │  ├─ explore-hud-view-model.ts
│        │  ├─ battle-hud-view-model.ts
│        │  └─ menu-view-model.ts
│        ├─ render/
│        │  ├─ shared/
│        │  │  ├─ canvas-palette.ts
│        │  │  ├─ coordinates.ts
│        │  │  ├─ easing.ts
│        │  │  ├─ seeded-random.ts
│        │  │  ├─ fog.ts
│        │  │  └─ render-types.ts
│        │  ├─ markers/
│        │  │  └─ canvas-markers.ts
│        │  ├─ ship/
│        │  │  ├─ ship-renderer.ts
│        │  │  ├─ ship-metrics.ts
│        │  │  ├─ solid-ship.ts
│        │  │  └─ art-ship.ts
│        │  ├─ explore/
│        │  │  ├─ ExploreCanvas.tsx
│        │  │  ├─ drawExploreFrame.ts
│        │  │  ├─ explore-camera.ts
│        │  │  ├─ explore-scene.ts
│        │  │  ├─ explore-background.ts
│        │  │  ├─ explore-fog.ts
│        │  │  ├─ explore-vision.ts
│        │  │  ├─ explore-trail.ts
│        │  │  ├─ explore-reboot-sequence.ts
│        │  │  ├─ explore-release-sequence.ts
│        │  │  └─ explore-nav-cues.ts
│        │  ├─ battle/
│        │  │  ├─ BattleCanvas.tsx
│        │  │  ├─ drawBattleFrame.ts
│        │  │  ├─ background/
│        │  │  ├─ enemies/
│        │  │  ├─ projectiles/
│        │  │  ├─ hazards/
│        │  │  ├─ support-fields/
│        │  │  ├─ pickups/
│        │  │  └─ barrier/
│        │  ├─ map/
│        │  │  ├─ MapCanvas.tsx
│        │  │  ├─ drawMapFrame.ts
│        │  │  └─ map-hit-targets.ts
│        │  ├─ minimap/
│        │  │  ├─ MiniMap.tsx
│        │  │  └─ drawMiniMap.ts
│        │  └─ key-visual/
│        │     ├─ KeyVisualCanvas.tsx
│        │     ├─ key-visual-composition.ts
│        │     └─ draw-key-visual.ts
│        ├─ screens/
│        │  ├─ battle/
│        │  ├─ explore/
│        │  ├─ map/
│        │  ├─ menu/
│        │  └─ title/
│        ├─ components/
│        │  ├─ ActionButton.tsx
│        │  ├─ EquipmentModal.tsx
│        │  ├─ InteractionPrompt.tsx
│        │  ├─ PresentationOverlay.tsx
│        │  └─ ScreenShell.tsx
│        └─ styles/
│           ├─ tokens.css
│           ├─ global.css
│           ├─ components/
│           └─ screens/
├─ packages/
│  ├─ contracts/
│  │  └─ src/
│  │     ├─ game-types.ts
│  │     ├─ session-types.ts
│  │     ├─ presentation-types.ts
│  │     ├─ render-state.ts
│  │     └─ visual-types.ts
│  ├─ game-session/
│  │  └─ src/
│  │     ├─ game-session.ts
│  │     ├─ battle/
│  │     ├─ explore/
│  │     ├─ render-state/
│  │     ├─ selectors/
│  │     └─ presentation/
│  └─ persistence/
│     └─ src/
│        ├─ load-content-bundle.ts
│        ├─ validation/
│        ├─ dexie/
│        └─ defaults.ts
└─ content/
   └─ gameplay/
      ├─ enemies/
      ├─ projectiles/
      ├─ bullet-patterns/
      ├─ missions/
      ├─ visual-presets/
      │  ├─ enemies/
      │  ├─ projectiles/
      │  └─ hazards/
      └─ prototypes/                   # active runtime と分ける場合のみ
```

## 10. 推奨リファクタ手順

### Phase 0: リポジトリの正本を復元する

目的:

ビルド可能な状態に戻し、レビュー対象と実行対象を一致させます。

実施内容:

- 欠落 package を復元する。
- `tsconfig.base.json` を復元する。
- `apps/web/tsconfig.json` の paths に `@magnolia/persistence` を追加する。現状は import があるのに paths に含まれていません。
- artifact/cache を除外する。
- CI で型検査、content validation、最低限の unit test を通す。

完了条件:

- clean checkout で `npm run build` または monorepo build が通る。
- review/archive に `dist`、`node_modules`、`.DS_Store`、`__MACOSX` が入らない。

### Phase 1: renderState と visual preset の契約を固定する

目的:

デザイン変更を TypeScript の ID 分岐ではなく、renderState と visual preset の差分で進められるようにします。

実施内容:

- enemy render item に `visualPresetId` を含める。
- projectile render item に `visualPresetId` または `trailPresetId` を含める。
- hazard render item に `visualPresetId` を含める。
- `content/gameplay/visual-presets` を追加するか、既存 enemy/projectile JSON 内の preset を loader が解決する。
- loader validation で参照整合をチェックする。

完了条件:

- 新しい enemy visual を追加するとき、`battle-renderer` の core drawing order を編集しなくてよい。
- mission 固有の見た目差分は TypeScript 関数ではなく content/preset で表現できる。

### Phase 2: `use-magnolia-app.ts` を app shell に戻す

目的:

表示変更で app 接続や session sync が壊れないようにします。

実施内容:

- `magnolia-client.ts` を作り、content/repository/session 接続を隔離する。
- `useMagnoliaFrameLoop` に rAF と dt 制御を移す。
- overlay queue と item popup を presentation module に移す。
- seen equipment storage を storage module に移す。
- `buildExploreNodeInteractionEvents` を廃止し、session が返す event を使う。

完了条件:

- `use-magnolia-app.ts` は public state と actions の合成に集中する。
- UI 側で domain event を新規作成しない。

### Phase 3: shared canvas primitives を作る

目的:

map/explore/minimap/battle の座標・色・乱数・fog 表現を統一します。

実施内容:

- `render/shared/coordinates.ts`
- `render/shared/seeded-random.ts`
- `render/shared/easing.ts`
- `render/shared/canvas-palette.ts`
- `render/shared/fog.ts`

完了条件:

- world → canvas 変換が 1 箇所になる。
- seeded random/easing が 1 箇所になる。
- Canvas 色指定が palette module 経由になる。

### Phase 4: battle renderer を分割する

目的:

敵、敵弾、hazard のデザイン変更を安全に進められるようにします。

実施内容:

- `drawBattleFrame.ts` を描画順だけの薄い orchestration にする。
- enemy/projectile/hazard/support/barrier/pickup を directory 分割する。
- registry は `visualPresetId` を受ける。
- `projectileId` 固有例外を visual effect flag/preset に変換する。

完了条件:

- `drawBattleFrame.ts` が 200〜250 行程度に収まる。
- `hazard` の telegraph/active/fading が別 function または別 preset module になる。
- 新しい projectile visual を追加しても core frame order を編集しない。

### Phase 5: ExploreCanvas を分割する

目的:

探索画面の演出変更を個別 module で進められるようにします。

実施内容:

- canvas host と draw frame を分ける。
- camera/reboot/release/trail/nav cue/fog を分ける。
- module global trail state を廃止する。
- overlay frame の算出を `explore-frame-model` として切り出す。

完了条件:

- `ExploreCanvas.tsx` が canvas host と effect に集中する。
- reboot sequence の変更で trail/nav cue に触れない。
- TrailState が instance-local になる。

### Phase 6: Map/MiniMap/Explore の ViewModel と hit target を統一する

目的:

表示条件、click target、map marker の差分を整理します。

実施内容:

- `MapViewModel` を作る。
- `ExploreRenderState` に `interactionTargets` を追加する。
- Map/MiniMap/Explore marker は `canvas-markers.ts` と shared coordinates を使う。
- MapScreen から `ContentBundle` と `ProfileAggregate` を外す。

完了条件:

- MapScreen は full content/profile を受け取らない。
- click interaction の可否は UI 側で再計算しない。

### Phase 7: KeyVisual を runtime battle state から分離する

目的:

poster/key visual の演出が runtime battle contract を汚さないようにします。

実施内容:

- `BattleRenderState` 偽装を廃止する。
- `KeyVisualComposition` または `BattlePosterViewModel` を定義する。
- key visual の enemy/projectile/hazard は dedicated composition で描く。

完了条件:

- runtime battle renderState を変更しても key visual が壊れにくい。
- key visual 固有 ID が session/runtime の ID 空間に混ざらない。

### Phase 8: content の active/legacy/prototype を整理する

目的:

デザイン調整対象を明確にします。

実施内容:

- `a1`、`a2`、`b1`、`c1` の扱いを決める。
- active mission から参照されない pattern を削除または future-use として明示する。
- content validation で unused active asset を警告する。
- registry から obsolete key を消す。

完了条件:

- active gameplay content と prototype が混ざらない。
- design team が調整対象を迷わない。

### Phase 9: CSS と Canvas palette を整理する

目的:

画面デザイン変更時の修正範囲を小さくします。

実施内容:

- `tokens.css` を正本にする。
- Canvas palette を TS module にする。
- 画面 CSS は layout/state、component CSS は再利用部品に寄せる。
- motion/reduceFlashing の token を整備する。

完了条件:

- palette 変更で grep 修正が不要になる。
- Canvas と CSS の色が同じ命名で追える。

## 11. 受け入れ基準

このリファクタは、次の条件を満たしたら完了と判定します。

- clean checkout で build が通る。
- `packages/*` と `docs` と `apps/web` の境界が一致している。
- review/archive に build artifact/cache/macOS artifact が入らない。
- `use-magnolia-app.ts` が接続と state/action 合成に集中し、frame loop、presentation queue、popup、storage が分離されている。
- UI 側で domain event を作らない。
- `ExploreCanvas.tsx` が canvas host に近い責務へ縮小され、reboot/release/trail/nav cue/fog が別 module になる。
- `battle-renderer.ts` が `drawBattleFrame.ts` と entity/hazard/projectile modules に分割される。
- enemy/projectile/hazard の見た目は `visualPresetId` または同等の preset contract で解決される。
- `MapScreen` が `ContentBundle` と `ProfileAggregate` を直接受け取らない。
- click target は renderState/ViewModel から受け取り、UI 側で interaction 可否を再実装しない。
- key visual は runtime battle state を偽装しない。
- active content と prototype/legacy content が分かれている。
- 座標変換、seeded random、easing、canvas palette が shared module にある。

## 12. 変更時のガードレール

大規模リファクタ中は、次を守るべきです。

- 描画分割と gameplay 変更を同じ PR に混ぜない。
- 敵配置、弾幕密度、hazard 位置は content 変更として扱う。
- 当たり判定、damage、解析率、進行条件は session 側の変更として扱う。
- renderer は renderState を描くだけにする。
- visual preset に gameplay を推測させない。
- UI は未開放情報を直接 content から読まない。
- 既存の `canvas-markers.ts` と `ship-renderer.ts` の良い境界を崩さず、同じ方式を他の描画へ展開する。
- まず snapshot/renderState の golden test を追加し、描画分割で gameplay 出力が変わっていないことを確認する。

## 13. 優先順位

最初にやるべき順序は次です。

1. monorepo の欠落を直し、build を通す。
2. renderState と visual preset の契約を固定する。
3. `use-magnolia-app.ts` から frame loop / presentation / storage / UI event 補完を切り出す。
4. battle renderer を分割する。
5. ExploreCanvas を分割する。
6. Map/MiniMap/Explore の座標変換と hit target を共通化する。
7. KeyVisual を専用 composition へ分ける。
8. content の legacy/prototype を整理する。
9. CSS token と canvas palette を整理する。

この順番にする理由は、まずビルド可能性と契約を固定しないと、描画分割が「見た目の調整」ではなく「状態の再解釈」になってしまうためです。大規模デザイン改修の前に、renderState と visual preset を先に固定するのが最も安全です。

## 14. 小修正を行わなかった理由

今回は直接コード修正を入れていません。理由は次の通りです。

- アーカイブ単体がビルド不能であり、修正後の検証ができない。
- 欠落している `packages/*` が現在の設計上の正本であり、`apps/web` だけを直しても境界の正しさを確認できない。
- 主な問題は単発の typo や軽微な責務漏れではなく、描画・ViewModel・content・session event の境界にまたがる。
- 今後予定されているデザイン変更では、場当たり的にファイルを分割すると逆に重複や依存が増える危険がある。

したがって、今回の正しい対応は、まずこのレビューを開発チームの合意文書として使い、Phase 0 から段階的に進めることです。

## 15. 要約

このプロジェクトには、境界設計の意図がすでに文書化されています。その意図は妥当です。しかし、現状の `apps/web` は描画・アプリ接続・表示条件・一部 event 補完が集中しており、今後の敵配置・敵弾・描画デザイン改修を安全に受け止めるには分割が必要です。

最も重要な改善は、次の 4 点です。

- 正本 package を含む完全な monorepo 状態で build を通す。
- renderState と visual preset を先に固定し、敵・弾・hazard の見た目を ID 直書きから外す。
- `use-magnolia-app.ts`、`ExploreCanvas.tsx`、`battle-renderer.ts`、`MapScreen.tsx` の責務を分ける。
- content の active/prototype/legacy を整理し、デザイン調整対象を明確にする。

この順に進めれば、SOLID/DRY/KISS の方向へ寄せながら、ゲームの大規模なビジュアル変更を安全に実施できます。
