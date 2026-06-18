# 気になることメモ（NOTES）

このファイルは「気になること＝後で相談したい論点」を書き溜める場所です。
作業中に気づいた懸念・改善案・後で問題になりそうな点を、その場で直さず記録して申し送ります。

各項目の形式：

```
## [未解決] 論点タイトル（YYYY-MM-DD 記録）
- 状況:
- 懸念/論点:
- 案（あれば）:
```

解決したら `[未解決]` を `[解決]` に変え、結論を1行追記します。

---

## [記録] 公式サイト寄せリデザイン（黒ヘッダー/スタンプ帳/ロゴ）の設計メモ（2026-06-12）
- **exchange の配色判断**: handoff は赤アクセント復活を指定したが、直前タスクの「色で画面区別しない」方針と矛盾するため、ユーザー確認のうえ**中立色維持**を採用（赤は不採用）。`--fg-staff` は復活させない。
- **logoUrl 列の後方互換**: 既存イベントの COMPANIES に logoUrl 列が無くても、read 側は header 駆動(`g('logoUrl')`)で空を返すため壊れない。列は `adminUpdateCompany` が初回保存時に末尾へ自動作成。新規イベントは createEvent_ がスキーマに含む。`adminAddCompany` は logoUrl を付与しない（列ズレ回避）。→ **GAS 再デプロイ必須**。
- **グリッド突合は companyId 優先**: handoff は企業名突合だったが、同名・表記ゆれに弱いので stamps/companies 双方に companyId を載せて ID 突合（名前はフォールバック）。
- **ロゴ配信の推奨**: 最速・最安定は同一オリジン同梱（`app/logos/<companyId>.png`、CSP `'self'` のみで可）。URL貼り付け運用も両立するため CSP は `img-src 'self' https: data:`。Drive 共有リンクは `<img>` 直リンクに弱く非推奨（`lh3.googleusercontent.com`/`i.imgur.com`/自前を推奨）。
- **未対応（必要なら後日）**: start/stamp/exchange へのセクション見出し追加（現状は黒ヘッダーのみ）。マイルストーン両端ラベルが端で僅かに見切れる可能性（要実機確認、必要なら左右端だけ transform 調整）。

## [記録] admin/exchange デザイン統一での角丸の扱い（2026-06-12 記録）
- admin/exchange を共通 style.css 体系へ統一する際、**色・影は全て CSS 変数化**したが、
  admin の微小コントロール角丸(≤10px: stat-card=10 / company-item=9 / add-co-form=9 /
  url-box=9 / key-val・copy-btn=4 等)は**数値のまま据え置き**た。
- 理由: これらを共通トークン(--radius-ui=12)へ寄せると角が丸くなりすぎ、
  管理ツールの情報密度・締まった見た目が損なわれるため(タスクの「密度維持」条件を優先)。
- 主要カード(login/modal/section/event-card/nav-card)と入力・主要ボタンは
  --radius-card / --radius-ui に統一済み。今後さらに揃えたい場合は
  小半径用トークン(例 --radius-sm)を style.css に追加して一括適用するのが筋。

## [解決] 学生マスター列ズレ（LIVEシート19列化で解消・2026-06-12）
- 旧懸念「LIVE学生マスターの列ズレ(性別・所属校出場・規則誓約同意の列追加)」は
  LIVEシートが19列に修正済みのため**解決扱い**とする。CLAUDE_TASKS 進捗も更新。

## [記録] イベント(大会)スコープと端末cookieの混在リスク（2026-06-11 記録）
- 構造: 1つのGASで複数イベント。**イベントごとに別スプレッドシート**(eventSs_)。
  マスターに EVENT_LIST のみ。フロント(GitHub Pages)とGAS本体は全イベント共通。
- **イベント別(毎回別物)**: cardToken(学生名札)/stampToken/viewKey・stampKey(企業キー)/
  exchangeKey/各ログ(スタンプ・QR閲覧・景品)/CONFIG(景品設定・期限)。
