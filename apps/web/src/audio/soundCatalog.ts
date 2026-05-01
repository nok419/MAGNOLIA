export const SOUND_ASSET_IDS = {
  PLACEHOLDER_SHOT: 'asset.placeholder.shot',

  UI_CURSOR: 'asset.ui.cursor',
  UI_CONFIRM: 'asset.ui.confirm',
  UI_CANCEL: 'asset.ui.cancel',
  UI_PANEL_OPEN: 'asset.ui.panelOpen',
  UI_PANEL_CLOSE: 'asset.ui.panelClose',
  UI_ERROR: 'asset.ui.error',

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
  ITEM_PICKUP: 'asset.explore.itemPickup',
  EQUIPMENT_PICKUP: 'asset.explore.equipmentPickup',

  PLAYER_SHOT: 'asset.combat.playerShot',
  PLAYER_HIT: 'asset.combat.playerHit',
  ENEMY_SHOT: 'asset.combat.enemyShot',
  ENEMY_HIT: 'asset.combat.enemyHit',
  ENEMY_DESTROYED: 'asset.combat.enemyDestroyed',
  NO_AMMO: 'asset.combat.noAmmo',

  EQUIPMENT_SWITCH: 'asset.equipment.switch',
  EQUIPMENT_USE: 'asset.equipment.use',

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

  TITLE_NEW_GAME: 'title.newGame',
  TITLE_LOAD_GAME: 'title.loadGame',

  MISSION_IN: 'mission.in',
  MISSION_CLEAR: 'mission.clear',
  MISSION_FAIL: 'mission.fail',
  MISSION_OBJECTIVE_UPDATE: 'mission.objectiveUpdate',

  EXPLORE_STEP: 'explore.step',
  EXPLORE_SCAN: 'explore.scan',
  EXPLORE_SCAN_HIT: 'explore.scanHit',
  EXPLORE_ITEM_PICKUP: 'explore.itemPickup',
  EXPLORE_EQUIPMENT_PICKUP: 'explore.equipmentPickup',
  EXPLORE_DOOR_OPEN: 'explore.doorOpen',
  EXPLORE_DOOR_LOCKED: 'explore.doorLocked',

  COMBAT_PLAYER_SHOT: 'combat.playerShot',
  COMBAT_ENEMY_SHOT: 'combat.enemyShot',
  COMBAT_ENEMY_SHOT_FAST: 'combat.enemyShot.fast',
  COMBAT_ENEMY_SHOT_HEAVY: 'combat.enemyShot.heavy',
  COMBAT_ENEMY_SHOT_LASER: 'combat.enemyShot.laser',
  COMBAT_PLAYER_HIT: 'combat.playerHit',
  COMBAT_ENEMY_HIT: 'combat.enemyHit',
  COMBAT_ENEMY_DESTROYED: 'combat.enemyDestroyed',
  COMBAT_RELOAD: 'combat.reload',
  COMBAT_NO_AMMO: 'combat.noAmmo',
  COMBAT_EXPLOSION: 'combat.explosion',

  EQUIPMENT_SWITCH: 'equipment.switch',
  EQUIPMENT_USE: 'equipment.use',

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
  defaultVolume: number;
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
export const PLACEHOLDER_SHOT_MP3_URL = '/sound/shot-placeholder.mp3';

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
    url: PLACEHOLDER_SHOT_MP3_URL,
    description: '既存の unlock / 開発確認用。新規棚卸しでは player-shot.mp3 を正本にする。',
    temporary: true,
  },

  asset(SOUND_ASSET_IDS.UI_CURSOR, 'ui-cursor.mp3', 'メニュー移動/左右変更'),
  asset(SOUND_ASSET_IDS.UI_CONFIRM, 'ui-confirm.mp3', '決定/New Game/Load Game'),
  asset(SOUND_ASSET_IDS.UI_CANCEL, 'ui-cancel.mp3', '戻る/キャンセル'),
  asset(SOUND_ASSET_IDS.UI_PANEL_OPEN, 'ui-panel-open.mp3', 'パネル/スロット選択を開く'),
  asset(SOUND_ASSET_IDS.UI_PANEL_CLOSE, 'ui-panel-close.mp3', 'パネル/スロット選択を閉じる'),
  asset(SOUND_ASSET_IDS.UI_ERROR, 'ui-error.mp3', '選択不可/弾切れなどの短い警告'),

  asset(SOUND_ASSET_IDS.BGM_TITLE, 'bgm-title.mp3', 'タイトルBGM'),
  asset(SOUND_ASSET_IDS.BGM_EXPLORE, 'bgm-explore.mp3', '探索BGM'),
  asset(SOUND_ASSET_IDS.BGM_BATTLE, 'bgm-battle.mp3', '通常戦闘BGM'),
  asset(SOUND_ASSET_IDS.BGM_MISSION, 'bgm-mission.mp3', 'ミッション汎用BGM'),

  asset(SOUND_ASSET_IDS.MISSION_IN, 'mission-in.mp3', 'ミッション突入'),
  asset(SOUND_ASSET_IDS.MISSION_OBJECTIVE, 'mission-objective-update.mp3', '目標更新/通信通知'),
  asset(SOUND_ASSET_IDS.MISSION_CLEAR, 'mission-clear.mp3', 'ミッションクリア'),
  asset(SOUND_ASSET_IDS.MISSION_FAIL, 'mission-fail.mp3', 'ミッション失敗/中断'),

  asset(SOUND_ASSET_IDS.EXPLORE_SCAN, 'explore-scan.mp3', '探索スキャン開始'),
  asset(SOUND_ASSET_IDS.EXPLORE_SCAN_HIT, 'explore-scan-hit.mp3', '探索スキャン反応あり'),
  asset(SOUND_ASSET_IDS.ITEM_PICKUP, 'item-pickup.mp3', '通常回収'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_PICKUP, 'equipment-pickup.mp3', '装備回収'),

  asset(SOUND_ASSET_IDS.PLAYER_SHOT, 'player-shot.mp3', 'プレイヤー射撃'),
  asset(SOUND_ASSET_IDS.PLAYER_HIT, 'player-hit.mp3', 'プレイヤー被弾'),
  asset(SOUND_ASSET_IDS.ENEMY_SHOT, 'enemy-shot.mp3', '敵射撃'),
  asset(SOUND_ASSET_IDS.ENEMY_HIT, 'enemy-hit.mp3', '敵へ命中'),
  asset(SOUND_ASSET_IDS.ENEMY_DESTROYED, 'enemy-destroyed.mp3', '敵撃破/小爆発'),
  asset(SOUND_ASSET_IDS.NO_AMMO, 'no-ammo.mp3', '弾切れ/使用不可'),

  asset(SOUND_ASSET_IDS.EQUIPMENT_SWITCH, 'equipment-switch.mp3', '装備切替'),
  asset(SOUND_ASSET_IDS.EQUIPMENT_USE, 'equipment-use.mp3', 'サブ装備使用'),

  asset(SOUND_ASSET_IDS.BARRIER_UP, 'barrier-up.mp3', 'バリア展開'),
  asset(SOUND_ASSET_IDS.BARRIER_DOWN, 'barrier-down.mp3', 'バリア解除/時間切れ'),
  asset(SOUND_ASSET_IDS.BARRIER_LOOP, 'barrier-loop.mp3', 'バリア展開中ループ'),
  asset(SOUND_ASSET_IDS.BARRIER_HIT, 'barrier-hit.mp3', 'バリアで弾を防いだ瞬間'),
  asset(SOUND_ASSET_IDS.BARRIER_BREAK, 'barrier-break.mp3', '将来のバリア破壊'),

  asset(SOUND_ASSET_IDS.RADIO_BLIP, 'radio-blip.mp3', '無線の短いブリップ'),
  asset(SOUND_ASSET_IDS.RADIO_STATIC_LOOP, 'radio-static-loop.mp3', '聴取不可時の無線ノイズループ'),
];

