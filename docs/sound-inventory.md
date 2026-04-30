# サウンド素材棚卸し v2

この棚卸しは、音声を少しずつ足していけるように、初期仮置き対象と未収集のまま安全に呼べる対象を分けたものです。

前提方針は、各画面や操作が直接 `new Audio()` を呼ばないことです。ゲームロジック側は `audioEvents.playerShot()`、`audioEvents.menuMove('down')`、`audioEvents.barrierHit()` のような意味ベースの関数だけを呼び、実際の音源、音量、連打制御、同時発音数、ループ可否は `apps/web/src/audio/soundCatalog.ts` と `AudioHub` が管理します。

## 重要な変更点

前回案のように全イベントへ `apps/web/public/sound/shot-placeholder.mp3` を仮接続すると、BGM、ノイズ、バリアループ、敵弾、探索音まで同じショット音で鳴る危険があります。特に BGM やループ系へ仮ショット音を入れると、一度再生されたあと長く残りやすく、後で差し替え忘れたときの体験劣化が大きくなります。

v2 では、初期に鳴らしてよいものだけを `status: 'placeholder'` とし、それ以外は `status: 'missing'` の無音イベントとして登録します。未収集イベントは呼んでもクラッシュせず、開発コンソールに一度だけ警告を出して何も鳴らしません。これにより、コード側の呼び出しは先に仕込めますが、未収集音がショット音で代用され続けることはありません。

## P0A: まず shot-placeholder.mp3 で仮鳴らししてよい基本音

| キー | 場面 | トリガー | チャンネル | 仮接続 | 理由 |
|---|---|---|---|---|---|
| `ui.menu.up` | メニュー | カーソル上移動 | UI | 可 | 操作反応の確認に必要 |
| `ui.menu.down` | メニュー | カーソル下移動 | UI | 可 | 操作反応の確認に必要 |
| `ui.menu.left` | メニュー | 音量/選択肢左 | UI | 可 | 音量調整UIの確認に必要 |
| `ui.menu.right` | メニュー | 音量/選択肢右 | UI | 可 | 音量調整UIの確認に必要 |
| `ui.confirm` | メニュー | 決定 | UI | 可 | 基本UXの中心 |
| `ui.cancel` | メニュー | 戻る | UI | 可 | 基本UXの中心 |
| `ui.open` | UI | パネルを開く | UI | 可 | UI開閉確認用 |
| `ui.close` | UI | パネルを閉じる | UI | 可 | UI開閉確認用 |
| `ui.error` | UI | 選択不可/失敗操作 | UI | 可 | 操作受理/不受理の確認に必要 |
| `title.newGame` | タイトル | New Game 決定 | UI | 可 | タイトル遷移の確認に必要 |
| `combat.playerShot` | 戦闘 | プレイヤー射撃 | SFX | 可 | 用意済みショット音の本命 |
| `combat.playerHit` | 戦闘 | プレイヤー被弾 | SFX | 可 | 被弾フィードバックの初期確認 |
| `barrier.up` | バリア | 展開 | SFX | 可 | バリア操作の初期確認 |
| `barrier.hit` | バリア | バリア被弾 | SFX | 可 | バリア防御の初期確認 |
| `barrier.break` | バリア | バリア破壊 | SFX | 可 | 危機イベントの初期確認 |

P0A は「音が出る、音量が変えられる、中央ハブ経由で鳴る」を確認するための最小セットです。ここにないものは、関数を呼んでも無音のままにします。

## P0B: 早めに専用素材を入れたい基本UX

