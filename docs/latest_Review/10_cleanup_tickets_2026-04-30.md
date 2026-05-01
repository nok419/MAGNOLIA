# MAGNOLIA クリーンアップ作業チケット 2026-04-30

対象: 提供アーカイブの cleanup と、残った SOLID / DRY / KISS 違反候補。

状態の意味:
- done: 実リポジトリに反映済み。
- hold: 明示的に保留中。

# MGN-CLN-001 source archive から生成物、OS メタデータ、ローカル設定を除外する

状態: hold

何が問題か:
`__MACOSX`、`.DS_Store`、AppleDouble `._*`、`node_modules/.vite`、`dist`、`*.tsbuildinfo`、`.claude/settings.local.json` が混入していた。

なぜ問題か:
source review と release artifact の境界が崩れ、古い build や個人環境情報を source と誤認しやすい。

どうしたか:
clean source から除外し、`.gitignore` を追加した。

受け入れ条件:
`find .` で metadata / cache / dist / tsbuildinfo / local settings が出ない。

確認:
clean source で該当ファイルなし。

# MGN-CLN-002 古い音声差分 patch と空ディレクトリを除外する

状態: done

何が問題か:
`sound/audio_integration_incremental_v2.diff` が残り、実装済みの audio source と古い差分が併存していた。`components/audio` と複数の screen directory が空だった。

なぜ問題か:
正本が分かりにくく、将来の作業者が古い patch を新規要件と誤認する。

どうしたか:
MGN-CLN-002 は音声チーム関連の仕事を含むため保留した。音源の配置先は `apps/web/public/sound`、棚卸し正本は `docs/sound-inventory.md` に寄せ、root `sound/` は正本として使わない。

受け入れ条件:
`*.diff`、空ディレクトリ、未使用 `sound/` が source archive に入らない。

確認:
保留。音声チーム関連 file は `apps/web/src/audio`、`apps/web/public/sound`、`docs/06_音声管理.md`、`docs/sound-inventory.md` に限定して維持する。

# MGN-CLN-003 未参照 source wrapper を削除する

状態: done

何が問題か:
次の 4 ファイルが `main.tsx` 起点の参照グラフから未到達だった。

```text
apps/web/src/components/ScreenShell.tsx
apps/web/src/render/battle/backgrounds/broadcast-facility.ts
apps/web/src/render/battle/backgrounds/central-tower.ts
apps/web/src/render/battle/enemies/enemy-presets.ts
```

なぜ問題か:
使われていない wrapper は責務があるように見え、KISS に反する。background wrapper 2 件は同じ再 export だけで、DRY の安定した共通化でもない。

どうしたか:
clean source から削除した。

受け入れ条件:
削除後に未到達 source が 0 件である。

確認:
source reachability: `total_files=165 reachable_from_app=165 unreachable=0`。

# MGN-CLN-004 root の検証入口を復元または統合する

状態: done

何が問題か:
提供アーカイブには root `package.json` と `tsconfig.base.json` がなく、`agent.md` が求める `npm run lint`、`npm test`、`npm run build` の入口が成立しなかった。

なぜ問題か:
各 package は `../../tsconfig.base.json` を参照しているため、root 設定がないと型検査の前提が欠ける。

どうしたか:
実リポジトリ既存の root `package.json`、`tsconfig.base.json`、`.gitignore` を維持し、clean source 側の弱い設定へ置換しなかった。root scripts で lint / test / build を実行できることを確認した。

受け入れ条件:
実リポジトリで既存 root 設定と重複しない形に統合し、依存 install 後に `npm run lint`、`npm test`、`npm run build` が実行できる。

確認:
`npm run lint`、`npm test`、`npm run build` が成功。

# MGN-CLN-005 content manifest の生成物扱いを明文化する

状態: done

何が問題か:
`packages/persistence/src/generated/content-manifest.ts` は生成ファイルだが、runtime import のため source に残っている。

