# MAGNOLIA クリーンアップレビュー 2026-04-30

対象: 提供アーカイブ `/mnt/data/アーカイブ.zip`
目的: `agent.md` の KISS / DRY / SOLID、スコープ管理、生成物混入禁止に照らし、曖昧な責務、重複、未使用デブリを確認し、安全に外せるものを整理する。

このレビューは、提供アーカイブ内の `agent.md`、`docs/00_rules.md`、`docs/02_開発体制とディレクトリ構成.md`、`docs/05_データ構造.md`、`docs/08_表示と機能の境界.md`、`docs/11_design_package/README.md` と、実コードを突き合わせた結果です。アーカイブ外の CI、lock file、実リポジトリの root 設定は確認できていません。したがって、root 設定の追加は「このアーカイブ単体を検証可能に近づけるための修正案」です。実リポジトリに既存の root 設定がある場合は、重複させず統合してください。

# 結論

今回、安全に解消できるものは解消済みです。主に、OS メタデータ、build/cache、TypeScript incremental cache、ローカル設定、古い差分パッチ、空ディレクトリ、未参照 source wrapper を clean source から除外しました。アプリの参照グラフ上で、削除後の `apps/web/src/main.tsx` から到達不能な TypeScript / TSX / CSS / JSON source は 0 件です。

一方で、責務集中が大きい `packages/game-session/src/game-session.ts`、`apps/web/src/app/use-magnolia-app.ts`、key visual 周辺、battle step の host interface、色指定の残量は、短い削除作業で安全に直す範囲を超えています。これらは挙動変更リスクがあるため、個別チケットに分けました。

2026-05-01 追記:
MGN-CLN-002 は音声チーム関連を含むため保留しました。それ以外の cleanup ticket は実リポジトリへ反映済みです。`MagnoliaGameSession` は battle / explore frame と探索 signal runtime を分離し、`useMagnoliaApp` は idle auto-save、presentation timer、action、session sync を helper 化しました。key visual は `apps/web/src/render/key-visual/` へ移し、direct color baseline は 25 ファイル 710 件から 24 ファイル 686 件へ減らしました。`source-audit` は `apps/web/src/main.tsx` 起点の到達性検査を含みます。

# 実施した確認

- `agent.md` の KISS / DRY / SOLID / scope control / before finishing / review checklist を確認。
- `docs/02` の状態正本と参照経路を確認。現在の主要境界は `packages/game-session` が gameplay 正本、`packages/persistence` が content/save/settings 接続、`apps/web` が snapshot / renderState の表示層。
- `docs/08` の表示境界を確認。表示層は gameplay 判定、保存解釈、未開放情報の再計算をしない前提。
- source reachability を簡易解析。original では 169 source 中 4 件が `main.tsx` から未到達、clean source では 165 source 中 0 件が未到達。
- archive debris を確認。`__MACOSX`、`.DS_Store`、AppleDouble `._*`、`node_modules/.vite`、`dist`、`*.tsbuildinfo`、`.claude/settings.local.json`、`sound/audio_integration_incremental_v2.diff` が混入。
- direct command で `source-audit`、`style-audit`、content manifest check、content validation を実行。

# 対応済みの変更

## C-01 生成物、キャッシュ、OS メタデータ、ローカル設定を clean source から除外

何が問題か:
`__MACOSX`、`.DS_Store`、AppleDouble `._*`、`apps/web/node_modules/.vite`、`apps/web/dist`、packages の `dist`、`tools/content-validator/dist`、`*.tsbuildinfo`、`apps/web/.claude/settings.local.json` がアーカイブに含まれていました。

なぜ問題か:
`agent.md` は生成物、大きいファイル、ローカル情報を PR に含めないことを求めています。これらは source of truth ではなく、レビュー対象を増やし、古い build との混同を招きます。特に `apps/web/node_modules/.vite` と `apps/web/dist` はサイズも大きく、実装差分より生成物差分が目立ちます。

