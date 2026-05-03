# サウンド素材棚卸し v3 — 優先度降順・受け口準備版

更新日: 2026-05-01

この棚卸しは、現行 MAGNOLIA の実装で実際に呼び出せる、または今回のパッチで呼び出せるようにした音だけを正本にしたものです。前回の「あると嬉しい」大量要求は外し、現在のゲーム判断・操作判断に必要な順で並べ直しました。

音源の配置先は `apps/web/public/sound/` 配下の用途別ディレクトリです。コード側の URL は public root 基準なので、たとえば `apps/web/public/sound/barrier/barrier-hit.wav` は `/sound/barrier/barrier-hit.wav` として呼びます。以下のファイル名をそのまま置いてください。ファイルが未配置でもアプリは落ちず、該当音だけ無音で進行します。プロジェクト直下の `sound/` と、`apps/web/public/sound/mp3/` のような一時配置フォルダは音源の正本として使いません。

各音源ファイルと同じ場所に置いていた同名の `.md` ファイルは廃止しました。用途確認はこの棚卸し文書に集約します。

## 優先度の定義

P0 は、入力・戦闘・バリア・通信遮断の判断に直結する最小セットです。P1 は、画面滞在時間が長い BGM と探索/戦闘の主報酬音です。P2 は、ミッション結果・装備・通信演出の輪郭を強くする音です。P3 は、受け口だけ用意しておくが、今すぐ素材を要求しなくてよい音です。

## 優先度降順リスト

