# 水面スポイトの検証記録

## 実装と対象

- 色選択シートの「スポイトで水面から色を選ぶ」でシートを閉じ、水面上のタップ／クリックを次のインク色にする。採色後は通常の描画操作に戻る。画面外は採色せず待機し、中止ボタン／Escで元の色のまま終了できる。
- キーボードでは水面へフォーカスを移し、矢印キーでマーカーを移動（Shiftで微調整）、Enterで採色。選択結果と案内は既存の読み上げ領域にも表示する。
- 既存の `toSurface` 変換でズーム・パンを考慮する。WebGLの現在表示中のテクスチャから1画素だけ取得し、上下方向を変換する。水で薄まった部分は背景色とアルファ合成する。水面の画素やUndo履歴は変更しない。画面外は画像ではなくUI背景なので採色しない。
- 追加依存はなし。外部画面を対象にするブラウザの `EyeDropper` APIは利用しないため、同APIが使えないブラウザでも水面内の採色ができる。

## Modern Web Guidance と互換性

変更前に `.agents/skills/modern-web-guidance/SKILL.md` を読み、`pick color eyedropper` と `sample screen color` を検索した。専用のスポイト／EyeDropperガイドは見つからなかったため、`color`、`accessibility`、`natural-interactions` を取得して全文を確認した。

| ガイド | 採用内容・互換性の判断 |
|---|---|
| `color` | 採色モードを色だけで示さず、テキスト、マーカー、中止ボタンを表示する。強制配色モードではマーカーと案内の境界をシステム色で示す。 |
| `accessibility` | ネイティブのボタンとキーボード操作、視認できるフォーカス、既存の `aria-live="polite"` を利用。描画キャンバスの `touch-action: none` は描画面のため維持する。 |
| `natural-interactions` | 操作はタップ・クリック・キー操作のどれでも開始・採色・中止できる。フォーカスの表示は既存の `:focus-visible` を維持する。Popoverなど今回使用しない非Widely-available APIのフォールバックは不要。 |

## 検証

```sh
npm test
npm run build
npm run test:e2e -- --reporter=line
MSL_TEST_BROWSER=webkit npm run test:e2e -- e2e/eyedropper.spec.ts --reporter=line
```

単体19件、本番ビルド、Chromiumの既存テストを含む33件、WebKitのスポイト3件が成功。採色による画素・操作履歴の不変、ズーム・パン後の位置、背景色、キーボードとEsc、薄いインクの背景合成、水面外の無効化、狭い画面でのタッチ採色を検証した。実機のタッチ・スタイラスは未検証。
