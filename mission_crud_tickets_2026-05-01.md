# ミッション制作 CRUD 安定化レビュー 2026-05-01

このメモは、敵を「ノイズ源」、敵弾を「ノイズ」として扱うミッション制作を前提に、現状の差分で直した範囲と、別 Issue として扱うべき大きい作業を分けたものです。

# この差分で直した範囲

- `mission.playerSpawnId` を戦闘開始位置に反映するようにした。これまでは content の値を持っていても、常に画面下中央から開始していた。
- 不明な spawnPointId が画面上中央へ黙って置き換わらないようにした。validator と runtime の両方で検出する。
- enemy spawn の `seed` を射撃パターンの位相に反映するようにした。波や entry を追加しても、seed が維持される限り同じノイズ源の弾幕位相が変わりにくくなる。
- bullet pattern の `params.visualOnly: true` または `params.nonColliding: true` を、敵弾にも反映するようにした。視覚演出用のノイズは、自機、バリア、弾消しに干渉しない。
- mission と transmission の相互参照、mission beat の transcript chunk / enemy / hazard 参照を validator と runtime loader で検査するようにした。
- transcript chunk の表示順が `transcriptChunkIds` の編集で崩れにくいように、表示用 transcript は `startMs` 順に並べる。
- 字幕とアーカイブ本文に長い文字列が入っても横にはみ出しにくい CSS を追加した。
- アーカイブ本文のマスク処理で、絵文字や結合文字を壊しにくい grapheme 単位の分割を使うようにした。

# Ticket 1: spawn point を content 化する

## 背景

現状の spawn point は `spawn_top_left` などの固定 ID をコード内で解決している。今回の差分では、許可 ID を contracts に寄せ、未知 ID の黙認を止めた。しかし、敵配置を AIDD で詰めるには、座標、出現領域、画面外余白、左右対称配置、演出専用の進入位置を JSON で扱える必要がある。

## 実装内容

- `content/gameplay/battle-spawn-points/*.json` を追加する。
- 各 spawn point は次を持つ。
  - `spawnPointId`
  - `side`: `player` / `noiseSource` / `shared`
  - `xRatio`, `yRatio`
  - `offsetX`, `offsetY`
  - `authoringLabel`
  - `intendedUse`: 例 `mission03.radial_intro`, `visual_only_lane`
- `MissionMaster.playerSpawnId` と `EnemySpawn.spawnPointId` は、この content を参照する。
- `loadContentBundle` と `content-validator` は次を検査する。
  - 参照先が存在する。
  - player spawn は `side=player` または `shared` のみ。
  - enemy spawn は `side=noiseSource` または `shared` のみ。
  - 画面外 spawn は許可された余白内に収まる。
- `resolveSpawnPoint` は hardcoded switch ではなく、bundle 内の spawn point を受け取って座標へ変換する。

## 受け入れ条件

- 新しい spawn point JSON を追加するだけで、敵配置を増やせる。
- 未定義 ID、player/enemy の取り違え、極端な画面外座標は validator で止まる。
- 既存 mission 3 本は、旧 ID から新 JSON へ移行して同じ位置で動く。

# Ticket 2: wave / entry に安定 ID を追加する

## 背景

現状の wave は配列 index で spawned 状態を管理している。ミッション中に content を差し替える運用はないため通常プレイでは問題になりにくいが、AIDD で wave の追加、削除、並べ替えを繰り返すと、保存済みの調整メモやリプレイ比較がしにくい。

## 実装内容

- `EnemyWave` に `waveId` を追加する。
- `EnemySpawn` に `spawnId` を追加する。
- `InternalBattleState.spawnedWaveIndexes` を `spawnedWaveIds` に移行する。
- 旧 content の互換として、`waveId` が無い場合は `missionId:atMs:index` を loader で補う。ただし validator は新規 content では `waveId` 必須にする。
- `patternSeed` は `spawnId` を優先し、`seed` は数値揺らぎ用として残す。

## 受け入れ条件