なぜ問題か:
`agent.md` の generated files 禁止と、現在の content manifest 運用の例外が明文化されていない。

どうしたか:
`agent.md` と `docs/02_開発体制とディレクトリ構成.md` に、`content-manifest.ts` は runtime loader が直接 import するため commit する生成 source として扱うことを明記した。stale manifest は `npm run content:manifest:check` と `npm run content:validate` で検出する。

受け入れ条件:
`docs/02` または `docs/05` と `agent.md` のいずれかに、manifest の扱いが明記される。CI で stale manifest を検出できる。

確認:
`npm test` は `content:validate` を含み、`content:validate` は `content:manifest:check` を先に実行する。

# MGN-REF-001 `MagnoliaGameSession` を変更理由ごとに分割する

状態: done

何が問題か:
`packages/game-session/src/game-session.ts` が 2470 行で、公開 API、探索、戦闘、保存、archive、presentation、装備、fragment をまとめている。

なぜ問題か:
単一責任が崩れ、battle または explore の小変更でも session 全体を確認する必要がある。

どうしたか:
public facade として `MagnoliaGameSession` を残し、探索 frame を `packages/game-session/src/explore/step-explore.ts`、探索 scan / hint / interaction target を `packages/game-session/src/explore/explore-session-runtime.ts`、戦闘 frame を `packages/game-session/src/battle/step-battle.ts` に分けた。`game-session.ts` は 2495 行から 2189 行へ縮小し、snapshot / command public API は維持した。

受け入れ条件:
`MagnoliaGameSession` は public API と依存接続を主に担当し、探索と戦闘の frame update は独立 module でテストできる。既存 snapshot / command public API は互換を保つ。

確認:
`npm test` の session smoke test と frontend / backend test が成功。

# MGN-REF-002 `BattleStepHost` を小さい port に分ける

状態: done

何が問題か:
`BattleStepHost` は 24 項目を要求し、`stepBattleFrame` が `game-session.ts` の private method へ多く戻っている。

なぜ問題か:
インターフェース分離に反し、battle step の依存が広すぎる。テスト時にも不要な callback を多数用意する必要がある。

どうしたか:
`BattleStepHost` を `snapshot`、`profile`、`mission`、`effects`、`actors`、`pickups`、`fragments`、`player`、`difficulty`、`audio`、`ids` の小さい port に分けた。挙動は変えず、呼び出し側の依存範囲を明示した。

受け入れ条件:
`stepBattleFrame` が必要な port だけを受け取る。テスト fixture が小さくなる。battle result 保存と fragment 回収の挙動が変わらない。

# MGN-REF-003 `useMagnoliaApp` から idle autosave と presentation timer を切り出す

状態: done

何が問題か:
`useMagnoliaApp.ts` が 857 行で、app state、session sync、command action、presentation event、popup expiry、idle auto-save、audio side effect を同時に扱う。

なぜ問題か:
UI action の変更が保存や presentation timeout に波及しやすい。

どうしたか:
`useIdleAutoSave`、`usePresentationTimers`、`createMagnoliaActions`、`syncMagnoliaAppStateFromSession` を作り、`useMagnoliaApp` の公開 return shape を維持したまま hook 本体を composition root に寄せた。`use-magnolia-app.ts` は 857 行から 273 行へ縮小した。

受け入れ条件:
保存、presentation、action dispatch のテストまたは再現手順が分かれる。`useMagnoliaApp` の公開 return shape は互換を保つ。

# MGN-REF-004 key visual を battle runtime fixture から分離する

状態: done

何が問題か:
`KeyVisualModal.tsx` と `key-visual-render-state.ts` が battle renderState を利用しつつ、poster 構図と PNG export を持っている。

なぜ問題か:
key visual は実ミッションではなく、battle runtime と変更理由が異なる。

