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

## 2026-06-12 事前学生登録フォーム Phase 2（ファイル提出→Drive保存）
- 変更ファイル: `app/register-pre.html`, `js/register-pre.js`, `js/api.js`, `docs/gas-patches/api.gs.final.txt`
- 変更内容:
  - **見学のサービス作業有無（分岐②）**: 「はい」→保険加入証明＋サービスクラス＋誓約書(直筆サイン)／「いいえ」→誓約書、を出し分け。サービスクラスは「事前登録」シートの`サービス作業クラス`へ（いいえは「実施しない」）
  - **ファイル提出**: 各区分に必要なファイル入力を追加（FG＝誓約書/免許証、女子＝承諾書(任意)/誓約書/免許証、補欠＝誓約書/免許証、見学はい＝保険証明/誓約書、見学いいえ＝誓約書）。画像/PDF・1ファイル8MB上限をクライアント検証
  - **GAS**: `registerPreStudent` がファイル(base64)を受け取り `savePreRegFiles_`/`getPreRegFolder_` で **Driveのイベント別フォルダ「FG事前登録書類_<eventId>」に非公開保存**（個人情報のため共有しない＝オーナー/組織のみ閲覧）。URLを「事前登録」シートの各URL列へ
  - **api.js**: `postCall_` のタイムアウトを120秒に延長（アップロード考慮）。フロントは `FileReader` で base64 化し `files` として送信
  - cache-busting `?v=20260612f`
- 申し送り/注意点:
  - **GAS 再デプロイ必須**（ファイル保存・Drive権限）。初回は **Drive アクセス許可（OAuth同意）** が要求される
  - 個人情報（免許証・誓約書）保護のため Drive ファイルは**非公開**。admin（オーナー）でログインして閲覧する想定。Phase 3 の一覧出力に各URLを含める
  - 大容量回線/端末では8MB×複数で送信に時間がかかる場合あり（上限8MB/ファイルでガード）
  - 残: **Phase 3** admin の事前登録一覧・メールリスト・ファイルURL出力

## 2026-06-12 事前学生登録フォーム Phase 1（参加区分の分岐項目）
- 変更ファイル: `app/register-pre.html`, `js/register-pre.js`
- 変更内容（フロントのみ・GAS再デプロイ不要。データ列はPhase 0で整備済み）:
  - 参加区分の選択で**分岐セクションを出し分け**：
    - FGクラス：ドライバー登録区分(A/B/C)・シムアタック受験日/タイム・意気込み・宿泊希望・夕食手配(宿泊時のみ表示)
    - 女子クラス：シムアタック受験日/タイム・意気込み・宿泊/夕食
    - 補欠：シムアタック・来場可否・土日弁当・サービス作業クラス
    - 見学応援：来場予定日(複数)・土日弁当・予選会Rd.1出場・メディア同意
  - 区分別バリデーション（シムタイム `1:15.001` 形式・来場日1日以上・各必須・メディア同意）
  - 宿泊「はい」で夕食欄を表示する連動
  - cache-busting を `?v=20260612e` に更新
- 申し送り/注意点: ファイル提出（誓約書・免許証・保険証明）は Phase 2。見学のサービス作業有無＋保険証明も Phase 2（ファイル連動のため）。書類リンクは現状 Rd.2 固定（将来CONFIG化推奨）

