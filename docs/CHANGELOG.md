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

## 2026-06-09 admin パネルから企業の追加・削除を実装
- 変更ファイル:
  - `app/admin.html`（企業追加フォームUI・削除ボタン・CSS追加）
  - `js/admin.js`（handleAddCompany_ / handleDeleteCompany_ / company-listに削除ボタン追加）
  - `docs/gas-patches/api.gs.final.txt`（adminAddCompany / adminDeleteCompany アクション追加）
- 変更内容:
  - 「企業管理」セクションに追加フォームを設置（企業名必須・企業ID任意、空欄なら GAS 側で自動生成）。
  - 各企業カードに「×」削除ボタンを追加（confirm ダイアログ付き）。
  - GAS: `actionAdminAddCompany_` — 重複 ID チェック後に COMPANIES シートへ appendRow。
  - GAS: `actionAdminDeleteCompany_` — companyId で行を特定して deleteRow。
  - 追加・削除後は `loadCompanies_()` を再呼び出しして一覧を自動更新。
- 申し送り: GAS ファイルを手動でエディタへ貼り付け・再デプロイが必要。削除は取り消し不可なのでダイアログで確認済み。

## 2026-06-09 イベント切替時の競合状態（Race Condition）修正
- 変更ファイル:
  - `js/admin.js`
- 変更内容:
  - `loadGen_` 世代カウンタをグローバル State に追加。
  - `loadAll_()` を修正: 呼び出しごとに `gen = ++loadGen_` と `ev = curEvent_` をスナップショット → 6つのロード関数へ引き渡し。
  - `loadStats_` / `loadStampLog_` / `loadWalkIns_` / `loadPrizeLog_` / `loadConfig_` のシグネチャを `(gen, ev)` に変更。await 後に `gen !== loadGen_` であれば古いレスポンスとして即 return。
  - `loadCompanies_` はデフォルト引数 `(gen = null, ev = null)` で単体呼び出し（キー発行後）にも対応。
- 理由/背景: イベントを切り替えた際に、前イベントへのAPIリクエストがまだ飛行中で後から応答が返ると新しいイベントのデータを上書きしてしまう競合状態があった。
- 申し送り/注意点: この修正により「切り替えても変わらない」症状が解消する。なお、現在イベントが1件のみの場合はドロップダウンに1項目しかなく切り替え自体が不可なため、テストは2件目のイベントを作成してから行うこと。

## 2026-06-09 admin 運営動線の整理（準備ステップガイド追加・設定再配置）
- 変更ファイル:
  - `app/admin.html`（構造再設計）
  - `js/admin.js`（最小差分）
  - `docs/NOTES.md`（準備中機能の申し送り追記）
- admin.html 変更内容:
  - 全体構造を「イベントバー → 準備フロー → 当日運用 → 設定・管理」の順に再設計。
  - 各ブロックの区切りに `.area-label` を追加（視覚的なフロー案内）。
  - **準備ステップガイド（新規）**: 折りたたみカード3枚（Step1/2/3）を追加。各カードに自動完了バッジを表示。
    - Step1（イベント作成）: `btn-step1-create` → 新規イベントモーダル呼び出し。
    - Step2（企業・学生登録）: 「準備中」ボタン2本 ＋ 企業キー管理（`btn-gen-keys`/`company-list`）を settings から移動。
    - Step3（URL発行）: 「準備中」ボタン3本 ＋ 当日参加登録URL（`walkin-url`/`btn-copy-url`）を settings から移動。
  - settings セクションは「景品・期間設定」と「管理者キー変更」のみに整理。
  - **ID変更なし**。DOM 移動のみで admin.js の参照は全て維持。
- admin.js 変更内容:
  - `btn-step1-create` のクリックリスナー追加（`showModal_('modal-create')` を呼び出し）。
  - `data-wip` 属性を持つボタンへの委譲クリックハンドラを追加（「今後実装予定」トーストを表示）。
  - `updateStepBadges_()` / `setBadge_()` 関数を新規追加（ステップバッジの完了判定・更新）。
  - `loginWithKey_()` / `loadStats_()` / `loadCompanies_()` の完了後に `updateStepBadges_()` を呼び出す。