- **全イベント共通(1つ)**: API_BASE_URL・ADMIN_KEY・WALK_IN_CODE・EVENT_LIST・フロント資材。
- **端末に残る(イベントに紐づかない=混在注意)**:
  - cookie `fg_stamp_token` / `fg_company_view` … ドメイン単位。前回イベントの値が残っていても
    今回イベントのシートに無ければ一致せず(=安全側で記録されないだけ)。要再取得。
  - localStorage `fg_event_id`(日付で自動更新) / `fg_company_name`(表示用)。
- **「前回の名札を持ってくる人」**: 旧名札QRは旧イベントのcardToken。新イベントのシートには
  存在せず無効 → **来場者は毎回新しい名札が必要**(または当日参加登録で新規発行)。
- **設計ギャップ(今回判明)**: card系URLは元々 event を持たず当日日付で自動判定。
  → 会期外テストや複数大会同時で取り違える(fallback `2026_test`)。
  対処: 企業QR用URLに `&event=<eventId>` を埋め込んで解消(2026-06-11)。
  学生名札URLは従来通り(会期中は日付判定でOK)。テスト時は `?event=` を付けるか
  EVENT_LIST に「今日」を含むテストイベントを置く。

## [記録] QR閲覧ログの自動記録/手動登録の区別方法と重複抑制（2026-06-11 記録）
- 状況: 企業QR(cookie方式)による閲覧ログ自動記録を実装（card.html?viewkey=<viewKey>）。
- **区別方法**: VIEW_LOG の6列目 `source` で区別する。
  - `company_auto` … 企業cookie(viewKey)による自動記録。companyId列には GAS が viewKey から解決した企業IDが入る。
  - `manual_email` … 従来のメール手動登録。companyId列は従来通り `'manual'`。
  - 旧データ（source列なし・5列）は manual 扱い相当。getCompanyView は companyId 一致で
    フィルタするため、`'manual'` 行が企業リストに混ざることはない（従来から同じ構造）。
- **重複抑制（軽量実装）**: `company_auto` のみ、同一イベント×同一学生×同一企業の既存行が
  あれば時刻のみ更新して行を増やさない（VIEW_LOG全行を線形走査。イベント規模では問題ない）。
  `manual_email` は従来通り毎回 append（メールアドレスを変えて再登録する可能性があるため）。
- **cookie 設計**: `fg_company_view` に viewKey のみ保存（60日・SameSite=Lax）。企業IDは
  毎回 GAS 側で解決するため、クライアントから企業IDを直接信用しない。企業名表示用に
  localStorage `fg_company_name` を併用（個人情報ではないため許容）。
- 既存シートへの申し送り: 既存イベントの QR閲覧ログ シートに6列目ヘッダー `source` を
  手動で追記推奨（なくても appendRow は6列目に書き込むため動作には支障なし）。

## [解決] card.html の inline onclick が CSP でブロックされていた（2026-06-11 記録）
- 状況: card.html は CSP `script-src 'self'`（unsafe-inline なし）なのに、
  `onclick="copyEmail()"` 等の inline ハンドラを使用していた。inline イベントハンドラは
  この CSP でブロックされるため、メールコピー・一覧コピー・アコーディオン・メール登録の
  各ボタンが**本番で動作していなかった可能性が高い**。
- 結論: 企業QR実装と同時に全て addEventListener 方式へ変更して解消。
  他ページ（progress/exchange/start等）は元から addEventListener 方式で問題なし。

## [未解決] 準備ステップ②③の「準備中」機能の実装（2026-06-09 記録）
- 状況: admin.html の準備ステップガイドに「準備中」として枠だけ設置した機能が3つ。
  - ② 学生マスター取込（importStudents の UI 化）
  - ② 企業マスター編集 UI
  - ③ 学生QR URL 一括発行 / 企業NFC URL 発行 / ラベル用CSV出力
