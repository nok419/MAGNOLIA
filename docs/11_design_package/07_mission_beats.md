# mission beats

mission 固有の見せ方は、Web 側の TypeScript 分岐ではなく content で表します。

# mission_good_morning

- 0 から 7 秒: 起動、移動確認。wave は出さない。
- 7 から 17 秒: main の確認。`main-confirmation-*` の wave で前方ノイズ源を少数にする。
- 17 から 23 秒: 近接攻撃の確認。`melee-confirmation` の wave を置く。
- 23 から 30 秒: sub の確認。新規 wave を置かず、敵弾を増やさない。
- 30 から 37 秒: 被弾ノイズの確認。`hit-noise-confirmation-safe` で失敗しても大きく壊れない量にする。
- 37 から 44 秒: magnetic disaster。hazard の予兆と継続ノイズを見せる。
- 44 から 55 秒: 探索へ戻る準備。`return-to-explore-preparation` で敵を少数にする。

# mission_where_are_you

duration は 90 秒を維持します。既存の本文が 85 秒まであるため、45 から 65 秒へ圧縮すると本文の削除または高速化が必要になります。今回は話者ごとの性格差を wave の `intentTag` と hazard timing で分けます。

- カナ: `kana-*`。弱い scout を中心にし、返事を強要しない区間にする。
- タクミ: `takumi-*`。左右から流れる standard と hazard で公共経路の混乱を出す。
- ミサキ: `misaki-*`。heavy と hazard で fragment 回収の圧力を上げる。
- 最後の「絶対。」: `protect-final-word`。短いが守る価値の高い区間として、終盤 wave を分ける。

# mission_evacuation

本文は 55.7 秒まであるため、空白を埋める目的の敵追加はしません。壊れた公共放送として、`broken-public-broadcast-*`、`broadcast-collapse`、`fragment-recovery-window` を使い、後半は fragment 回収で一部が戻る前提にします。
