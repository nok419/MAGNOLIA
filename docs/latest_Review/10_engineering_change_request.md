# MAGNOLIA playable slice 改修依頼書

作成日: 2026-04-28
対象: `mission_good_morning` / `mission_where_are_you` / `mission_evacuation` までの playable slice

## 1. 背景

現状の playable slice は、探索・戦闘・アーカイブ・装備の基本構造は成立している。一方で、体験としては「通信を受信しているゲーム」よりも「通信テキストが横に出ている縦スクロールの射撃ゲーム」に見えやすい。

本改修の目的は、敵や弾を増やすことではなく、プレイヤーの行動が「通信の聞き取り」「言葉の欠損」「断片の回収」に直結していると感じられるようにすること。

特に次の 4 点を優先する。

1. ノイズ超過時に、字幕本文を実際に読めなくする。
2. 被弾・聴取失敗後に、欠損した通信断片をその場で回収できるようにする。
3. 探索を「アイコンへ歩く」から「信号を探す」に寄せる。ただし過度に面倒にはしない。
4. ミッションごとに、本文の性質とプレイ内容が一致するよう調整する。

## 2. 非目標

以下は今回の改修範囲に含めない。

- 音声本実装そのもの。
- mission04 以降の追加。
- プレイヤーの選択によって通信内容が永久に分岐し、回収不能になる構造。
- 何度も同じミッションを周回しないと基本本文が揃わない設計。
- UI 側が content や session 内部状態を直接読んで独自判定する実装。

## 3. 改修 A: ノイズ超過時の字幕欠損

### 目的

ノイズ超過時に `activeSubtitle.audible === false` になっても、現状は字幕本文がそのまま読めてしまう。これを、文字化け・伏せ字・黒塗り・グリッチで実際に読めない状態にする。

### 要件

- 聴取可能時は通常字幕を表示する。
- 聴取不可時は、本文をそのまま表示せず、欠損表示に変換する。
- 欠損の強さは将来的には `noiseLevel / hearingThreshold` から段階的に決める。
- 現時点で renderState に十分な値がない場合は、初期実装では `activeSubtitle.audible` の true/false のみで段階導入してよい。
- `reduceFlashing` 有効時は、激しい点滅や高速グリッチを避け、静的な黒塗り・伏せ字中心にする。
- 欠損は毎フレーム完全ランダムにしない。100〜160ms 程度で固定されるグリッチフレームを使い、読めないが目にうるさすぎない状態にする。

### 推奨仕様

字幕変換関数を UI 側に追加する。

```ts
type CorruptSubtitleInput = {
  text: string
  severity: number // 0..1
  seed: string
  frame: number
  reduceFlashing: boolean
}
```

出力は ReactNode または文字列配列。日本語の文字分割には可能なら `Intl.Segmenter("ja", { granularity: "grapheme" })` を使い、fallback として `Array.from(text)` を使う。

欠損表現の候補:

- 低 severity: 数文字だけ `…` / `░` / `ノイズ` に置換。
- 中 severity: 30〜60% を `█` または短い黒塗り span に置換。
- 高 severity: ほぼ読めない。文字化け片と黒塗りを混在。

### 変更対象の目安

- `apps/web/src/screens/battle/BattleScreen.tsx`
- `apps/web/src/styles/battle.css`
- 必要なら `BattleRenderState.activeSubtitle` に `chunkId`, `noiseLevel`, `hearingThreshold` を追加。

### 受け入れ条件

- ノイズ超過時に、字幕本文が実際に読めない。
- 聴取可能状態に戻ると本文が復帰する。
- `reduceFlashing` 有効時に高速点滅しない。
- 本文を直接 DOM から失わず、aria-label などでアクセシビリティに配慮する。ただしゲーム上のネタバレを避けるため、聴取不可時にスクリーンリーダーへ完全本文を読ませるかは別途判断する。

## 4. 改修 B: 欠損フラグメント回収

### 目的

被弾やノイズ超過によって通信が欠損した直後、プレイヤーが能動的に欠損片を回収できるようにする。死亡がないゲームにおける「失敗後の立て直し」を作る。

### 基本挙動

