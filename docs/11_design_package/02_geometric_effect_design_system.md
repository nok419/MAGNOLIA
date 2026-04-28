# 02 幾何学デザインとエフェクト設計システム

作成日: 2026-04-28
目的: 「幾何学的で美しいが、質素でも装飾過多でもない」MAGNOLIA の描画規則を具体化する。

## 0. まず捨てる前提

黄金比や幾何学模様を使えば美しくなる、という考え方は捨てる。比率は道具であり、美しさの本体ではない。

MAGNOLIA で必要なのは、個々の図形の美しさよりも、図形が何を意味し、どの場面で、どれくらいの強さで、どの時間で現れるかが一貫していることだ。

この文書では、図形を「見た目の飾り」ではなく、意味を持ったコンポーネントとして定義する。

## 1. MAGNOLIA の視覚文法

### 世界観の核

MAGNOLIA は、人の意思が消えた後の電子世界で、人の痕跡だけが根付いている場所である。

このため、画面の大半は人工的・非人格的・規則的でよい。ただし、復元された声、未送信の私信、誰かの最後の行動に触れる瞬間だけ、少し温かく、少し不規則になる。

### 形状と意味

- 点
  - signal mote, dead pixel, 微細な受信ノイズ。
  - 画面を豊かにするが、主役にしない。
- 線
  - carrier line, scan trace, 接続、測定、方向。
  - MAGNOLIA の最重要プリミティブ。
- 弧
  - 不完全な円、部分的な記録、受信範囲、余韻。
  - 完全な円よりも、欠けた弧を基本にする。
- 円
  - 安定した場、敵機コア、基本弾、解析フィールド。
  - 使いすぎると全てが同じ意味になるため、直径・線幅・発光で役割を分ける。
- 菱形
  - fragment, packet, archive piece, map marker。
  - 通信断片と収集対象に集中して使う。
- 長方形
  - record, terminal, redaction, data slot。
  - UI の本文・リスト・設定に使う。
- グリッド
  - 空間そのものではなく、計測や校正の補助線。
  - 背景の全面模様にしない。必要な面だけに薄く出す。
- 花弁的な非対称形
  - MAGNOLIA の名前に由来するが、花として描かない。
  - 弧、余白、欠損、重なりで示す。

## 2. レイヤー構造

全画面で同じレイヤー順を使う。

1. L0: void
   - 黒に近い深青。最奥。ほぼ動かない。
2. L1: distant signal field
   - 遠い線、粒子、空間の呼吸。低アルファ。
3. L2: local structure
   - 探索グリッド、戦闘の carrier lines、メニューの frame。
4. L3: gameplay entities
   - 自機、敵機、敵弾、通信アイコン、収集物。
5. L4: transient effects
   - scan pulse, hit, pickup, fragment, distortion。
6. L5: HUD / menu panels
   - 読むべき情報。背景より明るく、敵弾とは衝突しない位置。
7. L6: mode transition veil
   - モード遷移専用。通常時は出さない。
8. L7: accessibility override
   - reduced flashing, low framerate, high contrast fallback。

このレイヤーを守ると、背景をリッチにしても敵弾や本文の可読性を保てる。

## 3. 色設計

### 色の基本方針

黒、青、深い青をベースにする。ただし「黒背景に青い線」だけでは質素になる。必要なのは、青の数を増やすことではなく、暗い層の微妙な差を作ることだ。

推奨 token:

```ts
export const visualColors = {
  void: "#03070f",
  abyss: "#06101d",
  deep: "#0a1729",
  panel: "rgba(8, 18, 34, 0.82)",
  panelRaised: "rgba(13, 29, 52, 0.88)",
  lineQuiet: "rgba(140, 195, 255, 0.14)",
  lineMedium: "rgba(140, 195, 255, 0.28)",
  signal: "#5da4d1",
  signalSoft: "rgba(93, 164, 209, 0.62)",
  signalBright: "rgba(180, 226, 255, 0.92)",
  memory: "#f0c674",
  memorySoft: "rgba(240, 198, 116, 0.42)",
  danger: "#ff5a6e",
  dangerSoft: "rgba(255, 90, 110, 0.34)",
  textPrimary: "rgba(232, 244, 255, 0.92)",
  textSecondary: "rgba(192, 215, 232, 0.68)",
  textMuted: "rgba(150, 178, 202, 0.42)",
}
```