## 2026-06-12 事前学生登録フォーム Phase 0（共通セクション・脱Googleフォーム化）
- 変更ファイル: `app/register-pre.html`(新規), `js/register-pre.js`(新規), `js/api.js`, `docs/gas-patches/api.gs.final.txt`, `docs/gas-patches/admin.gs.final.txt`
- 変更内容:
  - **GAS**: `doPost` エントリ新設（CORSプリフライト回避のJSON POST受け口。将来のファイルUL兼用）。`registerPreStudent` アクション追加＝STUDENTSへ本人確認サブセットを upsert（`登録種別=事前`・`cardToken`発行・stampTokenは発行しない）、「事前登録」シート（`PRE_REG_COLS` フル列）へ記録、**確認メール送信**（MailApp＝オーナーGmail／QR名刺は載せない）。`SHEET.PRE_REG`・`PRE_REG_COLS`・`PRE_CLASS_CODES`・`preAttr_`/`appendPreRegRow_`/`sendPreRegMail_` 追加。createEvent_ の新規イベントに「事前登録」シートを追加
  - **api.js**: `postCall_`（POST/Content-Type無し）と `registerPreStudent(params)` を追加・エクスポート
  - **フロント**: `register-pre.html?event=<eventId>`（公開）＝共通①②③（氏名/ふりがな/大学/学部学科/学年/部歴/性別/生年月日/メール/電話/郵便番号/都道府県/住所詳細）＋参加区分＋規則同意＋個人情報同意。仕様書のバリデーション（氏名スペース・電話10-11桁・郵便7桁・メール・「大学」必須）を実装。完了画面は「登録完了＋確認メール送信」表示
- 方針: スコープは全区分フル再現／ファイルはDrive保存／メールはオーナーGmail（QR名刺は載せず、後日 admin で一覧出力→入場パスを作成・受付配布）。本コミットは **Phase 0（共通セクション）** まで
- 申し送り/注意点:
  - **GAS 再デプロイ必須**（doPost/registerPreStudent/事前登録シート/メール権限）。初回送信時に MailApp のメール送信許可（OAuth同意）が要求される
  - 残: **Phase 1** 区分別分岐項目（FG/女子/補欠/見学応援・メディア同意）、**Phase 2** ファイルUL→Drive、**Phase 3** admin 事前登録一覧/メールリスト出力
  - 会期前は当日自動判定が効かないため、事前登録URLは必ず `?event=` 付き（admin発行想定）

## 2026-06-12 progressにevent明示指定＋アセットのキャッシュバスティング
- 変更ファイル: `js/api.js`, `js/progress.js`, `app/progress.html`
- 変更内容:
  - **event 明示指定**: `getStampProgress`/`exchangePrize` に任意の event 引数を追加し、progress.js は `?event=` を読んで渡す。会期外・複数大会・テスト時に当日自動判定をバイパスして対象イベントを直接表示できる（例 `progress.html?st=…&event=2026_rd_test`）。省略時は従来どおり自動判定
  - **キャッシュバスティング**: progress.html の style.css / config.js / api.js / progress.js 参照に `?v=20260612c` を付与。HTMLだけ更新されてもJS/CSSが古いキャッシュのままUIが変わらない問題に対処
- 理由/背景: 実機で「更新してもUIが変わらない」報告。原因は(1)JS/CSSの個別キャッシュ、(2)トークンが2026_rd_testなのに当日判定が2026_testでデータ取得失敗、の2点
- 申し送り/注意点: 他ページのアセットにも順次バージョン付与すると、今後の更新反映が安定する（必要なら一括対応）

## 2026-06-12 progress固定ヘッダー/フッターの不具合修正＋到達ゲージ調整
- 変更ファイル: `app/progress.html`, `js/style.css`, `js/progress.js`
- 変更内容:
  - **固定レイアウトの不具合修正**: `.pg-scroll` に `min-height:0` を付与（flex子が縮まずカードが内容高まで伸び、ヘッダー固定が崩れ・フッターがはみ出して見えなくなっていた根本原因）。`#state-progress` の高さに `100vh` フォールバックを追加（`100dvh` 非対応ブラウザ対策）。`.fg-header` に `flex-shrink:0`
  - **到達ゲージ（フッター）**: 「マイルストーン」見出しを追加し、ラベルを「N個達成／あとN個・達成！」に。**最終マイルストーン(=maxPrizes×unitSize)を100%とみなすゲージ**であることを明確化（fill = count / MAX交換量）
- 理由/背景: 実機で固定ヘッダー/フッターが効かない不具合の報告。フッター到達バーをコンセプト画像（MAX=100%ゲージ）に合わせる
- 申し送り/注意点: マイルストーン最終ラベル（右端100%位置）が端で僅かに見切れる可能性は残（要実機確認・必要なら右端ラベルのみ寄せ調整）。GAS変更なし