どうしたか:
clean source から除外しました。加えて `.gitignore` を追加し、同じ種類の混入を防ぐ設定を置きました。

改善後にどう変化するか:
配布物と source archive の役割が分かれ、レビューは source と docs に集中できます。生成物を確認する必要がある場合は `tools/create-release-artifact.mjs` の release artifact で扱う形に戻せます。

## C-02 古い音声差分パッチと空ディレクトリを除外

何が問題か:
`sound/audio_integration_incremental_v2.diff` は、`AudioHub.ts` などを新規追加する古い差分でした。実際には `apps/web/src/audio/AudioHub.ts` などが既に存在し、差分内には現在存在しない `apps/web/src/components/audio/AudioSettingsPanel.tsx` や `apps/web/src/styles/audio-settings.css` も含まれていました。さらに `apps/web/src/components/audio`、`apps/web/src/screens/archive`、`apps/web/src/screens/equipment`、`apps/web/src/screens/settings`、`apps/web/src/screens/slot-select` が空でした。

なぜ問題か:
未適用または部分的に古い patch が残ると、どれが正本か分からなくなります。空ディレクトリは責務の存在を示すように見えますが、実体がなく、現在の `MenuScreen` 集約方針ともずれます。

どうしたか:
古い patch と空ディレクトリを clean source から除外しました。`apps/web/public/sound/shot-placeholder.mp3` は実際の public asset なので残しました。

改善後にどう変化するか:
音声実装の正本が `apps/web/src/audio/*`、`apps/web/src/app/audio-controller.ts`、`docs/06_音声管理.md` に絞られます。screen 構成も実ファイルに対応した見え方になります。

## C-03 未参照 source wrapper を削除

何が問題か:
次の 4 ファイルが `apps/web/src/main.tsx` から到達不能でした。

```text
apps/web/src/components/ScreenShell.tsx
apps/web/src/render/battle/backgrounds/broadcast-facility.ts
apps/web/src/render/battle/backgrounds/central-tower.ts
apps/web/src/render/battle/enemies/enemy-presets.ts
```

`broadcast-facility.ts` と `central-tower.ts` は同じ `drawBattleBackgroundPreset` の再 export だけでした。`ScreenShell.tsx` は画面枠の component ですが import がなく、`MapScreen.tsx` は同じ CSS class を直接使っています。`enemy-presets.ts` は type union だけで参照がありませんでした。

なぜ問題か:
KISS の観点では、使われていない wrapper や将来用の薄い型は、実装者に存在しない分岐や責務を想像させます。DRY の観点でも、同じ意味を持たない薄い再 export は安定した共通化ではありません。

どうしたか:
clean source から削除しました。削除後の簡易 reachability 解析では未到達 source は 0 件です。

改善後にどう変化するか:
battle background の入口は `background-renderer.ts` に集まり、画面枠も実際に使う screen 実装へ限定されます。将来 ScreenShell を戻す場合は、実使用箇所と同時に追加できます。

## C-04 root の検証入口を補いました

何が問題か:
提供アーカイブには root `package.json` と `tsconfig.base.json` がありませんでした。一方で `apps/web/tsconfig.json` と packages の tsconfig は `../../tsconfig.base.json` を参照しており、`agent.md` は `npm run lint`、`npm test`、`npm run build` の実行または失敗報告を求めています。

なぜ問題か:
root の検証入口がないと、開発者ごとに実行コマンドがばらつきます。また、このアーカイブ単体では `tsc --showConfig` が `Cannot read file .../tsconfig.base.json` で失敗します。

どうしたか:
clean source に root `package.json`、`tsconfig.base.json`、`.gitignore` を追加しました。`tsconfig.base.json` は既存 `*.tsbuildinfo` から読み取れた `target: ES2022`、`module: ESNext`、`strict`、`skipLibCheck`、`esModuleInterop`、`composite`、`declaration` を基準にした最小設定です。

