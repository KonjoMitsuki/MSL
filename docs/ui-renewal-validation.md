# MSL 0.7.0 UI刷新の検証記録

## 実装範囲

専用ブランチ `feat/mobile-editor-renewal` で実装。既存のWebGL2エンジン、GLSL、履歴、PNG生成処理は変更していない。UIの配置、色選択、シート、入力とフォーカスの接続を更新した。追加の実行時依存パッケージはない。

作業前にREADME、CHANGELOG、AGENTS、React画面、設定と色管理、Pointer Events、エンジン、描画・履歴・出力の構成、既存の単体テストとE2Eを確認した。変更前は単体19件・E2E24件・ビルドが成功した。

## Figmaの参照と差分

参照ファイル：[MSL / Interactive Mobile Prototype](https://www.figma.com/design/xLI0Wt7xhYw8cQcj0e5pUX)。Figma MCPでページ構造・寸法を取得し、以下のノードのデザインコードとスクリーンショットを参照した。

| ノード | 内容 | 実装への反映 |
|---|---|---|
| `7:2` | 390 × 844の滴下画面 | 濃紺の背景、ミント色の選択表示、水面、下部4ツール、半径調整 |
| `7:189` | 流体ペン | ツールに応じた案内と半径、強度と余韻の設定 |
| `7:325` | 変形ペン | 選択状態と水面を変形する操作 |
| `7:372` | 色選択シート | 円形の色相ボタン、現在色、HEX、色の一覧 |
| `7:406` | 流体設定シート | ブラシ半径、強さ、指を離した後の流れの時間 |
| `7:428` | 書き出しシート | 水面全体のPNGと切り抜きPNGの選択 |

`figma-use` でプロトタイプのクリック遷移も取得した。カラー→色選択→編集、流体→設定→流体、書き出し→保存完了、Undo/Redoの画面遷移を実際の状態変更・履歴操作・PNGダウンロードへ接続した。プロトタイプの設定ボタンが共通の流体設定へ移動する箇所は、選択中のツールに合った設定を開く。

主な配色は背景 `#0D131C`、シート `#1C2938`、ツールバー `#121B26`、選択色 `#ACEBD8`、選択背景 `#273649`。本文と補助文字の読みやすさを保つため、補助文字は `#A5B5C6` に調整した。

以下は意図した差分である。

- OSの時刻・電波表示・ホームインジケーター・端末外枠はWebページに描かず、実際のセーフエリアに対応する。
- 見本の水面画像は描画済みデータとして挿入せず、既存エンジンの水面をそのまま表示する。作品の初期状態も維持する。
- ペンの画面にある見本の「滴の半径」は、実際に調整するペン半径に変更する。
- スライダーやカラーのプレビューは現在値に連動する。色相SVGとスライダーのつまみはFigmaから取得し、ローカルファイルとして使用する。
- 色相ボタンの絵は32pxを保ち、押せる範囲を44pxにするため円周を広げた。色相の選択値はFigmaの各ノードの塗り色を参照する。自由な色の選択にはブラウザ標準のカラーピッカーを使う。
- 既存の4パレット、最大24保存色、最近選んだ7色を追加したため、色選択シートの内容は縦にスクロールする。
- 水面の拡大・全体表示、使い方、バージョンを追加した。短い画面では水面とツールの高さを縮める。
- タブレットとPCは横並びの配置を追加した。Figmaに専用の大型画面フレームはなかった。
- 見本の「画像保存は行いません」は実装に含めず、実際にPNGを生成する。保存完了はシート内で伝える。

## Modern Web Guidance

`npx --yes modern-web-guidance@latest install` で `.agents/skills/modern-web-guidance` と `skills-lock.json` を導入した。レイアウト、ダイアログ、バックグラウンド処理、操作遅延の4検索を行い、関連する次の4ガイドを `retrieve` して実装前に読んだ。

| ガイド | 採用内容・判断 |
|---|---|
| [responsive-design](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/css/responsive-design.md) | 動的な表示領域に `dvh`、正方形の水面に `aspect-ratio` を使用。配置はCSSのGrid/Flexとメディアクエリで変更する。 |
| [dialog](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-components/dialog.md) | `showModal()`、見出しを参照する名前、初期フォーカス、`form method="dialog"` の終了を使用。ブラウザにフォーカス制限と復帰を任せ、背景スクロールの連鎖をCSSで抑える。 |
| [performance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/performance/performance.md) | 描画パラメータを参照する既存のrefを維持し、頻繁な表示更新からクイック調整をmemoで分離。描画中の新しいReact状態やタイマーを追加せず、依存パッケージ・外部フォントも増やさない。 |
| [efficient-background-processing](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/performance/efficient-background-processing.md) | 内容を確認したが `content-visibility` と専用の停止処理は追加しない。水面は小さい単一画面の主役であり、performanceガイドの上部コンテンツへ適用しない指針に従う。既存の処理は操作中のrequestAnimationFrameで動き、待機中の常時描画ループはない。非表示時の動作の変更は履歴と未確定入力に影響するため今回の範囲から外した。 |

`dialog` のルール “DON'T add … a focus trap” に従い、自作のフォーカストラップは追加していない。`responsive-design` の “Use dynamic viewport units” に従い、ブラウザの表示領域の変化をCSSで扱う。`performance` の “DON'T apply … to above-the-fold content” に従い、水面へ不要な描画省略処理を入れない。

標準dialog・Pointer Events・ResizeObserver・CSSの動的単位を前提とする。新しいInvoker Commandsやclosedby、Popover APIは追加していない。対応範囲を広げるため、シートは既存コードと同じ `showModal()` を用い、閉じるボタンとEscを用意した。シートのスクロール抑制が完全ではないブラウザでも、標準のモーダルと閉じる操作は利用できる。`getCoalescedEvents` がない環境では従来どおり通常のイベントを使う。

## テスト

```bash
npm test
npm run build
npm run test:e2e -- --reporter=line
MSL_TEST_BROWSER=webkit npm run test:e2e -- e2e/renewal.spec.ts e2e/crop.spec.ts e2e/material.spec.ts e2e/water.spec.ts e2e/release.spec.ts --reporter=line
```

Chromiumの全28件は成功。従来の24件の描画・履歴・出力の検証を残し、シートを開く操作を更新した。追加4件では実際のボタン・マウス操作から両ペンを使い、色・パラメータ・パン・画像ハッシュのUndo/Redo一致、フォーカス、Spaceによるボタン操作、Esc、色の復元、無効なHEX、画面回転を確認した。

単体テスト19件とTypeScriptを含む本番ビルドも成功。Linux版Playwright WebKit 27.2でも、追加UIテスト4件・切り抜き1件・物性1件・押下成長3件・水フェード2件の計11件が成功した。これはiOS SafariやAndroid Chromeの実機確認ではない。

| 操作 | 確認内容 |
|---|---|
| 滴下・長押し・連続滴下 | 描画画素、押し出し、軌跡単位の履歴、キャンセル |
| 変形ペン・流体ペン | UIから実行、模様の変化、余韻、途中確定、GPUリソース数 |
| Undo / Redo | 元の画像ハッシュと一致。シート内のキー操作で背景の作品は変化しない |
| 色・パラメータ | HEX、4パレット、保存色、最近の色、半径、強さ、余韻、物性の復元 |
| ピンチ・パン | Chromiumのタッチ入力、ズーム、途中の未確定描画の取消、移動ツール |
| PNG・切り抜き | PNG形式、寸法、元のRGB、背景合成、枠操作中に描画しないこと |
| 画面幅 | 320 × 667、390 × 844、768 × 1024、1440 × 900、844 × 390。横方向のはみ出しと作品の保持。上下47px・34pxのセーフエリアをCSS変数で再現し、ツールが表示内に収まることも確認 |
| 描画環境の異常 | WebGL2非対応時の案内、コンテキスト消失と履歴からの復元 |

シートはタブ移動中に背景の操作ボタンへフォーカスが移らないことを検証する。ブラウザのアドレスバーなどへフォーカスが移る標準の動作は妨げない。

画面例：[スマホ](renewal-mobile.png)、[色選択](renewal-colors.png)、[PC](renewal-desktop.png)。

## パフォーマンス

[変更前後の測定値](ui-renewal-performance.json)。変更前の `b620358` と今回のUIで既存AT-11をそれぞれ1回実行し、同一PC・同じ依存関係・Chromium 159 / SwiftShader / 1024pxで比較した。

| 項目 | 変更前 | 変更後 |
|---|---:|---:|
| 100滴の20滴ごとの確定時間の合計 | 2040.6ms | 1911.1ms |
| 1500msプレビューの平均FPS | 61 | 62 |
| 100滴後の滴下用GPUテクスチャ | 2枚 | 2枚 |
| 履歴画像の上限 | 20MiB | 20MiB |
| UndoとRedo後の画素一致 | 成功 | 成功 |

単回測定のため、時間差をUIによる性能改善とは判断しない。実機GPUの速度や、Pointer Eventから表示までの遅延、INPを測った値ではない。流体の形は入力タイミングにも依存するため、異なる実行のハッシュを比較するのではなく、それぞれの履歴再生で画素が一致することを確認する。

## 日本語の推敲

[yomiyasu公式スキル](https://github.com/nanaism/yomiyasu/blob/main/skills/yomiyasu/SKILL.md) v3.1.0を読み、初心者向けの使い方を推敲した。物理計算の内部説明を操作方法へまとめ、余韻を「指を離してから流れが続く時間」、HEXを「色番号」と説明した。元のREADME・ヘルプと実装を資料として照合した。

- 書き手・読み手・場面: 書き手: 決めていない／読み手: general（指定）／場面: manual（推定）
- 実行した検査: lint、資料との照合、最終稿の照合
- 実行しなかった検査: diff（新規作成として検査したため）
- 見直し候補: 最終稿 4件から3件。件数は点数ではなく、読みやすさの良し悪しを示さない。
- 残した表現: 「ます」の連続2件は機能の説明として自然なため維持。「解像度」は実際の設定項目を指すため維持。
- 資料にない数値・名前と事実の穴の候補は0件。操作方法は元のヘルプ・READMEと実装を読み比べて確認した。
- `yomiyasu-check: executed via=verify run=20261116T033556Z-995d849e attempt=2 final=sha256:d27671744baa mode=compose doc_type=manual reader=general checks=lint,materials meaning_risk=0 replay=skipped`

検査の実行は、意味の保持や読みやすさの自動的な合格判定を意味しない。

## 制限と次の確認

- iOS Safari・Android Chrome・スタイラスの実機は未検証。画面のセーフエリアやブラウザバーの伸縮はCSSで対応したが、実機での操作確認が必要。
- 2本指タップUndoとキャンバス回転は追加していない。既存のピンチ・2本指パンと未確定描画のキャンセルを保った。
- 色相ホイールは代表色の選択。任意の彩度・明るさはブラウザ標準のカラーピッカーで選ぶため、表示はOSによって異なる。
- 作品の自動保存・筆圧・パームリジェクションは追加していない。保存色と最近の色の保存が制限される環境ではタブ内のみで使える。
- 次は実機でピンチ・2本指パン・ペン入力と保存操作を確認し、必要に応じてUIを調整する。作品の復元機能は別の変更として検討する。
