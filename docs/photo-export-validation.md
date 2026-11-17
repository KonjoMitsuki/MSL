# 写真へのPNG保存の検証

対象: v0.7.1（当時の検証記録）。変更前のmainは `0e3aee3`。v0.7.2ではファイル保存を削除したため、最新の仕様は [写真保存への統一](photo-only-validation.md) を参照。

## 保存方法と互換性

- 「写真に保存・共有」は既存のPNG生成処理で画像を作り、実画像の `File` をプレビューする。全体画像と切り抜き画像の両方に対応。
- `navigator.share` と `navigator.canShare({ files: [file] })` で、そのPNGを共有できることを確認する。APIがない、falseを返す、例外を投げる場合もプレビューを残し、画像を長押しする手順を表示する。ユーザーエージェントによる判定はしない。
- 共有ボタンを押してから `navigator.share({ files: [file] })` までに画像生成などの非同期処理を挟まない。Safariのtransient user activationの期限切れを避けるため、PNGの準備と共有操作を分けた。
- URLやページのタイトルではなく `image/png` のファイルだけを共有する。iOSの共有メニューで「画像を保存」を選ぶと「写真」に入る。アプリ側から「写真」への書き込みや保存完了の判定はできない。
- キャンセルと共有エラーはプレビュー内に表示して再試行できるようにし、勝手にダウンロードを始めない。「PNGをファイルに保存」「切り抜きPNG」の既存ダウンロード経路も維持。
- プレビューはCanvasではなくPNGを参照する `img`。長押しメニューを禁止せず、プレビューを閉じるとObject URLを解放する。
- 既存の標準dialog内にプレビューを表示し、見出しにフォーカスを移す。「書き出し方法に戻る」では呼び出しボタンへフォーカスを戻す。

## Modern Web Guidance

`.agents/skills/modern-web-guidance/SKILL.md` に従い、2026-11-17に `share image files` と `Web Share API` を検索した。検索結果には画像ファイルの共有に対応するガイドがなかったため、無関係なガイドは取得・適用していない。

APIと互換性の判断には次の公式資料を参照した。

- [MDN: Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share): ファイル対応の検出、ユーザー操作、キャンセルと失敗の区別。
- [MDN: Navigator.canShare](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare): HTTPSと実際の共有データによる機能検出。
- [WebKit: The User Activation API](https://webkit.org/blog/13862/the-user-activation-api/): 非同期処理の間にtransient activationが切れること。

## 検証範囲

| 確認 | 結果 |
| --- | --- |
| `npm run build` | 成功（v0.7.1） |
| `npm test` | 19件成功 |
| Chromium 159: 写真保存のE2E | 新規7件成功 |
| Chromium 159: 既存のPNG・切り抜き・背景合成・シート操作 | 4件成功 |
| WebKit 27.2: 写真保存のE2E | 新規7件成功 |
| 390×844の画面 | [プレビュー画像](photo-export-mobile.png)を目視確認 |

WebKitは環境に不足していたDebianライブラリを一時領域に展開し、ユーザー領域のブラウザから参照させて実行した。`libGLESv2` はシステムのライブラリ一覧に載らないため、解決先を確認したうえで `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` により事前の一覧検査だけを省いた。ブラウザ本体とPNG生成・操作テストは実行している。

`e2e/photo-export.spec.ts` では共有APIをスタブし、実際に生成したPNGファイルとUIの接続を検証する。OSの共有メニューは自動テストで操作していない。

- 共有ファイルのMIME、ファイル名、512×512の全画素が元の水面と一致すること。
- PNG生成の完了だけでは共有が起きず、次のクリックで有効なuser activationがある間に共有APIを呼ぶこと。共有中の連打を防ぐこと。
- ファイル共有APIの欠如、非対応、例外でプレビューと長押し案内が使えること。
- プレビューから明示的にダウンロードしたPNGの全バイトがプレビューと一致すること。
- 共有のキャンセル・権限エラーではダウンロードせず、再試行できること。
- 切り抜きの共有ファイルが320×180のPNGで、プレビューの全バイトと一致すること。
- 320px、390pxの画面幅と844×390の横画面で横スクロールせず、保存ボタンに到達できること。
- プレビューを閉じる・戻る際のObject URL解放とフォーカス移動。

iPhone実機の「画像を保存」、写真ライブラリへの追加、アプリ内ブラウザごとの長押しメニューは未検証。Playwright WebKitの結果はiOS実機の共有メニュー検証を意味しない。