| No | 優先度 | 配置ファイル | コードURL | 用途 | 主な呼び出し/イベント | ループ |
|---:|---|---|---|---|---|---|
| 01 | P0 | `apps/web/public/sound/ui/ui-cursor.wav` | `/sound/ui/ui-cursor.wav` | メニュー上下左右、選択移動 | `ui.menu.up/down/left/right`, `useMenuNavigation` | no |
| 02 | P0 | `apps/web/public/sound/ui/ui-confirm.wav` | `/sound/ui/ui-confirm.wav` | 決定、New Game、Load Game | `ui.confirm`, `title.newGame`, `title.loadGame`, `saveWritten` | no |
| 03 | P0 | `apps/web/public/sound/ui/ui-cancel.wav` | `/sound/ui/ui-cancel.wav` | 戻る/キャンセル | `ui.cancel`, `useMenuNavigation` | no |
| 04 | P0 | `apps/web/public/sound/ui/ui-panel-open.wav` | `/sound/ui/ui-panel-open.wav` | メニュー/パネルを開く | `ui.open`, screen transition, slot open | no |
| 05 | P0 | `apps/web/public/sound/ui/ui-panel-close.wav` | `/sound/ui/ui-panel-close.wav` | メニュー/パネルを閉じる | `ui.close`, screen transition, slot close | no |
| 06 | P0 | `apps/web/public/sound/ui/ui-error.wav` | `/sound/ui/ui-error.wav` | 選択不可、失敗操作 | `ui.error` | no |
| 07 | P0 | `apps/web/public/sound/combat/player-shot.wav` | `/sound/combat/player-shot.wav` | プレイヤー射撃 | `playerMainWeaponFired` -> `combat.playerShot` | no |
| 08 | P0 | `apps/web/public/sound/combat/player-hit.wav` | `/sound/combat/player-hit.wav` | プレイヤー被弾/ノイズ悪化 | `battle.player.hit` -> `combat.playerHit` | no |
| 09 | P0 | `apps/web/public/sound/equipment/noise_camceler.wav` | `/sound/equipment/noise_camceler.wav` | ノイズキャンセラー/バリア展開 | `playerBarrierStarted` -> `barrier.up` | no |
| 10 | P0 | `apps/web/public/sound/barrier/barrier-down.wav` | `/sound/barrier/barrier-down.wav` | バリア解除/時間切れ | `playerBarrierStopped` -> `barrier.down` | no |
| 11 | P0 | `apps/web/public/sound/barrier/barrier-hit.wav` | `/sound/barrier/barrier-hit.wav` | バリアで敵弾を防いだ瞬間 | `playerBarrierHit` -> `barrier.hit` | no |
| 12 | P0 | `apps/web/public/sound/noise/radio-static-loop.wav` | `/sound/noise/radio-static-loop.wav` | 聴取不可状態の無線ノイズ | `battle.noise.peak/clear` -> `noise.radioStatic` | yes |
| 13 | P1 | `apps/web/public/sound/title/op.wav` | `/sound/title/op.wav` | タイトル OP ループ | `titleOpened` -> `bgm.title` | yes |
| 14 | P1 | `apps/web/public/sound/bgm/bgm-explore.wav` | `/sound/bgm/bgm-explore.wav` | 探索 BGM | `explorationEntered`, battle exit -> `bgm.exploration` | yes |
| 15 | P1 | `apps/web/public/sound/bgm/bgm-battle.wav` | `/sound/bgm/bgm-battle.wav` | 戦闘 BGM | `combatEntered` -> `bgm.combat`; boss BGM も当面共用 | yes |
| 16 | P1 | `apps/web/public/sound/mission/mission-in.wav` | `/sound/mission/mission-in.wav` | ミッション突入 | `missionStarted` -> `mission.in` | no |
| 17 | P1 | `apps/web/public/sound/explore/scan.wav` | `/sound/explore/scan.wav` | 探索スキャン開始 | `exploreScanStarted` -> `explore.scan` | no |
| 18 | P1 | `apps/web/public/sound/explore/explore-scan-hit.wav` | `/sound/explore/explore-scan-hit.wav` | スキャン反応あり | `exploreScanHit` -> `explore.scanHit` | no |
| 19 | P1 | `apps/web/public/sound/explore/move.wav` | `/sound/explore/move.wav` | 探索中の移動ループ | `explorationMoveStart/Stop` | yes |
| 20 | P1 | `apps/web/public/sound/explore/item-pickup.wav` | `/sound/explore/item-pickup.wav` | 通常アイテム回収 | `collectibleCollected` -> `explore.itemPickup` | no |
| 21 | P1 | `apps/web/public/sound/explore/equipment-pickup.wav` | `/sound/explore/equipment-pickup.wav` | 装備回収 | `collectibleCollected(hiddenEquipment)` -> `explore.equipmentPickup` | no |
| 22 | P1 | `apps/web/public/sound/combat/enemy-shot.mp3` | `/sound/combat/enemy-shot.mp3` | 敵射撃/敵弾発生。基準音量は小さめ | `enemyProjectileFired` -> `combat.enemyShot` | no |
| 23 | P1 | `apps/web/public/sound/combat/enemy-hit.wav` | `/sound/combat/enemy-hit.wav` | 敵へ命中 | `playerProjectileHit` -> `combat.enemyHit` | no |
| 24 | P1 | `apps/web/public/sound/combat/enemy-destroyed.wav` | `/sound/combat/enemy-destroyed.wav` | 敵撃破/小爆発 | `enemyDestroyed` -> `combat.enemyDestroyed`; `combat.explosion` も当面共用 | no |
| 25 | P2 | `apps/web/public/sound/bgm/bgm-mission.wav` | `/sound/bgm/bgm-mission.wav` | 汎用ミッション BGM | `missionEntered` -> `bgm.mission.default` | yes |
| 26 | P2 | `apps/web/public/sound/mission/mission-objective-update.wav` | `/sound/mission/mission-objective-update.wav` | 目標更新/通信通知 | `mission.objectiveUpdate`, `voice.objective` | no |
| 27 | P2 | `apps/web/public/sound/mission/mission-clear.wav` | `/sound/mission/mission-clear.wav` | ミッションクリア | `missionCleared` -> `mission.clear` | no |
| 28 | P2 | `apps/web/public/sound/mission/mission-fail.wav` | `/sound/mission/mission-fail.wav` | ミッション失敗/中断 | `mission.fail` | no |
| 29 | P2 | `apps/web/public/sound/equipment/equipment-switch.wav` | `/sound/equipment/equipment-switch.wav` | 装備切替 | `equipmentEquipped` -> `equipment.switch` | no |
| 30 | P2 | `apps/web/public/sound/equipment/equipment-use.wav` | `/sound/equipment/equipment-use.wav` | サブ装備使用の汎用音 | `playerSubWeaponUsed` -> `equipment.use` | no |
| 31 | P2 | `apps/web/public/sound/equipment/static_waves.wav` | `/sound/equipment/static_waves.wav` | ミュートチャンバー展開 | `playerSubWeaponUsed(runtimeHandlerId=sub.field.silent_wave)` -> `equipment.silentWave` | no |
| 32 | P2 | `apps/web/public/sound/voice/radio-blip.wav` | `/sound/voice/radio-blip.wav` | 無線の短いブリップ | `missionEntered` -> `voice.radioBlip` | no |
| 33 | P3 | `apps/web/public/sound/barrier/barrier-loop.wav` | `/sound/barrier/barrier-loop.wav` | バリア稼働中の薄いループ | `barrier.up/down` 間の `barrier.loop` | yes |
| 34 | P3 | `apps/web/public/sound/barrier/barrier-break.wav` | `/sound/barrier/barrier-break.wav` | 将来のバリア破壊 | `barrier.break` | no |
| 35 | P3 | `apps/web/public/sound/combat/no-ammo.wav` | `/sound/combat/no-ammo.wav` | 弾切れ/使用不可 | `combat.noAmmo` | no |