### 色の使用比率

- void / abyss / deep: 70〜85%
- lineQuiet / lineMedium: 8〜15%
- signal blue: 5〜10%
- memory amber: 1〜4%
- danger red: 1〜3%
- green: 原則 0。必要な場合は修復・安定化に限定。

### 重要な禁則

- 画面ごとに新しい青を作らない。
- 透明度違いを毎回リテラルで書かない。
- danger red を「目立たせたい通知」に使わない。
- memory amber を報酬や金銭っぽい豪華さに使わない。
- white glow を乱用しない。

## 4. 線と余白

### 線幅 token

```ts
export const strokes = {
  hair: 0.5,
  thin: 1,
  regular: 1.5,
  strong: 2,
  silhouette: 2.5,
}
```

- 背景線: hair〜thin
- UI frame: thin〜regular
- 自機・敵機の輪郭: regular〜silhouette
- 敵弾の危険コア: regular 以上
- 装飾弧: hair〜thin

### 余白 scale

```ts
export const space = [4, 8, 12, 16, 24, 32, 48, 64]
```

- 小ボタン内余白: 8〜12
- パネル内余白: 16〜24
- 大きな画面分割: 32〜64
- メニュー列間: 24〜48

黄金比を使う場合も、最終的にはこの scale に丸める。そうしないと UI の余白が毎箇所で揺れ、野暮ったく見える。

## 5. Motion 設計

### motion intent

MAGNOLIA の動きは 4 種に分ける。

- productive
  - 入力への反応。短い。70〜150ms。
- system communication
  - パネル開閉、通知、装備変更。180〜280ms。
- expressive transition
  - 探索から戦闘、戦闘からリザルト。400〜700ms。
- ambient
  - 背景、粒子、呼吸。周期 4〜12 秒。目立たない。

### easing

```ts
export const easing = {
  standard: "cubic-bezier(0.2, 0, 0.38, 0.9)",
  entrance: "cubic-bezier(0, 0, 0.38, 0.9)",
  exit: "cubic-bezier(0.2, 0, 1, 0.9)",
  expressive: "cubic-bezier(0.4, 0.14, 0.3, 1)",
}
```

### motion 禁則

- 複数のパネルが別々の方向へ同時に動く遷移。
- 入力した後に、プレイヤーが待たされる長い装飾アニメーション。
- 1 秒に 3 回を超える明滅。
- reduced flashing 設定を無視する Canvas エフェクト。
- `Math.random()` を描画フレームで直接呼んで、毎回揺れ方が変わるノイズ。

## 6. エフェクトコンポーネントの正規化

現状のように、背景、hazard、subtitle、menu、title がそれぞれ独自のグリッチや粒子を持つと、ゲーム全体の視覚効果が統一されない。以下の正規コンポーネントへ集約する。

### SignalParticleField

用途:

- 背景の微粒子
- メニュー背面の浮遊粒子
- タイトル画面の遠景粒子
- 探索の静かな空間密度

入力:

```ts
type SignalParticleFieldInput = {
  seed: number
  density: "sparse" | "normal" | "dense"
  depth: "far" | "mid" | "near"
  drift: "still" | "up" | "toward-focus" | "current"
  colorRole: "line" | "signal" | "memory"
  reduceMotion: boolean
}
```

規則:

- density dense でもプレイ領域では敵弾より暗い。
- menu / title / explore で同じ関数を使う。
- フレームごとに粒子を再生成しない。

### CarrierLineField

用途:

- 戦闘背景
- 探索背景の遠い通信線
- メニュー frame の補助線

入力:

```ts
type CarrierLineFieldInput = {
  seed: number
  orientation: "vertical" | "horizontal" | "radial" | "diagonal"
  density: number
  curvature: number
  alpha: number
  focus?: { x: number; y: number }
}
```

規則:

- 背景の全面グリッドにしない。
- 画面の周辺や余白に寄せる。
- 敵弾が通る中央帯は控えめにする。

### ScanPulse

用途:

- 探索 scan
- 通信接続
- pickup
- 装備変更確認
- 戦闘中の解析進行

入力:

```ts
type ScanPulseInput = {
  origin: { x: number; y: number }
  radius: number
  progress: number
  strength: number
  shape: "circle" | "arc" | "diamond" | "line"
  role: "discover" | "connect" | "confirm" | "analyze"
}
```

規則:

- circle は探索・接続。
- diamond は fragment / archive。
- line は UI confirmation。
- 同じ scan pulse を画面ごとに別実装しない。

### SignalDistortion

用途:

- 被弾字幕
- hazard
- 戦闘遷移
- archive 未復元箇所
- title の一部。ただし title は専用強度を持つ。

入力:

```ts
type SignalDistortionInput = {
  seed: number
  severity: 0 | 1 | 2 | 3
  domain: "subtitle" | "hazard" | "transition" | "archive" | "title"
  cadenceMs: number
  chroma: 0 | 1 | 2
  mask: "line" | "block" | "slice" | "noise"
  reduceFlashing: boolean
}
```

規則:

- グリッチは 1 コンポーネントに集約する。
- severity 0 は欠損だけ、1 は微小な横ずれ、2 は短い slice、3 は transition 専用。
- hazard に TV static、interlace、strobe、block corruption、screen tear を個別実装しない。すべて `SignalDistortion` の sub-layer として制御する。
- subtitle と hazard は同じ見た目の強度違いであり、別世界の演出にしない。

### SoftBloom

用途:

- signal 強調
- 敵弾コア
- 自機コア
- 接続完了

規則:

- bloom は情報の周辺にだけ使う。
- UI frame 全体を光らせない。
- memory amber の bloom は小さく、短く。

### ResidualTrail

用途:

- 自機の移動軌跡
- projectile trail
- fragment attraction
- mode transition の持ち越し

規則:

- 履歴点は上限を決める。
- 消え方は dissolve ではなく fade + thinning。
- trail が自機や弾の本体より強くならない。

### FocusBracket

用途:

- メニュー選択
- 通信アイコン focus
- archive log selection
- 装備スロット選択

規則:

- 選択状態を glow だけに頼らない。
- bracket は短い線で、対象の四隅すべてを囲まない。
- 片側だけ欠けていると MAGNOLIA らしい。

### MetricMeter

用途:

- 解析率
- 復元率
- ノイズ強度
- 音量設定
- 通信強度

規則:

- バー、リング、ドットの 3 種だけ許可。
- 同じ値を画面ごとに違う形で表示しない。
- 7 段階設定は dot meter、連続値は bar meter、範囲感は ring meter。

## 7. 重複しやすいエフェクトの統合方針

### グリッチ

許可する意味は 3 つだけ。

- loss
  - 情報が欠ける。本文・アーカイブ・subtitle。
- desync
  - 同期がずれる。hit, hazard, transition。
- noise
  - 外乱が混ざる。background, hazard, battle peak。

見た目としては 1 つの `SignalDistortion` が severity と domain で変化するだけにする。

### パーティクル

許可する意味は 4 つ。

- dust
  - 背景密度。
- packet
  - 通信の流れ。
- fragment
  - 収集・復元。
- spark
  - hit / confirm。短命。

### リング

許可する意味は 4 つ。

- scan
  - 探索・検出。
- field
  - 支援・防御・静音域。
- core
  - 敵機・基本弾。
- transition
  - モード遷移。

同じ ring を何にでも使うのではなく、stroke, gap, direction, lifetime で差をつける。

## 8. 背景設計

### 戦闘背景

現行の単純な縦グリッドと粒子は、機能はあるが「通信空間」という意味を作りにくい。以下に置き換える。

- 周辺部に薄い carrier lines。
- 中央の弾道帯は暗めに保つ。
- 画面下から上へではなく、奥行き方向にゆっくり流れる dust。
- ミッションごとに 1 つだけ background motif を変える。
  - `good_morning`: sparse carrier wave。
  - `where_are_you`: interrupted arc。
  - `evacuation`: compression band と weak warning ticks。
- 敵弾が多い時は背景が自動で沈む。

### 探索背景

探索画面は、広い電子空間の中で「発見されている範囲」と「まだ聴こえていない範囲」を見せる。

- fog は黒い塗りだけでなく、情報密度の差として見せる。
- 探索済み領域には微細な carrier lines が残る。
- 未探索領域はただ暗いのではなく、情報が欠落しているように見せる。
- 通信アイコン周辺だけ温かい記録の痕跡を出す。

