# サウンド素材棚卸し v3 — 優先度降順・受け口準備版

更新日: 2026-04-30

この棚卸しは、現行 MAGNOLIA の実装で実際に呼び出せる、または今回のパッチで呼び出せるようにした音だけを正本にしたものです。前回の「あると嬉しい」大量要求は外し、現在のゲーム判断・操作判断に必要な順で並べ直しました。

音源の配置先は `apps/web/public/sound/` です。コード側の URL は public root 基準なので、たとえば `apps/web/public/sound/barrier-hit.mp3` は `/sound/barrier-hit.mp3` として呼びます。以下のファイル名をそのまま置いてください。ファイルが未配置でもアプリは落ちず、該当音だけ無音で進行します。

## 優先度の定義

P0 は、入力・戦闘・バリア・通信遮断の判断に直結する最小セットです。P1 は、画面滞在時間が長い BGM と探索/戦闘の主報酬音です。P2 は、ミッション結果・装備・通信演出の輪郭を強くする音です。P3 は、受け口だけ用意しておくが、今すぐ素材を要求しなくてよい音です。

## 優先度降順リスト

| No | 優先度 | 配置ファイル | コードURL | 用途 | 主な呼び出し/イベント | ループ |
|---:|---|---|---|---|---|---|
| 01 | P0 | `apps/web/public/sound/ui-cursor.mp3` | `/sound/ui-cursor.mp3` | メニュー上下左右、選択移動 | `ui.menu.up/down/left/right`, `useMenuNavigation` | no |
| 02 | P0 | `apps/web/public/sound/ui-confirm.mp3` | `/sound/ui-confirm.mp3` | 決定、New Game、Load Game | `ui.confirm`, `title.newGame`, `title.loadGame`, `saveWritten` | no |
| 03 | P0 | `apps/web/public/sound/ui-cancel.mp3` | `/sound/ui-cancel.mp3` | 戻る/キャンセル | `ui.cancel`, `useMenuNavigation` | no |
| 04 | P0 | `apps/web/public/sound/ui-panel-open.mp3` | `/sound/ui-panel-open.mp3` | メニュー/パネルを開く | `ui.open`, screen transition, slot open | no |
| 05 | P0 | `apps/web/public/sound/ui-panel-close.mp3` | `/sound/ui-panel-close.mp3` | メニュー/パネルを閉じる | `ui.close`, screen transition, slot close | no |
| 06 | P0 | `apps/web/public/sound/ui-error.mp3` | `/sound/ui-error.mp3` | 選択不可、失敗操作 | `ui.error` | no |
| 07 | P0 | `apps/web/public/sound/player-shot.mp3` | `/sound/player-shot.mp3` | プレイヤー射撃 | `playerMainWeaponFired` -> `combat.playerShot` | no |
| 08 | P0 | `apps/web/public/sound/player-hit.mp3` | `/sound/player-hit.mp3` | プレイヤー被弾/ノイズ悪化 | `battle.player.hit` -> `combat.playerHit` | no |
| 09 | P0 | `apps/web/public/sound/barrier-up.mp3` | `/sound/barrier-up.mp3` | バリア展開 | `playerBarrierStarted` -> `barrier.up` | no |
| 10 | P0 | `apps/web/public/sound/barrier-down.mp3` | `/sound/barrier-down.mp3` | バリア解除/時間切れ | `playerBarrierStopped` -> `barrier.down` | no |
| 11 | P0 | `apps/web/public/sound/barrier-hit.mp3` | `/sound/barrier-hit.mp3` | バリアで敵弾を防いだ瞬間 | `playerBarrierHit` -> `barrier.hit` | no |
| 12 | P0 | `apps/web/public/sound/radio-static-loop.mp3` | `/sound/radio-static-loop.mp3` | 聴取不可状態の無線ノイズ | `battle.noise.peak/clear` -> `noise.radioStatic` | yes |
| 13 | P1 | `apps/web/public/sound/bgm-title.mp3` | `/sound/bgm-title.mp3` | タイトル BGM | `titleOpened` -> `bgm.title` | yes |
| 14 | P1 | `apps/web/public/sound/bgm-explore.mp3` | `/sound/bgm-explore.mp3` | 探索 BGM | `explorationEntered`, battle exit -> `bgm.exploration` | yes |
| 15 | P1 | `apps/web/public/sound/bgm-battle.mp3` | `/sound/bgm-battle.mp3` | 戦闘 BGM | `combatEntered` -> `bgm.combat`; boss BGM も当面共用 | yes |
| 16 | P1 | `apps/web/public/sound/mission-in.mp3` | `/sound/mission-in.mp3` | ミッション突入 | `missionStarted` -> `mission.in` | no |
| 17 | P1 | `apps/web/public/sound/explore-scan.mp3` | `/sound/explore-scan.mp3` | 探索スキャン開始 | `exploreScanStarted` -> `explore.scan` | no |
| 18 | P1 | `apps/web/public/sound/explore-scan-hit.mp3` | `/sound/explore-scan-hit.mp3` | スキャン反応あり | `exploreScanHit` -> `explore.scanHit` | no |
| 19 | P1 | `apps/web/public/sound/item-pickup.mp3` | `/sound/item-pickup.mp3` | 通常アイテム回収 | `collectibleCollected` -> `explore.itemPickup` | no |
| 20 | P1 | `apps/web/public/sound/equipment-pickup.mp3` | `/sound/equipment-pickup.mp3` | 装備回収 | `collectibleCollected(hiddenEquipment)` -> `explore.equipmentPickup` | no |
| 21 | P1 | `apps/web/public/sound/enemy-shot.mp3` | `/sound/enemy-shot.mp3` | 敵射撃/敵弾発生 | `enemyProjectileFired` -> `combat.enemyShot` | no |
| 22 | P1 | `apps/web/public/sound/enemy-hit.mp3` | `/sound/enemy-hit.mp3` | 敵へ命中 | `playerProjectileHit` -> `combat.enemyHit` | no |
| 23 | P1 | `apps/web/public/sound/enemy-destroyed.mp3` | `/sound/enemy-destroyed.mp3` | 敵撃破/小爆発 | `enemyDestroyed` -> `combat.enemyDestroyed`; `combat.explosion` も当面共用 | no |
| 24 | P2 | `apps/web/public/sound/bgm-mission.mp3` | `/sound/bgm-mission.mp3` | 汎用ミッション BGM | `missionEntered` -> `bgm.mission.default` | yes |
| 25 | P2 | `apps/web/public/sound/mission-objective-update.mp3` | `/sound/mission-objective-update.mp3` | 目標更新/通信通知 | `mission.objectiveUpdate`, `voice.objective` | no |
| 26 | P2 | `apps/web/public/sound/mission-clear.mp3` | `/sound/mission-clear.mp3` | ミッションクリア | `missionCleared` -> `mission.clear` | no |
| 27 | P2 | `apps/web/public/sound/mission-fail.mp3` | `/sound/mission-fail.mp3` | ミッション失敗/中断 | `mission.fail` | no |
| 28 | P2 | `apps/web/public/sound/equipment-switch.mp3` | `/sound/equipment-switch.mp3` | 装備切替 | `equipmentEquipped` -> `equipment.switch` | no |
| 29 | P2 | `apps/web/public/sound/equipment-use.mp3` | `/sound/equipment-use.mp3` | サブ装備使用 | `playerSubWeaponUsed` -> `equipment.use` | no |
| 30 | P2 | `apps/web/public/sound/radio-blip.mp3` | `/sound/radio-blip.mp3` | 無線の短いブリップ | `missionEntered` -> `voice.radioBlip` | no |
| 31 | P3 | `apps/web/public/sound/barrier-loop.mp3` | `/sound/barrier-loop.mp3` | バリア稼働中の薄いループ | `barrier.up/down` 間の `barrier.loop` | yes |
| 32 | P3 | `apps/web/public/sound/barrier-break.mp3` | `/sound/barrier-break.mp3` | 将来のバリア破壊 | `barrier.break` | no |
| 33 | P3 | `apps/web/public/sound/no-ammo.mp3` | `/sound/no-ammo.mp3` | 弾切れ/使用不可 | `combat.noAmmo` | no |

