# 変更記録（CHANGELOG）

このファイルは「やったこと＝変更記録」を蓄積する場所です。
**新しいエントリを上（先頭）に追記**していきます。タスクを完了して push する前に、
必ずこのファイルの先頭へ今回の変更を1エントリ追記してください。

各エントリの形式：

```
## YYYY-MM-DD タスク名（T番号）
- 変更ファイル: （箇条書き）
- 変更内容: （何をどう変えたか）
- 理由/背景: （なぜ）
- 申し送り/注意点: （あれば。なければ「なし」）
```

---

## 2026-06-08 jsQRをローカル配置しCDN依存を解消（T5）
- 変更ファイル:
  - `js/vendor/jsQR.js`（新規・ローカル配置）
  - `app/start.html`
  - `app/exchange.html`
- 変更内容: QRコード読み取りライブラリ jsQR を CDN 参照からローカル（`js/vendor/jsQR.js`）へ移し、`start.html` / `exchange.html` の読み込みをローカル参照へ差し替えた。
- 理由/背景: CDN 依存を解消し、オフライン・CDN障害時でも QR スキャンが動作するようにするため。
- 申し送り/注意点: なし

## 2026-06-08 admin.gs の重複関数を整理（T7）
- 変更ファイル:
  - `docs/gas-patches/admin.gs.final.txt`（GAS反映用の完成版）
- 変更内容: `admin.gs` に2か所定義されていた `runAddStampParticipantsSheet()` を1つに統合し、重複定義を削除した。
- 理由/背景: 同名関数の二重定義による混乱・事故を防ぐため。内容が同一であることを確認のうえ片方を残した。
- 申し送り/注意点: GAS側はユーザーが GAS エディタへ手動コピペで反映する運用（`docs/gas-patches/` 配下の `*.final.txt` が反映元）。

## 2026-06-08 期間チェックの追加 ＋ exchangePrize の実装（T3）
- 変更ファイル:
  - `docs/gas-patches/api.gs.final.txt`（GAS反映用の完成版）
  - `docs/gas-patches/admin.gs.final.txt`（CONFIGスキーマに3キー追加）
- 変更内容:
  - 設定キー `stampStartAt` / `stampEndAt` / `exchangeDeadline` を導入（未設定なら制限なし＝後方互換）。
  - 判定ヘルパー `isStampOpen_()` / `isExchangeOpen_()` を追加。
  - `actionSaveStamp_` の冒頭で cfg を取得して `isStampOpen_` を確認（cfg の重複取得を排除）。
  - `exchangePrize` アクション（`actionExchangePrize_`）を新規実装し dispatch_ に分岐追加（学生側確定方式）。
  - エラーコード `stamp_closed` / `exchange_closed` を追加。
  - `setupEventSpreadsheet_` の CONFIG スキーマへ3キーを追加。
- 理由/背景: スタンプ取得・景品交換に期間制御が無く、かつフロントが呼ぶ `exchangePrize` が api.gs 未実装だったため。学生側確定方式の正式採用に伴い必須。
- 申し送り/注意点: フロント `progress.js` の `doExchange()` は変更不要（既存のまま動く）。設定シートへの3キー入力はユーザーが行う。

## 2026-06-08 findStudentByStampToken_() の検索条件強化（T2）
- 変更ファイル:
  - `docs/gas-patches/api.gs.final.txt`（GAS反映用の完成版）
- 変更内容: `findStudentByStampToken_(stampToken, eventId)` の検索条件に `eventId` 一致と `status === 'active'` を追加。status 列が無い旧シートでは従来通り判定する後方互換フォールバックも実装。
- 理由/背景: 1つの GAS で複数イベントを扱う設計のため、別イベント・無効トークンを誤って拾わないようにする。
- 申し送り/注意点: スタンプ参加者シートの現行スキーマは `['時刻','eventId','studentId','stampToken','activatedAt','status']`。