- ノイズが聴取閾値を超えた時、または被弾により新規欠損が発生した時、戦闘画面内にフラグメントを生成する。
- フラグメントは 2.5〜4.0 秒程度で消える。
- 自機が触れると回収され、その時間範囲の通信が部分的に復元される。
- フラグメントは安全地帯のど真ん中ではなく、少しだけリスクのある位置に出す。
- ただし過剰に難しくせず、calm では寿命を長め、terminal では短めにする。

### デザイン方針

フラグメントは「アイテム」ではなく「欠けた通信片」として見せる。

推奨ビジュアル:

- 小さな菱形または割れた矩形。
- 中央に 1〜2 文字ぶんの読めないグリフ、または `▧` / `…`。
- 周囲に薄い走査線と短いノイズ粒子。
- 回収時は字幕パネルまたは画面上部へ吸い込まれる短い軌跡を出す。

### データモデル方針

現在の本文チャンクは `content/gameplay/transmissions/*.chunks.json` に存在する。これを維持し、フラグメントやアーカイブ表示では「チャンク内のどの範囲が復元されたか」を扱えるようにする。

推奨型:

```ts
export type TranscriptSpan = {
  chunkId: TranscriptChunkId
  startRatio: number // 0..1
  endRatio: number   // 0..1
}

export type BattleFragmentViewModel = {
  fragmentId: string
  chunkId: TranscriptChunkId
  startRatio: number
  endRatio: number
  x: number
  y: number
  expiresAtMs: number
  strength: number
}
```

保存・アーカイブ側では、可能なら `heardRanges` の絶対時刻だけに依存せず、`chunkId + startRatio/endRatio` の復元スパンを併用する。

理由:

- `startMs` / `endMs` を後で調整しても、チャンク ID が維持されていれば復元状態が壊れにくい。
- 本文の文字数が変わっても、比率から表示範囲を再計算できる。
- 文字インデックスを保存しないため、本文修正時の破綻が少ない。

運用ルール:

- 同じ意味のセリフでタイミングや文言を微調整する場合は chunkId を維持する。
- 意味が変わる、分割・統合する、別の発話に変える場合は新しい chunkId を発行する。
- loader validation で、transmission の `transcriptChunkIds` と chunks 実体の参照整合を検証する。
- chunk の `startMs` / `endMs` は単調増加、重複なしを原則とする。

### 復元判定

- フラグメント回収時、対象 span を battle state の復元スパンに merge する。
- アーカイブ表示時は、chunk の文字列を grapheme 単位に分割し、復元済み比率に応じて表示・欠損マスクを生成する。
- chunk 全体の復元率が 85% 以上なら全文表示、部分復元なら未復元文字を `█` 等で隠す、という段階処理を許可する。

### ゲームバランス

- 1 回の被弾で大量のフラグメントを出さない。原則 1 個、連続ノイズ時はクールダウンを設ける。
- 重要セリフの直前・直後は、フラグメントの寿命を少し長くしてもよい。
- フラグメント回収で「完全なノーミス」と同等になる必要はないが、上手く回収すれば大きく欠損を減らせるようにする。

### 変更対象の目安

- `packages/contracts`: `TranscriptSpan`, `BattleFragmentViewModel`, save 型拡張。
- `packages/game-session`: フラグメント生成、衝突判定、回収、復元 span merge。
- `apps/web/src/components/battle-renderer.ts`: フラグメント描画。
- `apps/web/src/screens/battle/BattleScreen.tsx`: 回収時の短い UI feedback。
- `apps/web/src/screens/menu/ArchivePanel.tsx`: 部分復元済み本文の欠損表示。

### 受け入れ条件

- 被弾またはノイズ超過後に、画面内へフラグメントが出現する。
- フラグメントを回収すると、該当する通信本文の欠損が部分的に復元される。
- 回収済み範囲はリザルト・アーカイブに反映される。
- 本文文字数や chunk の時間を軽微に変更しても、既存復元データが致命的に壊れない。

## 5. 改修 C: 探索スキャンパルスと信号探索

### 目的

探索を「最初から見えているアイコンへ歩く」だけでなく、「信号の兆候を拾って位置を推定する」体験へ寄せる。ただし、面倒な索敵作業にはしない。