| キー | 場面 | トリガー | チャンネル | 仮ショット流用 | 素材メモ |
|---|---|---|---|---|---|
| `bgm.title` | タイトル | タイトル表示 | BGM | 不可 | 短いループ。ショット音の流用禁止 |
| `bgm.exploration` | 探索 | 探索開始/戦闘終了 | BGM | 不可 | 長時間聴くため低密度 |
| `bgm.combat` | 戦闘 | 戦闘開始 | BGM | 不可 | SE帯域を空ける |
| `mission.in` | ミッション | ミッション突入 | SFX | 不可 | 場面切替の短い強調音 |
| `mission.objectiveUpdate` | ミッション | 目標更新 | SFX/Voice | 不可 | 通知音または短い無線音 |
| `explore.step` | 2D探索 | 1マス移動/歩行 | SFX | 不可 | 小さく、連続して疲れない |
| `explore.scan` | 2D探索 | スキャン開始 | SFX | 不可 | 起動感のある短音 |
| `explore.scanHit` | 2D探索 | スキャン反応あり | SFX | 不可 | 報酬感のある通知音 |
| `explore.itemPickup` | 探索 | アイテム回収 | SFX | 不可 | 軽い報酬音 |
| `explore.equipmentPickup` | 探索 | 装備回収 | SFX | 不可 | アイテムより特別感 |
| `combat.enemyShot` | 戦闘 | 敵射撃/敵弾発生 | SFX | 不可 | プレイヤー射撃と聞き分ける |
| `combat.enemyHit` | 戦闘 | 敵へ命中 | SFX | 不可 | 短く、連続して濁らない |
| `combat.noAmmo` | 戦闘 | 弾切れ | SFX/UI | 不可 | 空撃ち/警告。短く不快すぎない |

P0B はゲーム体験として早く欲しいものですが、ショット音を流用すると誤学習が起きやすい領域です。特に BGM、足音、探索通知音、敵弾は最初からショット音にしないほうが安全です。

## P1: 精細化フェーズ

| キー | 場面 | トリガー | チャンネル | 素材メモ |
|---|---|---|---|---|
| `bgm.mission.default` | ミッション | 汎用ミッションBGM | BGM | ミッション中の基本曲 |
| `bgm.mission.boss` | ミッション/ボス | ボス/強敵 | BGM | 通常戦闘より強い |
| `combat.enemyShot.fast` | 戦闘 | 高速敵弾 | SFX | 軽く鋭い |
| `combat.enemyShot.heavy` | 戦闘 | 重い敵弾/砲撃 | SFX | 太いが低域を出しすぎない |
| `combat.enemyShot.laser` | 戦闘 | レーザー/ビーム | SFX | 持続/発射音の設計に注意 |
| `combat.reload` | 戦闘 | リロード/チャージ | SFX | 動作時間に合わせる |
| `combat.explosion` | 戦闘 | 爆発 | SFX | 画面揺れやヒットストップと同期 |
| `equipment.switch` | 装備 | 装備切替 | SFX | UIより手触りを強める |
| `equipment.use` | 装備 | 装備使用 | SFX | 装備カテゴリ別に将来分岐 |
| `barrier.loop` | バリア | 展開中 | SFX Loop | ショット音流用禁止。専用素材まで無音 |
| `voice.radioBlip` | 音声 | 無線開始/終了 | Voice | ボイス前後に短く入れる |
| `voice.objective` | 音声 | 任務音声 | Voice | 後で実ボイスへ差し替え |
| `noise.radioStatic` | ノイズ | 通信妨害 | Noise Loop | 小さく、状態解除でフェードアウト |
| `noise.lowHp` | ノイズ | 低HP | Noise Loop | 長時間鳴り続けない音量にする |

ミッション別BGMは、`setMissionBgm('mission-01', SOUND_KEYS.BGM_MISSION_DEFAULT)` のように登録してから `audioEvents.missionEntered('mission-01')` を呼ぶ設計にしています。専用キーを増やす場合は `SOUND_KEYS` と `SOUND_EVENTS` に追加します。

敵弾ごとの音は `audioEvents.enemyShot('fast')`、`audioEvents.enemyShot('heavy')`、`audioEvents.enemyShot('laser')` のように呼べるようにしています。素材がない間は無音なので、敵弾ロジックだけ先に接続できます。

## P2: 演出強化・環境差分

