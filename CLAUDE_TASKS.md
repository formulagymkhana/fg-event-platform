# Claude Code 作業指示書 — FG Event Platform

このファイルは Claude Code に作業を依頼するための指示書です。
リポジトリのルートに置き、Code を起動したら「CLAUDE_TASKS.md を読んで作業して」と指示してください。

> 復元メモ（2026-06-08）: 旧 CLAUDE_TASKS.md はチャット貼り付けのみでファイル化されていなかったため、
> 前セッションのログから全文復元のうえファイル化した。T2/T3/T7 の本文は当時の指示書そのまま。

---

## 0. 前提・背景

FG Event Platform（Formula Gymkhana のイベント管理基盤）の改修。
構成は `handoff.md` を参照。要点だけ再掲する。

- フロントエンド: GitHub Pages（このリポジトリ）。HTML + 素の JS。
- バックエンド: Google Apps Script（スタンドアロン Web App）。1つの GAS で複数イベントを管理。
- トークン設計:
  - `cardToken` … 企業が学生情報を閲覧するトークン（学生マスターの token 列）
  - `stampToken` … 学生のスタンプラリー用トークン（fg_stamp_token cookie）
- 景品モデル: 「N個集めるとM個選べる」（prizeThreshold / prizeCount / exchangeKey）

### 重要な運用方針（確定事項）

**景品交換は「学生側確定方式」を正式採用する。**
- 学生が `progress.html` の「景品を受け取る」→「はい、受け取りました」を押して確定する。
- スタッフは画面の「引換可能」表示を確認してから、学生に操作させる運用ルールとする。
- スタッフ側 `exchange.html` / `markPrizeExchanged` は廃止せず、補助・予備として残す。

---

## 0.1 GASファイルの扱いについて（重要）

このリポジトリには GAS の `.gs` ファイル（`api.gs` / `admin.gs`）が
**含まれていない**（GAS 側はユーザーが GAS エディタで直接管理）。

- リポジトリ内に `api.gs` / `admin.gs` が**存在する場合**: そのまま編集して差分を作る。
- **存在しない場合**: 修正後の完成版コードを `docs/gas-patches/` に出力する
  （現状の運用。`api.gs.final.txt` / `admin.gs.final.txt` が反映元）。
  ユーザーが GAS エディタへ手動でコピペして反映する。

---

## 0.2 作業ルール（恒久・必ず従う）

今後このリポジトリで作業する際は、必ず以下に従うこと。

- タスクを完了して push する前に、必ず `docs/CHANGELOG.md` の先頭へ今回の変更を1エントリ追記する。
- 作業中に気づいた懸念・改善案・設計上の論点は `docs/NOTES.md` に追記する
  （その場で直さなくてよい。記録して申し送る）。
- この `CLAUDE_TASKS.md` の「進捗ステータス／残タスク」も、完了・新規発生に応じて更新する。
- **push は実行前に必ずユーザーへ確認を取る。**

---

## 0.3 進捗ステータス（2026-06-08 時点）

完了済み（git 履歴・CHANGELOG 参照）:
- T2: findStudentByStampToken_() の検索条件強化 ✅
- T3: 期間チェックの追加 ＋ exchangePrize の実装 ✅
- T5: jsQR をローカル配置し CDN 依存を解消 ✅
- T6: イベント自動判定・当日飛び込み登録 ✅
- T7: admin.gs の重複関数を整理 ✅
- T11: 学生マスター token 列を cardToken にリネーム＋関連修正 ✅
- T12: 管理パネル実装・簡素化・ADMIN_KEY 変更機能 ✅

進行中／残タスク:
- 当日参加者フォーム: 入力規則の整合（見学・応援パス準拠）まで完了 ✅（2026-06-08）。
  - 残: LIVE学生マスターの列ズレ修正（`性別`・`所属校出場` の列追加。NOTES参照）。
  - 将来スコープ（郵便番号/住所詳細・来場日・弁当・サービス作業/保険）は未着手。
- 将来構想: 脱Googleフォーム化（NOTES.md 参照。計画段階）。
- 任意: eventId 比較の String() 統一（下記「任意（おまけ）」参照。NOTES.md にも記録）。

---

## タスク T2: findStudentByStampToken_() の検索条件強化 〔完了〕

### 目的
現状 `findStudentByStampToken_()` は stampToken 単体で参加者を検索している。
1つの GAS で複数イベントを扱う設計のため、`eventId` 一致と `status === 'active'`
も条件に加え、別イベント・無効トークンを拾わないようにする。

