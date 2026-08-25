/**
 * 開催報告ページ（2026-08-25 新設）。
 *
 * admin.html とは独立したページ。localStorage の fg_admin_key を共有するため、
 * admin.html でログイン済みならそのまま使える（未ログインならここでも入力できる）。
 * このページは書き込みを一切行わない（adminGetAttendanceReport は読み取り専用）。
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

  let adminKey_ = localStorage.getItem('fg_admin_key') || '';
  let events_ = [];
  let reportRequestId_ = 0;
  let printDetailsState_ = null;

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

  function expandPrintDetails_() {
    if (printDetailsState_) return;
    const details = Array.from(document.querySelectorAll('.report-details'));
    printDetailsState_ = details.map(item => ({ item, open: item.open }));
    details.forEach(item => { item.open = true; });
  }

  function restorePrintDetails_() {
    if (!printDetailsState_) return;
    printDetailsState_.forEach(state => { state.item.open = state.open; });
    printDetailsState_ = null;
  }

  window.addEventListener('beforeprint', expandPrintDetails_);
  window.addEventListener('afterprint', restorePrintDetails_);
  $('btn-print')?.addEventListener('click', () => {
    expandPrintDetails_();
    window.print();
    setTimeout(restorePrintDetails_, 0);
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
    void loadReport_(event.target.value);
  });

  function dayLabel_(day) {
    const match = String(day).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) return String(day);
    const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`;
  }

  function metricHtml_(label, value, unit, detail, primary) {
    return `
      <div class='metric${primary ? ' metric-primary' : ''}'>
        <div class='metric-value'>${value == null ? '—' : esc(value)}<span class='metric-unit'>${esc(unit || '')}</span></div>
        <div class='metric-label'>${esc(label)}</div>
        ${detail ? `<div class='metric-detail'>${esc(detail)}</div>` : ''}
      </div>`;
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

  function comparisonTableHtml_(title, rows, wide) {
    const bodyRows = rows.length ? rows.map(row => {
      const details = row.driverDetail || row.supportDetail
        ? `<div class='attr-detail'>
            ${row.driverDetail ? `<span>選手：${esc(row.driverDetail)}</span>` : ''}
            ${row.supportDetail ? `<span>応援：${esc(row.supportDetail)}</span>` : ''}
          </div>`
        : '';
      return `
        <tr>
          <th scope='row'>${esc(row.label)}${details}</th>
          <td class='num'>${row.driver}</td>
          <td class='num'>${row.support}</td>
          <td class='num'>${row.driver + row.support}</td>
        </tr>`;
    }).join('') : "<tr><td colspan='4' class='empty-cell'>データなし</td></tr>";

    return `
      <div class='attribute-block${wide ? ' attribute-block-wide' : ''}'>
        <h3 class='attribute-title'>${esc(title)}</h3>
        <div class='table-wrap'>
          <table class='report-table attribute-table' aria-label='${esc(title)}の学生属性'>
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
          <td class='num'>${count_(row.drivers)}</td>
          <td class='num'>${count_(row.nonDrivers)}</td>
          <td class='num'><strong>${count_(row.total)}</strong></td>
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
          <td class='num'>${count_(source.registration)}</td>
          <td class='num'>${count_(source.stamp)}</td>
          <td class='num'>${count_(source.view)}</td>
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
        <td class='num'>${stamp.count}<span class='sub'>${stamp.users}人</span></td>
        <td class='num'>${view.count}<span class='sub'>${view.users}人</span></td>
      </tr>`).join('');

    const summary = data.summary;
    const summaryHtml = !summary ? '' : (() => {
      const registeredDrivers = count_(summary.fgDrivers) + count_(summary.womenDrivers);
      return `
        <section class='report-section'>
          <div class='section-header'>
            <div>
              <h2>開催サマリー</h2>
              <p class='section-note'>主要な成果を同じ基準で比較できるようにまとめています。</p>
            </div>
          </div>
          <div class='metric-grid'>
            ${metricHtml_('学生来場（延べ）', totalVisitors, '名', '概算', true)}
            ${metricHtml_('出場選手', registeredDrivers, '名', `FG ${count_(summary.fgDrivers)} / 女子 ${count_(summary.womenDrivers)}`)}
            ${metricHtml_('応援来場（延べ）', totalSupport, '名', '来場記録ベース')}
            ${metricHtml_('出場校', count_(summary.schoolEntryCount), '校', '出場校エントリー')}
            ${metricHtml_('出展ブース', count_(summary.companyCount), '社', '企業マスター')}
          </div>
          <div class='summary-foot'>
            <span>来場学生の所属大学：${count_(summary.attendeeSchoolCount)}校</span>
            <span>開催日数：${count_(summary.dayCount) || days.length}日間</span>
          </div>
        </section>`;
    })();

    const booth = data.booth || {};
    const boothDays = Array.isArray(booth.days) && booth.days.length ? booth.days : days;
    const boothRows = Array.isArray(booth.rows) ? booth.rows : [];
    const boothTableHtml = boothRows.length ? `
      <div class='table-wrap'>
        <table class='report-table booth-table' aria-label='ブース別スタンプ取得数'>
          <thead>
            <tr>
              <th rowspan='2' class='booth-name-col' scope='col'>ブース</th>
              ${boothDays.map(day => `<th colspan='2' scope='colgroup'>${esc(dayLabel_(day))}</th>`).join('')}
              <th rowspan='2' class='num booth-total-col' scope='col'>合計</th>
            </tr>
            <tr>${boothDays.map(() => "<th class='num' scope='col'>選手</th><th class='num' scope='col'>応援</th>").join('')}</tr>
          </thead>
          <tbody>
            ${boothRows.map(row => {
              const cells = Array.isArray(row.days) ? row.days : [];
              return `<tr>
                <th class='booth-name-col' scope='row'>${esc(row.name)}</th>
                ${boothDays.map((_, index) => {
                  const cell = cells[index] || {};
                  return `<td class='num'>${count_(cell.driver)}</td><td class='num'>${count_(cell.nonDriver)}</td>`;
                }).join('')}
                <td class='num booth-total-col'><strong>${count_(row.total)}</strong></td>
              </tr>`;
            }).join('')}
            <tr class='total-row'>
              <th class='booth-name-col' scope='row'>合計</th>
              ${boothDays.map((_, index) => {
                const driverTotal = boothRows.reduce((sum, row) => sum + count_(((row.days || [])[index] || {}).driver), 0);
                const supportTotal = boothRows.reduce((sum, row) => sum + count_(((row.days || [])[index] || {}).nonDriver), 0);
                return `<td class='num'>${driverTotal}</td><td class='num'>${supportTotal}</td>`;
              }).join('')}
              <td class='num booth-total-col'>${boothRows.reduce((sum, row) => sum + count_(row.total), 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>` : "<p class='empty-inline'>ブース別スタンプの記録はありません</p>";

    const stampCount = stampDriver.count + stampSupport.count;
    const stampUsers = stampDriver.users + stampSupport.users;
    const viewCount = viewDriver.count + viewSupport.count;
    const viewUsers = viewDriver.users + viewSupport.users;
    const rallyHtml = `
      <section class='report-section'>
        <div class='section-header'>
          <div>
            <h2>スタンプラリー</h2>
            <p class='section-note'>取得状況、企業ブースごとの接点、景品交換をまとめて確認できます。</p>
          </div>
          <p class='section-side-note'>回数は延べ<br>人数は重複なし</p>
        </div>
        <div class='metric-grid rally-metrics'>
          ${metricHtml_('スタンプ取得', stampCount, '回', `${stampUsers}人`, true)}
          ${metricHtml_('QR読み取り', viewCount, '回', `${viewUsers}人`)}
          ${metricHtml_('景品交換', count_(data.prizeExchangeCount), '回', '交換処理回数')}
          ${metricHtml_('交換済み景品', count_(data.prizeItemCount), '個', '配布個数')}
          ${metricHtml_('記録ブース', boothRows.length, '件', 'スタンプ取得あり')}
        </div>
        ${boothTableHtml}
      </section>`;

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

      return `
        <section class='report-section'>
          <div class='section-header'>
            <div>
              <h2>学生属性</h2>
              <p class='section-note'>選手と、来場記録のある応援学生を同じ区分で比較しています。</p>
            </div>
            <p class='section-side-note'>住所は登録フォームの<br>住所（都道府県）</p>
          </div>
          <div class='attribute-grid'>
            ${comparisonTableHtml_('学年', yearRows, false)}
            ${comparisonTableHtml_('住所（都道府県）', prefectureRows, false)}
            ${comparisonTableHtml_('学部学科（自動分類）', facultyRows, true)}
          </div>
        </section>`;
    })();

    const methodologyHtml = `
      <section class='report-section'>
        <details class='report-details'>
          <summary>集計方法・注意事項</summary>
          <div class='details-body'>
            <div class='details-copy'>
              <p><strong>来場者数:</strong> 学生のみの概算で、企業スタッフ・一般来場者は含みません。
              選手は来場予定日を取得していないため開催日すべてに一律加算し、応援はスタンプ開始・当日登録、
              スタンプ取得、企業によるQR読み取りのいずれかがある学生を日別に重複なく数えます。
              補欠ドライバーは選手への入れ替わりがない限り応援として扱います。</p>
              <p><strong>延べ人数:</strong> 同じ学生が複数日来場した場合、日別合計では日数分を数えます。
              来場記録が一切ない応援学生は、実際に来場していても判別できないため含みません。</p>
              <p><strong>学生属性:</strong> 選手と来場記録のある応援学生が対象です。学年は自由記述から
              大学院生を補正し、短期大学・専門学校・自動車大学校は「その他」に含めます。
              学部学科は自由入力をキーワード分類した参考値で、入力内訳を併記しています。</p>
            </div>
            <div class='audit-grid'>
              <div class='audit-block'>
                <h3>応援の来場判定に使用した記録</h3>
                <div class='table-wrap'>
                  <table class='report-table audit-table' aria-label='応援の来場判定に使用した記録'>
                    <thead><tr><th scope='col'>日程</th><th class='num' scope='col'>開始・当日登録</th><th class='num' scope='col'>スタンプ</th><th class='num' scope='col'>QR読み取り</th></tr></thead>
                    <tbody>${sourceRows}</tbody>
                  </table>
                </div>
                <p class='section-note'>同じ学生が複数列に入るため、列の合計は応援来場者数と一致しません。</p>
              </div>
              <div class='audit-block'>
                <h3>活動記録の選手・応援内訳</h3>
                <div class='table-wrap'>
                  <table class='report-table audit-table' aria-label='活動記録の選手と応援の内訳'>
                    <thead><tr><th scope='col'>区分</th><th class='num' scope='col'>スタンプ取得</th><th class='num' scope='col'>QR読み取り</th></tr></thead>
                    <tbody>${activityRows}</tbody>
                  </table>
                </div>
                <p class='section-note'>大きい数字は延べ回数、小さい数字はその記録を持つ実人数です。</p>
              </div>
            </div>
          </div>
        </details>
      </section>`;

    body.innerHTML = `
      <article class='report-sheet'>
        <header class='report-event'>
          <h1>${esc(event ? (event.name || eventId) : eventId)}</h1>
          <div class='report-event-meta'>
            <span>${days.map(dayLabel_).map(esc).join('・')}</span>
            <span>全${days.length}日間</span>
            <span class='report-badge'>概算値を含む</span>
          </div>
        </header>
        ${summaryHtml}
        <section class='report-section'>
          <div class='section-header'>
            <div>
              <h2>来場状況</h2>
              <p class='section-note'>選手は登録ベース、応援は会場で確認できた来場記録ベースです。</p>
            </div>
            <p class='section-side-note'>学生のみ<br>日別の延べ人数</p>
          </div>
          <div class='table-wrap'>
            <table class='report-table attendance-table' aria-label='日別の学生来場者数'>
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
                  <td class='num'>${totalDrivers}</td>
                  <td class='num'>${totalSupport}</td>
                  <td class='num'>${totalVisitors}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        ${rallyHtml}
        ${attributeHtml}
        ${methodologyHtml}
      </article>`;
    body.setAttribute('aria-busy', 'false');
  }

  (async () => {
    if (!adminKey_) {
      showState('login');
      return;
    }
    const res = await tryLogin_(adminKey_);
    if (!res.ok) {
      adminKey_ = '';
      localStorage.removeItem('fg_admin_key');
      showState('login');
      return;
    }
    showState('app');
    await loadEvents_(res);
  })();
})();
