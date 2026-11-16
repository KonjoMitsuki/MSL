# UI検証記録

## 水面中心のエディタ

- Modern Web Guidance `responsive-design` / `css-layout`: `100dvh` と正方形の `aspect-ratio` で、水面を表示可能な領域まで拡大。スクロールバーを含む `100vw` は使わず、横幅は親領域から決める。動的ビューポート単位と `aspect-ratio` は広く対応しており、旧来の表示領域には `100vh` を先に指定。
- `form-factor-adaptation` / `accessibility`: 文字を削ったボタンは `aria-label` と `title` を残し、SVGを装飾扱いにする。タッチ対象は44px以上、フォーカス輪郭とセーフエリアを維持。詳細な説明は視覚的に隠して支援技術から読めるようにし、細かい設定は既存のdialog内に残す。
- `icons`: 外部アイコンライブラリは増やさず、少数のSVGをインラインで描画して `currentColor` に追従させる。CSSの新しいスタイルクエリへの依存はない。
- `toolbar`: ツール列は既存のナビゲーションと個別のボタンのまま維持。`role="toolbar"` / `focusgroup` を付ける場合に必要となる矢印キー操作と非対応ブラウザ用のロービングフォーカスを実装しないまま、見た目だけをツールバーと呼ばない。
- 確認: `npm run build` 成功、`npm test` 19件成功、`npm run test:e2e` 30件成功。スマートフォン・横画面・PCで正方形、操作の到達性、切り抜き・描画の回帰を確認。自動計測の性能JSONは実行環境依存のため変更しない。