## 棚卸しから外した/後回しにした要求

以下は「欲しくなる可能性はあるが、現時点の安定トリガーや体験上の必要度が低い」ため、素材要求から外しました。コード上は `missingEvent` として残してあり、呼ばれても無音です。

| キー | 判断 | 理由 |
|---|---|---|
| `explore.step` | 後回し | 足音は高頻度で疲れやすく、移動方式/床材が固まってからで十分 |
| `explore.doorOpen`, `explore.doorLocked` | 後回し | 現行のドア操作が素材要求するほど安定していない |
| `combat.enemyShot.fast/heavy/laser` | 集約 | まずは `enemy-shot.mp3` 1本で敵弾を判断できればよい |
| `combat.reload` | 後回し | リロード/チャージ仕様がまだ音に同期する段階ではない |
| `noise.lowHp` | 不採用 | MAGNOLIA は HP ではなく聴取ノイズ設計のため、低 HP ループは設計とずれる |
| 環境 ambience、床材別足音、敵出現差分、大型/小型死亡差分 | 後回し | 現行の判断音を埋めてから拡張するべき演出強化枠 |

## コード側の受け口状態

今回のパッチで、`apps/web/src/audio/soundCatalog.ts` に上記ファイル名をすべて登録しました。`AudioHub` は `optional: true` の音源を起動時 preload せず、実際にイベントが来たときだけ再生を試します。MP3 がまだ無い場合は一度だけ警告を出して、その asset をその実行中は無音扱いにします。アプリ処理は継続します。

