export const SOUND_ASSET_IDS = {
  PLACEHOLDER_SHOT: 'asset.placeholder.shot',

  // 追加例:
  // UI_CURSOR: 'asset.ui.cursor',
  // UI_CONFIRM: 'asset.ui.confirm',
  // PLAYER_SHOT: 'asset.combat.playerShot',
  // BGM_MISSION_01: 'asset.bgm.mission01',
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
  COMBAT_RELOAD: 'combat.reload',
  COMBAT_NO_AMMO: 'combat.noAmmo',
  COMBAT_EXPLOSION: 'combat.explosion',

  EQUIPMENT_SWITCH: 'equipment.switch',
  EQUIPMENT_USE: 'equipment.use',

  BARRIER_UP: 'barrier.up',
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
export type SoundPriority = 'P0A' | 'P0B' | 'P1' | 'P2';
export type SoundImplementationStatus = 'placeholder' | 'ready' | 'missing';

export type SoundAssetDefinition = {
  id: SoundAssetId;
  url: string;
  description: string;
  temporary?: boolean;
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

// 現段階で実際に鳴らしてよい仮音源は、このショット音だけです。
// ブラウザ配信と release artifact の正本にするため、音源は apps/web/public/sound/ に置きます。
export const PLACEHOLDER_SHOT_MP3_URL = '/sound/shot-placeholder.mp3';

export const SOUND_ASSETS: readonly SoundAssetDefinition[] = [
  {
    id: SOUND_ASSET_IDS.PLACEHOLDER_SHOT,
    url: PLACEHOLDER_SHOT_MP3_URL,
    description: '仮置き: shot-placeholder.mp3。P0A の基本操作音だけに使う。BGM/ループ/未収集音には使わない。',
    temporary: true,
  },
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

const placeholderEvent = (
  key: SoundKey,
  category: SoundCategory,
  defaultVolume: number,
  priority: SoundPriority,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, defaultVolume, priority, 'placeholder', SOUND_ASSET_IDS.PLACEHOLDER_SHOT, options);

const missingEvent = (
  key: SoundKey,
  category: SoundCategory,
  defaultVolume: number,
  priority: SoundPriority,
  options: EventOptions = {},
): SoundEventDefinition => event(key, category, defaultVolume, priority, 'missing', undefined, options);

export const SOUND_EVENTS: readonly SoundEventDefinition[] = [
  // P0A: 最初に shot-placeholder.mp3 で鳴らしてよい基本操作音。ここだけ仮音源を許可する。
  placeholderEvent(SOUND_KEYS.UI_MENU_UP, 'ui', 0.24, 'P0A', { cooldownMs: 35, polyphony: 2, detuneRange: 40, description: 'メニューカーソル上移動' }),
  placeholderEvent(SOUND_KEYS.UI_MENU_DOWN, 'ui', 0.24, 'P0A', { cooldownMs: 35, polyphony: 2, detuneRange: 40, description: 'メニューカーソル下移動' }),
  placeholderEvent(SOUND_KEYS.UI_MENU_LEFT, 'ui', 0.2, 'P0A', { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'スライダー/選択肢左' }),
  placeholderEvent(SOUND_KEYS.UI_MENU_RIGHT, 'ui', 0.2, 'P0A', { cooldownMs: 35, polyphony: 2, detuneRange: 30, description: 'スライダー/選択肢右' }),
  placeholderEvent(SOUND_KEYS.UI_CONFIRM, 'ui', 0.32, 'P0A', { cooldownMs: 60, polyphony: 3, description: '決定' }),
  placeholderEvent(SOUND_KEYS.UI_CANCEL, 'ui', 0.26, 'P0A', { cooldownMs: 60, polyphony: 3, description: '戻る/キャンセル' }),
  placeholderEvent(SOUND_KEYS.UI_OPEN, 'ui', 0.22, 'P0A', { cooldownMs: 80, polyphony: 2, description: 'UIを開く' }),
  placeholderEvent(SOUND_KEYS.UI_CLOSE, 'ui', 0.2, 'P0A', { cooldownMs: 80, polyphony: 2, description: 'UIを閉じる' }),
  placeholderEvent(SOUND_KEYS.UI_ERROR, 'ui', 0.32, 'P0A', { cooldownMs: 120, polyphony: 1, description: '選択不可/エラー' }),
  placeholderEvent(SOUND_KEYS.TITLE_NEW_GAME, 'ui', 0.38, 'P0A', { cooldownMs: 300, polyphony: 1, description: 'New Game 決定' }),
  placeholderEvent(SOUND_KEYS.COMBAT_PLAYER_SHOT, 'sfx', 0.45, 'P0A', { cooldownMs: 30, polyphony: 6, detuneRange: 25, description: 'プレイヤー射撃' }),
  placeholderEvent(SOUND_KEYS.COMBAT_PLAYER_HIT, 'sfx', 0.52, 'P0A', { cooldownMs: 100, polyphony: 3, description: 'プレイヤー被弾' }),
  placeholderEvent(SOUND_KEYS.BARRIER_UP, 'sfx', 0.42, 'P0A', { cooldownMs: 280, polyphony: 1, description: 'バリア展開' }),
  placeholderEvent(SOUND_KEYS.BARRIER_HIT, 'sfx', 0.4, 'P0A', { cooldownMs: 60, polyphony: 4, detuneRange: 35, description: 'バリア被弾' }),
  placeholderEvent(SOUND_KEYS.BARRIER_BREAK, 'sfx', 0.55, 'P0A', { cooldownMs: 300, polyphony: 1, description: 'バリア破壊' }),

  // P0B: 早期に専用素材を入れたいが、未収集の間は無音にする。shot-placeholder.mp3 を流用しない。
  missingEvent(SOUND_KEYS.TITLE_LOAD_GAME, 'ui', 0.32, 'P0B', { cooldownMs: 200, polyphony: 1, description: 'Load Game 決定' }),
  missingEvent(SOUND_KEYS.MISSION_IN, 'sfx', 0.55, 'P0B', { cooldownMs: 500, polyphony: 1, description: 'ミッション突入' }),
  missingEvent(SOUND_KEYS.MISSION_OBJECTIVE_UPDATE, 'sfx', 0.36, 'P0B', { cooldownMs: 250, polyphony: 1, description: '任務目標更新' }),
  missingEvent(SOUND_KEYS.EXPLORE_STEP, 'sfx', 0.16, 'P0B', { cooldownMs: 110, polyphony: 2, detuneRange: 70, description: '2D探索の移動/足音' }),
  missingEvent(SOUND_KEYS.EXPLORE_SCAN, 'sfx', 0.34, 'P0B', { cooldownMs: 260, polyphony: 1, description: 'スキャン開始' }),
  missingEvent(SOUND_KEYS.EXPLORE_SCAN_HIT, 'sfx', 0.42, 'P0B', { cooldownMs: 220, polyphony: 1, description: 'スキャン反応あり' }),
  missingEvent(SOUND_KEYS.EXPLORE_ITEM_PICKUP, 'sfx', 0.36, 'P0B', { cooldownMs: 120, polyphony: 3, description: 'アイテム回収' }),
  missingEvent(SOUND_KEYS.EXPLORE_EQUIPMENT_PICKUP, 'sfx', 0.48, 'P0B', { cooldownMs: 240, polyphony: 1, description: '装備回収' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT, 'sfx', 0.34, 'P0B', { cooldownMs: 30, polyphony: 8, detuneRange: 35, description: '敵弾/敵射撃の基本音' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_HIT, 'sfx', 0.34, 'P0B', { cooldownMs: 45, polyphony: 6, description: '敵への命中' }),
  missingEvent(SOUND_KEYS.COMBAT_NO_AMMO, 'sfx', 0.28, 'P0B', { cooldownMs: 170, polyphony: 1, description: '弾切れ' }),
  missingEvent(SOUND_KEYS.BGM_TITLE, 'bgm', 0.38, 'P0B', { loop: true, polyphony: 1, description: 'タイトルBGM。仮ショット音では鳴らさない' }),
  missingEvent(SOUND_KEYS.BGM_EXPLORATION, 'bgm', 0.34, 'P0B', { loop: true, polyphony: 1, description: '探索BGM。仮ショット音では鳴らさない' }),
  missingEvent(SOUND_KEYS.BGM_COMBAT, 'bgm', 0.38, 'P0B', { loop: true, polyphony: 1, description: '戦闘BGM。仮ショット音では鳴らさない' }),

  // P1: ミッション別BGM、敵弾種別、装備、無線などの精密化。
  missingEvent(SOUND_KEYS.BGM_MISSION_DEFAULT, 'bgm', 0.36, 'P1', { loop: true, polyphony: 1, description: 'ミッション汎用BGM' }),
  missingEvent(SOUND_KEYS.BGM_MISSION_BOSS, 'bgm', 0.42, 'P1', { loop: true, polyphony: 1, description: 'ミッション/ボスBGM' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_FAST, 'sfx', 0.3, 'P1', { cooldownMs: 25, polyphony: 10, detuneRange: 30, description: '高速敵弾' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_HEAVY, 'sfx', 0.42, 'P1', { cooldownMs: 80, polyphony: 4, detuneRange: 20, description: '重い敵弾/砲撃' }),
  missingEvent(SOUND_KEYS.COMBAT_ENEMY_SHOT_LASER, 'sfx', 0.36, 'P1', { cooldownMs: 60, polyphony: 4, description: 'レーザー/ビーム系敵弾' }),
  missingEvent(SOUND_KEYS.COMBAT_RELOAD, 'sfx', 0.38, 'P1', { cooldownMs: 240, polyphony: 1, description: 'リロード/チャージ' }),
  missingEvent(SOUND_KEYS.COMBAT_EXPLOSION, 'sfx', 0.65, 'P1', { cooldownMs: 90, polyphony: 3, description: '爆発/大きなヒット' }),
  missingEvent(SOUND_KEYS.EQUIPMENT_SWITCH, 'sfx', 0.34, 'P1', { cooldownMs: 120, polyphony: 1, description: '装備切替' }),
  missingEvent(SOUND_KEYS.EQUIPMENT_USE, 'sfx', 0.42, 'P1', { cooldownMs: 160, polyphony: 2, description: '装備使用' }),
  missingEvent(SOUND_KEYS.BARRIER_LOOP, 'sfx', 0.12, 'P1', { loop: true, polyphony: 1, description: 'バリア稼働ループ。専用素材が入るまで無音' }),
  missingEvent(SOUND_KEYS.VOICE_RADIO_BLIP, 'voice', 0.28, 'P1', { cooldownMs: 120, polyphony: 1, description: '無線ボイス前後のブリップ' }),
  missingEvent(SOUND_KEYS.VOICE_OBJECTIVE, 'voice', 0.36, 'P1', { cooldownMs: 300, polyphony: 1, description: '任務音声/疑似ボイス' }),
  missingEvent(SOUND_KEYS.NOISE_RADIO_STATIC, 'noise', 0.13, 'P1', { loop: true, polyphony: 1, description: '無線ノイズ/環境ノイズ' }),
  missingEvent(SOUND_KEYS.NOISE_LOW_HP, 'noise', 0.18, 'P1', { loop: true, polyphony: 1, description: '低体力時ノイズ/鼓動' }),

  // P2: 演出・探索差分。ここも専用素材が入るまで無音。
  missingEvent(SOUND_KEYS.MISSION_CLEAR, 'sfx', 0.58, 'P2', { cooldownMs: 500, polyphony: 1, description: 'ミッションクリア' }),
  missingEvent(SOUND_KEYS.MISSION_FAIL, 'sfx', 0.5, 'P2', { cooldownMs: 500, polyphony: 1, description: 'ミッション失敗' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_OPEN, 'sfx', 0.4, 'P2', { cooldownMs: 240, polyphony: 1, description: 'ドア/ゲート開放' }),
  missingEvent(SOUND_KEYS.EXPLORE_DOOR_LOCKED, 'sfx', 0.36, 'P2', { cooldownMs: 240, polyphony: 1, description: 'ロック中のドア' }),
];

export const SOUND_EVENT_BY_KEY = Object.fromEntries(SOUND_EVENTS.map((definition) => [definition.key, definition])) as Record<SoundKey, SoundEventDefinition>;

export const PLACEHOLDER_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'placeholder').map((definition) => definition.key);
export const MISSING_SOUND_KEYS = SOUND_EVENTS.filter((definition) => definition.status === 'missing').map((definition) => definition.key);