## 今回整理した追加音源

`mp3/` に置かれていたファイル名から意図を読み取り、既存の汎用イベントでは足りない箇所だけ専用イベントを追加しました。以下も配置先は用途別ディレクトリです。

| No | 配置ファイル | コードURL | 用途 | 主な呼び出し/イベント |
|---:|---|---|---|---|
| 36 | `apps/web/public/sound/title/title-new-game.wav` | `/sound/title/title-new-game.wav` | New Game のスロット確定 | `title.newGame` |
| 37 | `apps/web/public/sound/title/title-load-game.wav` | `/sound/title/title-load-game.wav` | Continue / Load Game のスロット確定 | `title.loadGame` |
| 38 | `apps/web/public/sound/system/system-save-load.wav` | `/sound/system/system-save-load.wav` | セーブ完了/ロード系コンソール操作 | `system.saveLoad`, `saveWritten` |
| 39 | `apps/web/public/sound/combat/player-hit-heavy.wav` | `/sound/combat/player-hit-heavy.wav` | プレイヤー被弾音の別音色 | `combat.playerHit.heavy` |
| 40 | `apps/web/public/sound/equipment/equipment-archive-category-select.wav` | `/sound/equipment/equipment-archive-category-select.wav` | 装備カテゴリ、メニュー内タブ切替 | `equipmentArchive.categorySelect` |
| 41 | `apps/web/public/sound/equipment/equipment-archive-detail-select.wav` | `/sound/equipment/equipment-archive-detail-select.wav` | 装備/アーカイブの詳細対象選択 | `equipmentArchive.detailSelect` |
| 42 | `apps/web/public/sound/equipment/equipment-upgrade.wav` | `/sound/equipment/equipment-upgrade.wav` | 装備強化成立 | `equipment.upgrade` |

一時名からの整理対応は次の通りです。

| 元ファイル名 | 正本ファイル名 | 判断 |
|---|---|---|
| `title_select.wav` | `ui-cursor.wav` | タイトル画面の選択移動。現状の共通メニュー移動音として使う |
| `title_decision.wav` | `ui-confirm.wav`, `ui-panel-open.wav` | 通常決定音。タイトルでスロット選択を開く音も UI 系統として同じ音色を使う |
| `title_cancel.wav` | `ui-cancel.wav`, `ui-panel-close.wav` | 戻る操作とパネルを閉じる操作に共用 |
| `newgame.wav` | `title-new-game.wav` | New Game 確定専用 |
| `continue_game.wav` | `title-load-game.wav` | Continue / Load Game 確定専用 |
| `console_and_save_and_load.wav` | `system-save-load.wav` | セーブ完了/ロード系コンソール操作に限定する |
| `damaged_1.wav` | `player-hit.wav` | 被弾音の基本音 |
| `damaged_2.wav` | `player-hit-heavy.wav` | 被弾音の別音色 |
| `barrier.wav` | `noise_camceler.wav` | ノイズキャンセラーのバリア展開。現行は `equipment/` 内の専用音源を使う |
| `static_waves.wav` | `static_waves.wav` | ミュートチャンバー展開専用 |
| `equipment_archive_category_select.wav` | `equipment-archive-category-select.wav` | 装備/アーカイブの分類選択 |
| `equipment_archive_detail_select.wav` | `equipment-archive-detail-select.wav` | 装備/アーカイブの詳細選択 |
| `equipment_archive_detail_decision.wav` | `equipment-switch.wav` | 装備詳細での確定操作 |
| `equipment_archive_denied.wav` | `ui-error.wav` | 選択不可/失敗操作 |
| `equipment_upgrade.wav` | `equipment-upgrade.wav` | 装備強化成立 |

