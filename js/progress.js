
/**
 * FG Event Platform — スタンプ進捗画面ロジック
 *
 * 景品モデル: N個集めるとM個選べる
 * 景品交換は学生側で確定(スタッフの指示に従って操作)。
 */

// ── イベントリスナー(CSP対応: onclickは使わない) ──
document.getElementById('btn-reload')?.addEventListener('click', loadProgress);
document.getElementById('btn-exchange-start')?.addEventListener('click', () => {
  hide('exchange-start'); show('exchange-confirm');
});
document.getElementById('btn-exchange-cancel')?.addEventListener('click', () => {
  show('exchange-start'); hide('exchange-confirm');
});
document.getElementById('btn-exchange-confirm')?.addEventListener('click', doExchange);

// ── 起動 ──
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

  setText('count-num', String(count));

  const pct = Math.min(100, Math.round((count / threshold) * 100));
  document.getElementById('bar-fill').style.width = pct + '%';
  setText('bar-label', `${count} / ${threshold} 個`);

  // ステータス(優先度: 交換済み > 達成 > 進行中)
  hide('status-cleared'); hide('status-exchanged'); hide('status-progress');
  hide('exchange-action');
  // 交換アクションは初期状態(start表示/confirm非表示)に戻す
  show('exchange-start'); hide('exchange-confirm');

  if (exchanged) {
    show('status-exchanged');
  } else if (cleared) {
    const el = document.getElementById('status-cleared');
    el.innerHTML = `🎉 景品引換可能！<div class="status-sub">交換所で好きな景品を${prizeNum}個選べます</div>`;
    show('status-cleared');
    // 達成 & 未交換 → 交換ボタンを表示
    show('exchange-action');
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
  } else {
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
}

// ── 景品交換(学生側確定) ──

async function doExchange() {
  const token = FG_API.getParam('st') || FG_API.getStampToken();
  if (!token) return;

  const btn = document.getElementById('btn-exchange-confirm');
  btn.disabled = true;
  btn.textContent = '記録中...';

  const res = await FG_API.exchangePrize(token);

  btn.disabled = false;
  btn.textContent = 'はい、受け取りました';

  if (res.ok) {
    // 進捗を再読み込み(交換済み表示に切り替わる)
    renderProgress(res.data);
    showState('progress');
  } else if (res.error === 'already_exchanged') {
    loadProgress(); // 既に交換済み → 最新状態を再取得
  } else {
    showState('error');
    setText('error-title', 'エラーが発生しました');
    setText('error-msg', res.message || 'もう一度お試しください。');
  }
}

// ── ユーティリティ ──

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
