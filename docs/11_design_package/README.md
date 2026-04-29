# 11_design_package

更新日: 2026-04-29

## 目的
この文書は、design package の語彙を実装 token に接続する正本です。

対象:
- palette
- motion
- accessibility
- screen grammar

## palette
実装 token:
- `content/gameplay/visual-presets/*.json`
  - `paletteRole`
  - `accessibilityVariant`
  - `rendererKind`
- `content/gameplay/background-presets/*.json`
  - `theme`
  - `residualWarmth`
  - `structureDensity`
  - `dustDensity`
  - `scanlineIntensity`
  - `vignetteStrength`
- `packages/game-session/src/battle-visuals.ts`
  - `BattleEnemyVisualView.paletteRole`
  - `BattleProjectileVisualView.paletteRole`
  - `BattleHazardVisualView.paletteRole`

運用:
- Web 側で enemy ID や projectile ID ごとの色分岐を増やしません。
- 色や発光の基準は preset から renderState へ渡します。

## motion
実装 token:
- `packages/contracts/src/presentation-types.ts`
  - `PresentationCueId`
  - `PresentationChannel`
  - `PresentationCueSpec`
- `content/gameplay/presentation-cues.json`
  - `defaultDurationMs`
  - `maxFlashHz`
  - `reduceFlashingVariant`
- `apps/web/src/components/PresentationOverlay.tsx`
- `apps/web/src/render/battle/*`

運用:
- blocking の有無と duration は cue 側で固定します。
- `reduceFlashing` 有効時は `reduceFlashingVariant` を基準にします。
- 高速点滅を追加する場合は `maxFlashHz <= 3` を守ります。

## accessibility
実装 token:
- `content/gameplay/visual-presets/*.json`
  - `accessibilityVariant`
- `content/gameplay/presentation-cues.json`
  - `reduceFlashingVariant`
  - `maxFlashHz`
- `packages/contracts/src/settings.ts`
  - `reduceFlashing`
  - `lowFrameRateMode`

運用:
- 見た目 preset は `accessibilityVariant` を必ず持ちます。
- cue は低刺激版の duration を必ず持ちます。
- 文字情報を欠損表示にする場合でも、UI は状態を示す label を持ちます。

## screen grammar
実装 token:
- `packages/game-session/src/runtime-types.ts`
  - `ExploreRenderState`
  - `BattleRenderState`
  - `BattleEnemyVisualView`
  - `BattleProjectileVisualView`
- `packages/game-session/src/selectors.ts`
- `apps/web/src/app/use-magnolia-app.ts`
- `apps/web/src/screens/*`

運用:
- Web は content を直接走査して画面状態を補完しません。
- 未開放情報は selector と renderState の段階で落とします。
- screen は snapshot / renderState / callback を受けて描画します。

## content validator との接続
`npm run validate:content` は次を検査します。

- `rendererKind`
- `paletteRole`
- `accessibilityVariant`
- `presentation-cues.json`
- background / visual / hitbox preset coverage
- active content と prototype content の混在

この検証を通らない design token は merge しません。