export const SOUND_ASSET_BY_ID = SOUND_ASSETS.reduce<Record<SoundAssetId, SoundAssetDefinition>>((acc, definition) => {
  acc[definition.id] = definition;
  return acc;
}, {} as Record<SoundAssetId, SoundAssetDefinition>);

type EventOptions = Omit<SoundEventDefinition, 'key' | 'assetId' | 'category' | 'defaultVolume' | 'priority' | 'status'>;

const event = (
  key: SoundKey,
  category: SoundCategory,
  defaultVolume: number,
  priority: SoundPriority,
  status: SoundImplementationStatus,
  assetId: SoundAssetId | undefined,
  options: EventOptions = {},
): SoundEventDefinition => ({
  key,
  category,
  defaultVolume,
  priority,
  status,
  ...(assetId ? { assetId } : {}),
  ...options,
});

const readyEvent = (
  key: SoundKey,
  category: SoundCategory,
  defaultVolume: number,
  priority: SoundPriority,
  assetId: SoundAssetId,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, defaultVolume, priority, 'ready', assetId, options);

const missingEvent = (
  key: SoundKey,
  category: SoundCategory,
  defaultVolume: number,
  priority: SoundPriority,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, defaultVolume, priority, 'missing', undefined, options);

export const SOUND_EVENTS: readonly SoundEventDefinition[] = [
  // P0: 操作・戦闘・バリアの即時フィードバック。素材未配置なら無音、配置後はコード変更なしで鳴る。
  readyEvent(SOUND_KEYS.UI_MENU_UP, 'ui', 0.24, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'メニューカーソル上移動' }),
  readyEvent(SOUND_KEYS.UI_MENU_DOWN, 'ui', 0.24, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'メニューカーソル下移動' }),
  readyEvent(SOUND_KEYS.UI_MENU_LEFT, 'ui', 0.2, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 20, description: 'スライダー/選択肢左' }),
  readyEvent(SOUND_KEYS.UI_MENU_RIGHT, 'ui', 0.2, 'P0', SOUND_ASSET_IDS.UI_CURSOR, { cooldownMs: 35, polyphony: 2, detuneRange: 20, description: 'スライダー/選択肢右' }),
  readyEvent(SOUND_KEYS.UI_CONFIRM, 'ui', 0.32, 'P0', SOUND_ASSET_IDS.UI_CONFIRM, { cooldownMs: 60, polyphony: 3, description: '決定' }),
  readyEvent(SOUND_KEYS.UI_CANCEL, 'ui', 0.26, 'P0', SOUND_ASSET_IDS.UI_CANCEL, { cooldownMs: 60, polyphony: 3, description: '戻る/キャンセル' }),
  readyEvent(SOUND_KEYS.UI_OPEN, 'ui', 0.22, 'P0', SOUND_ASSET_IDS.UI_PANEL_OPEN, { cooldownMs: 80, polyphony: 2, description: 'UIを開く' }),
  readyEvent(SOUND_KEYS.UI_CLOSE, 'ui', 0.2, 'P0', SOUND_ASSET_IDS.UI_PANEL_CLOSE, { cooldownMs: 80, polyphony: 2, description: 'UIを閉じる' }),
  readyEvent(SOUND_KEYS.UI_ERROR, 'ui', 0.3, 'P0', SOUND_ASSET_IDS.UI_ERROR, { cooldownMs: 120, polyphony: 1, description: '選択不可/エラー' }),
  readyEvent(SOUND_KEYS.TITLE_NEW_GAME, 'ui', 0.36, 'P0', SOUND_ASSET_IDS.UI_CONFIRM, { cooldownMs: 300, polyphony: 1, description: 'New Game 決定' }),
  readyEvent(SOUND_KEYS.TITLE_LOAD_GAME, 'ui', 0.32, 'P0', SOUND_ASSET_IDS.UI_CONFIRM, { cooldownMs: 200, polyphony: 1, description: 'Load Game 決定' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_SHOT, 'sfx', 0.44, 'P0', SOUND_ASSET_IDS.PLAYER_SHOT, { cooldownMs: 30, polyphony: 6, detuneRange: 25, description: 'プレイヤー射撃' }),
  readyEvent(SOUND_KEYS.COMBAT_PLAYER_HIT, 'sfx', 0.52, 'P0', SOUND_ASSET_IDS.PLAYER_HIT, { cooldownMs: 100, polyphony: 3, description: 'プレイヤー被弾' }),
  readyEvent(SOUND_KEYS.BARRIER_UP, 'sfx', 0.42, 'P0', SOUND_ASSET_IDS.BARRIER_UP, { cooldownMs: 280, polyphony: 1, description: 'バリア展開' }),
  readyEvent(SOUND_KEYS.BARRIER_DOWN, 'sfx', 0.32, 'P0', SOUND_ASSET_IDS.BARRIER_DOWN, { cooldownMs: 220, polyphony: 1, description: 'バリア解除/時間切れ' }),
  readyEvent(SOUND_KEYS.BARRIER_HIT, 'sfx', 0.4, 'P0', SOUND_ASSET_IDS.BARRIER_HIT, { cooldownMs: 60, polyphony: 4, detuneRange: 35, description: 'バリアで敵弾を防ぐ' }),
  readyEvent(SOUND_KEYS.NOISE_RADIO_STATIC, 'noise', 0.13, 'P0', SOUND_ASSET_IDS.RADIO_STATIC_LOOP, { loop: true, polyphony: 1, description: '聴取不可時の無線ノイズ' }),

  // P1: 画面滞在時間が長い音楽と、探索/回収の主要報酬音。
  readyEvent(SOUND_KEYS.BGM_TITLE, 'bgm', 0.38, 'P1', SOUND_ASSET_IDS.BGM_TITLE, { loop: true, polyphony: 1, description: 'タイトルBGM' }),
  readyEvent(SOUND_KEYS.BGM_EXPLORATION, 'bgm', 0.34, 'P1', SOUND_ASSET_IDS.BGM_EXPLORE, { loop: true, polyphony: 1, description: '探索BGM' }),
  readyEvent(SOUND_KEYS.BGM_COMBAT, 'bgm', 0.38, 'P1', SOUND_ASSET_IDS.BGM_BATTLE, { loop: true, polyphony: 1, description: '戦闘BGM' }),
  readyEvent(SOUND_KEYS.MISSION_IN, 'sfx', 0.55, 'P1', SOUND_ASSET_IDS.MISSION_IN, { cooldownMs: 500, polyphony: 1, description: 'ミッション突入' }),
  readyEvent(SOUND_KEYS.EXPLORE_SCAN, 'sfx', 0.34, 'P1', SOUND_ASSET_IDS.EXPLORE_SCAN, { cooldownMs: 260, polyphony: 1, description: 'スキャン開始' }),
  readyEvent(SOUND_KEYS.EXPLORE_SCAN_HIT, 'sfx', 0.42, 'P1', SOUND_ASSET_IDS.EXPLORE_SCAN_HIT, { cooldownMs: 220, polyphony: 1, description: 'スキャン反応あり' }),
  readyEvent(SOUND_KEYS.EXPLORE_ITEM_PICKUP, 'sfx', 0.36, 'P1', SOUND_ASSET_IDS.ITEM_PICKUP, { cooldownMs: 120, polyphony: 3, description: 'アイテム回収' }),
  readyEvent(SOUND_KEYS.EXPLORE_EQUIPMENT_PICKUP, 'sfx', 0.48, 'P1', SOUND_ASSET_IDS.EQUIPMENT_PICKUP, { cooldownMs: 240, polyphony: 1, description: '装備回収' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT, 'sfx', 0.3, 'P1', SOUND_ASSET_IDS.ENEMY_SHOT, { cooldownMs: 45, polyphony: 6, detuneRange: 35, description: '敵射撃' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_HIT, 'sfx', 0.32, 'P1', SOUND_ASSET_IDS.ENEMY_HIT, { cooldownMs: 45, polyphony: 6, description: '敵への命中' }),
  readyEvent(SOUND_KEYS.COMBAT_ENEMY_DESTROYED, 'sfx', 0.52, 'P1', SOUND_ASSET_IDS.ENEMY_DESTROYED, { cooldownMs: 90, polyphony: 3, description: '敵撃破/小爆発' }),

  // P2: 装備・通信・ミッション結果。ゲーム体験の輪郭が固まった後に専用素材化する。
  readyEvent(SOUND_KEYS.BGM_MISSION_DEFAULT, 'bgm', 0.36, 'P2', SOUND_ASSET_IDS.BGM_MISSION, { loop: true, polyphony: 1, description: 'ミッション汎用BGM' }),
  readyEvent(SOUND_KEYS.BGM_MISSION_BOSS, 'bgm', 0.42, 'P2', SOUND_ASSET_IDS.BGM_BATTLE, { loop: true, polyphony: 1, description: 'ボス/強敵BGMは当面 bgm-battle.mp3 を共用' }),
  readyEvent(SOUND_KEYS.MISSION_OBJECTIVE_UPDATE, 'sfx', 0.36, 'P2', SOUND_ASSET_IDS.MISSION_OBJECTIVE, { cooldownMs: 250, polyphony: 1, description: '任務目標更新' }),
  readyEvent(SOUND_KEYS.MISSION_CLEAR, 'sfx', 0.58, 'P2', SOUND_ASSET_IDS.MISSION_CLEAR, { cooldownMs: 500, polyphony: 1, description: 'ミッションクリア' }),
  readyEvent(SOUND_KEYS.MISSION_FAIL, 'sfx', 0.5, 'P2', SOUND_ASSET_IDS.MISSION_FAIL, { cooldownMs: 500, polyphony: 1, description: 'ミッション失敗' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_SWITCH, 'sfx', 0.34, 'P2', SOUND_ASSET_IDS.EQUIPMENT_SWITCH, { cooldownMs: 120, polyphony: 1, description: '装備切替' }),
  readyEvent(SOUND_KEYS.EQUIPMENT_USE, 'sfx', 0.42, 'P2', SOUND_ASSET_IDS.EQUIPMENT_USE, { cooldownMs: 160, polyphony: 2, description: '装備使用' }),
  readyEvent(SOUND_KEYS.VOICE_RADIO_BLIP, 'voice', 0.28, 'P2', SOUND_ASSET_IDS.RADIO_BLIP, { cooldownMs: 120, polyphony: 1, description: '無線ボイス前後のブリップ' }),

  // P3: 現在の実装では必須度が低い、または専用挙動が未確定の音。要求としては棚卸し末尾へ退避する。
  readyEvent(SOUND_KEYS.BARRIER_LOOP, 'sfx', 0.12, 'P3', SOUND_ASSET_IDS.BARRIER_LOOP, { loop: true, polyphony: 1, description: 'バリア稼働ループ' }),
  readyEvent(SOUND_KEYS.BARRIER_BREAK, 'sfx', 0.55, 'P3', SOUND_ASSET_IDS.BARRIER_BREAK, { cooldownMs: 300, polyphony: 1, description: '将来のバリア破壊' }),
  readyEvent(SOUND_KEYS.COMBAT_NO_AMMO, 'sfx', 0.28, 'P3', SOUND_ASSET_IDS.NO_AMMO, { cooldownMs: 170, polyphony: 1, description: '弾切れ/使用不可' }),
  readyEvent(SOUND_KEYS.COMBAT_EXPLOSION, 'sfx', 0.62, 'P3', SOUND_ASSET_IDS.ENEMY_DESTROYED, { cooldownMs: 90, polyphony: 3, description: '爆発は当面 enemy-destroyed.mp3 を共用' }),
  readyEvent(SOUND_KEYS.VOICE_OBJECTIVE, 'voice', 0.32, 'P3', SOUND_ASSET_IDS.MISSION_OBJECTIVE, { cooldownMs: 300, polyphony: 1, description: '疑似ボイス/任務読み上げは目標更新音を共用' }),

  // 明確な演出要件が固まるまで素材要求から外すキー。呼ばれても無音で進行する。
  missingEvent(SOUND_KEYS.EXPLORE_STEP, 'sfx', 0.16, 'P3', { cooldownMs: 110, polyphony: 2, detuneRange: 70, description: '足音は疲労しやすいため未要求' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_OPEN, 'sfx', 0.4, 'P3', { cooldownMs: 240, polyphony: 1, description: 'ドア実装確定まで未要求' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_LOCKED, 'sfx', 0.36, 'P3', { cooldownMs: 240, polyphony: 1, description: 'ドア実装確定まで未要求' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_FAST, 'sfx', 0.3, 'P3', { cooldownMs: 25, polyphony: 10, detuneRange: 30, description: '敵弾差分は enemy-shot.mp3 に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_HEAVY, 'sfx', 0.42, 'P3', { cooldownMs: 80, polyphony: 4, detuneRange: 20, description: '敵弾差分は enemy-shot.mp3 に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_LASER, 'sfx', 0.36, 'P3', { cooldownMs: 60, polyphony: 4, description: '敵弾差分は enemy-shot.mp3 に集約' }),
  missingEvent(SOUND_KEYS.COMBAT_RELOAD, 'sfx', 0.38, 'P3', { cooldownMs: 240, polyphony: 1, description: 'リロード仕様確定まで未要求' }),
  missingEvent(SOUND_KEYS.NOISE_LOW_HP, 'noise', 0.18, 'P3', { loop: true, polyphony: 1, description: 'MAGNOLIA はHPなし設計なので未要求' }),
];

export const SOUND_EVENT_BY_KEY = Object.fromEntries(SOUND_EVENTS.map((definition) => [definition.key, definition])) as Record<SoundKey, SoundEventDefinition>;

export const PLACEHOLDER_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'placeholder').map((definition) => definition.key);
export const READY_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'ready').map((definition) => definition.key);
export const MISSING_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'missing').map((definition) => definition.key);
