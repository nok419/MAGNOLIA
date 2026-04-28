# motion

演出は、予兆、衝撃、余波、保存の順に分けます。

| 区間 | duration | easing | 役割 | reduceFlashing |
| --- | ---: | --- | --- | --- |
| 予兆 | 180ms から 600ms | `--motion-ease-standard` | hazard、被弾、接続の前触れ | 点滅ではなく alpha と線幅で表す |
| 衝撃 | 80ms から 160ms | linear または `--motion-ease-standard` | 被弾、ノイズ閾値超過 | flash は 3Hz 以下、赤全面は禁止 |
| 余波 | 240ms から 700ms | `--motion-ease-soft` | 画面揺れ後の残り、fragment 出現 | 揺れ量を 50% 以下にする |
| 保存 | 180ms から 400ms | `--motion-ease-standard` | 回復、記録、UI 反映 | 点滅を使わず状態差で示す |

`lowFrameRateMode` では particle 数、trail 数、scanline の移動量を下げます。duration は短縮しません。短縮すると出来事の順序が読みにくくなります。

presentation cue は `content/gameplay/presentation-cues.json` に `reduceFlashingVariant` を持ち、validator が channel、duration、点滅上限を確認します。

