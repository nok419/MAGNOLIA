# palette

CSS token と canvas palette は同じ semantic name を使います。

| 役割 | CSS token | canvas palette role | 用途 |
| --- | --- | --- | --- |
| 暗部 | `--color-void-base` | `voidBase` | 背景の最暗部 |
| 奥行き | `--color-void-raised` | `voidRaised` | 画面背景、低い surface |
| panel | `--color-void-panel` | `panel` | UI panel |
| 弱い線 | `--color-line-subtle` | `lineSubtle` | border、grid、scanline |
| 強い線 | `--color-line-strong` | `lineStrong` | focus、選択、重要線 |
| 信号 | `--color-signal-primary` | `signalPrimary`, `playerSignal` | player、scan、通常強調 |
| 本文 | `--color-signal-readable` | `signalReadable` | 可読テキスト、白い core |
| 補助 | `--color-signal-muted` | `signalMuted` | subtitle、補助情報 |
| 温かみ | `--color-residual-warmth` | `residualWarmth` | fragment、記憶、報酬 |
| 復元 | `--color-restoration` | `restoration` | 回復、復元済み |
| 脅威 | `--color-threat-noise` | `threatNoise`, `enemyNoise` | 被弾、ノイズ閾値、hazard |

新規 CSS では原則として直接色指定を増やしません。例外は以下です。

- canvas の `rgba()` で alpha を動的に変える場合。ただし `canvas-palette.ts` の role から作る。
- 既存 CSS の段階的移行。新規 class では token を使う。
- 一時検証用の色。merge 前に token へ戻す。