| キー案 | 場面 | トリガー | チャンネル | 素材メモ |
|---|---|---|---|---|
| `mission.clear` | ミッション | クリア | SFX | リザルト遷移へ繋げる |
| `mission.fail` | ミッション | 失敗 | SFX | 過度に不快にしない |
| `explore.doorOpen` | 探索 | ドア開放 | SFX | 低め、短め |
| `explore.doorLocked` | 探索 | ロック中 | SFX | UIエラーと似せすぎない |
| `explore.step.metal` | 探索 | 金属床移動 | SFX | 通常足音より硬い |
| `explore.step.water` | 探索 | 水/湿地移動 | SFX | 短い水音 |
| `explore.secretFound` | 探索 | 隠し発見 | SFX | 印象的な報酬音 |
| `stinger.danger` | 全般 | 強敵出現/警告 | SFX | 短い緊張音 |
| `stinger.reward` | 全般 | レア装備獲得 | SFX | 特別感 |
| `ambience.facility` | 探索 | 施設エリア | Noise/Ambience | 低密度ループ |
| `ambience.cave` | 探索 | 洞窟/ダンジョン | Noise/Ambience | 空間感 |
| `enemy.spawn` | 戦闘 | 敵出現 | SFX | 出現位置の認知 |
| `enemy.death.small` | 戦闘 | 小型敵撃破 | SFX | 短く軽い |
| `enemy.death.large` | 戦闘 | 大型敵撃破 | SFX | 報酬感を強める |
| `player.death` | 戦闘 | プレイヤー死亡 | SFX | リザルト遷移へ繋げる |

## 差し替え手順

新しい音を追加するときは、ゲームロジック側を触らず `soundCatalog.ts` だけを変更するのが基本です。
音源ファイルは `apps/web/public/sound/` を正本にし、ASCII のファイル名を使います。`soundCatalog.ts` では public root からの URL、たとえば `/sound/ui-confirm.mp3` を指定します。

```ts
export const SOUND_ASSET_IDS = {
  PLACEHOLDER_SHOT: 'asset.placeholder.shot',
  UI_CONFIRM: 'asset.ui.confirm',
} as const;

export const SOUND_ASSETS = [
  {
    id: SOUND_ASSET_IDS.PLACEHOLDER_SHOT,
    url: PLACEHOLDER_SHOT_MP3_URL,
    description: '仮置き: shot-placeholder.mp3',
    temporary: true,
  },
  {
    id: SOUND_ASSET_IDS.UI_CONFIRM,
    url: '/sound/ui-confirm.mp3',
    description: '決定音',
  },
] as const;

// ui.confirm の行を placeholderEvent から event(..., 'ready', SOUND_ASSET_IDS.UI_CONFIRM, ...) へ変更する。
```

BGMやループ音は、専用素材が入るまでは `missingEvent` のままにしてください。ショット音で仮接続しないことが、差し替え忘れを防ぐ一番重要なルールです。

## 接続例

アプリ起動時は一度だけ初期化します。

```ts
import { initializeGameAudio } from '../audio';

useEffect(() => {
  initializeGameAudio();
}, []);
```

メニュー操作では、実際にカーソルが動いたときだけ鳴らします。

```ts
if (selectedIndex !== previousIndex) {
  audioEvents.menuMove(selectedIndex > previousIndex ? 'down' : 'up');
}
```

射撃では、session が `playerMainWeaponFired` を返したときだけ鳴らします。入力状態だけを見て鳴らすと、cooldown や弾生成失敗とずれるためです。

```ts
if (event.type === 'playerMainWeaponFired') {
  audioEvents.playerShot();
}
```

敵弾は種類を先に渡せます。素材がない間は無音で、後から `soundCatalog.ts` だけで鳴らせます。

```ts
audioEvents.enemyShot(enemyBullet.kind === 'laser' ? 'laser' : 'default');
```

ミッションBGMも先に経路を用意できます。

```ts
setMissionBgm('mission-01', SOUND_KEYS.BGM_MISSION_DEFAULT);
audioEvents.missionEntered('mission-01');
```

## ミックス上の注意

UI音は短く、同じ音を連打しても疲れないことを最優先にします。射撃、被弾、バリア破壊はゲーム判断に直結するため、BGMより前に出します。探索移動音は数百回聞くため、音量を低めにし、将来は床材ごとのバリエーションとランダムピッチを入れます。ノイズ系は雰囲気作りに有効ですが、常時大きく鳴らすと情報音を潰すため、低音量、必要な状態だけループ、状態解除時にフェードアウトを基本にします。
