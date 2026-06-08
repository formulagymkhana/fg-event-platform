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

## 2026-06-08 当日参加フォームの入力規則をGフォーム仕様書に整合（当日フォーム）
- 変更ファイル:
  - `app/register.html`
  - `js/register.js`
  - `docs/gas-patches/api.gs.final.txt`（registerWalkIn row に 規則誓約同意 を追加）
  - `docs/gas-patches/admin.gs.final.txt`（STUDENT_COLS と importStudents に 規則誓約同意 を追加、19列化）
- 変更内容（スコープ=「入力規則の整合のみ」。新規ロジ項目は追加せず）:
  - 大学名: `maxlength=100` ＋「大学」を含む・100字以内の検証を追加（エラー文「大学名または大学校名を正しく入力してください」）。
  - 学年: 選択肢を仕様準拠（大学学部1〜4年生／短期大学1〜3年生／自動車大学校1〜4年生）に optgroup で再編。
  - 学部学科: 必須化。
  - 氏名・ふりがな: 姓名間スペースを半角/全角どちらも許容（`.+[ 　].+`）。ふりがなはひらがな＋スペース。
  - 性別: ラベル/値を 男 / 女 / 回答しない に変更。
  - 自動車部所属年数: 必須化＋選択肢を 1〜5年目／その他・自動車部所属ではない に変更。
  - 住所(都道府県): 必須化。
  - 同意: 「大会規則書・誓約書同意」チェック(#15)を追加し必須化。`registerWalkIn` へ `rulesConsent` を送信。GAS row 生成に `規則誓約同意` の1行を追加。
- 理由/背景: 当日参加（見学・応援パス）の入力規則を Google フォーム仕様書（`formula_gymkhana_2026_form_spec.md`）に合わせ、本受付と整合させるため。
- 申し送り/注意点: `規則誓約同意` の保存には学生マスターへの列追加が必要（NOTES 参照）。郵便番号/住所詳細・来場予定日・弁当・サービス作業/保険（#6,8,10〜14）は今回スコープ外。

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