## 2026-06-12 公式サイト寄せUIリデザイン＋progressスタンプ帳化＋企業ロゴ登録
- 変更ファイル: `js/style.css`, `app/admin.html`, `js/admin.js`, `app/progress.html`, `js/progress.js`, `docs/gas-patches/api.gs.final.txt`, `docs/gas-patches/admin.gs.final.txt`
- 変更内容（handoff_ui_stamp_redesign.md ベース。導線・スタンプ/景品ロジックは不変）:
  - **style.css トークン更新**: `--fg-blue` #0057B8→#004ECC、`--fg-bg`/`--fg-line` 微調整、`--radius-card` 20→18 / `--radius-ui` 12→8、`--shadow-card` 更新。新規 `--fg-blue-light/--fg-black/--fg-dark/--fg-gray/--fg-white/--fg-bg-soft`
  - **黒ヘッダー化**: 共通 `.fg-header` を黒背景＋青下線に。学生(start/stamp/progress)＋exchange に自動適用。**card.html はローカル白ヘッダー維持**。admin も独自ヘッダー(app-hd/page-hd/login-hd/modal-hd)を黒に統一
  - **新コンポーネント**: `.section-label/.section-en/.section-ja`、`.stamp-grid` 一式、`.milestone-*`、`.fg-list`
  - **progress リデザイン**: 円形ゲージ→アプリ型レイアウトに再構成。**固定ヘッダー（取得ブース X/Y社）＋スクロールするスタンプ帳グリッド（企業ロゴ/頭文字＋チェック、4×3）＋固定フッター（到達バー＋ステータス＋交換アクション）**。取得履歴は fg-list でスクロール領域に。`#state-progress` を `height:calc(100dvh-48px)` の縦フレックスにし pg-top/pg-scroll/pg-bottom で構成。progress.js に renderStampGrid/renderMilestoneBar/renderStampList とフォールバックを追加（既存スタンプ/景品ロジックは保持。ヘッダーは「取得ブース数/全ブース数」表記に変更）
  - **企業ロゴ登録**: admin の企業カードに「ロゴURL」入力＋プレビュー＋保存を追加。GAS に `adminUpdateCompany`(logoUrl列を必要時に作成)、`getStampProgress` に companies(ロゴ含む)返却、`adminGetCompanies` に logoUrl、新規イベントの COMPANIES スキーマに logoUrl 列を追加
  - **CSP**: progress.html / admin.html に `img-src 'self' https: data:` を追加（外部/同梱ロゴ画像の表示用）
- 方針判断（ユーザー確認済み）: exchange は**中立色のまま維持**（handoff の赤アクセント復活は不採用）。admin も黒ヘッダーに統一。ロゴは同一オリジン同梱が最速・最安定で `'self'` だけで足りるが、URL貼り付け運用も両立するため `https: data:` も許可
- 申し送り/注意点:
  - **GAS 再デプロイ必須**（companies/ logoUrl/ adminUpdateCompany）。未再デプロイでも progress はフォールバックで動作（取得済み企業のみ表示・ロゴ無し）
  - グリッドの取得突合は **companyId 優先**（handoff の企業名突合より堅牢化）
  - start/stamp/exchange は黒ヘッダー適用のみ（セクション見出しは progress のみ。必要なら後日追加）
  - マイルストーン両端ラベルが端で僅かに見切れる可能性（NOTES 記録・要実機確認）

