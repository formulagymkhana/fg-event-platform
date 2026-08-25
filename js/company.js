/**
 * FG Event Platform — 企業来訪学生一覧
 *
 * URL形式: company.html?key=[viewKey]&event=[eventId(任意)]
 * key 省略時は cookie fg_company_view にフォールバック。
 */

const $ = id => document.getElementById(id);

function showState(state) {
  ['loading', 'error', 'main'].forEach(s => {
    const el = $('state-' + s);
    if (el) el.style.display = s === state ? (s === 'error' ? 'flex' : '') : 'none';
  });
}

function showErr(title, msg) {
  $('err-title').textContent = title;
  $('err-msg').textContent   = msg;
  showState('error');
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── タブ切り替え ──────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $('content-' + btn.dataset.tab)?.classList.add('active');
  });
});

// ── 学生行レンダリング ────────────────────────────
function cardUrl(v) {
  const base = 'card.html?token=' + encodeURIComponent(v.cardToken || '');
  return _event ? base + '&event=' + encodeURIComponent(_event) : base;
}

function visitorRow(v) {
  const url   = v.cardToken ? cardUrl(v) : null;
  const outer = url
    ? `<a class="visitor-row v-row-link" href="${esc(url)}" target="_blank" rel="noopener">`
    : `<div class="visitor-row">`;
  const close = url ? '</a>' : '</div>';
  const dept = v.department ? ` · ${esc(v.department)}` : '';
  // 学年は「大学学部1年生」等それ自体が完結した表記のため「年」を付け足さない
  const yr   = v.year ? ` · ${esc(v.year)}` : '';
  return `
    ${outer}
      <div class="v-head">
        <div class="v-name">${esc(v.name)}<span class="v-furigana">${esc(v.furigana)}</span>${url ? '<span class="v-arrow">›</span>' : ''}</div>
        <div class="v-time">${esc(v.time)}</div>
      </div>
      <div class="v-meta">${esc(v.school)}${yr}${dept}<span class="v-cat">${esc(v.category)}</span></div>
      ${v.email ? `<div class="v-email" data-email="${esc(v.email)}">${esc(v.email)}</div>` : ''}
    ${close}`;
}

function renderQrList(visitors) {
  const wrap = $('qr-list-wrap');
  if (!visitors.length) {
    wrap.innerHTML = '<p class="empty-note">QRスキャンの記録がありません</p>';
    return;
  }
  wrap.innerHTML = `<div class="visitor-list">${visitors.map(visitorRow).join('')}</div>`;
  wrap.querySelectorAll('.v-email[data-email]').forEach(el =>
    el.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard?.writeText(el.dataset.email).then(() => toast('メールアドレスをコピーしました'));
    }));
}

function renderStampList(visitors) {
  const wrap = $('stamp-list-wrap');
  if (!visitors.length) {
    wrap.innerHTML = '<p class="empty-note">スタンプ来訪の記録がありません</p>';
    return;
  }
  wrap.innerHTML = `<div class="visitor-list">${visitors.map(visitorRow).join('')}</div>`;
  wrap.querySelectorAll('.v-email[data-email]').forEach(el =>
    el.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard?.writeText(el.dataset.email).then(() => toast('メールアドレスをコピーしました'));
    }));
}

// ── データ取得 ────────────────────────────────────
let _key = '';
let _event = null;   // URLの event。省略時のみ当日の自動判定にフォールバック

async function loadQr() {
  $('qr-list-wrap').innerHTML = '<p class="empty-note" style="color:var(--fg-muted)">読み込み中...</p>';
  const res = await FG_API.getCompanyView(_key, _event);
  if (!res.ok) {
    const msg = res.error === 'expired'
      ? 'イベント終了後はQR閲覧ログの表示期間が終了しています。'
      : (res.message || '取得に失敗しました');
    $('qr-list-wrap').innerHTML = `<div class="err-note">${esc(msg)}</div>`;
    return;
  }
  $('qr-count').textContent = ' ' + res.data.total + '名';
  renderQrList(res.data.visitors || []);
}

