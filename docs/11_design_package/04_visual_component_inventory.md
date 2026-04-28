# 05 現行ビジュアルコンポーネント棚卸し

作成日: 2026-04-28
目的: 現在利用可能な描画コンポーネント、エフェクト、UI 表現を整理し、重複と不足を確認する。

## 0. サマリ

現行実装は、個別の描画部品はかなり多い。問題は「部品が足りない」よりも、「部品の分類と再利用規則が不足している」ことにある。

大きな重複は次の通り。

- グリッチ / ノイズ / 歪み
  - title, battle hazard, subtitle, archive, menu scanline が独自に持っている。
- 粒子 / motes / dust
  - battle background, explore trail, title backdrop, menu backdrop, projectile, pickup が独自に持っている。
- ring / arc / scan
  - enemy, projectile, barrier, support field, minimap, scan pulse, reboot, boundary release が広く使っているが、意味分類がない。
- glow / pulse
  - button, badge, reward, projectile, panel, title, interaction prompt がそれぞれ別 motion を持つ。
- UI panel / card / data row
  - menu, archive, settings, battle HUD, map screen で似た役割の部品が統一されていない。

不足しているものは次の通り。

- 全体共通の visual token。
- Canvas 用 effect primitive。
- `SignalDistortion` の正本。
- mode transition 専用 layer。
- mission visual profile。
- visual QA 用の固定 render states。

## 1. Canvas renderer inventory

| component | source | 現在の役割 | 評価 | 対応 |
| --- | --- | --- | --- | --- |
| battle background | `components/battle-renderer.ts:166` | 戦闘背景の gradient, grid, particles | 汎用 SF 背景に見える。通信空間の意味が弱い | `drawSignalSpaceBackground` に置換 |
| player ship | `components/battle-renderer.ts:292`, `app/ship-renderer.ts` | 自機描画 | 一元化されていて良い | 維持。被弾時は silhouette を崩さない |
| enemy visual profiles | `components/battle-renderer.ts:371` | 丸ベース敵機の profile | 良い核。MAGNOLIA らしい | 正本として維持 |
| enemy renderer | `components/battle-renderer.ts:423` | 敵機描画 | 良い。強敵差分は整理余地あり | profile 名に意味 role を追加 |
| enemy projectile registry | `components/battle-renderer.ts:1046` | projectileId から描画分岐 | 種類はあるが意味分類が不足 | projectile visual role を追加 |
| noise orb projectile | `components/battle-renderer.ts:1062` | 基本敵弾 | 良い。ユーザー評価も高い | 正本として維持 |
| geo diamond projectile | `components/battle-renderer.ts:1150` | 幾何学弾 | fragment / packet と意味衝突しやすい | packet role として再定義 |
| enemy lance projectile | `components/battle-renderer.ts:1203` | 方向性のある弾 | 可読性の利点あり | directed interference として使う |
| boss core projectile | `components/battle-renderer.ts:1264` | boss / pressure 弾 | ring / core の意味が分かる | overload / pressure 専用へ |
| signal shard projectile | `components/battle-renderer.ts:1331` | shard 弾 | archive fragment と混同しやすい | fragment ではなく interference shard と命名整理 |
| battle pickup | `components/battle-renderer.ts:1405` | 戦闘中 pickup | fragment 表現と近い | FragmentGlyph へ統合 |
| battle fragment | `components/battle-renderer.ts:1442` | 通信断片 | concept と合う | FragmentGlyph の正本候補 |
| barrier gauge | `components/battle-renderer.ts:1525` | バリア表示 | やや gamey / 強い glow | MetricMeter + FieldRing へ再整理 |
| support field | `components/battle-renderer.ts:1676` | sub arm field | ring 系と重複 | FieldRing primitive へ |
| silent wave field | `components/battle-renderer.ts:1718` | 静音域 | concept は良い | FieldRing / ScanPulse の変種へ |
| hazard | `components/battle-renderer.ts:1786` | 磁気干渉・危険領域 | glitch が過密で重複の中心 | SignalDistortion へ集約 |
| magnetic storm noise | `components/battle-renderer.ts:2122` | hazard 内ノイズ | hazard 専用になりすぎ | NoiseFog primitive へ |
| explore background | `components/ExploreCanvas.tsx:340` | 探索背景 | 良い要素はあるが primitive 化不足 | SignalSpace primitive を共有 |
| fog grid | `components/ExploreCanvas.tsx:422` | fog bitmap 表示 | 機能的 | 未探索を情報密度で見せる方向へ |
| vision fog | `components/ExploreCanvas.tsx:466` | 視界境界 | concept に合う | 維持しつつ token 化 |
| vision scanner overlay | `components/ExploreCanvas.tsx:528` | 探索 scan | ScanPulse と重複 | ScanPulse primitive へ |
| vision sweep | `components/ExploreCanvas.tsx:552` | sweep 表現 | scan 系 | ScanPulse / CarrierLine へ |
| vision ripples | `components/ExploreCanvas.tsx:590` | ripple | ring 系 | ScanRing 分類へ |
| explore scan pulse layer | `components/ExploreCanvas.tsx:1048` | scanPulses 表示 | 良い。正本候補 | ScanPulse に抽出 |
| signal hint layer | `components/ExploreCanvas.tsx:1088` | 近接ヒント | concept に合う | 通信ノード attraction として整理 |
| reboot sequence | `components/ExploreCanvas.tsx:1175` | reboot movie | 良い。MAGNOLIA らしい | transition primitive へ抽出 |
| reboot ambient | `components/ExploreCanvas.tsx:1464` | ambient glow | 良い | SoftBloom / ambient へ |
| reboot construction | `components/ExploreCanvas.tsx:1847` | 機体構築 | 良い | mode transition に応用 |
| explore trail | `components/ExploreCanvas.tsx:2592` | 自機軌跡 | 良いが粒子系と重複 | ResidualTrail 正本候補 |
| trail ornaments | `components/ExploreCanvas.tsx:2721` | 軌跡装飾 | 良いが整理必要 | ResidualTrail sub-layer へ |
| light motes | `components/ExploreCanvas.tsx:2809` | trail motes | particle 系 | SignalParticleField / ResidualTrail へ |
| restricted boundary | `components/ExploreCanvas.tsx:2875` | 境界 | concept 良い | boundary family として残す |
| boundary release | `components/ExploreCanvas.tsx:3091` 以降 | 解放演出 | 良い | transition primitive として再利用 |
| nav cue layer | `components/ExploreCanvas.tsx:3431` | 方向案内 | UI / map marker 系 | Focus / marker primitive へ |
| minimap | `components/MiniMap.tsx` | 探索済み表示・radar | 情報量は良いが ring 文法と重複 | map 専用 ring style を定義 |
| canvas markers | `app/canvas-markers.ts` | 通信/収集 icon | diamond / glyph 系 | Fragment / Marker primitive へ |
| title backdrop | `components/title/SignalBackdropCanvas.tsx` | title particles / lines | 良いが独自実装 | SignalParticleField へ |
| menu backdrop | `screens/menu/MenuBackdropCanvas.tsx` | menu particles | 簡素で他モードと断絶 | SignalParticleField + CarrierLine へ |

