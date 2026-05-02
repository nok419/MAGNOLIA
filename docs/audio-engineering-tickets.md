# 音楽/SE 受け入れ作業チケット

更新日: 2026-05-01

このチケット群は、今回の音声棚卸し v3 とコード受け口パッチをエンジニアがレビュー/取り込み/検証するための作業単位です。

## AUD-00: アーカイブ単体ビルド環境の復元

目的: 受け口パッチを取り込んだあと、通常の TypeScript/Vite ビルドで検証できる状態にする。

対象: ルート `tsconfig.base.json`、依存関係、`apps/web/node_modules` またはパッケージマネージャ設定。

作業:
1. 実リポジトリのルート設定ファイルを確認し、アップロードアーカイブに欠けている `tsconfig.base.json` 相当がある場合は戻す。
2. `apps/web` の依存関係を通常手順で復元する。
3. `apps/web` で `npm run build` を実行する。
4. 生成された `dist` を配布対象にする場合は、このパッチ後のソースから再生成する。

受け入れ条件:
- `apps/web/tsconfig.json` の `extends: ../../tsconfig.base.json` が解決できる。
- `npm run build` が実リポジトリ上で完了する。
- 古い `dist/assets/*.js` をそのまま配布しない。

備考: 今回のアップロードアーカイブ単体では、ルートの `tsconfig.base.json` と通常の依存関係ディレクトリが不足していたため、こちらでは最終ビルドまでは完了していない。

## AUD-01: サウンドカタログ v3 のレビューと取り込み

目的: `docs/sound-inventory.md` の v3 を正本として、実装上のファイル名と棚卸しのファイル名を一致させる。

対象:
- `docs/sound-inventory.md`
- `apps/web/src/audio/soundCatalog.ts`

作業:
1. P0〜P3 の優先度とファイル名をプロデューサー/サウンド担当に確認する。
2. `apps/web/public/sound/` に置くファイル名が棚卸しと一致していることを確認する。
3. `SOUND_ASSETS` の URL と棚卸し表の `コードURL` が一致していることを確認する。
4. 追加要求が出ても、現行トリガーが無いものは P3 以下または「後回し」表へ戻す。

受け入れ条件:
- 棚卸し表の 41ファイルが `SOUND_ASSETS` に登録済み。
- 棚卸し表の 41ファイルの用途を `docs/sound-inventory.md` で確認できる。
- `shot-placeholder.wav` は unlock/開発確認用としてのみ扱われ、新規棚卸しの正本ではない。
- 音源担当は表のファイル名だけを見て配置できる。

## AUD-02: 未配置音源でも落ちない AudioHub 挙動の確認

目的: 素材未配置の状態でも、呼び出し済みイベントがクラッシュや画面停止を起こさないようにする。

対象:
- `apps/web/src/audio/AudioHub.ts`
- `apps/web/src/audio/soundCatalog.ts`

作業:
1. `optional: true` の asset が起動時 preload 対象外になっていることを確認する。
2. 未配置音源のイベントを発火しても、該当音だけ無音で進行することを確認する。
3. 再生失敗ログが同じイベントで大量に出ないことを確認する。
4. 表の `配置ファイル` に音源を置いてブラウザを再読み込みすると、同じイベントが鳴ることを確認する。

受け入れ条件:
- 未配置 P0 ファイルがあってもゲーム開始、探索、戦闘が継続する。
- `AudioHub` が `NotAllowedError` と素材未配置を区別して扱う。
- BGM/ループ音の停止後に asset が誤って unavailable 扱いにならない。

## AUD-03: ドメインイベントから音声イベントへの接続レビュー

目的: 入力状態だけを見て音を鳴らすのではなく、ゲームロジックが成立したタイミングで音を鳴らす。

対象:
- `packages/contracts/src/session-types.ts`
- `packages/game-session/src/game-session.ts`
- `packages/game-session/src/battle/step-battle.ts`
- `packages/game-session/src/battle/collision-system.ts`
- `apps/web/src/app/audio-event-adapter.ts`

作業:
1. 追加 DomainEvent を型として確認する: `exploreScanStarted`, `exploreScanHit`, `missionCleared`, `playerProjectileHit`, `enemyProjectileFired`, `playerBarrierHit`。
2. 探索スキャンは cooldown が通ったときだけ `exploreScanStarted` を返すことを確認する。
3. スキャンで transmission/collectible が新規識別されたときだけ `exploreScanHit` を返すことを確認する。
4. 敵弾は `fireEnemyPatterns` の結果として projectile が増えたときだけ `enemyProjectileFired` を返すことを確認する。
5. バリア防御成立時は防いだ弾数に応じて `playerBarrierHit.hitCount` を返すことを確認する。
6. `audio-event-adapter.ts` が各 DomainEvent を `audioEvents.*` へ変換することを確認する。

受け入れ条件:
- cooldown 中の空撃ち/不成立操作では射撃音やスキャン音が鳴らない。
- 敵弾/敵ヒット/敵撃破/バリアヒットが session result 経由で鳴る。
- PresentationRequest の `battle.player.hit`, `battle.noise.peak`, `battle.noise.clear` は従来通り音声へ変換される。

