# 11 design package

この package は、見た目の変更を実装へ接続するための正本です。

- `01_visual_axis.md`: 視覚方針を色、線、余白、密度、motion、alpha に分けて定義します。
- `02_palette.md`: CSS token と canvas palette の対応を定義します。
- `03_motion.md`: 予兆、衝撃、余波、保存の時間、easing、点滅制限を定義します。
- `04_surface_icon_screen.md`: surface、iconography、screen grammar を定義します。
- `05_accessibility_validation.md`: reduceFlashing、lowFrameRateMode、字幕、aria-label、validator の受け入れ条件を定義します。
- `06_state_transition_and_save.md`: command ごとの責務境界と save normalizer の確認項目を定義します。
- `07_mission_beats.md`: mission beat を content で調整するルールを定義します。

関連する実装入口:

- CSS token: `apps/web/src/styles/tokens.css`
- canvas palette: `apps/web/src/render/shared/canvas-palette.ts`
- content preset: `content/gameplay/visual-presets`, `content/gameplay/hitbox-presets`, `content/gameplay/background-presets`
- validator: `tools/content-validator`