## 棚卸しから外した/後回しにした要求

以下は「欲しくなる可能性はあるが、現時点の安定トリガーや体験上の必要度が低い」ため、素材要求から外しました。コード上は `missingEvent` として残してあり、呼ばれても無音です。

| キー | 判断 | 理由 |
|---|---|---|
| `explore.step` | 後回し | `explore.move` を探索移動の連続音として使うため、足音の単発差分は床材仕様が固まってからでよい |
| `explore.doorOpen`, `explore.doorLocked` | 後回し | 現行のドア操作が素材要求するほど安定していない |
| `combat.enemyShot.fast/heavy/laser` | 集約 | まずは `enemy-shot.wav` 1本で敵弾を判断できればよい |
| `combat.reload` | 後回し | リロード/チャージ仕様がまだ音に同期する段階ではない |
| `noise.lowHp` | 不採用 | MAGNOLIA は HP ではなく聴取ノイズ設計のため、低 HP ループは設計とずれる |
| 環境 ambience、床材別足音、敵出現差分、大型/小型死亡差分 | 後回し | 現行の判断音を埋めてから拡張するべき演出強化枠 |

## コード側の受け口状態

今回のパッチで、`apps/web/src/audio/soundCatalog.ts` に上記ファイル名をすべて登録しました。各イベントの `sourceGain` が「元音源をゲーム内で何倍の基準音量として扱うか」の内部規定値です。設定画面の `MASTER VOLUME`、`BACKGROUND`、`SOUND EFFECTS`、`VOICE` はユーザー側の倍率で、`AudioHub` が `sourceGain × master × channel` として最終音量へ合成します。`AudioHub` は `optional: true` の音源を起動時 preload せず、実際にイベントが来たときだけ再生を試します。音源ファイルがまだ無い場合は一度だけ警告を出して、その asset をその実行中は無音扱いにします。アプリ処理は継続します。

既存の `shot-placeholder.wav` は、ブラウザのユーザー操作後 unlock 用として残しています。新規棚卸しの正本は `player-shot.wav` なので、ショット音を更新する場合も `shot-placeholder.wav` ではなく `player-shot.wav` を追加してください。

## 主な改修/接続箇所

- `apps/web/src/audio/soundCatalog.ts`: 42個の音、優先度、カテゴリ、内部基準倍率 `sourceGain`、ループ/連打制御を登録。
- `apps/web/src/audio/AudioHub.ts`: `sourceGain` とユーザー設定倍率を掛け合わせる。未配置 optional asset は preload せず、再生失敗時も音無しで進行する処理へ変更。
- `apps/web/src/audio/audioEvents.ts`: `enemyDestroyed` と `barrier.down` を追加し、意味ベースの入口を維持。
- `apps/web/src/app/audio-event-adapter.ts`: session/presentation のイベントを音声イベントへ変換。スキャン、敵弾、敵ヒット、敵撃破、バリアヒット、ミッションクリアを追加。
- `packages/contracts/src/session-types.ts`: 音声化に必要な DomainEvent を追加。
- `packages/game-session/src/game-session.ts`: 探索スキャン開始/ヒット、敵弾発射の DomainEvent を生成。
- `packages/game-session/src/battle/collision-system.ts`: 敵への命中、敵撃破、バリア防御成立の DomainEvent を生成。
- `packages/game-session/src/battle/step-battle.ts`: 敵イベントを battle frame result に含め、ミッションクリアイベントを生成。
- `apps/web/src/hooks/useMenuNavigation.ts`: キー/ホイール操作時にカーソル、決定、キャンセル音を呼ぶ。

## 配置後の確認手順

1. この棚卸し文書で用途を確認し、表の `配置ファイル` に記載された場所へ WAV を置く。
2. ブラウザで一度クリックまたはキー入力して audio unlock を通す。
3. P0 から順に確認する。未配置ファイルがある場合でも画面遷移・戦闘・探索は止まらない。
4. 実リポジトリ側で `npm run build` を実行して `dist` を再生成する。このアーカイブでは `dist` は更新していない。