## AUD-04: UI 操作音の接続レビュー

目的: タイトル/共通メニューの主要キー操作で、カーソル/決定/キャンセル音が鳴るようにする。

対象:
- `apps/web/src/hooks/useMenuNavigation.ts`
- `apps/web/src/app/use-magnolia-app.ts`
- `apps/web/src/app/audio-event-adapter.ts`

作業:
1. `useMenuNavigation` の Arrow/WASD/ホイール移動で `ui-cursor.wav` が鳴ることを確認する。
2. Enter/Z で `ui-confirm.wav`、Escape/X で `ui-cancel.wav` が鳴ることを確認する。
3. New Game/Load Game は意味イベントとして `title.newGame`/`title.loadGame` も通るため、二重に強く鳴りすぎる場合は音量または cooldown を調整する。
4. 設定画面や装備画面など、共通 hook 外のクリック操作に UI 音を足す必要があるかを追加レビューする。

受け入れ条件:
- 少なくともタイトルメニューのキーボード/ホイール操作で P0 UI 音が確認できる。
- クリック操作の未接続箇所が残る場合、別チケットとして列挙されている。

## AUD-05: P0 音源配置と QA

目的: 最小体験に必要な P0 音源を配置し、素材なし/素材ありの両方で確認する。

対象ファイル:
- `ui/ui-cursor.wav`
- `ui/ui-confirm.wav`
- `ui/ui-cancel.wav`
- `ui/ui-panel-open.wav`
- `ui/ui-panel-close.wav`
- `ui/ui-error.wav`
- `combat/player-shot.wav`
- `combat/player-hit.wav`
- `equipment/noise_camceler.wav`
- `barrier/barrier-down.wav`
- `barrier/barrier-hit.wav`
- `noise/radio-static-loop.wav`

作業:
1. `docs/sound-inventory.md` で用途を確認し、P0 音源ファイルを表の `配置ファイル` に記載された場所へ配置する。
2. タイトル操作、探索、戦闘射撃、被弾、バリア展開/解除/防御、通信ノイズ状態を確認する。
3. `master`, `bgm`, `se`, `voice` の設定変更が音量に反映されることを確認する。
4. P0 のうち任意の1ファイルを一時的に外し、無音進行になることを確認する。

受け入れ条件:
- P0 の音がすべて該当タイミングで鳴る。
- 音源未配置ケースでアプリが止まらない。
- 音量設定変更後、長いループ/BGMにも音量が反映される。

## AUD-06: P1/P2 音源配置計画

目的: P0 完了後に、BGM・探索報酬・敵フィードバック・ミッション結果を順に追加する。

対象: `docs/sound-inventory.md` の No.13〜31。

作業:
1. P1 を先に配置する: タイトル/探索/戦闘 BGM、ミッション突入、スキャン、回収、敵射撃/命中/撃破。
2. 次に P2 を配置する: 汎用ミッション BGM、目標更新、クリア/失敗、装備切替/使用、ミュートチャンバー、無線ブリップ。
3. BGM は loop 前提で頭/尻の無音やクリックノイズがないか確認する。
4. 敵弾/敵ヒット系は連打時に濁らない音量・長さに調整する。

受け入れ条件:
- P1/P2 のファイルを置くだけで、コード変更なしに該当イベントが鳴る。
- BGM が画面遷移でフェードし、不要なループが残らない。
- 敵弾や敵ヒットは cooldown/polyphony の設定内で破綻しない。

## AUD-07: 後回し要求の管理

目的: 多すぎる素材要求を再発させないよう、現行トリガーがない音を棚卸しに戻さない運用を決める。

対象:
- `docs/sound-inventory.md` の「棚卸しから外した/後回しにした要求」
- `apps/web/src/audio/soundCatalog.ts` の `missingEvent`

作業:
1. 足音、ドア、敵弾差分、reload、low HP、ambience、敵死亡差分などを当面の素材依頼から外す。
2. 新機能が入った場合だけ、トリガー・ファイル名・優先度を再審査して追加する。
3. `missingEvent` は呼ばれても無音なので、演出側が先行して関数を呼んでも安全な状態を維持する。

受け入れ条件:
- サウンド担当へ依頼するリストは v3 の優先度表に限定される。
- 追加要求には必ず「現在のトリガー」「配置ファイル名」「優先度」を付ける。

## AUD-08: 最終リリース前の回帰確認

目的: 音源追加後にゲームロジック・UI・ブラウザ autoplay 制限の回帰を確認する。

対象: Web app 全体。

作業:
1. 初回ロード直後、ユーザー操作前に BGM が pending になり、クリック/キー入力後に再生されることを確認する。
2. mute/master 0 のときに不要な音が鳴らないことを確認する。
3. 画面遷移、戦闘開始/終了、ミッション開始/クリアで BGM が重複しないことを確認する。
4. P0〜P2 の音源をすべて置いた状態で `npm run build` と手動プレイ確認を行う。

受け入れ条件:
- ブラウザ console に同一音源の大量警告が出ない。
- ループ音が止めるべき状態で残らない。
- リリース artifact の `dist/sound/` または公開ディレクトリに必要な音源が含まれる。