- wave の順番を入れ替えても、同じ `waveId` の出現済み判定と調整ログが保たれる。
- validator が重複 `waveId` / `spawnId` を検出する。
- mission03 の seed と出現タイミングは移行前後で一致する。

# Ticket 3: movement route を content 化する

## 背景

現在の動きは `straightDown`、`zigzag`、`slowDescent` と `overrides` で表現している。短期的には十分だが、ノイズ源らしい漂い、通信本文に同期した停止、視覚演出専用の横切りを作るには、動きの指定が不足する。

## 実装内容

- `content/gameplay/movement-patterns/*.json` を追加する。
- movement は次のどれかを持つ。
  - `linear`
  - `sineDrift`
  - `pauseThenDrift`
  - `bezierRoute`
  - `holdAndFade`
- `EnemyArchetype.behaviorKind` は互換用として残し、最終的に `movementPatternId` 参照へ移行する。
- `EnemySpawn.overrides` は、許可キーだけを上書きできるようにする。
- validator は route の各点、速度、滞在時間、画面外終了を検査する。

## 受け入れ条件

- mission JSON だけで、同じ敵を別 route に乗せられる。
- route の結果が画面内に長時間居座りすぎる場合、validator が警告する。
- route を変えても enemy hp、bullet pattern、visual preset は独立して保たれる。

# Ticket 4: 弾幕安全性と演出専用ノイズの検査を追加する

## 背景

今回の差分で `visualOnly` / `nonColliding` の敵弾は作れるようになった。ただし、画面上の安全地帯、密度、当たり得るノイズと演出ノイズの比率はまだ検査されていない。

## 実装内容

- validator に bullet pattern の簡易シミュレーションを追加する。
- 検査する項目は次とする。
  - 自機初期位置へ即時命中するノイズがない。
  - `visualOnly` の弾が damage / noiseDamage を持っていても runtime では 0 扱いになる。
  - 当たり得る弾の密度が、mission dangerLevel の上限を大きく超えない。
  - 演出専用ノイズが画面内に残り続けて描画負荷を増やさない。
- `BulletPattern.params` に authoring 用の標準キーを定義する。
  - `visualOnly`
  - `nonColliding`
  - `safeLaneHint`
  - `baseAngleDeg`
  - `rotationDegPerSec`
  - `phaseOffsetDeg`
  - `oscillationDeg`
  - `oscillationMs`

## 受け入れ条件

- mission03 の現行パターンは検査を通る。
- `visualOnly: true` の弾を画面横断演出に追加しても、自機への命中、バリア反応、弾消し反応が発生しない。
- validator の出力で、危険な弾と演出用ノイズの数を分けて確認できる。

## 実装結果

- `tools/content-validator/src/bullet-pattern-rules.ts` で bullet pattern の authoring key、危険弾数、演出専用ノイズ数、damage 抑制数、dangerLevel に対する最大同時危険弾数を検査する。
- `packages/contracts/src/content-kinds.ts` で `BulletPattern.params` の標準キーを定義した。既存 content 用に `aimAtPlayer` と `spreadDeg` も互換キーとして残す。
- `packages/game-session/src/battle-effects.ts` と `packages/game-session/src/game-session.ts` で `nonColliding` 敵弾をバリア、弾消し、磁気災害の弾消去対象から外した。
- `tests/content-validator.test.mjs` と `tests/backend-phase2.test.mjs` で、密度超過、即時命中、演出弾の count 出力、runtime の非干渉を確認する。

# Ticket 5: 通信音声と本文の同期再生

## 背景

`TransmissionMaster.audioAssetId` は型に存在するが、現在の web audio 経路では使われていない。字幕は `battle.audioPlaybackMs` という仮想時計で進むため、音声ファイルを追加しても、そのままでは再生・停止・再開・字幕同期は保証されない。

## 実装内容

- `BattleRenderState` または別の audio sync state に次を追加する。
  - `transmissionId`
  - `audioAssetId`
  - `audioPlaybackMs`
  - `audioStartDelayMs`
  - `phase`
  - `isPaused`
