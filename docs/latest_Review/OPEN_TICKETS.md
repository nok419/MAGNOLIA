# OPEN_TICKETS

作成日: 2026-04-29

## 現在の open ticket

### T-01: CI 実行結果の共有
何が問題か:
- `.github/workflows/ci.yml` は追加済みですが、remote 上の実行結果はこのローカル作業内では確認していません。

なぜ問題か:
- GitHub Actions の環境差で `npm ci` や Node.js version 周辺の差が出る可能性があります。

どうすべきか:
- push 後に pull request の CI 結果を確認します。

改善後にどう変化するか:
- clean clone 相当の検証結果をチームで共有できます。

### T-02: source archive の配布運用
何が問題か:
- `npm run archive:source` は追加済みですが、配布ファイル名や置き場はチーム運用として未確定です。

なぜ問題か:
- 配布先が固定されないと、CI artifact と source archive が混ざる可能性があります。

どうすべきか:
- 既定出力 `artifacts/magnolia-source.zip` を使うか、CI artifact 名に合わせるかを決めます。

改善後にどう変化するか:
- レビュー配布物が source / content / docs 中心に揃います。

### T-03: prototype content の削除判断
何が問題か:
- `a1`、`a2`、`b1`、`c1` と未使用 bullet pattern は prototype として残しています。

なぜ問題か:
- prototype として残す限り、validator と docs の管理対象には残ります。

どうすべきか:
- 今後も検証 fixture として使うか、削除するかを design / gameplay 側で決めます。

改善後にどう変化するか:
- active content の調整対象がさらに明確になります。
