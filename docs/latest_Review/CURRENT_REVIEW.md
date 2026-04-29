# CURRENT_REVIEW

作成日: 2026-04-29
対象: 基盤・正本・CRUD検証

## 結論
今回の baseline は、root workspace、`packages/contracts`、`packages/game-session`、`packages/persistence`、`apps/web`、`content/gameplay`、`tools/content-validator` を含む monorepo です。

提出 zip だけを正本にせず、現行 repo の tracked source を正本にします。

## 正本ブランチ差分表

| 観点 | zip 実体 | レビュー2想定構成 | 採用 baseline |
| --- | --- | --- | --- |
| root package | lockfile / root package / packages が不足していた前提 | `npm run typecheck`、`build`、`validate:content`、`test` がある前提 | root `package.json` に `typecheck`、`validate:content`、`test`、`build`、`archive:source` を置く |
| packages | 不在または zip に未収録 | `contracts`、`game-session`、`persistence` を含む | 3 package を正本として扱う |
| content preset | mission は preset ID を参照するが定義が不足 | visual / hitbox / background preset を持つ | `content/gameplay/visual-presets`、`hitbox-presets`、`background-presets` を追加 |
| content lifecycle | active と prototype が同階層で混在 | active / prototype / deprecated を分ける | `content-classification.json` を追加し、runtime は active のみを bundle 化 |
| save migration | 旧 ID 対応が明示されていない | import 時に旧 ID を正規化 | `migrated-id-map.json` と `save-normalizer.ts` で対応 |
| validator | ignored `dist` だけでは正本にならない | merge 前に content 破損を検出 | `tools/content-validator/validate-content.mjs` を正本化 |
| CI | 未固定 | typecheck / content validation / test / build | `.github/workflows/ci.yml` を追加 |
| 配布物 | 生成物や OS メタデータが混入し得る | source archive と CI artifact を分離 | `npm run archive:source` で tracked source のみを zip 化 |

## 受け入れ基準との対応

何が問題か:
- ignored `dist` にある validator は source archive に入らず、正本になりません。
- prototype enemy と active mission が同じ loader に入ると、調整対象を誤ります。
- 旧 save の ID を直接捨てると、import 時に進行が消えます。

なぜ問題か:
- clean clone で検証できない構成は、他メンバーが同じ結果を再現できません。
- Web 側の ID 個別分岐を増やす原因になります。
- save / content 更新の境界が曖昧になります。

どうしたか:
- validator、CI、test、archive script を root script に接続しました。
- content lifecycle、preset coverage、presentation cue、migration map を content に追加しました。
- visual preset の `rendererKind` と `paletteRole` は、`packages/contracts` と `packages/game-session/src/runtime-types.ts` の union に合わせて検査します。
- loader は active content だけを bundle に入れる方針へ寄せました。
- save normalizer は旧 area / transmission / mission / equipment / map node ID を現行 ID へ寄せます。
- docs/02、docs/05、docs/11 を更新しました。

改善後にどう変化するか:
- `npm run validate:content` で mission、equipment、projectile、preset、migration map の破損を merge 前に検出できます。
- runtime は playable slice の active content だけを扱います。
- source archive に生成物や OS メタデータが入りにくくなります。

## 検証コマンド

必須:
- `npm run typecheck`
- `npm run validate:content`
- `npm test`
- `npm run build`

任意:
- `npm run archive:source`
- ローカルブラウザ smoke check
