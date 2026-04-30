# active content

現在の playable slice で使用する content は `content/gameplay/content-classification.json` の `active` に列挙します。

実ファイルは従来の `missions`, `enemies`, `bullet-patterns`, `projectiles` に置きます。追加後は `npm run content:manifest` を実行し、`npm run content:validate` で manifest と active lifecycle の整合性を確認します。
