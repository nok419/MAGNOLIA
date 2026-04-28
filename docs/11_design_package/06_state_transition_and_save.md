# state transition and save normalizer

# command table

| command | precondition | mutation | events | persistence | UI がしてはいけない判断 |
| --- | --- | --- | --- | --- | --- |
| `startMission` | transmission が解放済み、mission が開始可能 | session が battle state を初期化 | transition、mission start | run 開始は repository へ渡す | mission ID で敵や報酬を推測しない |
| `completeMission` | battle が clear 条件を満たす | analysis、報酬、clear 記録を更新 | mission clear、reward、fragment | profile、mission run、archive を保存 | 報酬装備を UI 側で直接付与しない |
| `interactExploreNode` | node が visible かつ access 可能 | node 種別に応じて session が遷移 | transition、collectible、repair | collectible や area 進行を保存 | node ID で画面側が効果を分岐しない |
| `equipItem` | equipment が所持済みで slot が一致 | equippedItems を更新 | equipment changed | profile を保存 | 装備効果を UI 側で適用しない |
| `purchaseEquipment` | visible、購入可能、selfRepairPoint が足りる | equipment 所持、point 減少 | equipment purchased | profile を保存 | 価格を UI 側だけで確定しない |
| `upgradeEquipment` | 所持済み、maxLevel 未満、point が足りる | level 上昇、point 減少 | equipment upgraded | profile を保存 | level cap を UI 側だけで判断しない |
| `saveToSlot` | profile が存在する | slot summary と profile を更新 | saved | slot、profile、settings を保存 | slot 表示だけを更新して保存済みに見せない |
| `openArchive` | profile が存在する | 既読状態を更新する場合のみ mutation | archive opened | seen 状態を保存する場合は repository 経由 | content bundle から未発見情報を推測しない |
| `changeSetting` | setting key が許容値 | settings を更新 | setting changed | settings を保存 | reduceFlashing / lowFrameRateMode を無視した演出を出さない |

# save normalizer 確認項目

- 古い save を import して現行 schema に normalize できる。
- 削除された equipment ID は `migrated-id-map.json` で代替するか、安全に無効化する。
- enemy、projectile、mission ID の変更は原則 save に影響させない。影響する場合は migration を追加する。
- seen equipment は現状 localStorage 由来の UI 状態と profile 状態が混在しやすいため、保存先を変更する場合は移行手順を書く。
- export / import 後に slot summary、profile、archive、equipment、settings が一致する。

package 側の実装修正が必要な場合は、contracts、loader validation、session、UI の順で変更します。
