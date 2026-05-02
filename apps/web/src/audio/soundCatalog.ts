export const SOUND_ASSET_IDS = {
  PLACEHOLDER_SHOT: 'asset.placeholder.shot',

  UI_CURSOR: 'asset.ui.cursor',
  UI_CONFIRM: 'asset.ui.confirm',
  UI_CANCEL: 'asset.ui.cancel',
  UI_PANEL_OPEN: 'asset.ui.panelOpen',
  UI_PANEL_CLOSE: 'asset.ui.panelClose',
  UI_ERROR: 'asset.ui.error',
  SYSTEM_SAVE_LOAD: 'asset.system.saveLoad',
  SYSTEM_RECONSTRUCT: 'asset.system.reconstruct',
  TITLE_NEW_GAME: 'asset.title.newGame',
  TITLE_LOAD_GAME: 'asset.title.loadGame',

  BGM_TITLE: 'asset.bgm.title',
  BGM_EXPLORE: 'asset.bgm.explore',
  BGM_BATTLE: 'asset.bgm.battle',
  BGM_MISSION: 'asset.bgm.mission',

  MISSION_IN: 'asset.mission.in',
  MISSION_OBJECTIVE: 'asset.mission.objectiveUpdate',
  MISSION_CLEAR: 'asset.mission.clear',
  MISSION_FAIL: 'asset.mission.fail',

  EXPLORE_SCAN: 'asset.explore.scan',
  EXPLORE_SCAN_HIT: 'asset.explore.scanHit',
  EXPLORE_MOVE: 'asset.explore.move',
  ITEM_PICKUP: 'asset.explore.itemPickup',
  EQUIPMENT_PICKUP: 'asset.explore.equipmentPickup',

  PLAYER_SHOT: 'asset.combat.playerShot',
  PLAYER_MELEE: 'asset.combat.playerMelee',
  PLAYER_HIT: 'asset.combat.playerHit',
  PLAYER_HIT_HEAVY: 'asset.combat.playerHitHeavy',
  ENEMY_SHOT: 'asset.combat.enemyShot',
  ENEMY_HIT: 'asset.combat.enemyHit',
  ENEMY_DESTROYED: 'asset.combat.enemyDestroyed',
  NO_AMMO: 'asset.combat.noAmmo',

  EQUIPMENT_ARCHIVE_CATEGORY_SELECT: 'asset.equipmentArchive.categorySelect',
  EQUIPMENT_ARCHIVE_DETAIL_SELECT: 'asset.equipmentArchive.detailSelect',
  EQUIPMENT_SWITCH: 'asset.equipment.switch',
  EQUIPMENT_USE: 'asset.equipment.use',
  EQUIPMENT_SILENT_WAVE: 'asset.equipment.silentWave',
  EQUIPMENT_UPGRADE: 'asset.equipment.upgrade',

  BARRIER_UP: 'asset.barrier.up',
  BARRIER_DOWN: 'asset.barrier.down',
  BARRIER_LOOP: 'asset.barrier.loop',
  BARRIER_HIT: 'asset.barrier.hit',
  BARRIER_BREAK: 'asset.barrier.break',

  RADIO_BLIP: 'asset.voice.radioBlip',
  RADIO_STATIC_LOOP: 'asset.noise.radioStaticLoop',
} as const;

export type SoundAssetId = (typeof SOUND_ASSET_IDS)[keyof typeof SOUND_ASSET_IDS];