## 2026-06-12 admin.html / exchange.html を共通デザイン体系に統一（見た目のみ）
- 変更ファイル: `app/admin.html`, `app/exchange.html`, `js/style.css`
- 変更内容（機能・DOM・ID・JS・GAS呼び出しは一切変更なし）:
  - **style.css**: `--shadow-sm`(小カード用の軽い影)を追加。`.staff-badge` を赤茶→大会ブルー(blue-soft)に変更。未使用化した `.fg-header-staff` 一式と `--fg-staff` トークンを削除
  - **exchange.html**: 旧スタッフ用「赤茶ヘッダー」(`fg-header-staff`)を全て白ヘッダー(`fg-header`)に統一。スタッフ用スピナー色上書きを廃止。`.btn-staff` を赤茶→大会ブルーに。判定バッジは既に `.status-card` 化済み
  - **admin.html**: 濃紺帯ヘッダー(ログイン/共通/サブページ/モーダル)を**白ヘッダー＋下罫線**に統一。ロゴは黒字＋青スパン。主要ボタン(primary-btn/save-btn/btn-gen-keys)を大会ブルーに。直書き配色(`#C0392B`/`#27AE60`/`#1A4A80`/`#8BA3C4`/`#B0BAC8`/`#FEF3C7`系/`#1A2733`等)を共通トークンへ集約。小カードの影を `--shadow-sm` に、主要カード角丸を `--radius-ui`/`--radius-card` に。テーブルヘッダ・トーストは濃色面として `--fg-navy` 維持
- 理由/背景: 学生画面とデザイン体系を揃え、システム全体の統一感・完成度を出すため。色による画面区別を撤廃
- 申し送り/注意点:
  - 情報密度維持のため、admin の微小コントロール角丸(≤10px: stat-card/company-item/copy-btn 等)は数値のまま据え置き（NOTES 参照）。色・影は全てトークン化済み
  - GAS 変更なし（再デプロイ不要）

## 2026-06-11 企業QR用URLのUI改善＋イベントID埋め込み（前項の追補）
- 変更ファイル: `js/admin.js`, `app/admin.html`, `js/card.js`, `js/api.js`
- 変更内容:
  - **admin UI**: 企業QR用URLを、スタンプキー/閲覧キーの2行の**下に独立した行**で配置（破線区切り・末尾にコピーボタン）。見やすさ改善
  - **イベントID埋め込み**: 企業QR用URLを `card.html?viewkey=<viewKey>&event=<eventId>` に変更。会期外テストや複数大会同時運用での「無効」を解消（従来は event 無しで当日日付判定→会期外は `2026_test` にフォールバックし不一致）
  - **card.js / api.js**: `resolveViewKey` / `saveViewLogAuto` に event 引数を追加。企業QRのイベントで企業を検証し、表示中学生の記録は学生ページのイベント文脈で行う
- 理由/背景: 企業URLが「無効」になる事象の調査で、card系URLがイベントIDを持たず会期外で取り違える設計ギャップが判明（NOTES 2026-06-11 参照）
- 申し送り/注意点:
  - 本機能は GAS の `resolveViewKey` / `saveViewLog(vk)` 対応が前提 → **GAS未再デプロイだと企業URLは必ず「無効」になる**
  - 学生名札URLは従来通り event 無し（会期中は日付判定でOK）。会期外テストは `?event=` 付与か EVENT_LIST にテストイベント設定が必要

## 2026-06-11 企業特定によるQR閲覧ログの企業別記録（cookie方式）
- 変更ファイル: `app/card.html`, `js/card.js`, `js/api.js`, `js/admin.js`, `docs/gas-patches/api.gs.final.txt`, `docs/gas-patches/admin.gs.final.txt`
- 変更内容:
  - **企業QRのURL形式（決定）**: `card.html?viewkey=<viewKey>`（企業ごとに1つ。viewKey流用・新規キーなし）
  - **企業登録モード**: 企業QRを通常カメラで読むと viewKey を GAS で検証し、cookie `fg_company_view`（60日）に保存。tokenなしなら「企業登録完了」画面を表示
  - **自動記録（A）**: cookie がある状態で学生QR（card.html?token=...）を開くと、学生情報表示と同時に裏で `saveViewLog`（vk付き）を実行し、QR閲覧ログへ企業ID付きで自動記録
  - **オーバーレイ企業QR読み取り（B）**: cookie がない場合は案内＋[企業QRを読み取る]ボタンを表示。押すと**ページ遷移せず**カメラをオーバーレイ起動（ローカルjsQR使用）。読み取り成功で cookie 保存＋今表示中の学生を記録しオーバーレイを閉じる。キャンセル時も学生情報は画面に残り続ける
  - **メール再閲覧（C）**: 既存のメール登録フォームは従来通り併存（`'manual'` 渡しの挙動維持）
  - **GAS（api.gs）**: `actionSaveViewLog_` に `vk` パラメータ追加（viewKey→企業IDをサーバ側解決）、VIEW_LOG 6列目に `source`（company_auto/manual_email）を記録、company_auto は同一イベント×学生×企業の重複時に時刻のみ更新。新アクション `resolveViewKey` 追加。`getCompanyView` のフィルタを String() 比較に統一
  - **GAS（admin.gs）**: 新規イベントの VIEW_LOG ヘッダーに `source` 列追加
  - **admin.js**: 企業リストの閲覧キー行に「QR用URL」コピーボタン追加（企業QR作成用）
  - **既存バグ修正**: card.html の inline onclick が CSP でブロックされていた問題を addEventListener 化で解消（NOTES参照）。CSP に `media-src blob:` を追加（カメラ用）
