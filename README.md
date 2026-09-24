# JLCPCB Parts Quick Look

Webページ上で電子部品の型番を選択すると、DeepL 拡張機能のように小さなボタンが浮かび、
クリックすると新しいタブを開かずに在庫数・単価・パッケージをその場のポップオーバーで
確認できる Chrome / Edge 向け拡張機能（Manifest V3）です。

対応サイト: **JLCPCB** / **秋月電子通商** / **DigiKey**（要 API 設定）

## 使い方

1. Chrome / Edge で `chrome://extensions`（Edge は `edge://extensions`）を開く
2. 右上の「デベロッパー モード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択
4. 任意のページで型番（例: `STM32H743ZIT6`, `PIC16F1827`, `C114408`）をドラッグ選択
5. 選択範囲のそばに出る **[JLC]** ボタンをクリック
6. ポップオーバー上部のタブで JLCPCB / 秋月 / DigiKey を切り替え

検索の振る舞い:

- `C114408` のような LCSC コード → 完全一致で詳細カードを表示
- `STM32H743ZIT6` のような MPN → 一致する部品の詳細カードを表示
- `STM32H743` や `10uF 0603` のような曖昧な文字列 → 候補リスト（最大6件）を表示し、クリックで詳細へ

ポップオーバー上部の入力欄でキーワードを編集して Enter すると再検索できます。
Esc キーまたは外側クリックで閉じます。

## DigiKey の設定

DigiKey は公式 API（無料）経由で検索します。利用には開発者登録が必要です:

1. [developer.digikey.com](https://developer.digikey.com/) でアカウント作成
2. 「Create an App」で Production App を作成し Client ID / Client Secret を取得
3. `chrome://extensions` → この拡張の「詳細」→「拡張機能のオプション」で Client ID / Secret を入力し、DigiKey を有効化

未設定の場合、DigiKey タブには設定を促すメッセージが表示されます。

## 表示される情報

- 在庫数（stockCount）
- 数量別単価（USD、JLCPCB API の返す価格そのまま）
- パッケージ / カテゴリ / Basic・Extended 区分
- 最小発注数量（MOQ）・損耗数（ある場合）
- LCSC コード / MPN のコピーボタン、JLCPCB 商品ページとデータシートへのリンク

## 仕組み

- `content.js` … 選択範囲の検出、フローティングボタンとタブ付きポップオーバーの描画（Shadow DOM でページの CSS と分離）
- `background.js` … 各ソースへの検索ルーティング、10分間のメモリキャッシュ
- `sources/jlcpcb.js` … JLCPCB 部品検索 API（`/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2`）
- `sources/akizuki.js` … 秋月の検索結果ページ HTML をパース
- `sources/digikey.js` … DigiKey Product Information API v4（OAuth2 client credentials）
- `rules.json` … declarativeNetRequest で JLCPCB / DigiKey へのリクエスト Origin を書き換え
- `options.html` / `options.js` … ソースの有効/無効と DigiKey API 認証情報の設定

## 注意事項

- JLCPCB の公開 Web API（非公式・無保証）を利用しています。仕様変更で動かなくなる可能性があります
- 秋月は HTML スクレイピングのため、サイトのマークアップ変更で壊れる可能性があります
- 価格は JLCPCB が USD、秋月・DigiKey が JPY（税込/ロケール JP）表記です
- サービスワーカー経由で API を叩くため、ページ側の CSP には影響されません
- Chrome の PDF ビューアなど、content script が注入できないページでは動作しません
- 拡張機能をリロード・更新した場合、すでに開いているページの content script は無効化されます。
  「Extension was reloaded. Please refresh this page」と表示されたらページを再読み込みしてください

## 動作確認

`test.html` をブラウザで開き、記載の型番を選択して試せます。

### 自動検証 (scripts/verify.mjs)

headless Chrome + CDP で content.js の UI フロー（選択 → ボタン → ポップオーバー →
実際の JLCPCB API 応答）を検証できます。API 呼び出しは Node 側で行い、
ページには chrome.* のスタブを注入します。

```powershell
# Chrome を CDP 付きで起動
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\jlc-verify-profile" about:blank

# 別ターミナルで
node scripts\verify.mjs
```