- web audio 側に transmission voice 専用の再生器を追加する。
- battle の仮想時計と実音声の差が一定以上になったら、音声位置を補正する。
- pause、result 表示、mission 中断、再挑戦で音声を停止する。
- 音量設定に `voice` を追加するか、既存の master/sfx/bgm との扱いを決める。
- validator は `audioAssetId` がある場合、chunk の最大 `endMs` と音声尺の差を検査する。音声尺取得が難しい場合は、手入力の `audioDurationMs` を content に追加する。

## 受け入れ条件

- 音声あり通信で、字幕 chunk の開始時刻と音声再生位置が一致する。
- pause / resume 後も同期が戻る。
- 音声なし通信は、現在と同じ仮想時計で動く。
- `audioAssetId` が未解決の場合、validator または起動時 loader が明示的に失敗する。

## 実装結果

- `BattleRenderState.transmissionAudio` に `transmissionId`、`audioAssetId`、`audioPlaybackMs`、`audioStartDelayMs`、`phase`、`isPaused` を追加した。
- `AudioHub.syncTransmissionVoice()` を追加し、`audioPlaybackMs` と実音声の差が 160 ms を超えた時だけ seek する。pause 中は一時停止し、result、battle 離脱、音声なし通信では停止する。
- `SettingsRow.volumes.voice` は既存設定を使用する。通信音声は `voice` channel の gain を使う。
- `TransmissionMaster.audioDurationMs` を追加した。validator と loader は `audioAssetId` がある通信で `audioDurationMs` を必須にし、未登録 asset id と本文より短い音声尺を失敗にする。
- `tests/backend-phase2.test.mjs` と `tests/frontend-phase0.test.mjs` で renderState 公開面、web audio 同期経路、pause 時の停止指示を確認する。

# Ticket 6: transcript chunk の編集と保存データ移行

## 背景

保存データの復元範囲は `chunkId` と ratio で持っている。そのため本文の文字列変更には比較的強いが、chunk の分割、統合、ID 変更、時刻変更では、既存セーブの復元範囲が別の文字位置へ移る可能性がある。

## 実装内容

- transcript chunk に `previousChunkIds` または migration map を追加する。
- content 更新時に、旧 `chunkId` の復元範囲を新 `chunkId` へ移す migration tool を作る。
- validator は次を検査する。
  - `transmission.transcriptChunkIds` と chunk file の時刻順が一致する。
  - chunk の `startMs` / `endMs` が重ならない。
  - mission の `durationMs` が `audioStartDelayMs + maxChunkEndMs + outroMs` を含む。
  - mission beat の transcript chunk が同じ transmission に属する。

## 受け入れ条件

- chunk ID を変更する場合、移行 map が無いと validator が止める。
- 本文の長さだけを変えた場合、既存の復元割合は同じ chunk 内で維持される。
- chunk を分割した場合、旧復元範囲が新 chunk へ分配される。

# Ticket 7: ミッション CRUD UI / AIDD 用 authoring harness

## 背景

現状の content は JSON と manifest の静的読み込みであり、ゲーム内または web 上の CRUD editor はない。AIDD でミッションを作るには、編集、検査、試走、差分確認を同じ手順で回せる authoring harness が必要になる。

## 実装内容

- `tools/mission-authoring` を追加する。
- 機能は次の順で作る。
  - mission / transmission / chunks / enemies / bullet patterns の一覧表示。
  - wave / enemy spawn / hazard / beat の追加、更新、削除。
  - content manifest 再生成。
  - content-validator 実行。
  - mission 単体の deterministic preview 起動。
- JSON を直接編集した場合も、同じ validator と manifest check を通す。
- mission03 は回帰確認用に、現在の配置とタイミングを保存した preview fixture を持つ。

## 受け入れ条件

- mission の wave を 1 つ追加し、validator を通し、web preview で確認できる。
- transcript 本文を長くしても、字幕と archive が横にはみ出さない。
- content file を削除した場合、参照切れが validator で検出される。
- CRUD 操作後の差分が JSON と manifest に限定される。