改善後にどう変化するか:
`apps/web/tsconfig.json` の `tsc --showConfig` は root base を読めます。root scripts から `source:audit`、`style:audit`、`content:manifest:check`、`content:validate`、`build` の入口が分かります。ただし、実リポジトリの lock file と依存 install はこのアーカイブ外なので、full build は実リポジトリで再実行してください。

# 2026-04-30 時点の未解消設計課題

## F-01 `MagnoliaGameSession` の責務がまだ広い

何が問題か:
`packages/game-session/src/game-session.ts` は 2470 行で、公開 API、command handler、探索 runtime、戦闘補助処理、archive selection、presentation queue、save synchronization、装備付与、battle fragment、map visibility などを保持しています。`stepBattleFrame` への委譲はありますが、`BattleStepHost` は 24 項目を受け取り、多くが `game-session.ts` の private method に戻っています。

なぜ問題か:
単一責任とインターフェース分離の観点で、変更理由が多すぎます。戦闘 fragment の変更、探索 signal の変更、保存の変更、装備の変更が同じ巨大 class に戻るため、変更時に無関係な副作用を確認する範囲が広がります。

どうすべきか:
`explore-session-runtime`、`battle-session-runtime`、`session-command-handlers`、`session-persistence-sync` のように、まず実在する変更理由単位で pure function / small module へ切り出します。public API を急に変えず、facade として `MagnoliaGameSession` を残す段階移行が安全です。

改善後にどう変化するか:
戦闘・探索・保存・command の変更確認範囲が狭くなり、テストも小さい単位で置けます。

2026-05-01 追記:
探索 frame を `packages/game-session/src/explore/step-explore.ts`、探索 signal runtime を `packages/game-session/src/explore/explore-session-runtime.ts`、戦闘 frame を `packages/game-session/src/battle/step-battle.ts` に分けました。`game-session.ts` は public facade と依存接続を中心に残しています。

## F-02 `useMagnoliaApp` が app state、command action、presentation、idle autosave、audio side effect をまとめている

何が問題か:
`apps/web/src/app/use-magnolia-app.ts` は 857 行で、初期化、frame loop 接続、slot 操作、command dispatch、presentation event の寿命管理、item popup、idle auto-save、audio event adapter、state sync を同時に扱っています。

なぜ問題か:
React hook としての変更理由が多く、UI 表示変更でも保存・音声・presentation timeout に触れる恐れがあります。これは KISS と単一責任に反します。

どうすべきか:
まず `useIdleAutoSave`、`usePresentationTimers`、`createMagnoliaActions`、`syncMagnoliaAppStateFromSession` を切り出し、hook 本体は依存をつなぐ composition root に寄せます。

改善後にどう変化するか:
保存の変更、presentation cue の変更、操作 action の変更を個別に確認できます。

2026-05-01 追記:
`useIdleAutoSave`、`usePresentationTimers`、`createMagnoliaActions`、`syncMagnoliaAppStateFromSession` へ切り出しました。

## F-03 key visual が battle runtime fixture と PNG export の両方を抱えている

何が問題か:
`KeyVisualModal.tsx` は `BattleCanvas` と `buildKeyVisualRenderState` を使い、PNG export の Canvas 合成、ロゴ描画、直書き色、構図補正を同じ component 内に持っています。`key-visual-render-state.ts` は `BattleRenderState` を返し、実ミッションではない fixture ID を組み立てます。

なぜ問題か:
key visual は presentation 用の poster 構図であり、battle runtime renderer の検証対象とは変更理由が違います。現状では battle renderState の型変更が poster 生成へ波及し、逆に poster 用の構図調整が battle 表示に近い場所へ入り続けます。

どうすべきか:
`apps/web/src/render/key-visual/` を作り、poster composition、PNG export、battle renderer reuse の境界を分けます。battle renderer を使う場合も adapter を明示し、fixture は key visual package 内に閉じます。

