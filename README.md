# FG Event Platform

FORMULA GYMKHANA 学生参加プラットフォーム。事前/当日登録・QR名刺・スタンプラリー・景品交換・企業閲覧を、静的フロント（GitHub Pages）＋ Google Apps Script（GAS）バックエンドで提供する。

## 構成

- **フロント**: `app/*.html` ＋ `js/*.js`（ビルド無しの素のHTML/JS）。GitHub Pages で配信。
  - 本番ベース: `https://formulagymkhana.github.io/fg-event-platform/app/`
- **バックエンド**: GAS Web App。フロントは `js/config.js` の `API_BASE_URL` に対して fetch する。
  - GAS本体はリポジトリ管理外。`docs/gas-patches/api.gs.final.txt` / `admin.gs.final.txt` を GASエディタへ手動コピペして反映・再デプロイする（→ 反映漏れ注意。[docs/NOTES.md](docs/NOTES.md) 参照）。
- **データ**: Google スプレッドシート（イベントごとにシート分割。MASTER に EVENT_LIST）。

## 主要ページ（`app/`）

| ファイル | 役割 | 主なURLパラメータ |
|---|---|---|
| `register.html` | 当日参加登録（開放・コード不要） | — |
| `register-pre.html` | 事前登録（会期前） | `event` |
| `mypass.html` | 当日参加者マイページ（氏名＋個人QR・進捗復帰） | `token`,`event` |
| `card.html` | 学生情報カード（企業が閲覧） | `token`,`event` / `viewkey` |
| `start.html` | スタンプラリー開始（自分のQRを読む） | — |
| `stamp.html` | NFCスタンプ取得 | `ct`,`nc` |
| `progress.html` | スタンプ進捗・景品交換 | `st`,`event` |
| `company.html` | 企業向け来訪学生一覧 | `key`,`event` |
| `admin.html` | 管理画面（ハッシュルーティング） | `#<eventId>/<section>` |

## トークン設計

- `cardToken` … 企業が学生情報を閲覧する（card.html）。学生マスターに保存。
- `stampToken` … スタンプラリー専用。`fg_stamp_token` cookie に保存。
- `viewKey` … 企業の閲覧キー。`fg_company_view` cookie に保存。
- `exchangeKey` … 景品交換スタッフキー（イベント別 CONFIG）。

## 設計上の確定事項（巻き戻し注意）

- **当日受付コードは撤廃済み**（`register.html` は開放）。
- **イベント判定は日付駆動**。状態は `公開中 / 公開停止` の2値のみ（旧 `準備中`/`開催中`=公開中、`完了`=公開停止として互換扱い）。`getCurrentEvent_` は開催日内でも `公開停止`/`完了` を除外する＝終了日前の緊急/早期停止スイッチ。

## ドキュメント

- [docs/NOTES.md](docs/NOTES.md) … 設計メモ・未解決事項
- [docs/CHANGELOG.md](docs/CHANGELOG.md) … 変更履歴（GAS再デプロイ要否を含む）