- 完了判定ロジック（自動）:
  - Step1: `allEvents_.length > 0`
  - Step2: `stat-students > 0` かつ `company-list` に `.company-item` が1件以上
  - Step3: `walkInCode_` 設定済み かつ 発行済みキーが1件以上
- 申し送り/注意点:
  - 準備中機能（学生マスター取込 UI・NFC URL 発行等）は別タスクで実装する。NOTES 参照。
  - push は確認後。

## 2026-06-09 デザイン統一: register.html + admin.html（最終）
- 変更ファイル:
  - `app/register.html`
  - `app/admin.html`
- 変更内容:
  - register.html: `../js/style.css` 読み込み追加。ヘッダー白化 (`.fg-header`)、フォームの focus/accent を `--fg-blue` に統一。`.submit-btn` を `--fg-blue` ベースに変更。`.success-icon` を `--fg-blue-soft` カードに変更。`.guide-num`・`.bar-fill`・ラジオ `accent-color` を `--fg-blue` に統一。フォームリンク色を `var(--fg-navy)` に変更。
  - admin.html: `../js/style.css` 読み込み追加。ローカル `:root` の `--navy`/`--gray`/`--gray-light`/`--border`/`--navy-light` を `--fg-*` 変数にエイリアス化。管理画面のダーク UI（ヘッダー/テーブル背景 `--navy`）は構造無変更で維持。
  - JS・ID・ロジックは一切変更なし。
- 理由/背景: デザイン統一タスク（commit 5/5）。全画面の style.css 適用が完了。
- 申し送り/注意点: push 確認を取ること（push は確認後）。

## 2026-06-09 デザイン統一: exchange.html（スタッフ画面）
- 変更ファイル:
  - `app/exchange.html`
- 変更内容:
  - `../js/style.css` を読み込むよう `<link>` を追加。
  - ヘッダーを `.fg-header-staff`（style.css 定義・`--fg-staff: #5C1A1A` 赤茶）に切り替え。ヘッダー色は維持。
  - ローカル `.btn-primary` → `.btn-staff`（`--fg-staff` 色）にリネームし style.css の `.btn-primary`（`--fg-blue`）と衝突を解消。
  - 背景色・カード色・`stamp-box`・`verdict` バッジを CSS 変数（`--fg-bg`/`--fg-navy`/`--fg-muted`/`--fg-success-bg` 等）に統一。
  - スピナーの `border-top-color` を `--fg-staff` でオーバーライド（スタッフ画面のトーン保持）。
  - JS・ID・ロジックは無変更（`btn-exchange` は ID 参照のみ確認済み）。
- 理由/背景: デザイン統一タスク（commit 4/5）。スタッフ画面は赤茶ヘッダーを維持する設計方針通り。
- 申し送り/注意点: なし

## 2026-06-09 デザイン統一: stamp.html + progress.html（円形ゲージ）
- 変更ファイル:
  - `app/stamp.html`
  - `app/progress.html`
  - `js/progress.js`
- 変更内容:
  - stamp.html: ヘッダー白化、`.stamp-icon` を `--fg-blue-soft/--fg-blue` カードに変更。`.cleared-banner` を `--fg-blue` グラデーションへ統一。
  - progress.html: ヘッダー白化、水平バー (`.bar-wrap`) を 円形ゲージ (`.progress-ring` + `.ring-inner`) に置換。`#bar-fill` は JS 参照保持のため非表示 div で残存。`.stamp-check` を `--fg-blue`、ステータス色を CSS 変数で統一。
  - progress.js: `document.querySelector('.progress-ring')?.style.setProperty('--pct', pct)` を1行追加（円形ゲージへ進捗率を注入）。それ以外のロジックは無変更。
- 理由/背景: デザイン統一タスク（commit 3/5）。円形ゲージは conic-gradient + CSS変数 `--pct` で実装（style.css 定義済み）。
- 申し送り/注意点: なし

## 2026-06-09 デザイン統一: card.html + start.html
- 変更ファイル:
  - `app/card.html`
  - `app/start.html`
