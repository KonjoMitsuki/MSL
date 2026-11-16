# 水面の長押し操作の検証

- 対象: スマートフォンで水面を押し続けて滴下するとき、文字選択や長押しメニューが出ないこと。
- Modern Web Guidance: `prevent touch text selection` / `disable long press selection` を検索したが専用ガイドは見つからず、`css` を参照。「Write selectors in a way that expresses _intent_.」に従い、水面の `.canvas-frame` にだけ選択抑止を適用し、説明文や設定画面の文字選択は残した。
- 互換性: `user-select: none` と Safari 向けの `-webkit-user-select: none` / `-webkit-touch-callout: none` を併記。キャンバス上の `contextmenu` のみ抑止し、他の場所の右クリックは維持。既存の `touch-action: none` と Pointer Events の押下・ピンチ処理は変更しない。
- 確認: `npm run build`、`npm test`（19件）、Chromium のモバイル・タッチエミュレーションで長押し滴下、選択範囲なし、コンテキストメニュー抑止、指を離した後の履歴1件、および説明文の選択可能状態を検証。実機の Safari / Android ブラウザは未確認。
