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
| `register-school.html` | 出場校エントリー（学校単位・上書き型） | `event` |
| `company-entry.html` | 企業ブース出展申込（5ステップ） | `event` |
| `mypass.html` | 当日参加者マイページ（氏名＋個人QR・進捗復帰） | `token`,`event` |
| `card.html` | 学生情報カード（企業が閲覧） | `token`,`event` / `viewkey` |
| `start.html` | スタンプラリー開始（自分のQRを読む） | — |
| `stamp.html` | NFCスタンプ取得 | `ct`,`nc` |
| `progress.html` | スタンプ進捗・景品交換（学生側確定） | `st`,`event` |
| `exchange.html` | 景品交換（スタッフ用・補助/予備） | `key`,`event` |
| `company.html` | 企業向け来訪学生一覧 | `key`,`event` |
| `admin.html` | 管理画面（ハッシュルーティング） | `#<eventId>/<section>` |

各ページは `app/<name>.html` ↔ `js/<name>.js` の 1 対 1 対応。
共通処理は `js/config.js`（APIのURL）と `js/api.js`（GAS通信）に集約。

## トークン設計

- `cardToken` … 企業が学生情報を閲覧する（card.html）。学生マスターに保存。
- `stampToken` … スタンプラリー専用。`fg_stamp_token` cookie に保存。
- `viewKey` … 企業の閲覧キー。`fg_company_view` cookie に保存。
- `exchangeKey` … 景品交換スタッフキー（イベント別 CONFIG）。

## 開発

ビルド不要。静的サーバでリポジトリルートを配信するだけ。

```bash
npx serve -p 8744 .
```

`http://localhost:8744/app/<name>.html` でアクセスする。
バックエンドは本番 GAS を直接叩くため、**ローカルでもフォーム送信は本番データに書き込まれる**。

`package.json` / `node_modules` は無い。外部依存は `js/vendor/` に手動ベンダリング済み
（jsQR / qrcode.min.js）。

> **JS / CSS を変更したら、参照する全 HTML のキャッシュバスター `?v=` を必ず更新すること。**
> 更新漏れは「直したはずが反映されない」の最頻出原因。

## 設計上の確定事項（巻き戻し注意）

主要なものだけ再掲。全項目は [CLAUDE.md](CLAUDE.md) §4 を参照。

- **GAS通信のタイムアウトは `AbortController` ではなく `Promise.race`**（`js/api.js`）。iOS Safari の既知バグ回避のため。置き換えると iPhone からアクセス不能になる。
- **当日受付コードは撤廃済み**（`register.html` は開放）。
- **イベント判定は日付駆動**。状態は `公開中 / 公開停止` の2値のみ（旧 `準備中`/`開催中`=公開中、`完了`=公開停止として互換扱い）。`getCurrentEvent_` は開催日内でも `公開停止`/`完了` を除外する＝終了日前の緊急/早期停止スイッチ。
- **出場校エントリーは上書き型**（学校名で重複判定）。
- **エントリー/受付リストは CSV 出力のみ**（テンプレXLSXへの貼り付け運用）。

## ドキュメント

- [CLAUDE.md](CLAUDE.md) … **作業ルール・設計上の確定事項**（Claude Code 用だが、人が読んでもよい）
- [docs/USER_MANUAL.txt](docs/USER_MANUAL.txt) … 事務局向け取扱説明書（配布物）
- [docs/HANDOFF_2026-07-24.md](docs/HANDOFF_2026-07-24.md) … セッション引き継ぎ（アーカイブ。次回は新ファイルを作成）
- [docs/AUDIT_2026-07-29.md](docs/AUDIT_2026-07-29.md) … 実装・ドキュメントの現状調査（アーカイブ。提案は実行済み）
- [docs/NOTES.md](docs/NOTES.md) … 設計メモ・未解決事項
- [docs/CHANGELOG.md](docs/CHANGELOG.md) … GAS再デプロイの要否・デプロイ済みバージョン
- [docs/TASK_HISTORY.md](docs/TASK_HISTORY.md) … 過去のタスク指示書（アーカイブ）
- [assets/README.md](assets/README.md) … 静的画像アセットの置き場ルール

**実装が正、ドキュメントは参考。** 記述が実装と食い違う場合はコードを信じること。
