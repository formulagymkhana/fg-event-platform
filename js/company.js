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
function renderQrList(visitors) {
  const wrap = $('qr-list-wrap');
  if (!visitors.length) {
    wrap.innerHTML = '<p class="empty-note">QRスキャンの記録がありません</p>';
    return;
  }
  wrap.innerHTML = `<div class="visitor-list">` +
    visitors.map(v => `
      <div class="visitor-row">
        <div class="v-head">
          <div class="v-name">${esc(v.name)}<span class="v-furigana">${esc(v.furigana)}</span></div>
          <div class="v-time">${esc(v.time)}</div>
        </div>
        <div class="v-meta">${esc(v.school)}${v.year ? ' · ' + esc(v.year) + '年' : ''}<span class="v-cat">${esc(v.category)}</span></div>
        ${v.email ? `<div class="v-email" data-email="${esc(v.email)}">${esc(v.email)}</div>` : ''}
      </div>`).join('') +
    `</div>`;
  wrap.querySelectorAll('.v-email[data-email]').forEach(el =>
    el.addEventListener('click', () => {
      navigator.clipboard?.writeText(el.dataset.email).then(() => toast('メールアドレスをコピーしました'));
    }));
}

function renderStampList(visitors) {
  const wrap = $('stamp-list-wrap');
  if (!visitors.length) {
    wrap.innerHTML = '<p class="empty-note">スタンプ来訪の記録がありません</p>';
    return;
  }
  wrap.innerHTML = `<div class="visitor-list">` +
    visitors.map(v => `
      <div class="visitor-row">
        <div class="v-head">
          <div class="v-name">${esc(v.name)}</div>
          <div class="v-time">${esc(v.time)}</div>
        </div>
        <div class="v-meta">${esc(v.school)}<span class="v-cat">${esc(v.category)}</span></div>
      </div>`).join('') +
    `</div>`;
}

// ── データ取得 ────────────────────────────────────
let _key = '';

async function loadQr() {
  $('qr-list-wrap').innerHTML = '<p class="empty-note" style="color:var(--fg-muted)">読み込み中...</p>';
  const res = await FG_API.getCompanyView(_key);
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
  const res = await FG_API.getCompanyStampVisitors(_key);
  if (!res.ok) {
    $('stamp-list-wrap').innerHTML = `<div class="err-note">${esc(res.message || '取得に失敗しました')}</div>`;
    return;
  }
  $('stamp-count').textContent = ' ' + res.data.total + '名';
  renderStampList(res.data.visitors || []);
}

// ── 初期化 ────────────────────────────────────────
(async () => {
  _key = FG_API.getParam('key') || FG_API.getCompanyViewKey() || '';
  if (!_key) {
    showErr('閲覧キーがありません', '企業担当者用のURLからアクセスしてください。');
    return;
  }

  // 企業名取得（スタンプ来訪者は期限なしで使える）
  const stampRes = await FG_API.getCompanyStampVisitors(_key);
  if (!stampRes.ok && stampRes.error === 'invalid_key') {
    showErr('閲覧キーが無効です', '配布されたURLを再度ご確認ください。');
    return;
  }

  const companyName = stampRes.ok ? stampRes.data.companyName : '—';
  $('co-name').textContent = companyName;

  // スタンプは取得済みなのでレンダリング
  if (stampRes.ok) {
    $('stamp-count').textContent = ' ' + stampRes.data.total + '名';
    renderStampList(stampRes.data.visitors || []);
  }

  // QR ログを並行取得
  loadQr();

  showState('main');

  // 更新ボタン
  $('btn-reload-qr')?.addEventListener('click', loadQr);
  $('btn-reload-stamp')?.addEventListener('click', async () => {
    $('stamp-list-wrap').innerHTML = '<p class="empty-note" style="color:var(--fg-muted)">読み込み中...</p>';
    const r = await FG_API.getCompanyStampVisitors(_key);
    if (r.ok) {
      $('stamp-count').textContent = ' ' + r.data.total + '名';
      renderStampList(r.data.visitors || []);
    }
  });
})();