- 懸念/論点: 現在はボタンを押すとトーストで「今後実装予定」と表示するのみ。運営の作業負荷軽減のため、順次実装が必要。
- 案: 別タスクで `importStudents` UI 化（CSVアップロード→スプレッドシートへ書き込み）から着手するのが最も実用的と思われる。CLAUDE_TASKS.md に別タスクとして追記すること。
- 申し送り: step badge の完了判定（学生数>0 AND 企業登録あり）は `loadStats_()` + `loadCompanies_()` のデータから自動判定済み。ステップ③は `walkInCode_` 設定 + 企業キー発行済みで自動「完了」判定。

## [未解決] 学生マスターシートが STUDENT_COLS と3列ズレている（性別が未保存）（2026-06-08 記録）
- 状況: LIVE の学生マスターは16列（studentId..登録種別）で、`性別`・`所属校出場`・`規則誓約同意` が欠落。一方 admin.gs の `STUDENT_COLS` は19列。
- 影響: `registerWalkIn` はヘッダ名照合で書くため、列が無い `性別`（当日フォームで収集済み）や `規則誓約同意` が黙って捨てられる。
- 対処: シートのヘッダを STUDENT_COLS(19列) に「列の挿入」で揃える（生年月日↔メールアドレス間に `性別`、電話番号↔SNS同意間に `所属校出場`→`規則誓約同意`）。順序厳守（importStudents は位置依存でヘッダ上書きするため）。
- 申し送り: 今後 STUDENT_COLS を変更したら、必ず LIVE シートの列も同時に更新する（手動シートとコードが乖離しやすい）。

## [解決] 当日フォーム「規則誓約同意」(#15) は仕様書準拠で採用（2026-06-08 記録）
- 経緯: 一度「見学・応援は競技に出場しないため不要」と判断し撤回したが、実際は見学・応援学生も大会規則・誓約書に同意していたと確認。仕様書準拠で再採用。
- 結論: 大会規則書・誓約書の参照URL（仕様書 line165-166）をリンクとして同意文に埋め込み、`rulesConsent`→`規則誓約同意` 列に保存する。フロント/GAS patch 反映済み。

## [解決] activateStamp の期間チェック（2026-06-09 記録）
- 結論: 期間チェック不要。スタンプラリー登録（activateStamp）は物理的に当日会場にいる必要があるため、遠隔からの事前登録は現実的に不可能。現状のまま（チェックなし）で運用する。

## [解決] 景品交換の一本化（2026-06-09 記録）
- 結論: **学生側確定（`exchangePrize` / `progress.html`）に一本化**。スタッフ側の `markPrizeExchanged`（`exchange.html`）はコードとして残すが、本番では使用しない。`progress.html` の「景品を受け取る」ボタンが唯一の交換フローとなる。

## [未解決] 脱Googleフォーム化（受付の自前化）構想（2026-06-08 記録）
- 状況: 現在の本受付は Google フォーム（仕様書 `formula_gymkhana_2026_form_spec.md`）。当日参加はこのプラットフォーム側の `register.html` で受けている。将来的に Google フォーム依存を解消し、受付をプラットフォーム側で完結させたい意向（現在は計画段階）。
- 懸念/論点: ①ファイルアップロード（誓約書・免許証・保険証明）をどこに保存するか（GAS+Drive想定？）②4区分の分岐①と保険分岐②を自前UIで再現する工数 ③個人情報・同意記録の保全と権限管理 ④Googleフォームの自動集計/通知の代替。
- 案: まず当日参加（見学・応援パス）だけ自前化を進め、設計知見を貯めてから本受付の移行可否を判断する。

## [未解決] CLAUDE_TASKS.md がディスク上に存在していなかった（2026-06-08 記録）
- 状況: 旧 CLAUDE_TASKS.md（前提・背景＋T2/T3/T7）はチャットに貼られただけでファイル化されておらず、リポジトリに無かった。前セッションのログから全文復元して新規作成した。
- 懸念/論点: 今後また「指示書だけチャットに貼ってファイル化しない」運用に戻ると、セッションをまたいだ引き継ぎが失われる。
- 案: 指示書・仕様書の類はチャット貼り付けで終わらせず、必ず `CLAUDE_TASKS.md` / `docs/` 配下にファイルとしてコミットする運用を徹底する。