## 2. CSS motion inventory

| file | keyframes | 評価 | 対応 |
| --- | ---: | --- | --- |
| `base.css` | 8 | 基本 keyframes があるが、Canvas motion と接続していない | motion token 化 |
| `explore.css` | 10 | boot 系が多い。演出は良いが個別名が多い | intent 別に整理 |
| `interaction-prompt.css` | 6 | prompt 専用 motion が多い | ScanPulse / FocusBracket に寄せる |
| `menu-equipment.css` | 4 | badge / glow / scan / spin が menu 内で独自 | menu motion を削減 |
| `battle.css` | 3 | reward 系。勝利感が強くなりやすい | archive capture へ再設計 |
| `explore-map.css` | 3 | reboot settle / scanline / help | token 化 |
| `overlays-keyvisual.css` | 1 | key visual 専用 | 維持可 |

総 keyframes は少なすぎるわけではない。問題は、keyframe が「何の motion intent か」ではなく「画面ごとの名前」で増えていること。

## 3. Content inventory

### projectiles

| projectile | side | speed | noiseDamage | visualPreset | 評価 |
| --- | --- | ---: | ---: | --- | --- |
| `proj_enemy_basic` | enemy | 80 | 0.08 | `vis_bullet_enemy_basic` | 基本敵弾。維持 |
| `proj_enemy_core` | enemy | 54 | 0.12 | `vis_bullet_enemy_core` | pressure / overload 専用へ |
| `proj_enemy_geo` | enemy | 70 | 0.07 | `vis_bullet_enemy_geo` | packet role へ |
| `proj_enemy_lance` | enemy | 92 | 0.075 | `vis_bullet_enemy_lance` | directed interference へ |
| `proj_enemy_petal` | enemy | 60 | 0.06 | `vis_bullet_enemy_petal` | 花弁感に注意。多用しない |
| `proj_player_carrier` | player | 600 | 0 | `vis_bullet_player_carrier` | main として維持 |
| `proj_player_carrier_blast` | player | 0 | 0 | `vis_bullet_player_carrier_blast` | blast の見た目再整理 |
| `proj_player_pulse` | player | 400 | 0 | `vis_bullet_player_pulse` | signal wave として整理 |
| `proj_player_pulse_melee` | player | 200 | 0 | `vis_bullet_player_melee` | 局所静音化へ寄せる |

### bullet patterns