export const SOUND_KEYS = {
  UI_MENU_UP: 'ui.menu.up',
  UI_MENU_DOWN: 'ui.menu.down',
  UI_MENU_LEFT: 'ui.menu.left',
  UI_MENU_RIGHT: 'ui.menu.right',
  UI_CONFIRM: 'ui.confirm',
  UI_CANCEL: 'ui.cancel',
  UI_OPEN: 'ui.open',
  UI_CLOSE: 'ui.close',
  UI_ERROR: 'ui.error',
  SYSTEM_SAVE_LOAD: 'system.saveLoad',
  SYSTEM_RECONSTRUCT: 'system.reconstruct',

  TITLE_NEW_GAME: 'title.newGame',
  TITLE_LOAD_GAME: 'title.loadGame',

  MISSION_IN: 'mission.in',
  MISSION_CLEAR: 'mission.clear',
  MISSION_FAIL: 'mission.fail',
  MISSION_OBJECTIVE_UPDATE: 'mission.objectiveUpdate',

  EXPLORE_STEP: 'explore.step',
  EXPLORE_MOVE: 'explore.move',
  EXPLORE_SCAN: 'explore.scan',
  EXPLORE_SCAN_HIT: 'explore.scanHit',
  EXPLORE_ITEM_PICKUP: 'explore.itemPickup',
  EXPLORE_EQUIPMENT_PICKUP: 'explore.equipmentPickup',
  EXPLORE_DOOR_OPEN: 'explore.doorOpen',
  EXPLORE_DOOR_LOCKED: 'explore.doorLocked',

  COMBAT_PLAYER_SHOT: 'combat.playerShot',
  COMBAT_PLAYER_MELEE: 'combat.playerMelee',
  COMBAT_ENEMY_SHOT: 'combat.enemyShot',
  COMBAT_ENEMY_SHOT_FAST: 'combat.enemyShot.fast',
  COMBAT_ENEMY_SHOT_HEAVY: 'combat.enemyShot.heavy',
  COMBAT_ENEMY_SHOT_LASER: 'combat.enemyShot.laser',
  COMBAT_PLAYER_HIT: 'combat.playerHit',
  COMBAT_PLAYER_HIT_HEAVY: 'combat.playerHit.heavy',
  COMBAT_ENEMY_HIT: 'combat.enemyHit',
  COMBAT_ENEMY_DESTROYED: 'combat.enemyDestroyed',
  COMBAT_RELOAD: 'combat.reload',
  COMBAT_NO_AMMO: 'combat.noAmmo',
  COMBAT_EXPLOSION: 'combat.explosion',

  EQUIPMENT_ARCHIVE_CATEGORY_SELECT: 'equipmentArchive.categorySelect',
  EQUIPMENT_ARCHIVE_DETAIL_SELECT: 'equipmentArchive.detailSelect',
  EQUIPMENT_SWITCH: 'equipment.switch',
  EQUIPMENT_USE: 'equipment.use',
  EQUIPMENT_SILENT_WAVE: 'equipment.silentWave',
  EQUIPMENT_UPGRADE: 'equipment.upgrade',

  BARRIER_UP: 'barrier.up',
  BARRIER_DOWN: 'barrier.down',
  BARRIER_LOOP: 'barrier.loop',
  BARRIER_HIT: 'barrier.hit',
  BARRIER_BREAK: 'barrier.break',

  VOICE_RADIO_BLIP: 'voice.radioBlip',
  VOICE_OBJECTIVE: 'voice.objective',

  NOISE_RADIO_STATIC: 'noise.radioStatic',
  NOISE_LOW_HP: 'noise.lowHp',

  BGM_TITLE: 'bgm.title',
  BGM_EXPLORATION: 'bgm.exploration',
  BGM_COMBAT: 'bgm.combat',
  BGM_MISSION_DEFAULT: 'bgm.mission.default',
  BGM_MISSION_BOSS: 'bgm.mission.boss',
} as const;

export type SoundKey = (typeof SOUND_KEYS)[keyof typeof SOUND_KEYS];

export type SoundChannel = 'master' | 'bgm' | 'sfx' | 'ui' | 'voice' | 'noise';
export type SoundCategory = Exclude<SoundChannel, 'master'>;
export type SoundPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type SoundImplementationStatus = 'placeholder' | 'ready' | 'missing';

export type SoundAssetDefinition = {
  id: SoundAssetId;
  url: string;
  description: string;
  temporary?: boolean;
  /**
   * true の asset は素材未配置でも実行を止めない前提の棚卸し対象です。
   * 起動時 preload から外し、実際にイベントが発火したときだけ試しに鳴らします。
   */
  optional?: boolean;
};

