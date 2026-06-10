
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
  const count          = d.stampCount     || 0;
  const prizeUnitSize  = d.prizeUnitSize  || d.prizeThreshold || 5;
  const maxPrizes      = d.maxPrizes      || d.prizeCount     || 3;
  const claimableNow   = d.claimableNow   || 0;
  const exchangedCount = d.exchangedCount || 0;
  const nextThreshold  = d.nextThreshold  || null;
  const stamps         = d.stamps         || [];
  const cleared        = d.cleared        || false;  // claimableNow > 0
  const exchanged      = d.exchanged      || false;  // exchangedCount >= maxPrizes

  setText('count-num', String(count));

  // ゲージ: 次の交換閾値に向けた進捗
  const gaugeTarget = nextThreshold || (maxPrizes * prizeUnitSize);
  const pct = Math.min(100, Math.round((count / gaugeTarget) * 100));
  document.getElementById('bar-fill').style.width = pct + '%';
  document.querySelector('.progress-ring')?.style.setProperty('--pct', pct);
  setText('bar-label', `${count} / ${gaugeTarget} 個`);

  // ステータス表示をリセット
  hide('status-cleared'); hide('status-exchanged'); hide('status-progress');
  hide('exchange-action');
  show('exchange-start'); hide('exchange-confirm');

  if (exchanged) {
    // 最大数まで全交換済み
    const el = document.getElementById('status-exchanged');
    el.textContent = `✓ 全景品受け取り済み（計 ${exchangedCount} 個）`;
    show('status-exchanged');
  } else if (cleared) {
    // 今すぐ交換できる
    const el = document.getElementById('status-cleared');
    const alreadyNote = exchangedCount > 0 ? `（既に ${exchangedCount} 個受け取り済み）` : '';
    el.innerHTML = `🎉 景品 ${claimableNow} 個と交換できます！<div class="status-sub">${alreadyNote}交換所でスタッフにお声がけください</div>`;
    show('status-cleared');
    show('exchange-action');
  } else if (nextThreshold) {
    // 次の閾値に向けて収集中（一部交換済み）
    const remaining  = nextThreshold - count;
    const alreadyNote = exchangedCount > 0 ? `（${exchangedCount} 個交換済み）` : '';
    setText('status-progress', `あと ${remaining} 個でさらに1個GET！ ${alreadyNote}`);
    show('status-progress');
  } else {
    // まだ最初の閾値にも届いていない
    const remaining = prizeUnitSize - count;
    setText('status-progress', `あと ${remaining} 個で景品と交換できます`);
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
  } else if (res.error === 'nothing_to_claim' || res.error === 'already_exchanged') {
    loadProgress(); // 交換可能数なし → 最新状態を再取得
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