既存の `shot-placeholder.mp3` は、ブラウザのユーザー操作後 unlock 用として残しています。新規棚卸しの正本は `player-shot.mp3` なので、ショット音を更新する場合も `shot-placeholder.mp3` ではなく `player-shot.mp3` を追加してください。

## 主な改修/接続箇所

- `apps/web/src/audio/soundCatalog.ts`: 33個の正本ファイル名、優先度、カテゴリ、音量、ループ/連打制御を登録。
- `apps/web/src/audio/AudioHub.ts`: 未配置 optional asset を preload せず、再生失敗時も音無しで進行する処理へ変更。
- `apps/web/src/audio/audioEvents.ts`: `enemyDestroyed` と `barrier.down` を追加し、意味ベースの入口を維持。
- `apps/web/src/app/audio-event-adapter.ts`: session/presentation のイベントを音声イベントへ変換。スキャン、敵弾、敵ヒット、敵撃破、バリアヒット、ミッションクリアを追加。
- `packages/contracts/src/session-types.ts`: 音声化に必要な DomainEvent を追加。
- `packages/game-session/src/game-session.ts`: 探索スキャン開始/ヒット、敵弾発射の DomainEvent を生成。
- `packages/game-session/src/battle/collision-system.ts`: 敵への命中、敵撃破、バリア防御成立の DomainEvent を生成。
- `packages/game-session/src/battle/step-battle.ts`: 敵イベントを battle frame result に含め、ミッションクリアイベントを生成。
- `apps/web/src/hooks/useMenuNavigation.ts`: キー/ホイール操作時にカーソル、決定、キャンセル音を呼ぶ。

## 配置後の確認手順

1. MP3 を `apps/web/public/sound/` に置く。
2. ブラウザで一度クリックまたはキー入力して audio unlock を通す。
3. P0 から順に確認する。未配置ファイルがある場合でも画面遷移・戦闘・探索は止まらない。
4. 実リポジトリ側で `npm run build` を実行して `dist` を再生成する。このアーカイブでは `dist` は更新していない。