export type SoundEventDefinition = {
  key: SoundKey;
  category: SoundCategory;
  /**
   * 元音源をゲーム内で鳴らすときの基準倍率です。
   * ユーザー設定の倍率とは分け、AudioHub で sourceGain × channel gain × master gain として合成します。
   */
  sourceGain: number;
  priority: SoundPriority;
  status: SoundImplementationStatus;
  assetId?: SoundAssetId;
  loop?: boolean;
  cooldownMs?: number;
  polyphony?: number;
  detuneRange?: number;
  description?: string;
};

// AudioHub の user-gesture unlock 用に残す既存素材です。棚卸し対象の差し替え正本ではありません。
export const PLACEHOLDER_SHOT_WAV_URL = '/sound/placeholder/shot-placeholder.wav';

const soundUrl = (filename: string): string => `/sound/${filename}`;

const asset = (
  id: SoundAssetId,
  filename: string,
  description: string,
  options: Pick<SoundAssetDefinition, 'temporary' | 'optional'> = { optional: true },
): SoundAssetDefinition => ({
  id,
  url: soundUrl(filename),
  description,
  ...options,
});

export const SOUND_ASSETS: readonly SoundAssetDefinition[] = [
  {
    id: SOUND_ASSET_IDS.PLACEHOLDER_SHOT,
    url: PLACEHOLDER_SHOT_WAV_URL,
    description: '既存の unlock / 開発確認用。新規棚卸しでは player-shot.wav を正本にする。',
    temporary: true,
  },

  asset(SOUND_ASSET_IDS.UI_CURSOR, 'ui/ui-cursor.wav', 'メニュー移動/左右変更'),
  asset(SOUND_ASSET_IDS.UI_CONFIRM, 'ui/ui-confirm.wav', '決定/New Game/Load Game'),
  asset(SOUND_ASSET_IDS.UI_CANCEL, 'ui/ui-cancel.wav', '戻る/キャンセル'),
  asset(SOUND_ASSET_IDS.UI_PANEL_OPEN, 'ui/ui-panel-open.wav', 'パネル/スロット選択を開く'),
  asset(SOUND_ASSET_IDS.UI_PANEL_CLOSE, 'ui/ui-panel-close.wav', 'パネル/スロット選択を閉じる'),
  asset(SOUND_ASSET_IDS.UI_ERROR, 'ui/ui-error.wav', '選択不可/弾切れなどの短い警告'),
  asset(SOUND_ASSET_IDS.SYSTEM_SAVE_LOAD, 'system/system-save-load.wav', 'コンソール保存/ロード'),
  asset(SOUND_ASSET_IDS.SYSTEM_RECONSTRUCT, 'system/reconstruct.wav', 'New Game 後の自機構築ムービー'),
  asset(SOUND_ASSET_IDS.TITLE_NEW_GAME, 'title/title-new-game.wav', 'New Game 開始'),
  asset(SOUND_ASSET_IDS.TITLE_LOAD_GAME, 'title/title-load-game.wav', 'Continue / Load Game 開始'),

  asset(SOUND_ASSET_IDS.BGM_TITLE, 'title/op.wav', 'タイトル OP ループ'),
  asset(SOUND_ASSET_IDS.BGM_EXPLORE, 'bgm/bgm-explore.wav', '探索BGM'),
  asset(SOUND_ASSET_IDS.BGM_BATTLE, 'bgm/bgm-battle.wav', '通常戦闘BGM'),
  asset(SOUND_ASSET_IDS.BGM_MISSION, 'bgm/bgm-mission.wav', 'ミッション汎用BGM'),

  asset(SOUND_ASSET_IDS.MISSION_IN, 'mission/mission-in.wav', 'ミッション突入'),
  asset(SOUND_ASSET_IDS.MISSION_OBJECTIVE, 'mission/mission-objective-update.wav', '目標更新/通信通知'),
  asset(SOUND_ASSET_IDS.MISSION_CLEAR, 'mission/mission-clear.wav', 'ミッションクリア'),
  asset(SOUND_ASSET_IDS.MISSION_FAIL, 'mission/mission-fail.wav', 'ミッション失敗/中断'),

  asset(SOUND_ASSET_IDS.EXPLORE_SCAN, 'explore/scan.wav', '探索スキャン開始'),
  asset(SOUND_ASSET_IDS.EXPLORE_SCAN_HIT, 'explore/explore-scan-hit.wav', '探索スキャン反応あり'),
  asset(SOUND_ASSET_IDS.EXPLORE_MOVE, 'explore/move.wav', '探索中の移動ループ'),
  asset(SOUND_ASSET_IDS.ITEM_PICKUP, 'explore/item-pickup.wav', '通常回収'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_PICKUP, 'explore/equipment-pickup.wav', '装備回収'),

  asset(SOUND_ASSET_IDS.PLAYER_SHOT, 'combat/player-shot.wav', 'プレイヤー射撃'),
  asset(SOUND_ASSET_IDS.PLAYER_MELEE, 'combat/main-melee.wav', 'main パルスの近接スイープ'),
  asset(SOUND_ASSET_IDS.PLAYER_HIT, 'combat/player-hit.wav', 'プレイヤー被弾'),
  asset(SOUND_ASSET_IDS.PLAYER_HIT_HEAVY, 'combat/player-hit-heavy.wav', 'プレイヤー強被弾'),
  asset(SOUND_ASSET_IDS.ENEMY_SHOT, 'combat/enemy-shot.wav', '敵射撃'),
  asset(SOUND_ASSET_IDS.ENEMY_HIT, 'combat/enemy-hit.wav', '敵へ命中'),
  asset(SOUND_ASSET_IDS.ENEMY_DESTROYED, 'combat/enemy-destroyed.wav', '敵撃破/小爆発'),
  asset(SOUND_ASSET_IDS.NO_AMMO, 'combat/no-ammo.wav', '弾切れ/使用不可'),

  asset(SOUND_ASSET_IDS.EQUIPMENT_ARCHIVE_CATEGORY_SELECT, 'equipment/equipment-archive-category-select.wav', '装備/アーカイブの分類選択'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_ARCHIVE_DETAIL_SELECT, 'equipment/equipment-archive-detail-select.wav', '装備/アーカイブの詳細選択'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_SWITCH, 'equipment/equipment-switch.wav', '装備切替'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_USE, 'equipment/equipment-use.wav', 'サブ装備使用'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_SILENT_WAVE, 'equipment/static_waves.wav', 'ミュートチャンバー展開'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_UPGRADE, 'equipment/equipment-upgrade.wav', '装備強化'),

  asset(SOUND_ASSET_IDS.BARRIER_UP, 'equipment/noise_camceler.wav', 'ノイズキャンセラー/バリア展開'),
  asset(SOUND_ASSET_IDS.BARRIER_DOWN, 'barrier/barrier-down.wav', 'バリア解除/時間切れ'),
  asset(SOUND_ASSET_IDS.BARRIER_LOOP, 'barrier/barrier-loop.wav', 'バリア展開中ループ'),
  asset(SOUND_ASSET_IDS.BARRIER_HIT, 'barrier/barrier-hit.wav', 'バリアで弾を防いだ瞬間'),
  asset(SOUND_ASSET_IDS.BARRIER_BREAK, 'barrier/barrier-break.wav', '将来のバリア破壊'),

  asset(SOUND_ASSET_IDS.RADIO_BLIP, 'voice/radio-blip.wav', '無線の短いブリップ'),
  asset(SOUND_ASSET_IDS.RADIO_STATIC_LOOP, 'noise/radio-static-loop.wav', '聴取不可時の無線ノイズループ'),
];