### アイコン表示方針

アイコンは完全に消さない。段階表示にする。

1. 未発見: 正確なアイコンは出さない。通信強度バー、波形、視界円の縁の反応だけを出す。
2. 疑似検出: スキャンや接近で方角・距離帯だけが分かる。ゴースト反応や円弧を出すが、正確な座標アイコンは出さない。
3. 識別済み: 近距離到達または十分なスキャンで、通常アイコンを出す。以後、map / minimap に残る。
4. 接続済み・完全復元済み: 利便性のため、従来通り常時アイコンを残す。

### パルス仕様

- デフォルトは自機中心の局所全方位パルス。
- 全域パルスは強すぎるため、初期仕様にはしない。
- 指向性パルスは subsystem や OS 強化の候補として後回し。
- パルスなしでも、近くの通信は passive leak として兆候が出る。

推奨初期値:

- 入力: `R` または `click 2`。旧既定値 `Space` は保存済み設定の正規化で `R` に寄せる。
- 半径: 860 world units。passive leak より広く、遠距離ほど反応と識別進行を減衰させる。
- クールダウン: 2.0〜3.0 秒。
- 反応持続: 2.0〜4.0 秒。
- スキャンで分かる情報: 正確な位置ではなく、方角、距離帯、カテゴリ、信号強度。

### passive leak

パルスを押さなくても、次の兆候は常時出す。

- 近い未発見通信に応じて、通信強度バーが上がる。
- 波形の形がカテゴリに応じて変わる。
- 視界円の外周に、薄い方角反応を出す。
- 一定距離内では、画面上に一瞬だけゴーストノイズが出る。

### カテゴリ別反応

- private: 細く、不安定で、短い反応。途切れやすい小さな円弧。
- broadcast: 広く、規則的で、帯状の反応。強度バーも安定。
- automated: 一定周期で戻ってくる反応。静止していても周期パルスが見える。
- maintenance / equipment / repair: 通信より硬い反応。角ばった形、短いクリック感、低い揺らぎ。

### renderState 案

UI 側で content を直接漁らないため、session から探索ヒントを渡す。

```ts
export type ExploreSignalHintViewModel = {
  nodeId: WorldMapNodeId
  kind: "transmission" | "collectible" | "equipment" | "repair"
  category?: "private" | "broadcast" | "automated" | "maintenance"
  bearingRad: number
  distanceBand: "near" | "mid" | "far"
  strength: number
  confidence: number
  expiresAtMs?: number
}

export type ExploreScanPulseViewModel = {
  pulseId: string
  startedAtMs: number
  radius: number
  durationMs: number
}
```

### 入力変更

`stepExplore` input に `scanPressed` を追加する。

```ts
session.stepExplore({
  dtMs,
  move,
  dashPressed,
  interactPressed,
  scanPressed,
})
```

`use-magnolia-input.ts` に scan 用の just pressed 判定を追加する。`shouldPreventDefaultForKey` には必要に応じて `Space` を追加する。

### 変更対象の目安

- `packages/contracts`: 探索ヒント view model / keybinding 追加。
- `packages/game-session/src/explore-world.ts`: scan / passive leak / discovery state。
- `packages/game-session/src/session-snapshots.ts`: `ExploreRenderState` への signal hints 追加。
- `apps/web/src/app/use-magnolia-input.ts`: scan 入力。
- `apps/web/src/app/use-magnolia-app.ts`: `scanPressed` を `stepExplore` へ渡す。
- `apps/web/src/components/ExploreCanvas.tsx`: パルスリング、外周方角反応、カテゴリ別ゴースト描画。
- `apps/web/src/screens/explore/ExploreScreen.tsx`: help text に scan を追加。
- `apps/web/src/components/MiniMap.tsx`: 識別済みノードのみ確定アイコン表示。

### 受け入れ条件

- 未発見通信の正確なアイコンは、最初から常時表示されない。
- パルスを使うと、未発見通信の方角・距離帯・カテゴリが分かる。
- パルスを使わなくても、近づけば信号の兆候を追える。
- 一度識別した通信・収集物は、map / minimap に残る。
- 探索が面倒になりすぎず、初回プレイで次の目的地を見失わない。