| pattern | kind | projectile | cadence | burst | 評価 |
| --- | --- | --- | ---: | ---: | --- |
| `bp_scout_single` | goldenStream | basic | 280 | 1 | 美しい流れの可能性。意味 role を追加 |
| `bp_standard_spread` | radial | petal | 2000 | 5 | 基本 spread。petal 多用に注意 |
| `bp_radial_burst` | radial | petal | 3200 | 13 | 模様として良いが mission beat と紐付ける |
| `bp_spiral_stream` | radial | geo | 260 | 3 | 弾幕美が出やすい。packet stream へ |
| `bp_heavy_burst` | radial | basic | 2000 | 12 | heavy noise として明確 |
| `bp_a2_lance_spread` | radial | lance | 1900 | 5 | directional pattern として良い |
| `bp_b1_core_burst` | radial | core | 3100 | 16 | boss pressure として良い |
| `bp_b1_lance_stream` | radial | lance | 360 | 3 | stream として良いが背景と衝突注意 |
| `bp_c1_pressure_ring` | radial | core | 2600 | 10 | pressure ring 正本候補 |

### missions

| mission | duration | waves | hazards | 視覚 profile 提案 |
| --- | ---: | ---: | ---: | --- |
| `mission_good_morning` | 60000 | 7 | 1 | sparse carrier wave / low density / soft reboot memory |
| `mission_where_are_you` | 90000 | 12 | 3 | interrupted arc / searching residue / mid density |
| `mission_evacuation` | 60000 | 16 | 3 | compression band / urgent but quiet / warning ticks |

## 4. 重複一覧

### グリッチ系

発見箇所:

- `battle-renderer.ts` hazard / magnetic storm
- `battle.css` subtitle corruption / reward motion
- `title.css` title glitch variables
- `MagnoliaLogo.tsx` glitch frames
- `archive-settings.css` archive settings visual effects
- `explore.css` boot noise flicker

判断:

- title glitch はタイトル固有として残せるが、通常ゲーム内の loss / desync / noise と混同しない。
- battle hazard と subtitle corruption は必ず統合する。
- archive 欠損も同じ `SignalDistortion` へ寄せる。

### 粒子系

発見箇所:

- battle background particles
- projectile motes
- pickup particles
- explore trail motes
- title background particles
- menu background particles

判断:

- `SignalParticleField` と `ResidualTrail` に分ける。
- gameplay collision に関わる projectile core は別扱い。

### ring / arc 系

発見箇所:

- enemy orbit
- enemy projectile ring
- barrier gauge
- support field
- silent wave
- minimap ring
- scan pulse
- reboot halo
- boundary release shockwave

判断:

- ring 自体は MAGNOLIA に合う。削るのではなく意味分類する。
- `core`, `scan`, `field`, `transition` の 4 種に分ける。

### glow / pulse 系

発見箇所:

- base glow pulse
- text glow
- border glow
- menu badge pulse
- reward glow
- key pulse
- interaction prompt pulse
- projectile glow

判断:

- glow は focus / active signal / projectile core のみに絞る。
- badge や通常 panel の glow は削減する。

## 5. 不足一覧

### Visual token

現在は CSS variables が `base.css` にあるが、Canvas は多くをハードコードしている。TS と CSS が同じ token を参照できないため、画面間で色が揺れる。

必要:

- `visual-tokens.ts`
- CSS custom properties の再定義
- lint / audit script

### Effect primitives

Canvas renderer が画面ごとに個別関数を持っている。抽出が必要。

必要:

- `drawSignalParticleField`
- `drawCarrierLineField`
- `drawSignalDistortion`
- `drawScanPulse`
- `drawResidualTrail`
- `drawFocusBracket`
- `drawMetricMeter`
- `drawFragmentGlyph`

### Mode transition

モード切替を視覚的に統一する layer がない。

必要:

- `ModeTransitionLayer`
- transition request payload
- reduced motion fallback

### Mission visual profile

mission ごとの色・背景・弾幕 role がデータ化されていない。

必要:

- `mission-visual-profiles.ts`
- または mission JSON の `visualProfileId`

### Visual QA harness

固定状態の screenshot 比較や lint がない。

必要:

- fixed render state
- screenshot capture
- color literal count
- keyframe list
- effect id list

## 6. 統合後の理想 inventory

最終的に、エフェクト一覧は次の 10 個程度に抑える。

1. `SignalParticleField`
2. `CarrierLineField`
3. `ScanPulse`
4. `SignalDistortion`
5. `SoftBloom`
6. `ResidualTrail`
7. `RingField`
8. `FocusBracket`
9. `MetricMeter`
10. `FragmentGlyph`
11. `ScreenVeilTransition`

これ以上の新規エフェクトが必要な場合は、まず既存 effect の parameter で表現できない理由を書いてから追加する。