export const SOUND_ASSET_BY_ID = SOUND_ASSETS.reduce<Record<SoundAssetId, SoundAssetDefinition>>((acc, definition) => {
  acc[definition.id] = definition;
  return acc;
}, {} as Record<SoundAssetId, SoundAssetDefinition>);

export function isSoundAssetId(value: string | undefined): value is SoundAssetId {
  return Boolean(value && SOUND_ASSET_BY_ID[value as SoundAssetId]);
}

type EventOptions = Omit<SoundEventDefinition, 'key' | 'assetId' | 'category' | 'sourceGain' | 'priority' | 'status'>;

const event = (
  key: SoundKey,
  category: SoundCategory,
  sourceGain: number,
  priority: SoundPriority,
  status: SoundImplementationStatus,
  assetId: SoundAssetId | undefined,
  options: EventOptions = {},
): SoundEventDefinition => ({
  key,
  category,
  sourceGain,
  priority,
  status,
  ...(assetId ? { assetId } : {}),
  ...options,
});

const readyEvent = (
  key: SoundKey,
  category: SoundCategory,
  sourceGain: number,
  priority: SoundPriority,
  assetId: SoundAssetId,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, sourceGain, priority, 'ready', assetId, options);

const missingEvent = (
  key: SoundKey,
  category: SoundCategory,
  sourceGain: number,
  priority: SoundPriority,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, sourceGain, priority, 'missing', undefined, options);