## [未解決] eventId 比較の型不一致リスク（2026-06-08 記録）
- 状況: `actionSaveStamp_` / `actionGetStampProgress_` / `countStamps_` 等で `r[1] === p.event`（生値比較）と `String(...)` 比較が混在している（旧 CLAUDE_TASKS.md「任意（おまけ）」項）。
- 懸念/論点: eventId が数値的に見える値だと型不一致で一致判定に漏れが出る余地がある。
- 案: スタンプログ系の eventId 比較を `String(r[1]) === String(eventId)` に統一する予防的リファクタ（挙動は変えない範囲）。

## [未解決] GASファイルがリポジトリ管理外（手動コピペ反映）（2026-06-08 記録）
- 状況: `api.gs` / `admin.gs` はリポジトリに含まれず、`docs/gas-patches/*.final.txt` を GAS エディタへ手動コピペして反映する運用。
- 懸念/論点: 反映漏れ・反映ズレが検知できない。`*.final.txt` と実 GAS が乖離しても気づけない。
- 案: 反映時に CHANGELOG へ「GAS反映済み」を1行残す、もしくは clasp 等で GAS をリポジトリ管理下に置くことを将来検討。

## [解消] 横断レビュー一括対応（2026-06-18）
- **eventId 比較の String() 統一**: `actionSaveStamp_`（dup/prevCount）・`actionGetStampProgress_`・`actionGetCompanyStampVisitors_` の `r[1] === p.event` を `String()` 比較に統一済み（上記「未解決」eventId項を解消）。**GAS再デプロイ必須**。
- **既存学生の再受付トークン**: `actionRegisterWalkIn_` の `already_registered` で参加者行が無い場合に発行トークンをシートへ追記するよう修正（未保存トークン→スタンプ不能を解消）。**GAS再デプロイ必須**。
- **当日重複照合の空白正規化**: 氏名+大学名の照合を空白除去して比較（復帰の取りこぼし防止）。**GAS再デプロイ必須**。
- フロント: 当日登録のPOST化（PII非URL化）、company/exchange への event 貫通、card/start の jsQR 遅延読込、登録フォーム input 16px化＋全ページ maximum-scale 撤去、preconnect 追加、start.js 景品表示の現行フィールド化、admin ロゴ onerror の JS化、CSV二重BOM解消、admin 受付URL `?code=` 掃除（デプロイ不要）。

## [注意] importStudents は token を「氏名＋大学名」で引き継ぐ（2026-06-18 記録）
- 状況: `importStudents`（[admin.gs.final.txt](gas-patches/admin.gs.final.txt) 付近）は学生マスターをクリア再作成し、cardToken を氏名＋大学名で同定して引き継ぐ。
- 懸念: 同姓同名・大学名の表記揺れ・改名/入力修正があると、トークンの消失や誤引継ぎ（別人へ）が起きうる。
- 案: 取り込み前にバックアップ。氏名＋大学名の正規化（空白除去）を再取込側にも適用するか、studentId キーでの引継ぎを検討。

## [見送り・受容] 横断レビューで対応しない判断（2026-06-18）
- **Cookie がイベント別でない**: 旧 `fg_stamp_token`/`fg_company_view` が残っても、トークンは event 一致でしか解決せず「invalid（安全失敗）」になるため、別イベント参加者として扱われる事故は起きない。イベント重複予定も無いため対応見送り。
- **準備中でも公開導線が開く**: 日付駆動のみとする確定方針により受容（`完了` のみ除外）。「開催中必須」は当日切替忘れ→全停止の単一障害点になるため採用しない。
- **CI / GAS差分可視化**: 別タスク（インフラ）。本リポジトリ単独では自動化判断が必要なため保留。
