# Mission Authoring Harness

このツールは `content/gameplay` の mission authoring 用 CLI です。依存は Node.js built-in API のみです。

## 基本

一覧:

```sh
node tools/mission-authoring/mission-authoring.mjs list missions
node tools/mission-authoring/mission-authoring.mjs list transmissions
node tools/mission-authoring/mission-authoring.mjs list chunks
node tools/mission-authoring/mission-authoring.mjs list enemies
node tools/mission-authoring/mission-authoring.mjs list bullet-patterns
```

安全に試す場合は `content/gameplay` を一時ディレクトリへコピーして `--gameplay-dir` を指定します。

```sh
node tools/mission-authoring/mission-authoring.mjs wave add \
  --gameplay-dir /tmp/gameplay \
  --mission mission_good_morning \
  --at-ms 56000 \
  --intent-tag draft-wave \
  --entries-json '[{"enemyId":"enemy_scout","spawnPointId":"spawn_top_center","seed":200}]'
```

## 編集

- `wave add|update|delete`
- `enemy-spawn add|update|delete`
- `hazard add|update|delete`
- `beat add|update|delete`

`hazard` と `beat` は `--json` に追加または更新する object を渡します。削除は `--hazard-id` または `--beat-id` を指定します。

## 検査

既存の npm scripts を呼びます。

```sh
node tools/mission-authoring/mission-authoring.mjs manifest
node tools/mission-authoring/mission-authoring.mjs manifest --check
node tools/mission-authoring/mission-authoring.mjs validate
```

## Preview Fixture

既存 mission から authoring review 用の固定 JSON を生成します。

```sh
node tools/mission-authoring/mission-authoring.mjs preview-fixture --mission mission_good_morning
```

既定の出力先は `tools/mission-authoring/fixtures/<missionId>.preview.json` です。