export const SOUND_EVENTS: readonly SoundEventDefinition[] = [
  // P0: 操作・戦闘・バリアの即時フィードバック。素材未配置なら無音、配置後はコード変更なしで鳴る。
  readyEvent(SOUND_KEYS.UI_MENU_UP, 'ui', 0.3, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'メニューカーソル上移動' }),
  readyEvent(SOUND_KEYS.UI_MENU_DOWN, 'ui', 0.3, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'メニューカーソル下移動' }),
  readyEvent(SOUND_KEYS.UI_MENU_LEFT, 'ui', 0.26, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 20, description: 'スライダー/選択肢左' }),
  readyEvent(SOUND_KEYS.UI_MENU_RIGHT, 'ui', 0.26, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 20, description: 'スライダー/選択肢右' }),
  readyEvent(SOUND_KEYS.UI_CONFIRM, 'ui', 0.4, 'P0', SOUND_ASSET_IDS.UI_CONFIRM, { cooldownMs: 60, polyphony: 3, description: '決定' }),
  readyEvent(SOUND_KEYS.UI_CANCEL, 'ui', 0.34, 'P0', SOUND_ASSET_IDS.UI_CANCEL, { cooldownMs: 60, polyphony: 3, description: '戻る/キャンセル' }),
  readyEvent(SOUND_KEYS.UI_OPEN, 'ui', 0.3, 'P0', SOUND_ASSET_IDS.UI_PANEL_OPEN, { cooldownMs: 80, polyphony: 2, description: 'UIを開く' }),
  readyEvent(SOUND_KEYS.UI_CLOSE, 'ui', 0.28, 'P0', SOUND_ASSET_IDS.UI_PANEL_CLOSE, { cooldownMs: 80, polyphony: 2, description: 'UIを閉じる' }),
  readyEvent(SOUND_KEYS.UI_ERROR, 'ui', 0.38, 'P0', SOUND_ASSET_IDS.UI_ERROR, { cooldownMs: 120, polyphony: 1, description: '選択不可/エラー' }),
  readyEvent(SOUND_KEYS.TITLE_NEW_GAME, 'ui', 0.5, 'P0', SOUND_ASSET_IDS.TITLE_NEW_GAME, { cooldownMs: 300, polyphony: 1, description: 'New Game 決定' }),
  readyEvent(SOUND_KEYS.TITLE_LOAD_GAME, 'ui', 0.46, 'P0', SOUND_ASSET_IDS.TITLE_LOAD_GAME, { cooldownMs: 300, polyphony: 1, description: 'Load Game 決定' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_SHOT, 'sfx', 0.44, 'P0', SOUND_ASSET_IDS.PLAYER_SHOT, { cooldownMs: 30, polyphony: 6, detuneRange: 25, description: 'プレイヤー射撃' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_MELEE, 'sfx', 0.24, 'P0', SOUND_ASSET_IDS.PLAYER_MELEE, { cooldownMs: 180, polyphony: 2, detuneRange: 18, description: 'main パルス近接スイープ' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_HIT, 'sfx', 0.3, 'P0', SOUND_ASSET_IDS.PLAYER_HIT, { cooldownMs: 100, polyphony: 3, description: 'プレイヤー被弾' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_HIT_HEAVY, 'sfx', 0.28, 'P0', SOUND_ASSET_IDS.PLAYER_HIT_HEAVY, { cooldownMs: 100, polyphony: 3, description: 'プレイヤー被弾の別音色' }),
  readyEvent(SOUND_KEYS.BARRIER_UP, 'sfx', 0.42, 'P0', SOUND_ASSET_IDS.BARRIER_UP, { cooldownMs: 280, polyphony: 1, description: 'バリア展開' }),
  readyEvent(SOUND_KEYS.BARRIER_DOWN, 'sfx', 0.32, 'P0', SOUND_ASSET_IDS.BARRIER_DOWN, { cooldownMs: 220, polyphony: 1, description: 'バリア解除/時間切れ' }),
  readyEvent(SOUND_KEYS.BARRIER_HIT, 'sfx', 0.4, 'P0', SOUND_ASSET_IDS.BARRIER_HIT, { cooldownMs: 60, polyphony: 4, detuneRange: 35, description: 'バリアで敵弾を防ぐ' }),
  readyEvent(SOUND_KEYS.NOISE_RADIO_STATIC, 'noise', 0.13, 'P0', SOUND_ASSET_IDS.RADIO_STATIC_LOOP, { loop: true, polyphony: 1, description: '聴取不可時の無線ノイズ' }),

  // P1: 画面滞在時間が長い音楽と、探索/回収の主要報酬音。
  readyEvent(SOUND_KEYS.BGM_TITLE, 'bgm', 0.32, 'P1', SOUND_ASSET_IDS.BGM_TITLE, { loop: true, polyphony: 1, description: 'タイトル OP ループ' }),
  readyEvent(SOUND_KEYS.BGM_EXPLORATION, 'bgm', 0.29, 'P1', SOUND_ASSET_IDS.BGM_EXPLORE, { loop: true, polyphony: 1, description: '探索BGM' }),
  readyEvent(SOUND_KEYS.BGM_COMBAT, 'bgm', 0.32, 'P1', SOUND_ASSET_IDS.BGM_BATTLE, { loop: true, polyphony: 1, description: '戦闘BGM' }),
  readyEvent(SOUND_KEYS.MISSION_IN, 'sfx', 0.55, 'P1', SOUND_ASSET_IDS.MISSION_IN, { cooldownMs: 500, polyphony: 1, description: 'ミッション突入' }),
  readyEvent(SOUND_KEYS.EXPLORE_SCAN, 'sfx', 0.34, 'P1', SOUND_ASSET_IDS.EXPLORE_SCAN, { cooldownMs: 260, polyphony: 1, description: 'スキャン開始' }),
  readyEvent(SOUND_KEYS.EXPLORE_SCAN_HIT, 'sfx', 0.42, 'P1', SOUND_ASSET_IDS.EXPLORE_SCAN_HIT, { cooldownMs: 220, polyphony: 1, description: 'スキャン反応あり' }),
  readyEvent(SOUND_KEYS.EXPLORE_MOVE, 'sfx', 0.16, 'P1', SOUND_ASSET_IDS.EXPLORE_MOVE, { loop: true, polyphony: 1, description: '探索中の移動ループ' }),
  readyEvent(SOUND_KEYS.EXPLORE_ITEM_PICKUP, 'sfx', 0.36, 'P1', SOUND_ASSET_IDS.ITEM_PICKUP, { cooldownMs: 120, polyphony: 3, description: 'アイテム回収' }),
  readyEvent(SOUND_KEYS.EXPLORE_EQUIPMENT_PICKUP, 'sfx', 0.48, 'P1', SOUND_ASSET_IDS.EQUIPMENT_PICKUP, { cooldownMs: 240, polyphony: 1, description: '装備回収' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT, 'sfx', 0.3, 'P1', SOUND_ASSET_IDS.ENEMY_SHOT, { cooldownMs: 45, polyphony: 6, detuneRange: 35, description: '敵射撃' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_HIT, 'sfx', 0.32, 'P1', SOUND_ASSET_IDS.ENEMY_HIT, { cooldownMs: 45, polyphony: 6, description: '敵への命中' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_DESTROYED, 'sfx', 0.52, 'P1', SOUND_ASSET_IDS.ENEMY_DESTROYED, { cooldownMs: 90, polyphony: 3, description: '敵撃破/小爆発' }),

  // P2: 装備・通信・ミッション結果。ゲーム体験の輪郭が固まった後に専用素材化する。
  readyEvent(SOUND_KEYS.BGM_MISSION_DEFAULT, 'bgm', 0.31, 'P2', SOUND_ASSET_IDS.BGM_MISSION, { loop: true, polyphony: 1, description: 'ミッション汎用BGM' }),
  readyEvent(SOUND_KEYS.BGM_MISSION_BOSS, 'bgm', 0.36, 'P2', SOUND_ASSET_IDS.BGM_BATTLE, { loop: true, polyphony: 1, description: 'ボス/強敵BGMは当面 bgm-battle.wav を共用' }),
  readyEvent(SOUND_KEYS.MISSION_OBJECTIVE_UPDATE, 'sfx', 0.36, 'P2', SOUND_ASSET_IDS.MISSION_OBJECTIVE, { cooldownMs: 250, polyphony: 1, description: '任務目標更新' }),
  readyEvent(SOUND_KEYS.MISSION_CLEAR, 'sfx', 0.58, 'P2', SOUND_ASSET_IDS.MISSION_CLEAR, { cooldownMs: 500, polyphony: 1, description: 'ミッションクリア' }),
  readyEvent(SOUND_KEYS.MISSION_FAIL, 'sfx', 0.5, 'P2', SOUND_ASSET_IDS.MISSION_FAIL, { cooldownMs: 500, polyphony: 1, description: 'ミッション失敗' }),
  readyEvent(SOUND_KEYS.SYSTEM_SAVE_LOAD, 'ui', 0.42, 'P2', SOUND_ASSET_IDS.SYSTEM_SAVE_LOAD, { cooldownMs: 240, polyphony: 1, description: 'コンソール保存/ロード' }),
  readyEvent(SOUND_KEYS.SYSTEM_RECONSTRUCT, 'sfx', 0.56, 'P2', SOUND_ASSET_IDS.SYSTEM_RECONSTRUCT, { cooldownMs: 1200, polyphony: 1, description: 'New Game 後の自機構築ムービー' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_ARCHIVE_CATEGORY_SELECT, 'ui', 0.36, 'P2', SOUND_ASSET_IDS.EQUIPMENT_ARCHIVE_CATEGORY_SELECT, { cooldownMs: 80, polyphony: 2, description: '装備/アーカイブの分類選択' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_ARCHIVE_DETAIL_SELECT, 'ui', 0.34, 'P2', SOUND_ASSET_IDS.EQUIPMENT_ARCHIVE_DETAIL_SELECT, { cooldownMs: 70, polyphony: 2, description: '装備/アーカイブの詳細選択' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_SWITCH, 'sfx', 0.34, 'P2', SOUND_ASSET_IDS.EQUIPMENT_SWITCH, { cooldownMs: 120, polyphony: 1, description: '装備切替' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_USE, 'sfx', 0.42, 'P2', SOUND_ASSET_IDS.EQUIPMENT_USE, { cooldownMs: 160, polyphony: 2, description: '装備使用' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_SILENT_WAVE, 'sfx', 0.48, 'P2', SOUND_ASSET_IDS.EQUIPMENT_SILENT_WAVE, { cooldownMs: 180, polyphony: 1, description: 'ミュートチャンバー展開' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_UPGRADE, 'sfx', 0.46, 'P2', SOUND_ASSET_IDS.EQUIPMENT_UPGRADE, { cooldownMs: 260, polyphony: 1, description: '装備強化' }),
  readyEvent(SOUND_KEYS.VOICE_RADIO_BLIP, 'voice', 0.28, 'P2', SOUND_ASSET_IDS.RADIO_BLIP, { cooldownMs: 120, polyphony: 1, description: '無線ボイス前後のブリップ' }),

  // P3: 現在の実装では必須度が低い、または専用挙動が未確定の音。要求としては棚卸し末尾へ退避する。
  readyEvent(SOUND_KEYS.BARRIER_LOOP, 'sfx', 0.12, 'P3', SOUND_ASSET_IDS.BARRIER_LOOP, { loop: true, polyphony: 1, description: 'バリア稼働ループ' }),
  readyEvent(SOUND_KEYS.BARRIER_BREAK, 'sfx', 0.55, 'P3', SOUND_ASSET_IDS.BARRIER_BREAK, { cooldownMs: 300, polyphony: 1, description: '将来のバリア破壊' }),
  readyEvent(SOUND_KEYS.COMBAT_NO_AMMO, 'sfx', 0.28, 'P3', SOUND_ASSET_IDS.NO_AMMO, { cooldownMs: 170, polyphony: 1, description: '弾切れ/使用不可' }),
  readyEvent(SOUND_KEYS.COMBAT_EXPLOSION, 'sfx', 0.62, 'P3', SOUND_ASSET_IDS.ENEMY_DESTROYED, { cooldownMs: 90, polyphony: 3, description: '爆発は当面 enemy-destroyed.wav を共用' }),
  readyEvent(SOUND_KEYS.VOICE_OBJECTIVE, 'voice', 0.32, 'P3', SOUND_ASSET_IDS.MISSION_OBJECTIVE, { cooldownMs: 300, polyphony: 1, description: '疑似ボイス/任務読み上げは目標更新音を共用' }),

  // 明確な演出要件が固まるまで素材要求から外すキー。呼ばれても無音で進行する。
  missingEvent(SOUND_KEYS.EXPLORE_STEP, 'sfx', 0.16, 'P3', { cooldownMs: 110, polyphony: 2, detuneRange: 70, description: '足音は疲労しやすいため未要求' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_OPEN, 'sfx', 0.4, 'P3', { cooldownMs: 240, polyphony: 1, description: 'ドア実装確定まで未要求' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_LOCKED, 'sfx', 0.36, 'P3', { cooldownMs: 240, polyphony: 1, description: 'ドア実装確定まで未要求' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_FAST, 'sfx', 0.3, 'P3', { cooldownMs: 25, polyphony: 10, detuneRange: 30, description: '敵弾差分は enemy-shot.wav に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_HEAVY, 'sfx', 0.42, 'P3', { cooldownMs: 80, polyphony: 4, detuneRange: 20, description: '敵弾差分は enemy-shot.wav に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_LASER, 'sfx', 0.36, 'P3', { cooldownMs: 60, polyphony: 4, description: '敵弾差分は enemy-shot.wav に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_RELOAD, 'sfx', 0.38, 'P3', { cooldownMs: 240, polyphony: 1, description: 'リロード仕様確定まで未要求' }),
  missingEvent(SOUND_KEYS.NOISE_LOW_HP, 'noise', 0.18, 'P3', { loop: true, polyphony: 1, description: 'MAGNOLIA はHPなし設計なので未要求' }),
];

export const SOUND_EVENT_BY_KEY = Object.fromEntries(SOUND_EVENTS.map((definition) => [definition.key, definition])) as Record<SoundKey, SoundEventDefinition>;

export const PLACEHOLDER_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'placeholder').map((definition) => definition.key);
export const READY_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'ready').map((definition) => definition.key);
export const MISSING_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'missing').map((definition) => definition.key);
