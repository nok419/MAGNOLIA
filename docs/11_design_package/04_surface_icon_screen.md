# surface, iconography, screen grammar

# surface

| 要素 | 使い方 | 禁止 |
| --- | --- | --- |
| panel | 情報単位を囲む。blur は `--surface-panel-blur` を使う | panel の中に同じ見た目の panel を重ねない |
| border | focus、選択、境界に使う | 常時発光の太線を増やさない |
| blur | menu、modal、overlay の背面分離に使う | battle 中の重要対象に blur を重ねない |
| scanline | 通信、復元、map に限定する | 全画面で高 alpha の走査線を常時出さない |
| vignette | 探索と battle の奥行きに使う | subtitle や prompt を読みにくくしない |

# iconography

| 対象 | 記号 | 色 role | motion |
| --- | --- | --- | --- |
| transmission | 円弧と短い縦線 | `signalPrimary` | 接続時に外側へ 1 回広がる |
| collectible | 小さい菱形 | `residualWarmth` | 低速 pulse |
| fragment | 欠けた短冊 | `residualWarmth` から `restoration` | 回収後に保存区間へ移る |
| enemy | 円核と orbit | `enemyNoise` | 種別ごとの orbitScale |
| hazard | 矩形範囲と警告線 | `threatNoise` | 予兆を先に出す |
| repair | 十字ではなく短い水平線 2 本 | `restoration` | 点滅なし |

# screen grammar

| 画面 | 情報階層 |
| --- | --- |
| title | logo、slot、設定への導線。説明文を増やさない |
| explore | player、signal hint、interaction prompt、map 情報の順 |
| battle | player、敵弾、被弾/ノイズ、subtitle、fragment の順 |
| map | area、transmission、collectible、warp の順 |
| menu | 装備状態、装備一覧、詳細、費用/条件の順 |

画面側で mission ID、enemy ID、projectile ID を見て個別分岐を増やしません。必要な差は content preset に置きます。
