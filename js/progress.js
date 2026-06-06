/**
 * FG Event Platform — スタンプ進捗画面ロジック
 *
 * 景品モデル: N個集めるとM個選べる
 * fg_stamp_token cookie の stampToken を使って進捗を表示する。
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
    showState('error');
    if (res.error === 'timeout') {
      setText('error-title', '接続がタイムアウトしました');
      setText('error-msg', '更新ボタンで再試行してください。');
    } else {
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
    }
    return;
  }

  renderProgress(res.data);
  showState('progress');
}

function renderProgress(d) {
  const count     = d.stampCount     || 0;
  const threshold = d.prizeThreshold || 5;
  const prizeNum  = d.prizeCount     || 1;
  const stamps    = d.stamps         || [];
  const cleared   = d.cleared        || false;
  const exchanged = d.exchanged      || false;

  // カウント
  setText('count-num', String(count));

  // 進捗バー(最大100%)
  const pct = Math.min(100, Math.round((count / threshold) * 100));
  document.getElementById('bar-fill').style.width = pct + '%';
  setText('bar-label', `${count} / ${threshold} 個`);

  // ステータスメッセージ(優先度: 交換済み > 達成 > 進行中)
  hide('status-cleared'); hide('status-exchanged'); hide('status-progress');

  if (exchanged) {
    show('status-exchanged');
  } else if (cleared) {
    const el = document.getElementById('status-cleared');
    el.innerHTML = `🎉 景品引換可能！<div class="status-sub">交換所で好きな景品を${prizeNum}個選べます</div>`;
    show('status-cleared');
  } else {
    const remaining = threshold - count;
    setText('status-progress', `あと ${remaining} 個で景品${prizeNum}個GET！`);
    show('status-progress');
  }

  // スタンプ履歴
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
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
