/**
 * FG Event Platform — スタンプ進捗画面ロジック
 *
 * fg_stamp_token cookie の stampToken を使ってスタンプ取得状況を表示する。
 * config.js と api.js より後に読み込むこと。
 */

loadProgress();

async function loadProgress() {
  const token = FG_API.getParam('st') || FG_API.getStampToken();

  if (!token) {
    showState('no-token');
    return;
  }

  showState('loading');
  const res = await FG_API.getStampProgress(token);

  if (!res.ok) {
    if (res.error === 'timeout') {
      showState('error');
      setText('error-title', '接続がタイムアウトしました');
      setText('error-msg', '更新ボタンで再試行してください。');
    } else {
      showState('error');
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
    }
    return;
  }

  renderProgress(res.data);
  showState('progress');
}

function renderProgress(d) {
  const count   = d.stampCount    || 0;
  const total   = d.prizeCriteria || 5;
  const stamps  = d.stamps        || [];
  const cleared = d.cleared       || false;

  setText('count-num',   String(count));
  setText('count-total', String(total));

  const dots = document.getElementById('progress-dots');
  dots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'pdot' + (i < count ? ' filled' : '');
    dots.appendChild(dot);
  }

  if (cleared) {
    show('status-cleared');
    hide('status-progress');
  } else {
    hide('status-cleared');
    const msg = count === 0
      ? `スタンプを集めましょう！全${total}社を目指してください`
      : `あと ${total - count} 社でコンプリートです！`;
    setText('status-progress', msg);
    show('status-progress');
  }

  const list = document.getElementById('stamp-list');
  list.innerHTML = '';

  if (stamps.length === 0) {
    list.innerHTML = '<p class="no-stamps">まだスタンプがありません</p>';
    return;
  }

  stamps.forEach(s => {
    const item = document.createElement('div');
    item.className = 'stamp-item';
    item.innerHTML = `
      <div class="stamp-check">✓</div>
      <div class="stamp-company">${escHtml(s.company)}</div>
      <div class="stamp-time">${escHtml(s.time)}</div>
    `;
    list.appendChild(item);
  });
}

function showState(state) {
  ['loading', 'no-token', 'progress', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
