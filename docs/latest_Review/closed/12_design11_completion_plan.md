# 12_design11_completion_plan

更新日: 2026-04-28

実施結果: Phase 0 から Phase 6 まで実装済みです。削除対象として挙げた旧 wrapper、重複 mission visual table、support file 扱いの notes、feature CSS 側 keyframes、feature CSS / runtime TypeScript の raw color、MapScreen 内 canvas 描画 helper、KeyVisualModal 内 BattleRenderState 直組み立ては削除または移動しました。

## 何が問題か

- design11 の初回反映で、主要な入口は整いましたが、CSS の raw color、画面固有 keyframes、support file 扱いの visual presets、巨大 renderer、巨大 session class が残っています。
- 一部は分離済みでも、分離後の旧コード、重複定義、補助扱いの JSON、未使用 helper を削除する計画が明示されていませんでした。
- `docs/latest_Review/11_design11_work_order_status.md` は完了寄りの表現があり、現行実装に残る制約と一致していない箇所があります。

## なぜ問題か

- 分離だけを行って旧実装を残すと、どちらが正本か分からなくなります。
- CSS と Canvas で token の使い方が分かれると、色、明滅、motion intent を一箇所で管理できません。
- visual presets が runtime に接続されない場合、content が視覚文法を駆動するという design11 の前提を満たせません。
- 巨大 renderer と巨大 session class は、表示変更とゲーム進行変更の理由を同じファイルに集め続けます。

## どうするか

### Phase 0: 監査基準を固定する

- raw color、`@keyframes`、`Math.random(`、巨大ファイル行数、visual preset 接続、unused entry を検出するコマンドを固定します。
- 可能なら `npm run design:audit` を追加し、少なくとも作業後の確認コマンドをこの文書と status 文書に残します。
- 完了条件は、実装、削除、検証、文書更新の 4 点を満たした状態にします。

### Phase 1: CSS token と motion を正本化する

- `base.css` に色、RGB channel、alpha、shadow、motion duration、motion intent の CSS token を集約します。
- feature CSS の raw color を token へ置換します。
- 画面固有 keyframes を共通 keyframes または motion utility へ統合します。
- `transition: all` を削除し、対象プロパティを明示します。
- reduced flashing 時に止める motion、遅くする motion、静的化する motion を分けます。

削除対象:

- feature CSS に残る raw `#...`、`rgba(...)`、`rgb(...)`、`hsl(...)`。
- 共通 keyframes に置き換えられる画面固有 keyframes。
- token へ移した後の互換用 CSS 変数のうち、参照が 0 件になったもの。

### Phase 2: visual presets を runtime に接続する

- `ContentBundle` に mission visual profiles と bullet visual roles を追加します。
- `loadContentBundle` で `content/gameplay/visual-presets` を読み、active mission / active bullet pattern と相互検証します。
- `apps/web/src/app/mission-visual-profiles.ts` は hardcoded table ではなく bundle 由来の resolver に変えます。
- renderer registry が content role と対応していることを検証します。

削除対象:

- `runtimeStatus: supportFile` と、その前提の notes。
- TypeScript 側に重複した mission visual profile table。
- visual preset と同じ意味を持つ重複 fallback 定義。ただし unknown mission 用の最小 fallback は維持します。

### Phase 3: renderer と key visual を責務単位に分ける

- `reboot-sequence.ts` を phase 単位に分割します。
- `projectile-renderers.ts` を player / enemy role 単位に分割します。
- `MapScreen.tsx` を `MapCanvas`、`MapInfoPanel`、canvas renderer に分割します。
- key visual は `BattleRenderState` 直接依存をやめ、独立した `KeyVisualComposition` と adapter に分けます。

削除対象:

- 分割元に残る移植済み関数。
- key visual 用の projectile ID to role 重複 resolver。
- MapScreen 内の canvas 描画 helper と hit target 型のうち、移動後に残る重複。

### Phase 4: session の責務集中を減らす

- `MagnoliaGameSession` は public facade として残し、内部処理を helper module へ移します。
- 優先順は feature access / progression unlock、explore interaction、battle runtime update、presentation queue です。
- content 固有条件は content metadata または progression rule に寄せます。

削除対象:

- session class 内に残る移植済み helper。
- content 固有 ID を直接比較する条件。ただし migration や fallback として必要な場合は、専用 constant または content rule に移します。
- 同じ unlock 判定を複数箇所で持つ重複ロジック。

### Phase 5: visual fixtures を実行可能にする

- dev mode 限定の fixture viewer を追加します。
- query string で fixture を選べるようにし、fixed timestamp、seed、reduced flashing を再現します。
- screenshot 取得または手動確認の入口を文書化します。

削除対象:

- fixture 定義だけで使われない export。
- screenshot 入口追加後に不要になる暫定説明。

### Phase 6: docs と検証を実装に同期する

- `docs/latest_Review/11_design11_work_order_status.md` を実装後の事実に合わせます。
- 必要に応じて `docs/04_描画ルール.md` と `docs/08_表示と機能の境界.md` を更新します。
- `npm run check`、`npm run lint`、`npm test`、`npm run build`、`git diff --check` を完了条件にします。
- UI 変更後は dev server と screenshot で title / menu / explore / map / battle / archive / transition を確認します。

## 改善後にどう変化するか

- token、motion、distortion、primitive、visual preset の正本が分かれず、画面ごとの独自実装が減ります。
- content 側の視覚 metadata と runtime の描画が接続され、mission や bullet role の追加時に TypeScript の重複 table を触る必要が減ります。
- renderer と session class の責務が小さくなり、演出、UI、ゲーム進行、保存処理を別々に変更できます。
- 分離後の旧実装を削除するため、同じ意味のコードが二重に残りません。

## 実装後の確認

- `npm run design:audit` で raw color、`transition: all`、`Math.random(`、visual preset runtime 化、projectile renderer key 接続を検査します。
- dev mode では `?visualFixture=title.seeded-backdrop`、`?visualFixture=explore.reboot-settle`、`?visualFixture=map.signal-cartography`、`?visualFixture=battle.roles`、`?visualFixture=menu.archive-damaged-text`、`?visualFixture=mode.transition-veil` を確認入口にします。
- 分離後に不要になった `components/ExploreCanvas.tsx`、`components/battle-renderer.ts`、`screens/menu/EquipmentPanel.tsx`、`apps/web/src/app/map-view-model.ts` は削除済みです。