- 理由/背景: 前回運用で「当日話した学生の情報が欲しい」という企業要望が複数あり、企業別のQR閲覧学生リストを提供するため。スタンプ層（広い来訪）とQR閲覧層（濃い興味）は別物として維持し、本タスクはQR閲覧層のみ
- 申し送り/注意点:
  - **GAS 再デプロイが必要**（api.gs / admin.gs）
  - 既存イベントの QR閲覧ログ シートに6列目ヘッダー `source` を手動追記推奨
  - company.html 本体の実装は別タスク（T-E）。データは getCompanyView で取得可能なことを確認済み
  - スタンプ系（saveStamp / スタンプログ）には一切変更なし

## 2026-06-11 共通デザイン体系の拡充（第1弾・第2弾）
- 変更ファイル: `js/style.css`, `app/progress.html`, `app/exchange.html`, `app/start.html`, `app/stamp.html`, `js/stamp.js`
- 変更内容:
  - **style.css 追加（第1弾）**:
    - 色変数追加: `--fg-warning-*` / `--fg-error-*` / `--fg-disabled`
    - `:focus-visible` フォーカスリング（btn-primary/secondary/action-link/btn）
    - `.status-card`（success/info/warning/error/neutral/cleared + .sub/.status-sub）
    - `.booth-card` / `.complete-card`（stamp.html 企画書風改修用・未適用）
    - `.staff-badge`
    - `.scan-wrapper` 系 + `.cancel-btn`（QRスキャン枠共通化）
  - **HTML移行（第2弾）**:
    - progress.html: `.status-msg` → 共通 `.status-card`（cleared/success/neutral）
    - exchange.html: `.verdict` → 共通 `.status-card`、スキャンCSS削除→共通化、STAFF ONLYバッジ追加
    - start.html: スキャンCSS削除→共通化
    - stamp.html: `.cleared-banner` → 共通 `.status-card.cleared`
  - **stamp.js**: 旧キー `prizeThreshold`/`prizeCount` → 新モデル `prizeUnitSize`/`maxPrizes`/`nextThreshold`/`claimableNow` に対応（旧キーフォールバック付き）
- 理由/背景: 各ページに重複していたステータス表示・スキャン枠CSSを共通コンポーネント化し、企画書モック風デザインへの土台を整備。stamp.js は累積交換モデル刷新時の修正漏れを発見し同時修正
- 申し送り/注意点:
  - `.btn` のグローバル統一は exchange.html のローカル `.btn` と衝突するため見送り
  - `.booth-card`/`.complete-card` は CSS のみ追加（stamp.html への適用は第3弾候補）
  - GAS 変更なし（再デプロイ不要）