改善後にどう変化するか:
battle runtime と販促・タイトル用 visual の変更理由が分離されます。

2026-05-01 追記:
`apps/web/src/render/key-visual/` に poster composition、PNG export、battle canvas adapter、key visual render state を分けました。旧 battle fixture path は互換 re-export のみです。

## F-04 direct color literal が baseline として残っている

何が問題か:
`style-audit` は pass していますが、direct color literal は 25 ファイルに 710 件、red threatNoise migration candidate は 22 件あります。

なぜ問題か:
`docs/11_design_package` は CSS token と canvas palette を見た目の正本としています。直書き色が多いと、テーマや reduce flashing の調整が局所的な置換作業になります。

どうすべきか:
既存 baseline を急に 0 にせず、画面単位で palette / token へ移行し、baseline を減らすチケットにします。

改善後にどう変化するか:
見た目の変更が token / palette の変更に寄り、CSS と Canvas の色ズレを減らせます。

2026-05-01 追記:
key visual の direct color literal を削減し、baseline を 24 ファイル 686 件へ更新しました。

## F-05 `packages/persistence/src/generated/content-manifest.ts` の扱いを明文化する必要がある

何が問題か:
`content-manifest.ts` は生成ファイルですが、runtime loader が import しており、既存 `tools/create-source-archive.mjs` もこれを除外していません。

なぜ問題か:
`agent.md` の「generated files を含めない」と、現在の content manifest 運用がそのままでは衝突します。今回は削除すると runtime import が壊れるため残しました。

どうしたか:
`content-manifest.ts` は生成物だが source として commit する例外とし、`agent.md` と `docs/02_開発体制とディレクトリ構成.md` に明記しました。`content:manifest:check` は `content:validate` と `npm test` から実行されます。

改善後にどう変化するか:
generated file 禁止の例外が明確になり、レビュー時に毎回迷わなくなります。

# 検証結果

実行できた確認:

```text
node tools/source-audit.mjs
=> source audit passed

node tools/style-audit.mjs
=> style audit passed
=> 686 direct color literals in 24 files
=> 20 red threatNoise migration candidates

node tools/generate-content-manifest.mjs --check
=> content manifest is up to date

node tools/content-validator/dist/validate-content.js
=> content validation passed (90 JSON files)
```

clean source で確認したこと:

```text
tsc --showConfig -p apps/web/tsconfig.json
=> tsconfig.base.json を読み込める状態になった

tsc -b --dry apps/web/tsconfig.json
=> packages/contracts, packages/game-session, packages/persistence, apps/web の build 対象を解決

source reachability
=> total_files=165 reachable_from_app=165 unreachable=0
```

実行できなかった、または環境上完了確認できなかったこと:

```text
npm run lint
npm test
npm run build
```

理由:
元アーカイブは root `package.json` がなく、clean source は root scripts を補いましたが、この実行環境では npm command が途中で timeout しました。また、clean source archive は source-only のため `node_modules` と lock file を含めていません。実リポジトリで依存 install 後に再実行してください。

# clean source の内容

clean source には次を含めています。

- source / docs / content / tools
- root `.gitignore`
- root `package.json`
- root `tsconfig.base.json`
- 今回追加したレビュー書とチケット一覧

clean source には次を含めていません。

- `__MACOSX`
- `.DS_Store`
- AppleDouble `._*`
- `node_modules`
- `dist`
- `*.tsbuildinfo`
- `.claude/settings.local.json`
- `*.diff` / `*.patch`
- 空ディレクトリ
- 未参照 source wrapper 4 件

# 次に見るべきチケット

詳細は `10_cleanup_tickets_2026-04-30.md` を参照してください。優先度が高い順に、root 検証の実リポジトリ再実行、`MagnoliaGameSession` 分割、`useMagnoliaApp` 分割、key visual 分離、direct color baseline の段階削減です。