async function loadStamp() {
  $('stamp-list-wrap').innerHTML = '<p class="empty-note" style="color:var(--fg-muted)">読み込み中...</p>';
  const res = await FG_API.getCompanyStampVisitors(_key, _event);
  if (!res.ok) {
    const msg = res.error === 'expired'
      ? '公開期限が終了しました。'
      : (res.message || '取得に失敗しました');
    $('stamp-list-wrap').innerHTML = `<div class="err-note">${esc(msg)}</div>`;
    return;
  }
  $('stamp-count').textContent = ' ' + res.data.total + '名';
  renderStampList(res.data.visitors || []);
}

// ── 初期化 ────────────────────────────────────────
(async () => {
  try {
  _event = FG_API.getParam('event') || null;

  // viewkey param = 企業QR初回スキャン → cookie保存して登録バナー表示
  const vkParam = FG_API.getParam('viewkey');
  if (vkParam) {
    const vkRes = await FG_API.resolveViewKey(vkParam, _event);
    if (!vkRes.ok) {
      // ⚠ 開催中のイベントが無いだけの場合を「QRが無効」と言ってはいけない。
      //   ラミネートQRから来た企業が最初に通るのがこの経路で、
      //   キーは正しいのに「無効」と出ると配り直しの問い合わせになる。
      if (vkRes.error === 'no_active_event') {
        showErr('現在イベントは開催されておりません',
                '大会期間中および大会終了後の公開期間中にご覧いただけます。お手数ですが、大会当日以降に再度アクセスしてください。');
      } else {
        showErr('企業QRが無効です', '配布された企業QRを再度ご確認ください。');
      }
      return;
    }
    FG_API.saveCompanyViewKey(vkParam);
    _key = vkParam;
    // 登録完了バナー表示（タイトル・本文はHTMLに固定。企業名はヘッダーの co-name に表示される）
    const banner = $('reg-banner');
    if (banner) banner.style.display = '';
  } else {
    _key = FG_API.getParam('key') || FG_API.getCompanyViewKey() || '';
  }

  if (!_key) {
    showErr('閲覧キーがありません', '企業担当者用のURLからアクセスしてください。');
    return;
  }

  // 企業名取得 + 両タブ初期ロード
  const [stampRes, qrRes] = await Promise.all([
    FG_API.getCompanyStampVisitors(_key, _event),
    FG_API.getCompanyView(_key, _event),
  ]);

  if (stampRes.error === 'invalid_key' && qrRes.error === 'invalid_key') {
    showErr('閲覧キーが無効です', '配布されたURLを再度ご確認ください。');
    return;
  }

  // ⚠ 閲覧QRはイベントIDを持たない永続URL。どの大会を表示するかはGASが
  //   「開始済みの最新イベント」として解決するため、次のいずれかで該当なしになる。
  //     ・最初の大会がまだ開始していない
  //     ・大会終了後に運営がイベントを「公開停止」にした（＝全停止。仕様）
  //   このとき専用の案内を出さないと、企業側からは「QRが壊れている」と見えて
  //   問い合わせの原因になる。
  if (stampRes.error === 'no_active_event' && qrRes.error === 'no_active_event') {
    showErr('現在イベントは開催されておりません',
            '大会期間中および大会終了後の公開期間中にご覧いただけます。お手数ですが、大会当日以降に再度アクセスしてください。');
    return;
  }

  const companyName = (stampRes.ok ? stampRes.data.companyName : null)
    || (qrRes.ok ? qrRes.data.companyName : null)
    || '—';
  $('co-name').textContent = companyName + ' 様';

  // スタンプ
  if (stampRes.ok) {
    $('stamp-count').textContent = ' ' + stampRes.data.total + '名';
    renderStampList(stampRes.data.visitors || []);
  } else {
    const msg = stampRes.error === 'expired' ? '公開期限が終了しました。' : (stampRes.message || '取得に失敗しました');
    $('stamp-list-wrap').innerHTML = `<div class="err-note">${esc(msg)}</div>`;
  }

  // QR
  if (qrRes.ok) {
    $('qr-count').textContent = ' ' + qrRes.data.total + '名';
    renderQrList(qrRes.data.visitors || []);
  } else {
    const msg = qrRes.error === 'expired' ? 'イベント終了後はQR閲覧ログの表示期間が終了しています。' : (qrRes.message || '取得に失敗しました');
    $('qr-list-wrap').innerHTML = `<div class="err-note">${esc(msg)}</div>`;
  }

    showState('main');

    // 更新ボタン
    $('btn-reload-qr')?.addEventListener('click', loadQr);
    $('btn-reload-stamp')?.addEventListener('click', loadStamp);

    // 学生QR読み取り（一覧が表示できた場合のみ有効化する）
    $('btn-scan-student')?.addEventListener('click', openStudentScan);
    $('btn-scan-cancel')?.addEventListener('click', closeStudentScan);

    // 学生情報の一括ダウンロード（一覧が表示できた場合のみ有効化する）
    $('btn-download-csv')?.addEventListener('click', downloadVisitorsCsv_);
  } catch (e) {
    showErr('エラーが発生しました', '再読み込みしてもう一度お試しください。');
  }
})();