### 対象
`api.gs` の `findStudentByStampToken_(stampToken, eventId)`

### 修正後の実装（この内容に置き換える）

```javascript
function findStudentByStampToken_(stampToken, eventId) {
  const sheet = eventSs_(eventId).getSheetByName(SHEET.STAMP_PARTICIPANTS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const stCol   = headers.indexOf('stampToken');
  const sidCol  = headers.indexOf('studentId');
  const evCol   = headers.indexOf('eventId');
  const stsCol  = headers.indexOf('status');
  const row = data.slice(1).find(r =>
    String(r[stCol]) === String(stampToken) &&
    String(r[evCol]) === String(eventId) &&
    (stsCol < 0 || String(r[stsCol]) === 'active')
  );
  if (!row) return null;
  return findStudentById_(String(row[sidCol]), eventId);
}
```

### 注意
- `stsCol < 0` のフォールバックは、status 列を持たない旧シートでも壊れないため。
  スタンプ参加者シートの現行スキーマは
  `['時刻','eventId','studentId','stampToken','activatedAt','status']` で status を持つ。

### 受け入れ条件
- stampToken が一致しても eventId が異なる行は拾わない。
- status が 'active' 以外（将来 'revoked' 等を入れた場合）の行は拾わない。
- status 列が無い場合は従来通り stampToken + eventId だけで判定（後方互換）。

---

## タスク T3: 期間チェックの追加 ＋ exchangePrize の実装 〔完了〕

### 背景
- `getStudent` / `saveViewLog` には `publicDeadline` チェックがあるが、
  スタンプ取得・景品交換には期間制御が無い。
- さらに、フロント（api.js / progress.js）は `exchangePrize` を呼んでいるが、
  **api.gs に `exchangePrize` アクションが未実装**（dispatch_ にも actionExchangePrize_ にも無い）。
  学生側確定方式を正式採用する以上、これの新規実装が必須。

### T3-a. 設定シートに追加するキー（ドキュメント反映）
スタンプ期間と交換期限を publicDeadline とは分離する。
以下を設定シートに持たせる前提で実装する（実際のシート入力はユーザーが行う）。

| キー | 例 | 説明 |
|------|-----|------|
| stampStartAt | 2026/08/22 09:00 | スタンプ取得開始 |
| stampEndAt | 2026/08/23 17:00 | スタンプ取得終了 |
| exchangeDeadline | 2026/08/23 17:30 | 景品交換期限 |

- いずれも未設定なら「制限なし」として扱う（後方互換）。
- `handoff.md` の「設定シートの主要項目」表にもこの3キーを追記すること。
- `admin.gs` の `setupEventSpreadsheet_` の CONFIG スキーマにもこの3行を追加する
  （値は空文字でよい。例: `['stampStartAt', ''], ['stampEndAt', ''], ['exchangeDeadline', '']`）。

### T3-b. 判定ヘルパーを追加（api.gs）
`isPastDeadline_` の近くに追加する。

```javascript
/** スタンプ取得可能期間内か（未設定なら常にtrue） */
function isStampOpen_(cfg) {
  const now = new Date();
  if (cfg.stampStartAt && now < new Date(cfg.stampStartAt)) return false;
  if (cfg.stampEndAt   && now > new Date(cfg.stampEndAt))   return false;
  return true;
}
/** 景品交換可能期限内か（未設定なら常にtrue） */
function isExchangeOpen_(cfg) {
  if (!cfg.exchangeDeadline) return true;
  return new Date() <= new Date(cfg.exchangeDeadline);
}
```

### T3-c. saveStamp に期間チェックを組み込む（api.gs）
`actionSaveStamp_` の冒頭で cfg を取得し、`isStampOpen_` を確認する。
※現状 cfg はスタンプ記録の後で取得しているので、前に移動して使い回す
（後半の `const cfg = getConfig_(p.event);` は重複するので削除）。
修正後の冒頭部分（イメージ）:

```javascript
function actionSaveStamp_(p) {
  if (!p.st || !p.ct) return err_('missing_params');
  if (!p.event) return err_('missing_event');
  const cfg = getConfig_(p.event);
  if (!isStampOpen_(cfg)) return err_('stamp_closed');
  const student = findStudentByStampToken_(p.st, p.event);
  if (!student) return err_('invalid_student_token');
  // …（以降の重複・NFC判定、appendRow は既存のまま）…
  // 既存の「今回のスタンプで景品条件を達成したか」ブロックでは
  // 上で取得した cfg をそのまま使い、再取得の行は削除する:
  const threshold = Number(cfg.prizeThreshold) || Number(cfg.prizeCriteria) || 5;
  const justCleared = prevCount < threshold && count >= threshold;
  // …
}
```

### T3-d. exchangePrize アクションを新規実装（api.gs）
dispatch_ に分岐を追加:

```javascript
case 'exchangePrize': return actionExchangePrize_(p);
```

アクション本体を追加（markPrizeExchanged の近くに配置）:

```javascript
// ============================================================
// アクション: exchangePrize (学生側確定 / stampToken)
// 学生が progress.html で景品交換を確定する。1人1回のみ。
// ============================================================
function actionExchangePrize_(p) {
  if (!p.token) return err_('missing_token');
  if (!p.event) return err_('missing_event');
  const cfg = getConfig_(p.event);
  if (!isExchangeOpen_(cfg)) return err_('exchange_closed');
  const student = findStudentByStampToken_(p.token, p.event);
  if (!student) return err_('invalid_token');
  const count     = countStamps_(p.event, student.studentId);
  const threshold = Number(cfg.prizeThreshold) || Number(cfg.prizeCriteria) || 5;
  if (count < threshold) return err_('not_cleared');
  if (isExchanged_(p.event, student.studentId)) return err_('already_exchanged');
  eventSs_(p.event).getSheetByName(SHEET.PRIZE_LOG).appendRow([
    new Date(), p.event, student.studentId, student.name,
    count, '学生確定',
  ]);
  // progress.js は res.data を renderProgress に渡すため buildStampResult_ 形式で返す
  return ok_(buildStampResult_(p.event, student.studentId, count, {}));
}
```

### T3-e. エラーコードを追加（api.gs の err_ の MSG）

```javascript
stamp_closed:    'スタンプ取得期間外です',
exchange_closed: '景品交換期間が終了しました',
```

### 受け入れ条件
- stampStartAt / stampEndAt が未設定なら saveStamp は従来通り動く。
- 期間外に saveStamp を呼ぶと `{ ok:false, error:'stamp_closed' }` を返す。
- exchangePrize が dispatch_ から呼べる。
- 達成前は `not_cleared`、二重交換は `already_exchanged`、
  期限切れは `exchange_closed` を返す。
- 成功時は buildStampResult_ 形式（stampCount/prizeThreshold/prizeCount/cleared/exchanged）を返す。
- フロントの `progress.js` の `doExchange()` は変更不要（既存のまま動くこと）。

---

## タスク T7: admin.gs の重複関数を整理 〔完了〕

`admin.gs` に `runAddStampParticipantsSheet()` が **2か所** 定義されている
（`addStampParticipantsSheet` 直後と、ファイル末尾）。
内容が同一であることを確認のうえ、**ファイル末尾側の1つを残し、重複を削除**する
（または逆でもよい。残すのはどちらか1つ）。

### 受け入れ条件
- `runAddStampParticipantsSheet` の定義がファイル内に1つだけになる。

---

## 任意（おまけ）: saveStamp の eventId 比較を String() で統一

`actionSaveStamp_` / `actionGetStampProgress_` / `countStamps_` 等で
`r[1] === p.event`（生値比較）と `String(...)` 比較が混在している。
eventId が数値的に見える値だと型不一致の余地があるため、
スタンプログ系の eventId 比較を `String(r[1]) === String(eventId)` に統一すると安全。
※挙動を変えない範囲の予防的リファクタなので、時間があれば。（→ NOTES.md に記録済み）

---

## 作業の進め方（Code向け）

1. まず `handoff.md` と、フロントの `api.js` / `progress.js` / `stamp.js` を読んで現状を把握する。
2. リポジトリ内に `.gs` があるか確認し、「0.1」の方針に従って編集 or パッチ出力を選ぶ。
3. 各タスクの受け入れ条件を満たすか確認する。
4. `handoff.md` のドキュメント追記が必要なら忘れず行う。
5. 変更内容を要約し、コミットメッセージ案を提示する。
6. **push は実行前にユーザーへ確認を取ること。**
7. 完了時は `docs/CHANGELOG.md` 先頭に1エントリ追記し、本ファイルの進捗ステータスを更新する。
