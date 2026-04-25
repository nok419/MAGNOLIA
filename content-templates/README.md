# content-templates

このディレクトリは下書き用です。

- ここにあるファイルは `.jsonc` です
- 日本語コメントを付けているため、そのまま runtime 用の `content/` へは置きません
- 実データ化する時は、この template を複製して `.json` にし、コメントを外して使います

使い方:

1. template を複製する
2. `TODO` の値を実データで埋める
3. 参照 ID を他ファイルとそろえる
4. runtime 用の `content/` 配下へ `.json` として配置する

注意:

- `transmissionId` と `missionId`
- `equipmentId` と `effectId`
- `areaId` と map node の `areaId`
- `conditionId`

この 4 系統は相互参照が多いため、命名規則を途中で変えない方が安全です。

装備について:

- 装備カテゴリは `main` `sub` `os` `subsystem` の 4 つです
- `subsystem` だけは 2 枠装備できます
- 同じ `effectId` を複数装備から参照してよい設計です
- `subsystem` の特殊発火を使う時は、effect 側に `hookKind` を追加します

広域環境 hazard について:

- 汎用システム名は `BattlefieldHazard` です
- 現行の concrete kind は `magneticDisaster` です
- ゲーム内の呼称は「磁気災害」を想定しています