どうしたか:
`apps/web/src/render/key-visual/` を作り、poster composition / PNG export / battle canvas adapter / render state fixture を分けた。旧 `apps/web/src/render/battle/fixtures/key-visual-render-state.ts` はテスト互換用の薄い re-export だけにした。

受け入れ条件:
key visual の構図変更が battle renderer の runtime logic に触れない。PNG export は専用 module でテストまたは手動確認できる。

# MGN-REF-005 direct color literal baseline を段階的に減らす

状態: done

何が問題か:
`style-audit` は pass するが、direct color literal が 25 ファイルに 710 件残っている。

なぜ問題か:
`docs/11_design_package` の token / palette 方針に対し、色の正本が分散している。

どうしたか:
key visual の PNG export を palette helper へ寄せ、`KeyVisualModal.tsx` から direct color literal を外した。style audit baseline は 25 ファイル 710 件から 24 ファイル 686 件へ減らした。

受け入れ条件:
`style-audit` の direct color literal 数が減る。reduce flashing と low frame rate の表示が崩れない。

確認:
`npm run style:audit` が 24 ファイル 686 件で成功。

# MGN-REF-006 dead source を継続検出する audit を追加する

状態: done

何が問題か:
今回は手元の簡易 import graph で未参照 source を検出したが、既存 `source-audit` は mission ID renderer dispatch の回帰だけを見る。

なぜ問題か:
未使用 wrapper や将来用 component は再発しやすい。

どうしたか:
`tools/source-audit.mjs` へ、`apps/web/src/main.tsx` 起点の簡易 reachability check を追加した。対象は Git 管理下かつ実在する `apps/web/src` の TypeScript / TSX / CSS / JSON source とし、未到達 file があれば audit を失敗させる。

受け入れ条件:
未参照 source が増えた場合に audit が失敗する。allowlist は理由つきで最小にする。

確認:
`npm test` は `npm run source:audit` を含む。`tests/source-audit.test.mjs` は到達性 audit の成功と、未到達 probe file を置いた場合に失敗することを確認する。

# MGN-DOC-001 closed review と現在レビューの読み分けを明確にする

状態: done

何が問題か:
`docs/latest_Review/closed/09_SOLID_DRY_KISS_設計リファクタレビュー.md` は旧アーカイブ前提の履歴であり、現在の packages 込み構成とは一部ずれている。

なぜ問題か:
closed 履歴を現行指示として読むと、既に解消済みの欠落や古いコードマップを再調査することになる。

どうしたか:
`docs/latest_Review/README.md` を追加し、現在の入口を `10_clean_review_2026-04-30.md` と `10_cleanup_tickets_2026-04-30.md`、履歴の入口を `closed/` と明記した。

受け入れ条件:
新規作業者が `docs/latest_Review` を開いた時、現在使うレビューと履歴の区別が分かる。

確認:
README に `closed/09_SOLID_DRY_KISS_設計リファクタレビュー.md` は旧アーカイブ前提の履歴であることを明記した。

# MGN-CI-001 source archive 作成手順を CI または定例手順へ固定する

状態: done

何が問題か:
既存 `tools/create-source-archive.mjs` は generated/cache/metadata を除外するが、今回の zip にはそれらが混入していた。

なぜ問題か:
手動 zip だと debris が再混入する。

どうしたか:
`agent.md` と `docs/02_開発体制とディレクトリ構成.md` に、source archive は `npm run archive:source` で作成し、手動 zip を使わないことを明記した。`tests/source-archive.test.mjs` に root の `npm test` が `node --test tests/*.test.mjs` を実行する確認を追加した。

受け入れ条件:
source archive に `__MACOSX`、`.DS_Store`、`dist`、`node_modules`、`*.tsbuildinfo`、`*.diff` が入ると検査に失敗する。

確認:
`tools/create-source-archive.mjs` は作成後に zip listing を検査し、`tests/source-archive.test.mjs` は source archive の禁止 entry を確認する。
