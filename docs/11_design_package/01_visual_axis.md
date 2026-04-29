# visual axis

視覚方針は、画面ごとの個別演出ではなく、content preset と token に落とします。

| 軸 | 色 | 線 | 余白 | 密度 | motion | alpha |
| --- | --- | --- | --- | --- | --- | --- |
| 儚さ | `signalMuted`, `lineSubtle` | 細い線を優先 | 広め | 低い | 遅い変化 | 0.12 から 0.38 |
| 瀟洒さ | `signalReadable`, `signalPrimary` | 直線と円弧 | 揃える | 中 | easing を統一 | 0.38 から 0.82 |
| 非言語性 | `lineSubtle`, `residualWarmth` | glyph と短い軌跡 | 近接配置 | 低から中 | 反復を抑える | 0.18 から 0.62 |
| 人工性 | `voidPanel`, `lineStrong` | 格子、走査線 | 狭め | 中から高 | 一定速度 | 0.2 から 0.7 |
| 温かみの残り | `residualWarmth` | 角を増やさない | 周囲に空ける | 低 | ゆっくり消える | 0.18 から 0.56 |
| 脅威ノイズ | `threatNoise` | 太くしすぎない | 他情報から離す | 中 | 予兆を先に出す | 0.18 から 0.5 |

脅威ノイズは被弾、聴取不能、hazard 予兆に限定します。常時表示の装飾には使いません。