- 変更内容:
  - `../js/style.css` を読み込むよう `<link>` を追加。
  - ヘッダーを dark navy → 白 (`.fg-header`) に変更。ロゴの span を `--fg-blue` バッジへ統一。
  - `card.html`: CSS変数 (`--fg-blue`/`--fg-navy`/`--fg-bg`/`--fg-line`/`--fg-muted`/`--fg-success` 等) を参照するように inline スタイルを整理。
  - `start.html`: `.state-icon` を style.css の淡い青カードに統一。`.start-btn` → `.btn-primary`。成功アイコン `.success-icon` も `--fg-blue-soft/--fg-blue` カラーに統一。進捗バーを `--fg-blue` グラデーションへ変更。`.guide-num` を `--fg-blue` に変更。
  - JS・ID・データ属性・ロジック系は一切変更なし。
- 理由/背景: デザイン統一タスク（commit 2/5）。
- 申し送り/注意点: なし

## 2026-06-09 registerExistingEvent の STATUS を 準備中 に修正
- 変更ファイル:
  - `docs/gas-patches/admin.gs.final.txt`
- 変更内容: `registerExistingEvent()` の `STATUS = '完了'` を `'準備中'` に変更。`完了` のままだと `getCurrentEvent` にイベントが拾われず当日登録が機能しない。終了後に手動で `完了` へ変更する運用とする。
- 理由/背景: 外部レビューで発覚。`getCurrentEvent` は状態が `完了` のイベントを除外する実装のため。
- 申し送り/注意点: GAS再反映が必要（admin.gs のみ）。

## 2026-06-08 当日フォーム: ラジオ選択不可の修正・性別プルダウン化・学年追加
- 変更ファイル:
  - `app/register.html`
  - `js/register.js`
- 変更内容:
  - ラジオ選択不可バグを修正: `.form-row input` の `appearance:none` がラジオにも効いて選択状態が描画されなかったため、`.radio-group input[type=radio]` に `appearance:auto`・padding/border リセットを追加（出場ラジオ等が選択可能に）。
  - 性別を radio → プルダウン（select #f-gender）に変更。検証・送信を select 参照に更新。
  - 学年に「専門学校4年生」optgroup と末尾「その他」を追加。
- 理由/背景: 実機テストで性別・所属校出場のラジオが選択できなかった（CSSリセットの巻き込み）。性別はプルダウン希望。学年の選択肢拡充の要望。
- 申し送り/注意点: なし

## 2026-06-08 当日参加フォームの入力規則をGフォーム仕様書に整合（当日フォーム）
- 変更ファイル:
  - `app/register.html`
  - `js/register.js`
  - `docs/gas-patches/api.gs.final.txt`（registerWalkIn row に 規則誓約同意 を追加）
  - `docs/gas-patches/admin.gs.final.txt`（STUDENT_COLS と importStudents を19列化）
- 変更内容（スコープ=「入力規則の整合のみ」。新規ロジ項目は追加せず）:
  - 大学名: `maxlength=100` ＋「大学」を含む・100字以内の検証を追加（エラー文「大学名または大学校名を正しく入力してください」）。
  - 学年: 選択肢を仕様準拠（大学学部1〜4年生／短期大学1〜3年生／自動車大学校1〜4年生）に optgroup で再編。
  - 学部学科: 必須化。
  - 氏名・ふりがな: 姓名間スペースを半角/全角どちらも許容（`.+[ 　].+`）。ふりがなはひらがな＋スペース。
  - 性別: ラベル/値を 男 / 女 / 回答しない に変更。
  - 自動車部所属年数: 必須化＋選択肢を 1〜5年目／その他・自動車部所属ではない に変更。
  - 住所(都道府県): 必須化。
  - 同意: 「大会規則書・誓約書同意」(#15) を追加し必須化（大会規則書・誓約書の参照URLリンク付き）。`registerWalkIn` へ `rulesConsent` を送信し、GAS に `規則誓約同意` 列を追加。
- 理由/背景: 当日参加（見学・応援パス）の入力規則を Google フォーム仕様書（`formula_gymkhana_2026_form_spec.md`）に合わせ、本受付と整合させるため。見学・応援学生も大会規則・誓約書に同意していた（仕様書準拠）。
- 申し送り/注意点:
  - `規則誓約同意` の保存には学生マスターへの列追加が必要（NOTES 参照）。
  - 学生マスターの列ズレ（`性別`・`所属校出場` 欠落）も同時に要対応（NOTES 参照）。
  - 郵便番号/住所詳細・来場予定日・弁当・サービス作業/保険（#6,8,10〜14）は今回スコープ外。

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
