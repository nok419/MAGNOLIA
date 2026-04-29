# accessibility and validation

# accessibility

- `reduceFlashing` が true の場合、点滅は無効化し、alpha の単発変化、線幅、形状差で表します。
- `lowFrameRateMode` が true の場合、particle 数、trail 数、scanline の移動量を下げます。
- subtitle が欠損している場合、欠損を空白だけで表さず、欠損範囲が分かる表示を使います。
- interactive element は `aria-label` または可視 text で目的が分かるようにします。
- threatNoise の赤系は、被弾、聴取不能、hazard 予兆に限定します。

# validator

`npm run content:validate` は次を確認します。

- JSON の ID とファイル名の対応
- ID の重複
- mission、transmission、enemy、bullet pattern、projectile、equipment、map node の参照
- wave、hazard、subtitle chunk の duration 範囲
- `audioStartDelayMs`, `outroMs`, `hearingThresholdOverride`, `repeatDecayRate` の境界値
- active / prototype / deprecated content の分類
- visual / hitbox / background preset の coverage
- presentation cue の channel、duration、`reduceFlashingVariant`

direct color literal は既存分の移行を一括要求しません。新規追加時は `apps/web/src/styles/tokens.css` と `apps/web/src/render/shared/canvas-palette.ts` の semantic name を使います。
