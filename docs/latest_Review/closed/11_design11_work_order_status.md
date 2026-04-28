# 11_design11_work_order_status

更新日: 2026-04-28

## 何が問題か

- design11 の指示は、色、seed、distortion、primitive、画面遷移、content metadata、検証 fixture を同時に整える内容でした。
- 以前の状態では、公開入口だけ薄くしても旧実装、重複 resolver、raw color、support file 扱いの visual presets が残っていました。
- Map / Explore / app hook の一部では、User Interface（ユーザーインターフェース、UI）が content や session 内部条件を再計算していました。
- 分離後に wrapper や未使用 export を残すと、どれが正本か分かりにくくなります。

## なぜ問題か

- 画面ごとに色、乱数、グリッチ、粒子、遷移が分岐すると、reduced flashing や mission 別 visual profile の調整箇所が分散します。
- 巨大な renderer や hook は、表示だけを変える作業でも session、保存、入力、戦闘描画を同時に読む必要が出ます。
- content に visual metadata と staging 判定が接続されない場合、弾幕や未使用敵の扱いが renderer 側の個別分岐に流れます。
- fixture 定義だけでは、画面遷移や固定 frame の再現確認に使えません。

## どうしたか

- WO-00: `package.json` に `lint`、`test`、`design:audit` を追加しました。`lint` と `test` は現時点の有効な TypeScript project build を実行します。
- WO-01: `visual-tokens.ts` と CSS token を正本にし、feature CSS と runtime TypeScript の raw color を audit 対象にしました。`canvas-markers.ts` と persistence default も token / CSS variable 参照へ変更しました。
- WO-02: `visual-seed.ts` へ seed utility を集約し、`apps/web/src`、`packages`、`content` の `Math.random(` を 0 件にしました。
- WO-03: title、subtitle、hazard、archive、transition を `signal-distortion.ts` の domain / variant へ寄せました。reduced flashing 時は低頻度または静的表現へ落とします。
- WO-04: `effect-primitives.ts` を追加し、粒子、carrier line、scan pulse、focus bracket、screen veil transition を複数画面から使う形にしました。
- WO-05: battle renderer を `render/battle/*` に分割しました。`battle-renderer-impl.ts` は 67 行の描画順制御になり、背景、player、enemy、projectile、fragment、field、hazard は別ファイルです。
- WO-06: Explore renderer を `render/explore/*` に分割しました。`ExploreCanvasImpl.tsx` は 273 行で、背景、通常シーン、reboot、trail、boundary、nav cue、timeline は別ファイルです。reboot の機体構築は `reboot-construction.ts` へ移しました。
- WO-07: EquipmentPanel を構成入口と internal 実装に分け、MenuBackdrop は seed と primitive を使います。旧 `EquipmentPanel.tsx` wrapper は削除しました。
- WO-08: `ModeTransitionLayer` と `ScreenVeilTransition` を追加し、画面切り替えを App 直下で管理します。
- WO-09: battle result と archive は、報酬 UI ではなく transmission recovered / archive capture の表現へ寄せ、archive 側にも text distortion を使いました。
- WO-10: `MapViewModel` を `@magnolia/game-session` 側へ移し、`MapScreen` は `ContentBundle` / `ProfileAggregate` を props に持たない形にしました。Explore のクリック対象は `ExploreRenderState.interactionTargets` へ移し、UI は hit test のみ行います。
- WO-11: `useMagnoliaApp` 実体を 230 行台に縮小しました。frame loop、session sync、action 群、storage、popup、overlay を分割し、UI 側で `DomainEvent` を生成しない形にしました。
- WO-12: active mission に `visualProfileId`、active bullet pattern に `visualRole` を追加しました。`content/gameplay/visual-presets` は runtime data として `ContentBundle` に入り、loader validation で active mission / active bullet pattern と相互検証します。projectile renderer は `expectedRendererKey`、scale、glowStrength、tokenRoles を参照します。
- WO-13: `KeyVisualModal` は key visual composition builder を呼び、Battle render state への adapter は `key-visual-battle-adapter.ts` へ分離しました。
- WO-14: `VisualFixtureViewer` を追加し、dev mode の `?visualFixture=...` で title / explore / map / battle / archive / transition の固定 seed / 固定時刻確認ができます。

## 改善後にどう変化するか

- title、menu、explore、map、battle、archive は同じ token、seed、primitive、distortion の管理下で調整できます。
- renderer と app hook は変更理由ごとに分かれ、表示演出の変更で保存処理や session 操作を読む範囲が減ります。
- Map と Explore の UI は content や progress 条件を再構築せず、session から渡された view model / render state を表示します。
- content 側の visual metadata と staging 判定により、mission や bullet pattern の見た目を runtime 分岐へ押し込まずに扱えます。
- 分離後の旧 wrapper と未使用 export を削除したため、参照検索で現在の責務位置が見えやすくなりました。

## 確認結果

- `npm run check`: 成功
- `npm run design:audit`: 成功
- `Math.random(`: `apps/web/src`、`packages`、`content` で 0 件
- feature CSS raw color: `base.css` 以外 0 件
- runtime TypeScript raw color: `visual-tokens.ts` 以外 0 件
- `transition: all`: 0 件
- `content/gameplay/visual-presets`: `runtimeStatus: "runtimeData"`
- `battle-renderer-impl.ts`: 67 行
- `ExploreCanvasImpl.tsx`: 273 行
- `MapCanvas.tsx`: 128 行
- `projectile-renderers.ts`: 130 行
- `use-magnolia-app-impl.ts`: 230 行台