## 6. 改修 D: ミッション構成の再調整

### mission_good_morning

目的: 起動シーケンス / 自己診断。

- 既存の `tx_good_morning` は 55 秒程度あり、チュートリアルとして成立しやすい。
- 敵配置をだらっと流すより、8〜10 秒単位の機能確認フェーズに分ける。
- 移動、main、近接、sub、被弾ノイズ、磁気災害、探索開始の順に、本文と wave を対応させる。
- 失敗しても通信が完全に壊れないよう、`hearingThresholdOverride` は高めのままでよい。

### mission_where_are_you

目的: 長すぎない、市民の声の束。

- 現行実装では 65 秒程度の本文へ圧縮し、3 人の声が順番に短く届く構成にする。
- 各 speaker の区間ごとに弾幕の性格を変える。
  - カナ: 細く不安定、回避より聞き取り重視。
  - タクミ: 規則的で少し荒い。main で除去しやすい。
  - ミサキ: 不安定、hazard と絡める。
- 最後の「絶対。」は重要フレーズとして、短時間だが強い保護対象にする。

### mission_evacuation

目的: ほとんど壊れた通信の回収。

更新後の現行実装では、`tx_evacuation.chunks.json` は 55700ms まで本文チャンクを持ち、`mission_evacuation.json` は `durationMs: 60000` のまま運用する。古い baseline にあった 0〜8500ms までしか本文がない問題は解消済み。

古い baseline での修正方針は二択だった。

1. ミッションを 12〜18 秒程度に短縮する。
2. 45〜55 秒分の壊れた放送チャンクを追加し、長い欠損・断続・繰り返しを演出する。

推奨は 2。mission03 は「崩壊した公共放送」なので、完全な文章を増やすより、短い断片と長い破損区間を散らす。

例:

- 0〜8 秒: 正常な避難放送。
- 10〜20 秒: 繰り返し放送が崩れ始める。
- 22〜35 秒: 断片だけ拾える。
- 38〜50 秒: ほとんど破損。フラグメント回収でのみ一部復元。
- 最後: 「自力で……」などの短い残響。

### 受け入れ条件

- 各ミッションの本文タイムラインと mission duration が大きく乖離しない。
- ミッションごとに、本文の性質と敵 / hazard の性質が一致している。
- mission02 が長すぎず、mission03 が空白時間だらけにならない。

## 7. 優先順位

### P0: すぐ実装する

- 字幕の実欠損表示。
- `mission_evacuation` の本文長と mission duration の乖離修正。
- リザルトまたはアーカイブで、欠損した本文が見えるようにする初期対応。

### P1: playable slice の面白さを上げる

- 欠損フラグメントの生成・回収・表示。
- 探索スキャンパルスの初期実装。
- passive leak とカテゴリ別波形。

### P2: 拡張・磨き込み

- normalized transcript span への保存移行。
- 指向性スキャン、OS / subsystem による探索性能差。
- 戦闘中の信号帯 / 受信ルート。
- ミッション別の演出強化。

## 8. 実装上の注意

- UI は `snapshot` / `renderState` だけを見る。
- `apps/web` から content 全量や session 内部へ直接アクセスしない。
- mission 固有の処理を TypeScript にハードコードしない。mission の違いは content JSON と汎用 schema で表現する。
- 保存データは normalizer を通し、古い save が壊れないようにする。
- 未開放情報の秘匿は維持する。

## 9. 期待する体験

プレイヤーは、ただ対象を処理しているのではなく、通信の言葉を守っていると感じる。

被弾した瞬間、字幕が読めなくなり、失った断片が画面内にこぼれる。プレイヤーは危険を承知で拾いに行くか、次の言葉を守るかを判断する。

探索では、最初から正確な目的地へ一直線に歩くのではなく、強度バー、波形、視界円の反応、スキャンパルスを頼りに、通信の残響を探す。ただし、一度見つけたものはマップに残り、面倒な再探索は発生しない。

この方向で、MAGNOLIA は普通の射撃ゲームではなく、「言葉を欠損させないための受信戦闘」「失われた通信を探す探索ゲーム」として立ち上がる。
