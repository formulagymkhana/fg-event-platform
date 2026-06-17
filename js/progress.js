
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
  const eventOverride = FG_API.getParam('event') || null;  // テスト/会期外用の明示指定
  if (!token) {
    showState('no-token');
    return;
  }

  showState('loading');
  const res = await FG_API.getStampProgress(token, eventOverride);

  if (!res.ok) {
    showState('error');
    if (res.error === 'timeout') {
      setText('error-title', '接続がタイムアウトしました');
      setText('error-msg', 'ページを再読み込みして再試行してください。');
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

  // 固定ヘッダー: 取得ブース数 / 全ブース数（スタンプ帳の枠組み）
  const companies = d.companies || fallbackCompanies_(stamps);
  const gotSet  = new Set(stamps.map(s => String(s.companyId || s.company)));
  const visited = companies.filter(co => gotSet.has(String(co.companyId || co.name))).length;
  const total   = companies.length || visited;
  setText('count-num', String(visited));
  setText('bar-label', ` / ${total}社`);

  // ゲージ: 次の交換閾値に向けた進捗（bar-fill は非表示保持・参照のみ維持）
  const gaugeTarget = nextThreshold || (maxPrizes * prizeUnitSize);
  const pct = Math.min(100, Math.round((count / gaugeTarget) * 100));
  document.getElementById('bar-fill').style.width = pct + '%';
  document.querySelector('.progress-ring')?.style.setProperty('--pct', pct);

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

  // スタンプ帳グリッド・マイルストーンバー・取得履歴リスト
  renderStampGrid(stamps, companies);
  renderMilestoneBar(count, buildMilestones_(prizeUnitSize, maxPrizes), total);
  renderStampList(stamps);
}

// ── スタンプ帳グリッド ──
function renderStampGrid(stamps, companies) {
  const grid = document.getElementById('stamp-grid');
  if (!grid) return;
  grid.innerHTML = '';
  // 取得済み判定は companyId 優先・無ければ企業名で突合
  const gotSet = new Set(stamps.map(s => String(s.companyId || s.company)));

  companies.forEach((co, idx) => {
    const key   = String(co.companyId || co.name);
    const isGot = gotSet.has(key);

    const cell = document.createElement('div');
    cell.className = 'stamp-cell';

    const circle = document.createElement('div');
    circle.className = 'stamp-circle ' + (isGot ? 'got' : 'empty');

    if (isGot) {
      if (co.logoUrl) {
        const img = document.createElement('img');
        img.src = co.logoUrl;
        img.alt = co.name || '';
        img.loading = 'lazy';
        img.onerror = () => {
          img.remove();
          const init = document.createElement('div');
          init.className = 'stamp-initial';
          init.textContent = (co.name || '?').charAt(0);
          circle.appendChild(init);
        };
        circle.appendChild(img);
      } else {
        const init = document.createElement('div');
        init.className = 'stamp-initial';
        init.textContent = (co.name || '?').charAt(0);
        circle.appendChild(init);
      }
    } else {
      const num = document.createElement('div');
      num.className = 'stamp-num';
      num.textContent = idx + 1;
      circle.appendChild(num);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'stamp-name' + (isGot ? '' : ' empty');
    nameEl.textContent = isGot ? (co.name || '') : String(idx + 1);

    cell.appendChild(circle);
    cell.appendChild(nameEl);
    grid.appendChild(cell);
  });
}

// ── マイルストーンバー ──
function renderMilestoneBar(count, milestones, totalCompanies) {
  const section = document.getElementById('milestone-bar-section');
  if (!section || !milestones || milestones.length === 0) return;

  // バーの100% = 総ブース数。景品閾値はその中の通過点として配置
  const maxVal = totalCompanies || milestones[milestones.length - 1].threshold;
  const pct = Math.min(100, Math.round((count / maxVal) * 100));

  section.innerHTML = `
    <div class="milestone-title">マイルストーン</div>
    <div style="position:relative">
      <div class="milestone-track">
        <div class="milestone-fill" style="width:${pct}%"></div>
        ${milestones.map((m, i) => {
          const pos     = Math.round((m.threshold / maxVal) * 100);
          const reached = count >= m.threshold;
          const remain  = Math.max(0, m.threshold - count);
          const labelMod = i === milestones.length - 1 ? ' last' : (i === 0 ? ' first' : '');
          return `
            <div class="milestone-marker ${reached ? 'reached' : 'unreached'}" style="left:${pos}%"></div>
            <div class="milestone-label${labelMod}" style="left:${pos}%">
              <span class="m-count">${m.threshold}個達成</span>
              <span class="m-remain">${reached ? '達成！' : 'あと' + remain + '個'}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── 取得履歴（fg-list 形式） ──
function renderStampList(stamps) {
  const list = document.getElementById('stamp-list');
  if (!list) return;
  list.innerHTML = '';
  if (!stamps.length) {
    list.innerHTML = '<p style="padding:20px;text-align:center;font-size:13px;color:var(--fg-muted)">まだスタンプがありません</p>';
    return;
  }
  stamps.forEach(s => {
    const item = document.createElement('div');
    item.className = 'fg-list-item';
    item.innerHTML = `
      <div class="fg-list-title">${escHtml(s.company)}</div>
      <div class="fg-list-meta">${escHtml(s.time)} · NFC Stamp</div>`;
    list.appendChild(item);
  });
}

// ── フォールバック・マイルストーン生成 ──
function fallbackCompanies_(stamps) {
  // GAS が companies を返さない場合（旧デプロイ互換）は取得済み企業のみ表示
  const seen = new Map();
  stamps.forEach(s => {
    const key = String(s.companyId || s.company);
    if (!seen.has(key)) seen.set(key, { name: s.company, companyId: s.companyId || '', logoUrl: '' });
  });
  return [...seen.values()];
}

function buildMilestones_(unitSize, maxPrizes) {
  const result = [];
  for (let i = 1; i <= maxPrizes; i++) result.push({ threshold: unitSize * i });
  return result;
}

// ── 景品交換(学生側確定) ──

async function doExchange() {
  const token = FG_API.getParam('st') || FG_API.getStampToken();
  if (!token) return;
  const eventOverride = FG_API.getParam('event') || null;

  const btn = document.getElementById('btn-exchange-confirm');
  btn.disabled = true;
  btn.textContent = '記録中...';

  const res = await FG_API.exchangePrize(token, eventOverride);

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
    if (!el) return;
    if (s !== state) { el.style.display = 'none'; return; }
    el.style.display = s === 'progress' ? 'flex' : 'block';
  });
}
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
