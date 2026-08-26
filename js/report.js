/**
 * 開催報告ページ（2026-08-25 新設 / 2026-08-26 UIを管理画面へ寄せて再構成）。
 *
 * admin.html とは独立したページ。localStorage の fg_admin_key を共有するため、
 * admin.html でログイン済みならそのまま使える（未ログインならここでも入力できる）。
 * このページは書き込みを一切行わない（adminGetAttendanceReport は読み取り専用）。
 *
 * ⚠ 見た目の方針: 開催報告は「独立した帳票UI」ではなく admin.html の一機能として見せる。
 *   マークアップは admin.html と同じクラス構成（.area-label / .stat-grid / .stat-card /
 *   .section / .data-tbl）に揃えること。KPI は .section の外に置き、カードを入れ子にしない。
 *   印刷だけは配布用の帳票として扱い、影と面の背景を落とす（CSS は app/report.html 側）。
 * ⚠ API・集計条件・入出力データはこのファイルの表示都合で変えないこと。
 */
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
  const count_ = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // 表示用の桁区切り。大きい集計値が読み取りにくいため（2026-08-26 追加）。
  const fmt_ = v => count_(v).toLocaleString('ja-JP');

  let adminKey_ = localStorage.getItem('fg_admin_key') || '';
  let events_ = [];
  let reportRequestId_ = 0;
  let lastStudents_ = [];   // 直近に描画した学生ごとの明細（CSV出力用）
  let lastEventId_ = '';

  async function call_(action, params) {
    const body = JSON.stringify({ action, adminKey: adminKey_, ...params });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(FG_CONFIG.API_BASE_URL, {
        method: 'POST',
        body,
        redirect: 'follow',
        signal: ctrl.signal,
      });
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, error: 'timeout', message: 'タイムアウト' };
      return { ok: false, error: 'network_error', message: '通信エラー' };
    } finally {
      clearTimeout(timer);
    }
  }

  function showState(state) {
    $('state-login').style.display = state === 'login' ? 'block' : 'none';
    $('state-app').style.display = state === 'app' ? 'block' : 'none';
    if (state === 'login') setTimeout(() => $('f-key')?.focus(), 0);
  }

  function stateHtml_(message, options) {
    const opts = options || {};
    return `
      <div class='state-msg' role='status'>
        ${opts.loading ? "<div class='spinner' aria-hidden='true'></div>" : ''}
        <p>${esc(message)}</p>
        ${opts.retry ? "<button class='retry-btn' id='btn-retry' type='button'>再読み込み</button>" : ''}
      </div>`;
  }

  async function tryLogin_(key) {
    adminKey_ = key;
    const res = await call_('adminGetEvents', {});
    if (res.ok) localStorage.setItem('fg_admin_key', key);
    return res;
  }

  $('login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const key = $('f-key').value.trim();
    if (!key) return;

    const button = $('btn-login');
    const error = $('login-err');
    error.style.display = 'none';
    button.disabled = true;
    button.textContent = '確認中...';

    const res = await tryLogin_(key);
    if (res.ok) {
      showState('app');
      await loadEvents_(res);
    } else {
      adminKey_ = '';
      error.textContent = res.error === 'invalid_admin_key'
        ? 'キーが正しくありません'
        : 'ログインできませんでした。通信状況を確認して再度お試しください。';
      error.style.display = 'block';
    }

    button.disabled = false;
    button.textContent = 'ログイン';
  });

  // 印刷時の展開は CSS (@media print の .section-body{display:block}) が担当するので、
  // ここでは開閉状態を触らずにそのまま印刷する。
  $('btn-print')?.addEventListener('click', () => window.print());

  // ── セクションの折りたたみ（admin.html と同じ挙動） ──
  function toggleSection_(head) {
    const body = head.closest('.section')?.querySelector('.section-body');
    if (!body) return;
    const open = body.classList.toggle('open');
    head.querySelector('.section-toggle')?.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
  }

  function foldTarget_(target) {
    const head = target.closest && target.closest('.section-hd');
    if (!head) return null;
    return head.closest('.section')?.classList.contains('no-fold') ? null : head;
  }

  // 学生ごとの明細をCSVで出す（1人1行）。集計ではなく生の判断材料として渡す。
  function exportStudentsCsv_() {
    if (!lastStudents_.length) return;
    const days = (lastStudents_[0].days || []).map(d => d.day);
    const header = ['studentId', '氏名', '大学名', '学年', '属性', '区分', '登録種別']
      .concat(days.map(d => dayLabel_(d) + 'のアクション記録'))
      .concat(['アクション記録のある日数', 'スタンプ数', 'QR件数', '弁当_土', '弁当_日']);
    const lines = [header.map(csvSafe_).join(',')];
    lastStudents_.forEach(s => {
      const dayFlags = (s.days || []).map(d => (d.acted ? 'あり' : 'なし'));
      const actedDays = (s.days || []).filter(d => d.acted).length;
      lines.push([
        s.studentId, s.name, s.school, s.year, s.attribute,
        s.isDriver ? '選手' : '応援', s.regType,
      ].concat(dayFlags)
       .concat([actedDays, s.stamps, s.views, s.lunchSat, s.lunchSun])
       .map(csvSafe_).join(','));
    });
    downloadCsv_(`学生アクション明細_${lastEventId_ || 'event'}.csv`, lines.join('\r\n'));
  }

  $('report-body')?.addEventListener('click', event => {
    if (event.target.id === 'btn-csv-students') { exportStudentsCsv_(); return; }
    const head = foldTarget_(event.target);
    if (head) toggleSection_(head);
  });

  $('report-body')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const head = foldTarget_(event.target);
    if (!head) return;
    event.preventDefault();
    toggleSection_(head);
  });

  async function loadEvents_(prefetchedResponse) {
    const body = $('report-body');
    const select = $('ev-select');
    const res = prefetchedResponse || await call_('adminGetEvents', {});

    if (!res.ok) {
      if (res.error === 'invalid_admin_key') {
        localStorage.removeItem('fg_admin_key');
        adminKey_ = '';
        showState('login');
        return;
      }
      body.innerHTML = stateHtml_('イベント一覧の取得に失敗しました', { retry: true });
      $('btn-retry')?.addEventListener('click', () => loadEvents_());
      return;
    }

    events_ = Array.isArray(res.data && res.data.events)
      ? res.data.events.filter(event => event && event.eventId)
      : [];
    select.replaceChildren();
    events_.forEach(event => {
      const option = document.createElement('option');
      option.value = String(event.eventId);
      option.textContent = `${event.name || event.eventId}（${event.startDate || '日程未設定'}〜${event.endDate || '日程未設定'}）`;
      select.appendChild(option);
    });

    if (!events_.length) {
      body.innerHTML = stateHtml_('登録済みのイベントがありません');
      return;
    }

    const params = new URLSearchParams(location.search);
    const wanted = params.get('event');
    const initial = wanted && events_.some(event => String(event.eventId) === wanted)
      ? wanted
      : String(events_[0].eventId);
    select.value = initial;
    await loadReport_(initial);
  }

  $('ev-select')?.addEventListener('change', event => {
    // URL の ?event= も揃えておく。揃えないと、切り替えたあとに共有・再読み込みすると
    // 元のイベントへ戻ってしまう（2026-08-26 修正）。履歴は増やさず置き換える。
    const params = new URLSearchParams(location.search);
    params.set('event', event.target.value);
    history.replaceState(null, '', location.pathname + '?' + params.toString());
    void loadReport_(event.target.value);
  });

  function dayLabel_(day) {
    const match = String(day).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) return String(day);
    const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`;
  }

  // ── admin.html の .stat-card と同じ表情のKPI ──
  function statHtml_(label, value, unit, sub) {
    return `
      <div class='stat-card'>
        <div class='stat-val'>${value == null ? '—' : fmt_(value)}${unit ? `<span class='stat-unit'>${esc(unit)}</span>` : ''}</div>
        <div class='stat-lbl'>${esc(label)}</div>
        ${sub ? `<div class='stat-sub'>${esc(sub)}</div>` : ''}
      </div>`;
  }

  // ── admin.html の .section と同じパネル ──
  // 見出しは h2（ページ見出しの h1 は report.html 側の .page-title）。
  // 折りたためるものは aria-expanded で開閉状態を読み上げに伝える。
  let sectionSeq_ = 0;
  function sectionHtml_(title, inner, options) {
    const opts = options || {};
    const foldable = !!opts.foldable;
    const open = foldable ? !!opts.open : true;
    const bodyId = 'sec-body-' + (++sectionSeq_);
    const hdAttrs = foldable
      ? ` role='button' tabindex='0' aria-expanded='${open}' aria-controls='${bodyId}'`
      : '';
    return `
      <section class='section${foldable ? '' : ' no-fold'}'>
        <div class='section-hd'${hdAttrs}>
          <h2 class='section-title'>${esc(title)}</h2>
          <span class='section-toggle${foldable && open ? ' open' : ''}' aria-hidden='true'>▼</span>
        </div>
        <div class='section-body${foldable && open ? ' open' : ''}' id='${bodyId}'>${inner}</div>
      </section>`;
  }

  function activityCell_(activity, kind, group) {
    const cell = ((activity[kind] || {})[group]) || {};
    return { count: count_(cell.count), users: count_(cell.users) };
  }

  function detailText_(detail) {
    return Object.entries(detail || {})
      .sort((a, b) => count_(b[1]) - count_(a[1]))
      .map(([name, amount]) => `${name}${count_(amount) > 1 ? '×' + count_(amount) : ''}`)
      .join('、');
  }

  function comparisonRows_(driverValues, supportValues, options) {
    const opts = options || {};
    const driver = driverValues || {};
    const support = supportValues || {};
    const existing = Array.from(new Set([...Object.keys(driver), ...Object.keys(support)]));
    let keys;

    if (opts.order) {
      keys = opts.order.concat(existing.filter(key => !opts.order.includes(key)));
    } else {
      keys = existing.sort((a, b) => {
        const countDiff = (count_(driver[b]) + count_(support[b]))
          - (count_(driver[a]) + count_(support[a]));
        return countDiff || String(a).localeCompare(String(b), 'ja');
      });
    }

    const makeRow = key => ({
      label: key,
      driver: count_(driver[key]),
      support: count_(support[key]),
      driverDetail: detailText_(opts.driverDetails && opts.driverDetails[key]),
      supportDetail: detailText_(opts.supportDetails && opts.supportDetails[key]),
    });

    const rows = keys.map(makeRow);
    if (!opts.limit || rows.length <= opts.limit) return rows;

    const visible = rows.slice(0, opts.limit);
    const rest = rows.slice(opts.limit);
    visible.push({
      label: `他${rest.length}${opts.restUnit || '件'}`,
      driver: rest.reduce((sum, row) => sum + row.driver, 0),
      support: rest.reduce((sum, row) => sum + row.support, 0),
      driverDetail: '',
      supportDetail: '',
    });
    return visible;
  }

  function attributeBlockHtml_(title, rows, wide) {
    const bodyRows = rows.length ? rows.map(row => {
      const details = row.driverDetail || row.supportDetail
        ? `<span class='attr-detail'>
            ${row.driverDetail ? `<span>選手：${esc(row.driverDetail)}</span>` : ''}
            ${row.supportDetail ? `<span>応援：${esc(row.supportDetail)}</span>` : ''}
          </span>`
        : '';
      return `
        <tr>
          <th scope='row'>${esc(row.label)}${details}</th>
          <td class='num'>${fmt_(row.driver)}</td>
          <td class='num'>${fmt_(row.support)}</td>
          <td class='num'>${fmt_(row.driver + row.support)}</td>
        </tr>`;
    }).join('') : "<tr><td colspan='4' class='empty-msg'>データなし</td></tr>";

    return `
      <div class='sub-block${wide ? ' attr-wide' : ''}'>
        <div class='sub-title'>${esc(title)}</div>
        <div class='tbl-wrap'>
          <table class='data-tbl attr-tbl' aria-label='${esc(title)}'>
            <thead><tr><th scope='col'>区分</th><th class='num' scope='col'>選手</th><th class='num' scope='col'>応援</th><th class='num' scope='col'>合計</th></tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function loadReport_(eventId) {
    const requestId = ++reportRequestId_;
    const body = $('report-body');
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = stateHtml_('集計中（数秒かかることがあります）', { loading: true });

    const res = await call_('adminGetAttendanceReport', { event: eventId });
    if (requestId !== reportRequestId_) return;

    if (!res.ok) {
      body.setAttribute('aria-busy', 'false');
      if (res.error === 'invalid_admin_key') {
        localStorage.removeItem('fg_admin_key');
        adminKey_ = '';
        showState('login');
        return;
      }
      body.innerHTML = stateHtml_(
        `集計に失敗しました: ${res.message || res.error || '不明なエラー'}`,
        { retry: true }
      );
      $('btn-retry')?.addEventListener('click', () => loadReport_(eventId));
      return;
    }

    const data = res.data || {};
    const days = Array.isArray(data.days) ? data.days : [];
    if (!days.length) {
      body.setAttribute('aria-busy', 'false');
      body.innerHTML = stateHtml_('開催日程を取得できませんでした');
      return;
    }

    const byDay = data.byDay || {};
    const event = events_.find(item => String(item.eventId) === String(eventId));

    const dayRows = days.map(day => {
      const row = byDay[day] || {};
      return `
        <tr>
          <th scope='row'>${esc(dayLabel_(day))}</th>
          <td class='num'>${fmt_(row.drivers)}</td>
          <td class='num'>${fmt_(row.nonDrivers)}</td>
          <td class='num'>${fmt_(row.total)}</td>
        </tr>`;
    }).join('');

    const totalDrivers = days.reduce((sum, day) => sum + count_((byDay[day] || {}).drivers), 0);
    const totalSupport = days.reduce((sum, day) => sum + count_((byDay[day] || {}).nonDrivers), 0);
    const totalVisitors = totalDrivers + totalSupport;

    const sourceRows = days.map(day => {
      const source = (byDay[day] || {}).sources || {};
      return `
        <tr>
          <th scope='row'>${esc(dayLabel_(day))}</th>
          <td class='num'>${fmt_(source.registration)}</td>
          <td class='num'>${fmt_(source.stamp)}</td>
          <td class='num'>${fmt_(source.view)}</td>
        </tr>`;
    }).join('');

    const activity = data.activity || {};
    const stampDriver = activityCell_(activity, 'stamp', 'driver');
    const stampSupport = activityCell_(activity, 'stamp', 'nonDriver');
    const viewDriver = activityCell_(activity, 'view', 'driver');
    const viewSupport = activityCell_(activity, 'view', 'nonDriver');
    const activityRows = [
      ['選手', stampDriver, viewDriver],
      ['応援', stampSupport, viewSupport],
    ].map(([label, stamp, view]) => `
      <tr>
        <th scope='row'>${label}</th>
        <td class='num'>${fmt_(stamp.count)}<span class='cell-sub'>${fmt_(stamp.users)}人</span></td>
        <td class='num'>${fmt_(view.count)}<span class='cell-sub'>${fmt_(view.users)}人</span></td>
      </tr>`).join('');

    // ── 開催サマリー（KPIはセクションの外に置く＝カードを入れ子にしない） ──
    const summary = data.summary;
    const summaryHtml = !summary ? '' : (() => {
      const registeredDrivers = count_(summary.fgDrivers) + count_(summary.womenDrivers);
      return `
        <div class='area-label'>開催サマリー</div>
        <div class='stat-grid'>
          ${statHtml_('学生来場（延べ）', totalVisitors, '名', '選手込みの概算')}
          ${statHtml_('出場選手', registeredDrivers, '名', `FG ${count_(summary.fgDrivers)} / 女子 ${count_(summary.womenDrivers)}`)}
          ${statHtml_('応援来場（延べ）', totalSupport, '名', '来場記録ベース')}
          ${statHtml_('出場校', count_(summary.schoolEntryCount), '校', '出場校エントリー')}
          ${statHtml_('出展ブース', count_(summary.companyCount), '社', '企業マスター')}
          ${statHtml_('来場学生の所属大学', count_(summary.attendeeSchoolCount), '校', '応援のみの大学を含む')}
        </div>`;
    })();

    const attendanceHtml = sectionHtml_('来場状況', `
      <p class='sec-note'>選手は登録ベース、応援は会場で確認できた来場記録ベースです。学生のみの日別の延べ人数で、企業スタッフ・一般来場者は含みません。</p>
      <div class='tbl-wrap'>
        <table class='data-tbl' aria-label='日別の学生来場者数'>
          <thead>
            <tr>
              <th scope='col'>日程</th>
              <th class='num' scope='col'>選手<span class='th-sub'>登録</span></th>
              <th class='num' scope='col'>応援<span class='th-sub'>来場記録</span></th>
              <th class='num' scope='col'>合計<span class='th-sub'>概算</span></th>
            </tr>
          </thead>
          <tbody>
            ${dayRows}
            <tr class='total-row'>
              <th scope='row'>合計（延べ）</th>
              <td class='num'>${fmt_(totalDrivers)}</td>
              <td class='num'>${fmt_(totalSupport)}</td>
              <td class='num'>${fmt_(totalVisitors)}</td>
            </tr>
          </tbody>
        </table>
      </div>`);

    // ── スタンプラリー ──
    const booth = data.booth || {};
    const boothDays = Array.isArray(booth.days) && booth.days.length ? booth.days : days;
    const boothRows = Array.isArray(booth.rows) ? booth.rows : [];
    const boothTableHtml = boothRows.length ? `
      <p class='sec-note'>企業ブースごとのスタンプ取得数です。ブース名順に並べています。横にスクロールできます。</p>
      <div class='tbl-wrap'>
        <table class='data-tbl booth-tbl' aria-label='ブース別スタンプ取得数'>
          <thead>
            <tr>
              <th rowspan='2' class='col-booth' scope='col'>ブース</th>
              ${boothDays.map(day => `<th colspan='2' scope='colgroup'>${esc(dayLabel_(day))}</th>`).join('')}
              <th rowspan='2' class='num col-total' scope='col'>合計</th>
            </tr>
            <tr>${boothDays.map(() => "<th class='num' scope='col'>選手</th><th class='num' scope='col'>応援</th>").join('')}</tr>
          </thead>
          <tbody>
            ${boothRows.map(row => {
              const cells = Array.isArray(row.days) ? row.days : [];
              return `<tr>
                <th class='col-booth' scope='row'>${esc(row.name)}</th>
                ${boothDays.map((_, index) => {
                  const cell = cells[index] || {};
                  return `<td class='num'>${fmt_(cell.driver)}</td><td class='num'>${fmt_(cell.nonDriver)}</td>`;
                }).join('')}
                <td class='num col-total'>${count_(row.total)}</td>
              </tr>`;
            }).join('')}
            <tr class='total-row'>
              <th class='col-booth' scope='row'>合計</th>
              ${boothDays.map((_, index) => {
                const driverTotal = boothRows.reduce((sum, row) => sum + count_(((row.days || [])[index] || {}).driver), 0);
                const supportTotal = boothRows.reduce((sum, row) => sum + count_(((row.days || [])[index] || {}).nonDriver), 0);
                return `<td class='num'>${fmt_(driverTotal)}</td><td class='num'>${fmt_(supportTotal)}</td>`;
              }).join('')}
              <td class='num col-total'>${boothRows.reduce((sum, row) => sum + count_(row.total), 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>` : "<p class='empty-msg'>ブース別スタンプの記録はありません</p>";

    // 企業別のQR読み取り。GAS 側が「延べ回数」ではなく実人数を返す点に注意（重複抑制のため）。
    const viewCompanyRows = Array.isArray((data.viewByCompany || {}).rows) ? data.viewByCompany.rows : [];
    const viewCompanyHtml = viewCompanyRows.length ? `
      <p class='sec-note'>企業が学生QRを読み取った実人数です（企業と学生の組で重複を除いています）。
      企業名順に並べています。</p>
      <div class='tbl-wrap'>
        <table class='data-tbl' aria-label='企業別のQR読み取り'>
          <thead><tr><th scope='col'>企業</th><th class='num' scope='col'>選手</th><th class='num' scope='col'>応援</th><th class='num' scope='col'>合計</th></tr></thead>
          <tbody>
            ${viewCompanyRows.map(row => `<tr>
              <th scope='row'>${esc(row.name)}</th>
              <td class='num'>${fmt_(row.driver)}</td>
              <td class='num'>${fmt_(row.nonDriver)}</td>
              <td class='num'>${fmt_(row.total)}</td>
            </tr>`).join('')}
            <tr class='total-row'>
              <th scope='row'>合計</th>
              <td class='num'>${fmt_(viewCompanyRows.reduce((s, r) => s + count_(r.driver), 0))}</td>
              <td class='num'>${fmt_(viewCompanyRows.reduce((s, r) => s + count_(r.nonDriver), 0))}</td>
              <td class='num'>${fmt_(viewCompanyRows.reduce((s, r) => s + count_(r.total), 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>` : "<p class='empty-msg'>QR読み取りの記録はありません</p>";

    const stampCount = stampDriver.count + stampSupport.count;
    const stampUsers = stampDriver.users + stampSupport.users;
    const viewCount = viewDriver.count + viewSupport.count;
    const viewUsers = viewDriver.users + viewSupport.users;
    const rallyHtml = `
      <div class='area-label'>スタンプラリー</div>
      <div class='stat-grid'>
        ${statHtml_('スタンプ取得', stampCount, '回', `${stampUsers}人`)}
        ${statHtml_('QR読み取り', viewCount, '回', `${viewUsers}人`)}
        ${statHtml_('景品交換', count_(data.prizeExchangeCount), '回', '交換処理回数')}
        ${statHtml_('交換済み景品', count_(data.prizeItemCount), '個', '配布個数')}
        ${statHtml_('記録ブース', boothRows.length, '件', 'スタンプ取得あり')}
        ${statHtml_('QR読取企業', viewCompanyRows.length, '社', '読み取り記録あり')}
      </div>
      ${sectionHtml_('ブース別スタンプ取得数', boothTableHtml, { foldable: true, open: true })}
      ${sectionHtml_('企業別QR読み取り', viewCompanyHtml, { foldable: true, open: true })}`;

    // ── 学生属性 ──
    const attributes = data.attributes;
    const YEAR_ORDER = ['大学1年生', '大学2年生', '大学3年生', '大学4年生', '大学院生', 'その他', '未回答'];
    const FACULTY_ORDER = ['理工学系', '人文・社会経済系', 'その他', '未回答'];
    const attributeHtml = !attributes ? '' : (() => {
      const driver = attributes.driver || {};
      const support = attributes.nonDriver || {};
      const yearRows = comparisonRows_(driver.years, support.years, { order: YEAR_ORDER });
      const prefectureRows = comparisonRows_(driver.prefectures, support.prefectures, {
        limit: 11,
        restUnit: '府県',
      });
      const facultyRows = comparisonRows_(driver.faculties, support.faculties, {
        order: FACULTY_ORDER,
        driverDetails: driver.facultiesDetail,
        supportDetails: support.facultiesDetail,
      });

      return sectionHtml_('学生属性', `
        <p class='sec-note'>選手と、来場記録のある応援学生を同じ区分で比較しています。区分と並び順は開催報告書に合わせています。学部学科は自由入力をキーワード分類した参考値で、入力内訳を併記しています。</p>
        <div class='attr-grid'>
          ${attributeBlockHtml_('学年', yearRows, false)}
          ${attributeBlockHtml_('住所（都道府県）', prefectureRows, false)}
          ${attributeBlockHtml_('学部学科（自動分類）', facultyRows, true)}
        </div>`, { foldable: true, open: false });
    })();

    // ── 運用データ（弁当の未消化・記録が無い学生） ──
    const ops = data.ops;
    const opsHtml = !ops ? '' : (() => {
      const lunch = Array.isArray(ops.lunch) ? ops.lunch : [];
      const lunchTable = lunch.length ? `
        <div class='tbl-wrap'>
          <table class='data-tbl cross-tbl' aria-label='弁当希望とアクション有無のクロス集計'>
            <thead>
              <tr>
                <th rowspan='2' scope='col'>日程</th>
                <th colspan='2' scope='colgroup'>弁当あり</th>
                <th colspan='2' scope='colgroup'>弁当なし</th>
              </tr>
              <tr>
                <th class='num' scope='col'>アクション記録あり</th>
                <th class='num' scope='col'>アクション<br>記録なし</th>
                <th class='num' scope='col'>アクション<br>記録あり</th>
                <th class='num' scope='col'>アクション記録なし</th>
              </tr>
            </thead>
            <tbody>
              ${lunch.map(row => `<tr>
                <th scope='row'>${esc(dayLabel_(row.day))}</th>
                <td class='num'>${fmt_(row.yesActive)}</td>
                <td class='num'>${fmt_(row.yesIdle)}</td>
                <td class='num'>${fmt_(row.noActive)}</td>
                <td class='num'>${fmt_(row.noIdle)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : "<p class='empty-msg'>弁当希望の記録はありません</p>";

      const driverDays = Array.isArray(ops.driverDays) ? ops.driverDays : [];
      const driverDayTable = driverDays.length ? `
        <div class='tbl-wrap'>
          <table class='data-tbl' aria-label='選手の日別アクション有無'>
            <thead><tr><th scope='col'>日程</th><th class='num' scope='col'>アクション記録あり</th><th class='num' scope='col'>アクション記録なし</th></tr></thead>
            <tbody>
              ${driverDays.map(row => `<tr>
                <th scope='row'>${esc(dayLabel_(row.day))}</th>
                <td class='num'>${fmt_(row.active)}</td>
                <td class='num'>${fmt_(row.idle)}</td>
              </tr>`).join('')}
              <tr class='total-row'>
                <th scope='row'>全日程を通じて</th>
                <td class='num'>${fmt_(ops.driversWithRecord)}</td>
                <td class='num'>${fmt_(ops.driversNoRecord)}</td>
              </tr>
            </tbody>
          </table>
        </div>` : "<p class='empty-msg'>選手の記録はありません</p>";

      return sectionHtml_('運用データ', `
        <div class='sub-block'>
          <div class='sub-title'>弁当希望 × アクション記録の有無（応援・日別）</div>
          <p class='sec-note'>事前登録で弁当を希望したかどうかと、<strong>その日に</strong>何らかの操作
          （スタンプ開始・当日登録／スタンプ取得／QR読み取り）の記録が残ったかを掛け合わせています。
          読み方は次のとおりです。</p>
          <p class='sec-note'>4区分はいずれも人数です。「アクション記録あり」はその日にスタンプ開始・当日登録／
          スタンプ取得／企業によるQR読み取りのいずれかの記録が存在すること、「アクション記録なし」は
          いずれの記録も存在しないことを指します。記録の有無は来場の有無と同一ではありません。</p>
          <p class='sec-note'>対象は<strong>事前登録した選手以外</strong>です。当日登録者は弁当の設問自体を通っていないため含めていません。</p>
          ${lunchTable}
        </div>
        <div class='sub-block'>
          <div class='sub-title'>選手のアクション記録（日別）</div>
          <p class='sec-note'>事前登録の参加区分が出場選手の学生について、その日にアクションの記録が
          あったかを数えています。来場者数では選手を全開催日に一律加算しているため、この人数は
          来場者数には影響しません。</p>
          ${driverDayTable}
        </div>
        <div class='sub-block'>
          <div class='sub-title'>全開催日を通じてアクション記録が無い学生</div>
          <p class='sec-note'>上の表が<strong>日ごと</strong>の数え方なのに対し、こちらは
          <strong>どの日にも</strong>1件も記録を残さなかった人だけを数えています。
          片方の日だけ記録がある学生は日別では「アクション記録なし」に入りますが、こちらには入りません。
          そのため必ずこちらの方が小さい数になります。</p>
          <div class='tbl-wrap'>
            <table class='data-tbl' aria-label='全開催日を通じて記録が無い学生'>
              <thead><tr><th scope='col'>区分</th><th class='num' scope='col'>対象</th><th class='num' scope='col'>アクション記録なし</th></tr></thead>
              <tbody>
                <tr>
                  <th scope='row'>応援（学生マスター登録者・選手を除く）</th>
                  <td class='num'>${fmt_(Math.max(0, count_(ops.registeredStudents) - count_(ops.driverIdCount)))}</td>
                  <td class='num'>${fmt_(ops.noRecordStudents)}</td>
                </tr>
                <tr>
                  <th scope='row'>選手</th>
                  <td class='num'>${fmt_(ops.driverIdCount)}</td>
                  <td class='num'>${fmt_(ops.driversNoRecord)}</td>
                </tr>
                <tr class='total-row'>
                  <th scope='row'>合計</th>
                  <td class='num'>${fmt_(ops.registeredStudents)}</td>
                  <td class='num'>${fmt_(ops.noRecordStudents) + count_(ops.driversNoRecord)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>`, { foldable: true, open: true });
    })();

    // ── 大学別のアクション状況 ──
    // 判断材料として出すだけで、値の良し悪しはここでは述べない。
    const students = Array.isArray(data.students) ? data.students : [];
    lastStudents_ = students;
    lastEventId_ = eventId;
    const schoolHtml = !students.length ? '' : (() => {
      const bySchool = {};
      students.forEach(s => {
        const key = String(s.school || '（大学名なし）');
        if (!bySchool[key]) bySchool[key] = { total: 0, acted: 0, drivers: 0, stamps: 0, views: 0 };
        const b = bySchool[key];
        b.total++;
        if (s.actedAny) b.acted++;
        if (s.isDriver) b.drivers++;
        b.stamps += count_(s.stamps);
        b.views  += count_(s.views);
      });
      const rows = Object.keys(bySchool).map(name => {
        const b = bySchool[name];
        return { name, ...b, idle: b.total - b.acted };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));

      return sectionHtml_('大学別のアクション状況', `
        <p class='sec-note'>学生マスターの登録者を大学ごとに集計しています。「アクション記録あり」は
        スタンプ開始・当日登録／スタンプ取得／企業によるQR読み取りのいずれかの記録が、
        <strong>いずれかの開催日に</strong>あった人数です。大学名順に並べています。</p>
        <p class='sec-note'>この表が<strong>含まないもの</strong>: 来場したが何もアクションしなかった人と、
        そもそも来場しなかった人は区別できません。機器の不具合等で記録が残らなかった場合もアクション記録なしに入ります。
        当日登録者は登録と同時に記録が残るため、登録した日は必ずアクション記録ありになります。</p>
        <div class='tbl-wrap'>
          <table class='data-tbl' aria-label='大学別のアクション状況'>
            <thead><tr>
              <th scope='col'>大学</th>
              <th class='num' scope='col'>登録</th>
              <th class='num' scope='col'>うち選手</th>
              <th class='num' scope='col'>アクション記録あり</th>
              <th class='num' scope='col'>アクション記録なし</th>
              <th class='num' scope='col'>スタンプ<span class='th-sub'>延べ</span></th>
              <th class='num' scope='col'>QR<span class='th-sub'>件数</span></th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <th scope='row'>${esc(r.name)}</th>
                <td class='num'>${fmt_(r.total)}</td>
                <td class='num'>${fmt_(r.drivers)}</td>
                <td class='num'>${fmt_(r.acted)}</td>
                <td class='num'>${fmt_(r.idle)}</td>
                <td class='num'>${fmt_(r.stamps)}</td>
                <td class='num'>${fmt_(r.views)}</td>
              </tr>`).join('')}
              <tr class='total-row'>
                <th scope='row'>合計</th>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.total, 0))}</td>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.drivers, 0))}</td>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.acted, 0))}</td>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.idle, 0))}</td>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.stamps, 0))}</td>
                <td class='num'>${fmt_(rows.reduce((s, r) => s + r.views, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class='action-row no-print' style='margin:12px 0 0'>
          <button class='act-btn act-btn-ghost' id='btn-csv-students' type='button'>学生ごとの明細をCSVで出力</button>
        </div>
        <p class='sec-note' style='margin-top:8px'>CSVには学生1人1行で、氏名・大学・学年・区分・登録種別・
        日別のアクション有無・スタンプ数・QR件数・弁当希望が入ります。個人が特定できるデータのため取り扱いに注意してください。</p>`,
        { foldable: true, open: false });
    })();

    // ── 集計方法（既定は閉じる。印刷時は CSS で必ず展開される） ──
    const methodologyHtml = sectionHtml_('集計方法・注意事項', `
      <p class='sec-note'><strong>来場者数:</strong> 学生のみの概算で、企業スタッフ・一般来場者は含みません。
      選手は来場予定日を取得していないため開催日すべてに一律加算し、応援はスタンプ開始・当日登録、
      スタンプ取得、企業によるQR読み取りのいずれかがある学生を日別に重複なく数えます。
      補欠ドライバーは応援として扱います。</p>
      <p class='sec-note'><strong>延べ人数:</strong> 同じ学生が複数日来場した場合、日別合計では日数分を数えます。
      来場記録が一切ない応援学生は、実際に来場していても判別できないため含みません。</p>
      <p class='sec-note'><strong>学生属性:</strong> 選手と来場記録のある応援学生が対象です。学年は自由記述から
      大学院生を補正し、短期大学・専門学校・自動車大学校は「その他」に含めます。</p>
      <div class='attr-grid'>
        <div class='sub-block'>
          <div class='sub-title'>応援の来場判定に使用した記録</div>
          <div class='tbl-wrap'>
            <table class='data-tbl' aria-label='応援の来場判定に使用した記録'>
              <thead><tr><th scope='col'>日程</th><th class='num' scope='col'>開始・当日登録</th><th class='num' scope='col'>スタンプ</th><th class='num' scope='col'>QR読み取り</th></tr></thead>
              <tbody>${sourceRows}</tbody>
            </table>
          </div>
          <p class='sec-note' style='margin-top:8px'>同じ学生が複数列に入るため、列の合計は応援来場者数と一致しません。</p>
        </div>
        <div class='sub-block'>
          <div class='sub-title'>活動記録の選手・応援内訳</div>
          <div class='tbl-wrap'>
            <table class='data-tbl' aria-label='活動記録の選手と応援の内訳'>
              <thead><tr><th scope='col'>区分</th><th class='num' scope='col'>スタンプ取得</th><th class='num' scope='col'>QR読み取り</th></tr></thead>
              <tbody>${activityRows}</tbody>
            </table>
          </div>
          <p class='sec-note' style='margin-top:8px'>大きい数字は延べ回数、小さい数字はその記録を持つ実人数です。</p>
        </div>
      </div>`, { foldable: true, open: false });

    // シート・列の欠落は「記録が0件」と見分けがつかないため、必ず画面に出す。
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const warnHtml = !warnings.length ? '' : `
      <div class='warn-box' role='alert'>
        <div class='warn-title'>集計できていない項目があります</div>
        <ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        <p>該当箇所の数値は0件として表示されています。記録が無いのか、集計できていないのかを取り違えないでください。</p>
      </div>`;

    body.innerHTML = `
      ${warnHtml}
      <div class='ev-head'>
        <div class='ev-head-name'>${esc(event ? (event.name || eventId) : eventId)}</div>
        <div class='ev-head-meta'>
          <span>${days.map(dayLabel_).map(esc).join('・')}</span>
          <span>全${days.length}日間</span>
          <span>概算値を含む</span>
        </div>
      </div>
      ${summaryHtml}
      ${attendanceHtml}
      ${rallyHtml}
      ${attributeHtml}
      ${opsHtml}
      ${schoolHtml}
      ${methodologyHtml}`;
    body.setAttribute('aria-busy', 'false');
  }

  (async () => {
    if (!adminKey_) {
      showState('login');
      return;
    }
    const res = await tryLogin_(adminKey_);
    // ⚠ キーを消してよいのは「キーが違う」と分かったときだけ。
    //   タイムアウトや通信エラーで消すと、電波が悪いだけで再ログインを強いられる
    //   （2026-08-26 修正）。通信障害のときはアプリ画面のまま再読み込みを促す。
    if (!res.ok && res.error === 'invalid_admin_key') {
      adminKey_ = '';
      localStorage.removeItem('fg_admin_key');
      showState('login');
      return;
    }
    showState('app');
    if (!res.ok) {
      const body = $('report-body');
      body.innerHTML = stateHtml_(
        `接続できませんでした: ${res.message || res.error || '不明なエラー'}`,
        { retry: true }
      );
      $('btn-retry')?.addEventListener('click', () => loadEvents_());
      return;
    }
    await loadEvents_(res);
  })();
})();