// ── 学生QR読み取り（企業が学生情報を開く） ──────────────────
// ⚠ 既存の一覧表示・ログ記録には手を入れていない。追加のみ。
//   学生カードは card.js の autoViewLog_ が企業cookieを見て自動で閲覧ログを記録するため、
//   ここでログを書く必要はない（二重記録を避けるためにも書かない）。
let _scanStream = null, _scanCanvas = null, _scanCtx = null, _scanRafId = null;
let _scanPaused = false, _jsqrPromise = null;

function ensureJsQR_() {
  if (window.jsQR) return Promise.resolve();
  if (_jsqrPromise) return _jsqrPromise;
  _jsqrPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = '../js/vendor/jsQR.js';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('jsQR load failed'));
    document.head.appendChild(el);
  });
  return _jsqrPromise;
}

function setScanMsg_(text, cls) {
  const el = $('overlay-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'overlay-msg' + (cls ? ' ' + cls : '');
}

/** QRの中身がトークン単体かどうか（学生パスのQRはトークンのみを持つ） */
function isLikelyToken_(v) {
  const t = String(v || '').trim();
  if (!t || /\s/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false;
  return /^[A-Za-z0-9_-]{16,64}$/.test(t);
}

async function openStudentScan() {
  const overlay = $('scan-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  setScanMsg_('', '');
  _scanPaused = false;
  _scanCanvas = document.createElement('canvas');
  _scanCtx    = _scanCanvas.getContext('2d');

  try {
    const jsqrReady = ensureJsQR_();
    _scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = $('scan-video');
    video.srcObject = _scanStream;
    await video.play();
    _scanCanvas.width  = video.videoWidth  || 1280;
    _scanCanvas.height = video.videoHeight || 720;
    await jsqrReady;
    scanLoop_(video);
  } catch (e) {
    setScanMsg_('カメラを起動できませんでした。カメラのアクセスを許可してください。', 'err');
  }
}

function closeStudentScan() {
  if (_scanRafId) { cancelAnimationFrame(_scanRafId); _scanRafId = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
  const v = $('scan-video'); if (v) v.srcObject = null;
  const o = $('scan-overlay'); if (o) o.style.display = 'none';
}

function scanLoop_(video) {
  if (!_scanStream) return;
  if (!_scanPaused && video.readyState === video.HAVE_ENOUGH_DATA) {
    _scanCtx.drawImage(video, 0, 0, _scanCanvas.width, _scanCanvas.height);
    const img  = _scanCtx.getImageData(0, 0, _scanCanvas.width, _scanCanvas.height);
    // 反転印刷にも対応するため attemptBoth
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code) onStudentQR_(code.data);
  }
  _scanRafId = requestAnimationFrame(() => scanLoop_(video));
}

function onStudentQR_(qrData) {
  // 学生QRは「トークン単体」または card.html?token=... のURL。両方受ける。
  const raw = String(qrData || '').trim();
  let token = null;
  let qrEvent = null;
  try {
    const u = new URL(raw);
    token   = u.searchParams.get('token');
    // ⚠ QRに event があれば捨てずに保持する。会期後は当日判定が効かず
    //   no_active_event になるため、QR由来のイベントを優先して引き継ぐ。
    qrEvent = u.searchParams.get('event');
  } catch (e) { /* URLでない */ }
  if (!token && isLikelyToken_(raw)) token = raw;

  if (!token) {
    setScanMsg_('学生QRではありません。学生パスのQRを読み取ってください。', 'err');
    return; // スキャン継続
  }

  _scanPaused = true;
  // QR由来 → ページURL由来 の順で引き継ぐ（どちらも無ければ card.js が当日判定する）
  const evId = qrEvent || _event;
  const ev   = evId ? '&event=' + encodeURIComponent(evId) : '';
  const url = 'card.html?token=' + encodeURIComponent(token) + ev;

  // ⚠ まず別タブで開く。連続で読み取れるよう、一覧とスキャナを残すのが望ましいため。
  //   ただし iOS Safari は非同期処理からの window.open を塞ぐことがある。
  //   その場合は**同じタブで自動的に開く**（手動タップを挟まない）。
  //   ブラウザの「戻る」で一覧へ復帰できる。受付を止めないことを最優先する。
  const w = window.open(url, '_blank');
  if (w) {
    setScanMsg_('✓ 学生情報を新しいタブで開きました', 'ok');
    setTimeout(() => { _scanPaused = false; setScanMsg_('', ''); }, 1500);
  } else {
    setScanMsg_('学生情報を開いています…', 'ok');
    closeStudentScan();      // カメラを止めてから遷移する
    location.href = url;
  }
}

// ── 学生情報の一括ダウンロード（CSV） ──────────────────
// ⚠ 既存の一覧表示には手を入れていない。追加のみ。
//   画面のデータは保持していないため、押されたときに最新を取り直す
//   （「更新」を押し忘れていても最新が出るようにするため）。
//   文字コードは Shift_JIS（Windows の Excel でそのまま開けるように）。
//   エンコーダは js/csv-util.js（管理画面と共通）。

/** CSVの1セル整形。実体は js/csv-util.js の csvSafe_（数式インジェクション対策込み）。 */
const csvCell_ = csvSafe_;

const CSV_COLS_ = ['区分', '日時', '氏名', 'ふりがな', '大学名', '学部学科', '学年', '参加区分', 'メールアドレス'];

function csvRows_(visitors, label) {
  return (visitors || []).map(v => [
    label, v.time, v.name, v.furigana, v.school,
    v.department, v.year, v.category, v.email,
  ].map(csvCell_).join(','));
}

async function downloadVisitorsCsv_() {
  const btn = $('btn-download-csv');
  if (!btn) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '作成中…';

  try {
    const [qrRes, stampRes] = await Promise.all([
      FG_API.getCompanyView(_key, _event),
      FG_API.getCompanyStampVisitors(_key, _event),
    ]);
    // ⚠ 片方でも失敗したら出力しない。以前は「両方失敗」でのみ止めていたため、
    //   片側が落ちると**そのセクションだけ空の、一見正常なCSV**が出ていた。
    //   企業側からは欠損に気づけず、名刺交換した学生が抜け落ちる。
    if (!qrRes.ok || !stampRes.ok) {
      const err = !qrRes.ok ? qrRes.error : stampRes.error;
      const msg = !qrRes.ok ? (stampRes.ok ? 'QRスキャンの取得に失敗しました。' : '')
                            : 'スタンプの取得に失敗しました。';
      alert(err === 'expired'
        ? '公開期限が終了しているため出力できません。'
        : (msg || '取得に失敗しました。') +
          '\n不完全なファイルにならないよう、出力を中止しました。' +
          '\n通信環境を確認して、もう一度お試しください。');
      return;
    }

    const qr    = qrRes.data.visitors    || [];
    const stamp = stampRes.data.visitors || [];
    if (!qr.length && !stamp.length) {
      alert('出力できる来訪学生がいません。');
      return;
    }

    // ⚠ セクション見出し＋区分列の併用。見出しだけだとExcelで並べ替えた瞬間に
    //   区分が分からなくなり、区分列だけだと見た目の分離が無いため。
    //   同じ学生がQR・スタンプの両方に出るのは意図どおり（別々の来訪事実）。
    const head = CSV_COLS_.join(',');
    const lines = []
      .concat(['■ QRスキャン（名刺交換）', head], csvRows_(qr, 'QR'))
      .concat(['', '■ スタンプラリー来訪', head], csvRows_(stamp, 'スタンプ'));

    const company = (qrRes.ok && qrRes.data.companyName)
      || (stampRes.ok && stampRes.data.companyName) || '来訪学生';
    const stamp10 = new Date().toISOString().slice(0, 10);
    const bad = downloadCsvSjis_(`来訪学生一覧_${company}_${stamp10}.csv`, lines.join('\r\n'));
    if (bad && bad.length) {
      alert('一部の文字がShift_JISに変換できず「?」になりました。\n\n' + bad.join(' '));
    }
  } catch (e) {
    alert('出力に失敗しました。もう一度お試しください。');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}