## 2026-06-10 景品交換ログ個数列追加・新規イベント作成を新モデル対応・削除ボタン整理
- 変更ファイル: `app/admin.html`, `js/admin.js`, `docs/gas-patches/api.gs.final.txt`, `docs/gas-patches/admin.gs.final.txt`
- 変更内容:
  - **admin.html**: 「⚠ 危険ゾーン」ブロック廃止 → 設定末尾にシンプルな削除ボタン＋1行説明に変更
  - **admin.html**: 景品交換テーブルに「個数」(claimedCount)列を追加
  - **admin.js**: 景品ログ行に claimedCount を表示（旧データは1個扱い）
  - **api.gs**: `actionAdminGetPrizeLog_` をヘッダーベース読み取りに変更し `claimedCount` を返却
  - **admin.gs**: `setupEventSpreadsheet_` を新モデルに対応
    - CONFIG の初期値: `prizeThreshold`/`prizeCount` → `prizeUnitSize(5)`/`maxPrizes(3)`
    - PRIZE_LOG ヘッダー: `claimedCount` 列を追加
- 理由/背景: 新規イベント作成時に旧キーで設定が初期化されていた不整合を解消。景品交換ログの個数を管理画面で確認できるように
- 申し送り/注意点:
  - GAS 再デプロイ済み（api.gs / admin.gs）
  - 既存スプレッドシートの PRIZE_LOG に `claimedCount` 列がない場合、API側で1個扱いにフォールバック済み

## 2026-06-10 景品モデルを累積交換方式に刷新・統計グリッド改修
- 変更ファイル: `docs/gas-patches/api.gs.final.txt`, `app/admin.html`, `js/admin.js`, `app/exchange.html`, `js/exchange.js`, `js/progress.js`
- 変更内容:
  - **景品モデル変更（GAS）**: 1回限り → 累積交換方式。
    - `prizeThreshold`/`prizeCount` → `prizeUnitSize`/`maxPrizes` に変更（旧キーにフォールバック対応）
    - `isExchanged_`（boolean）→ `countExchanged_`（累計景品数）に置換
    - `buildStampResult_` が `claimableNow`/`exchangedCount`/`eligibleTotal`/`nextThreshold` を返すように変更
    - `actionExchangePrize_` / `actionMarkPrizeExchanged_`: `nothing_to_claim` エラーに変更、PRIZE_LOGに `claimedCount` 列を追加
    - `actionGetExchangeStatus_`: 新フィールド返却に対応
  - **統計グリッド変更**: 登録学生数・スタンプ総数 → 事前登録学生/当日参加学生/スタンプ参加者/景品交換済 の4項目に変更
  - **adminGetStats 拡張**: `preRegisteredCount`・`stampParticipants`（ユニーク参加者数）を追加
  - **学生管理ページ**: 合計/事前登録/当日参加/スタンプ参加の4カードに変更
  - **設定フォーム**: prizeThreshold/prizeCount → prizeUnitSize/maxPrizes に変更（ヒント文追加）
  - **exchange.html / exchange.js**: 複数回交換対応のUI（引換可能/追加収集中/全交換済み）
  - **progress.js**: 段階交換UIに対応（claimableNow/nextThreshold でメッセージ分岐）
- 理由/背景: 電子スタンプラリーの強みを活かした柔軟な景品交換モデルへ移行
- 申し送り/注意点:
  - **GAS 再デプロイが必要**
  - 既存の設定シートに `prizeUnitSize`/`maxPrizes` の行を追加する必要あり（旧キーへのフォールバックあり）
  - PRIZE_LOG の新規行には `claimedCount` 列が追加される（旧行は1個扱いで互換）

## 2026-06-09 UX改善: 削除ボタン移動・QR導線・当日参加者フロー
- 変更ファイル: `app/admin.html`, `js/admin.js`, `app/progress.html`
- 変更内容:
  - **イベント削除ボタンをイベント一覧カードから移動** → ダッシュボードの「設定・管理」アコーディオン最下部「⚠ 危険ゾーン」に配置。誤削除防止のため意図的に深い場所に設置。
  - **progress.html の no-token 画面に導線追加**:
    - 「📷 スタンプラリーを開始する」→ `start.html`（QRスキャンページ）へのリンクを追加。
    - QR名刺をお持ちでない当日参加者向けに「📝 当日参加登録はこちら」→ `register.html` へのリンクを追加（コードなしでアクセスした場合は register.html 側が「会場掲示QRから」と案内）。
