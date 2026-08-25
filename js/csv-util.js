/**
 * FG Event Platform — CSV出力の共通ユーティリティ
 *
 * ⚠ 管理画面（admin.js）と企業ページ（company.js）の両方から使う。
 *   以前は admin.js の中にあり企業ページから使えなかったため、
 *   2026-08-24 にここへ切り出した（docs/NOTES.md「CSV出力が散らばっている」対応の一歩）。
 *   このファイルは必ず admin.js / company.js より前に読み込むこと。
 */

/**
 * CSV文字列をBOM付きでダウンロードする唯一のヘルパー。
 *
 * ⚠ 引数順は (ファイル名, 本文)。本文にBOMを含めないこと（この関数が付与する）。
 *   2026-08-10 まで本ファイル内に同名の関数が2つあり（こちらが `(body, filename)`、
 *   CSV出力セクション側が `(filename, csv)` と引数順が逆）、関数宣言の巻き上げで
 *   後者が前者を上書きしていた。その結果、学生QR / 企業NFC / 企業再閲覧QR の
 *   3つのCSVは「ファイル名がCSV本文、中身がファイル名」という状態で出力され、
 *   BOMも失われていた。定義をこの1つに統合したので、増やさないこと。
 */
/**
 * Shift_JIS(CP932) エンコーダ。
 * 運送会社の送り状発行システムは Shift_JIS の CSV しか受け付けないものが多く、
 * UTF-8 のまま渡すと「読み込めません」あるいは取込後に文字化けする
 * （2026-08-17、西濃運輸の企業パス発送CSVで実際に発生）。
 *
 * ⚠ ブラウザ標準の TextEncoder は UTF-8 専用で、Shift_JIS への変換はできない。
 *   一方 TextDecoder は 'shift_jis' に対応しているので、**全バイト組み合わせを一度
 *   デコードして逆引き表を作る**ことで、外部ライブラリなしにエンコードを実現する。
 *   このリポジトリはビルド無し・依存は手動ベンダリングのため、表を持つより軽い。
 *   表は初回呼び出し時に一度だけ構築してキャッシュする（約9,400文字）。
 */
let sjisMap_ = null;
function buildSjisMap_() {
  if (sjisMap_) return sjisMap_;
  const dec = new TextDecoder('shift_jis');
  const map = new Map();
  // 1バイト: ASCII と半角カナ
  for (let b = 0x20; b <= 0x7E; b++) map.set(String.fromCharCode(b), [b]);
  for (let b = 0xA1; b <= 0xDF; b++) {
    const ch = dec.decode(new Uint8Array([b]));
    if (ch && ch !== '\uFFFD') map.set(ch, [b]);
  }
  // 2バイト: リード 0x81-0x9F / 0xE0-0xFC、トレイル 0x40-0x7E / 0x80-0xFC
  const trails = [];
  for (let t = 0x40; t <= 0x7E; t++) trails.push(t);
  for (let t = 0x80; t <= 0xFC; t++) trails.push(t);
  const leads = [];
  for (let l = 0x81; l <= 0x9F; l++) leads.push(l);
  for (let l = 0xE0; l <= 0xFC; l++) leads.push(l);
  for (const lead of leads) {
    const buf = new Uint8Array(trails.length * 2);
    trails.forEach((t, i) => { buf[i * 2] = lead; buf[i * 2 + 1] = t; });
    const chars = [...dec.decode(buf)];
    if (chars.length === trails.length) {
      chars.forEach((ch, i) => {
        if (ch !== '\uFFFD' && !map.has(ch)) map.set(ch, [lead, trails[i]]);
      });
    } else {
      // 1ペア=1文字にならなかった場合のみ、1ペアずつ確認する（保険）
      trails.forEach(t => {
        const ch = dec.decode(new Uint8Array([lead, t]));
        if (ch && ch !== '\uFFFD' && [...ch].length === 1 && !map.has(ch)) map.set(ch, [lead, t]);
      });
    }
  }
  // Mac と Windows で割れやすい記号を、Shift_JIS 側の対応字へ寄せる
  // （波ダッシュ U+301C ↔ 全角チルダ U+FF5E など。放置すると '?' になる）
  const alias = { '\u301C': '\uFF5E', '\u2212': '\uFF0D', '\u2016': '\u2225',
                  '\u00A2': '\uFFE0', '\u00A3': '\uFFE1', '\u00AC': '\uFFE2' };
  for (const from of Object.keys(alias)) {
    const to = alias[from];
    if (!map.has(from) && map.has(to)) map.set(from, map.get(to));
  }
  sjisMap_ = map;
  return map;
}

/** 文字列を Shift_JIS バイト列へ。変換できない文字は '?' にし、一覧を返す。 */
function encodeSjis_(text) {
  const map = buildSjisMap_();
  const out = [];
  const bad = new Set();
  for (const ch of String(text)) {
    if (ch === '\n') { out.push(0x0A); continue; }
    if (ch === '\r') { out.push(0x0D); continue; }
    const b = map.get(ch);
    if (b) out.push(...b);
    else { bad.add(ch); out.push(0x3F); }
  }
  return { bytes: new Uint8Array(out), unsupported: [...bad] };
}

/**
 * Shift_JIS の CSV としてダウンロードする（BOMは付けない）。
 * 変換できない文字があれば呼び出し元へ返し、警告に使わせる。
 */
function downloadCsvSjis_(filename, body) {
  const { bytes, unsupported } = encodeSjis_(body);
  const blob = new Blob([bytes], { type: 'text/csv;charset=shift_jis;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return unsupported;
}

function downloadCsv_(filename, body) {
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/**
 * CSVの1セルを安全に整形する（全CSV出力の共通処理・2026-08-25 追加）。
 *
 * ⚠ 数式インジェクション対策を含む。氏名・大学名・学部学科などは学生の自由入力で、
 *   `=`, `+`, `-`, `@` で始まる値をそのまま渡すと **Excel が数式として評価する**。
 *   引用符で囲んでも防げない（Excelは囲みを外してから評価する）ため、
 *   危険な先頭文字の前にシングルクォートを付けて無害化する。
 *   タブ・CR で始まる値も Excel が前後を詰めて数式化しうるので対象に含める。
 *
 * ⚠ 付けたシングルクォートは Excel の表示上は出ない（先頭のアポストロフィは
 *   「文字列として扱う」指示として解釈される）。ただしテキストエディタで開くと見える。
 */
function csvSafe_(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