### メニュー背景

メニュー背景は別空間ではなく、探索・戦闘と同じ signal field の「端末表示」層にする。

- 40 個のランダム粒子を浮かせるだけでは足りない。
- 画面端に faint frame、中央に低密度の data lanes、選択中の panel 周辺だけ微細な scan ticks。
- 背面粒子はすべて `SignalParticleField` へ統合。

## 9. HUD とメニューの品を上げる具体規則

### UI が野暮ったく見える典型原因

- 枠線が多い。
- すべての要素が同じ青で光る。
- 余白が要素ごとに違う。
- パネル内で情報の階層が明確でない。
- アイコン、ボタン、バッジ、メーターが別々の文法で作られている。
- 角丸、線幅、影、glow が場所ごとに異なる。

### MAGNOLIA の UI ルール

- パネルは最大 2 階層。
  - base panel と raised detail のみ。
- 枠線は 1 枚のパネルに 1 本だけ。
  - 内部の区切りは線ではなく余白と見出しで行う。
- glow は focus と active signal だけ。
  - 通常カードや通常ボタンは glow しない。
- active color は blue、記憶は amber、危険は red。
  - 新規 badge や報酬に amber を多用しない。
- 数字は tabular-nums。
  - 計測器らしさと安定感を出す。
- 大文字英字は letter-spacing を控えめにする。
  - 文字間を広げすぎるとテンプレート感が出る。

## 10. 実装設計

### 推奨ファイル追加

- `apps/web/src/app/visual-tokens.ts`
  - 色、線、余白、motion、z layer。
- `apps/web/src/app/effect-primitives.ts`
  - Canvas 用の正規エフェクト関数。
- `apps/web/src/app/signal-distortion.ts`
  - グリッチ/欠損/ノイズを 1 箇所へ集約。
- `apps/web/src/app/visual-seed.ts`
  - deterministic random helper。
- `apps/web/src/app/mission-visual-profiles.ts`
  - ミッションごとの background motif と bullet choreography の対応。

### 正規 effect id

```ts
export type EffectId =
  | "signal-particle-field"
  | "carrier-line-field"
  | "scan-pulse"
  | "signal-distortion"
  | "soft-bloom"
  | "residual-trail"
  | "focus-bracket"
  | "metric-meter"
  | "fragment-glyph"
  | "screen-veil-transition"
```

### エフェクト追加時のチェック

新しいエフェクトを足す前に、次を確認する。

1. 既存 effect id の param で表現できないか。
2. そのエフェクトは何を意味するのか。
3. どのモードで使えるのか。
4. reduced flashing / low framerate でどう振る舞うか。
5. 背景、敵弾、本文、HUD のどれより強いのか。
6. seed はどこから決まるか。
7. 同じモチーフが別ファイルに存在しないか。

## 11. アクセシビリティと性能

### 明滅

- 1 秒に 3 回を超える明滅は禁止。
- white flash は原則禁止。
- hit feedback は flash ではなく、線のずれ、短い ring、音、本文の軽い欠損で表現する。
- reduced flashing がオンの時、strobe, fast glitch, rapid opacity pulse は静的な欠損 mask へ変換する。

### 性能

- CSS animation は transform と opacity を中心にする。
- Canvas では毎フレーム `Math.random()` を使わず、seeded random + time quantization を使う。
- 多数の粒子、円弧、ノイズを毎フレーム新規生成しない。
- ぼかしや shadowBlur は範囲と回数を制限する。
- battle では敵弾が多い時に背景エフェクトを自動で減らす。

## 12. 品質判定

次の問いにすべて答えられる状態を合格とする。

- この線は何を意味しているか。
- この発光は何の状態を示しているか。
- このグリッチは loss / desync / noise のどれか。
- この粒子は dust / packet / fragment / spark のどれか。
- この色は token のどれか。
- reduced flashing の時にも同じ情報が伝わるか。
- 探索、戦闘、メニューで同じ視覚文法に見えるか。
- 人の痕跡は本当に少量で、だからこそ温かく見えるか。

MAGNOLIA の幾何学は、正確な比率の図形ではなく、意味のある沈黙と、必要な時だけ立ち上がる信号で成立させる。