- 理由/背景: no-token のデッドエンドを解消し、事前参加・当日参加双方にスムーズな導線を提供するため。
- 申し送り/注意点: なし

## 2026-06-09 イベント削除機能を追加
- 変更ファイル: `app/admin.html`, `js/admin.js`, `docs/gas-patches/api.gs.final.txt`
- 変更内容:
  - GAS: `adminDeleteEvent` アクションを追加。マスターイベント一覧シートから該当行を削除し、CacheService のキャッシュも削除。
  - JS: `handleDeleteEvent_()` 関数を追加。確認ダイアログ → API 呼び出し → ローカルリスト更新 → 再描画。
  - HTML/CSS: イベントカード右上に削除ボタン（×）を追加。`.ev-card-del` スタイルを追加。
  - スプレッドシート本体は削除せず、マスター一覧からの参照のみ削除。
- 理由/背景: テスト用イベントの整理・誤作成イベントの削除を管理画面から行えるようにするため。
- 申し送り/注意点:
  - GAS 再デプロイ（api.gs の新バージョン発行）が必要。
  - マスターシートの `eventId` 列が正しく設定されていることを確認。

## 2026-06-09 全体設定ページ（#settings）を新設
- 変更ファイル: `app/admin.html`, `js/admin.js`
- 変更内容:
  - `#settings` ルートを追加し、全体設定ページを新設。
  - イベント一覧ヘッダーに「⚙ 設定」リンクを追加。
  - 管理者キー変更・キャッシュクリアをダッシュボードから全体設定ページへ移動。
  - アプリ情報（GAS API URL）を全体設定ページに表示。
  - ダッシュボードの「設定・管理」は景品・期間設定のみに整理。

## 2026-06-09 admin パネルをハッシュルーティング SPA に刷新
- 変更ファイル:
  - `app/admin.html`（全面再設計）
  - `js/admin.js`（ルーティング追加・構造再編）
- 変更内容:
  - `location.hash` ベースの SPA ルーティングを実装。
    - `#` → イベント一覧ページ（カード形式）
    - `#eventId` → イベントダッシュボード（統計・ナビカード・当日運用・設定）
    - `#eventId/companies` → 企業管理ページ
    - `#eventId/students` → 学生管理ページ
  - ドロップダウン（event-select）を廃止。イベント一覧カードでイベントを選択。
  - ダッシュボードに「企業管理」「学生管理」ナビカードを設置（バッジで登録数を表示）。
  - 新規イベント作成後はダッシュボードへ自動遷移。
  - ブラウザの「戻る」ボタンでページ間を移動可能（hashchange イベントで処理）。
  - `setBadge_()` を nav-card-count / step-badge 両対応に更新。
- 削除した機能: `populateEventSel_`, `autoSelectEvent_`, `updateEventBar_`, `event-select` dropdown
- 追加した機能: `route_()`, `showPage_()`, `renderEventList_()`, `updateNavLinks_()`

## 2026-06-09 準備ステップを4段階に分割（企業登録・学生登録を独立化）
- 変更ファイル:
  - `app/admin.html`（Step2/3 分割 → Step4 追加）
  - `js/admin.js`（updateStepBadges_ を4ステップ対応に更新）
- 変更内容:
  - 旧 Step2「企業・学生の登録」を Step2「企業登録」と Step3「学生登録」に分割。
  - 旧 Step3「QR・NFC URL発行」を Step4 に繰り下げ。
  - Step2 バッジ: 企業数を `✓ N社` 形式で表示。
  - Step3 バッジ: 学生数を `✓ N名` 形式で表示。Step3 内に登録学生数サマリを追加。
  - Step4 バッジ: walkInCode_ + キー発行済みで完了判定（旧Step3と同じロジック）。
- 理由/背景: 今後企業・学生それぞれの機能が増えるため、早めにセクションを分離。

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
