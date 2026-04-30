# palette

CSS token と canvas palette は同じ semantic name を使います。

| 役割 | CSS token | canvas palette role | 用途 |
| --- | --- | --- | --- |
| 暗部 | `--color-void-base` | `voidBase` | 背景の最暗部 |
| 奥行き | `--color-void-raised` | `voidRaised` | 画面背景、低い surface |
| 奥の面 | `--color-void-depth` | `voidDepth` | 互換UIの深い面 |
| panel | `--color-void-panel-solid` | `panel` | canvas 上の不透明 panel |
| 弱い線 | `--color-line-subtle` | `lineSubtle` | border、grid、scanline |
| 強い線 | `--color-line-strong` | `lineStrong` | focus、選択、重要線 |
| 信号 | `--color-signal-primary` | `signalPrimary`, `signalPrimaryDim`, `playerSignal` | player、scan、通常強調 |
| 本文 | `--color-signal-readable` | `signalReadable` | 可読テキスト、白い core |
| 補助 | `--color-signal-secondary`, `--color-signal-muted` | `signalSecondary`, `signalMuted` | subtitle、補助情報 |
| 温かみ | `--color-residual-warmth` | `residualWarmth` | fragment、記憶、報酬 |
| 復元 | `--color-restoration` | `restoration` | 回復、復元済み |
| 脅威 | `--color-threat-noise` | `threatNoise`, `enemyNoise` | 被弾、ノイズ閾値、hazard |

新規 CSS では原則として直接色指定を増やしません。例外は以下です。

- canvas の `rgba()` で alpha を動的に変える場合。ただし `canvas-palette.ts` の role から作る。
- 既存 CSS の段階的移行。新規 class では token を使う。
- 一時検証用の色。merge 前に token へ戻す。

## direct color baseline 例外

`npm run style:audit` は `apps/web/src/styles/tokens.css` と `apps/web/src/render/shared/canvas-palette.ts` を正本として除外し、それ以外の直接色指定は `tools/style-audit/direct-color-baseline.json` の件数を上限にします。2026-04-30 時点の baseline は移行中の既存色だけを許容します。新規ファイルまたは件数増加は失敗扱いです。

| ファイル群 | 残す理由 | 期限 |
| --- | --- | --- |
| `apps/web/src/styles/*.css` | 既存画面のグラデーション、影、状態色がまだ token へ移行中。新規 class は semantic token を使う。 | 直接編集する次フェーズで該当箇所を縮小する |
| `apps/web/src/render/battle/*` | battle の発光、hazard、subtitle noise は alpha と motion を数式で変える箇所が残る。新規描画は `canvas-palette.ts` と shared effect を使う。 | renderer を触るチケットごとに移行する |
| `apps/web/src/render/explore/*`、`apps/web/src/render/map/*` | 霧、trail、map grid の既存演出が一部 direct color を持つ。低負荷 mode や shared effect へ移した箇所から削減する。 | explore / map 描画変更時に縮小する |
| `apps/web/src/components/title/SignalBackdropCanvas.tsx`、`apps/web/src/components/KeyVisualModal.tsx` | title と key visual の既存装飾に残る色。波紋や格子は shared effect へ寄せ、fixture state は content preset 検査へ移した。 | title / key visual の追加調整時に token 化する |
| `apps/web/src/app/canvas-markers.ts`、`apps/web/src/components/MiniMap.tsx` | marker と minimap の互換色。Path2D cache と低負荷 mode 対応は入れ、色移行は表示差分が見える単位で行う。 | marker 再設計時に token 化する |

`threatNoise` は hazard、被弾、聴取不能、danger tone に限定します。通常 hover、通常選択、背景装飾の赤系強調には使いません。
