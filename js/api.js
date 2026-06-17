/**
 * FG Event Platform — GAS通信モジュール
 *
 * GASのAPIを叩く関数をまとめたモジュール。
 * FG_API.getStudent(token) のように使う。
 * config.jsより後に読み込むこと。
 *
 * トークン設計:
 *   cardToken  … 企業が学生情報を閲覧するためのトークン(学生マスターのtoken列)
 *   stampToken … スタンプラリー専用トークン(fg_stamp_token cookieに保存)
 */

const FG_API = (() => {

  // ── 内部共通関数 ──────────────────────────────

  /**
   * 今日のイベントIDをlocalStorageキャッシュ経由で取得。
   * 当日初回のみGASへ問い合わせ、以降はキャッシュを返す(高速)。
   * GASが応答しない場合は config.js の EVENT_ID にフォールバック。
   */
  async function getOrFetchEventId_() {
    const today = new Date().toDateString();
    try {
      const cached     = localStorage.getItem('fg_event_id');
      const cachedDate = localStorage.getItem('fg_event_date');
      if (cached && cachedDate === today) return cached;
      const res = await getCurrentEvent();
      if (res.ok && res.data.eventId) {
        localStorage.setItem('fg_event_id',   res.data.eventId);
        localStorage.setItem('fg_event_date',  today);
        return res.data.eventId;
      }
      if (res.error === 'no_active_event') return null;
    } catch (e) {}
    return FG_CONFIG.EVENT_ID;
  }

  async function call_(action, params = {}) {
    const url = new URL(FG_CONFIG.API_BASE_URL);
    url.searchParams.set('action', action);
    // getCurrentEvent 自身はイベントID不要。それ以外は自動解決。
    if (action !== 'getCurrentEvent' && !params.event) {
      const eventId = await getOrFetchEventId_();
      if (eventId === null) return { ok: false, error: 'no_active_event', message: '現在開催中のイベントはありません' };
      params = { event: eventId, ...params };
    }
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url.toString(), {
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') {
        return { ok: false, error: 'timeout', message: 'タイムアウトしました。再度お試しください。' };
      }
      return { ok: false, error: 'network_error', message: '通信エラーが発生しました' };
    }
  }

  // POST 送信（事前登録・将来のファイルアップロード用）。
  // Content-Type を付けない＝CORSプリフライト回避（GAS doPost が JSON を読む）。
  async function postCall_(action, params = {}) {
    const body = JSON.stringify({ action, ...params });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000); // ファイルUL考慮
      const res = await fetch(FG_CONFIG.API_BASE_URL, {
        method: 'POST',
        body,
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') {
        return { ok: false, error: 'timeout', message: 'タイムアウトしました。再度お試しください。' };
      }
      return { ok: false, error: 'network_error', message: '通信エラーが発生しました' };
    }
  }

  // ── イベント自動判定API ───────────────────────

  /** 今日の日付に合致するアクティブなイベントを取得 */
  function getCurrentEvent() {
    return call_('getCurrentEvent', {});
  }

  // ── 企業向けAPI ───────────────────────────────

  /** cardTokenで学生情報を取得(企業がQR名刺を見るとき) */
  function getStudent(cardToken, event) {
    const p = { token: cardToken };
    if (event) p.event = event;
    return call_('getStudent', p);
  }

  /** 企業が学生QRを閲覧したログを記録(メール手動登録用) */
  function saveViewLog(cardToken, companyId, email) {
    return call_('saveViewLog', { token: cardToken, company: companyId, email });
  }

  /** 企業cookie(viewKey)による閲覧ログ自動記録。企業IDはGAS側で解決。
   *  event 省略時は自動判定(当日のイベント)にフォールバック。 */
  function saveViewLogAuto(cardToken, viewKey, event) {
    const p = { token: cardToken, vk: viewKey };
    if (event) p.event = event;
    return call_('saveViewLog', p);
  }

  /** 企業QR登録: viewKeyの有効性を確認し企業名を取得。
   *  event 省略時は自動判定にフォールバック。 */
  function resolveViewKey(viewKey, event) {
    const p = { key: viewKey };
    if (event) p.event = event;
    return call_('resolveViewKey', p);
  }

  // ── 学生向けAPI ───────────────────────────────

  /**
   * cardToken → stampToken を発行(スタンプラリー開始時)
   * 学生が自分のQRをスキャンして呼ぶ。
   * 返り値: { stampToken, stampCount, prizeCriteria, cleared }
   */
  function activateStamp(cardToken, event) {
    const p = { token: cardToken };
    if (event) p.event = event;
    return call_('activateStamp', p);
  }

  /** stampTokenでNFCスタンプを記録 */
  function saveStamp(stampToken, companyStampKey, nfcCounter) {
    return call_('saveStamp', { st: stampToken, ct: companyStampKey, nc: nfcCounter });
  }

  /** stampTokenでスタンプ取得状況を取得(個人情報を含まない)
   *  event 省略時は当日の自動判定。テスト/会期外は event 明示で対象イベントを指定可。 */
  function getStampProgress(stampToken, event) {
    const p = { token: stampToken };
    if (event) p.event = event;
    return call_('getStampProgress', p);
  }

  /** 学生が自分で景品交換を確定する(スタッフ指示に従って操作) */
  function exchangePrize(stampToken, event) {
    const p = { token: stampToken };
    if (event) p.event = event;
    return call_('exchangePrize', p);
  }

  // ── 企業閲覧API ───────────────────────────────

  /** 企業がQR閲覧学生一覧を取得(viewKeyで認証) */
  function getCompanyView(viewKey) {
    return call_('getCompanyView', { key: viewKey });
  }

  /** 企業ブースでスタンプを取得した学生一覧を取得 */
  function getCompanyStampVisitors(viewKey) {
    return call_('getCompanyStampVisitors', { key: viewKey });
  }

  // ── 当日飛び込み登録API ──────────────────────

  /**
   * 当日飛び込み参加者を登録してstampTokenを発行する。
   * params: { code, name, furigana, school, department, year,
   *           clubYears, birthday, email, phone, prefecture }
   */
  function registerWalkIn(params) {
    return call_('registerWalkIn', params);
  }

  /**
   * 事前学生登録（会期前・公開）。POST送信。
   * params に event を必ず含めること（会期前は自動判定が効かないため）。
   */
  function registerPreStudent(params) {
    return postCall_('registerPreStudent', params);
  }

  // ── 景品交換API(スタッフ用) ──────────────────

  /** 学生cardTokenとスタッフキーで景品交換状況を取得 */
  function getExchangeStatus(cardToken, staffKey) {
    return call_('getExchangeStatus', { token: cardToken, key: staffKey });
  }

  /** 学生を景品交換済みとして記録 */
  function markPrizeExchanged(cardToken, staffKey, staff) {
    return call_('markPrizeExchanged', { token: cardToken, key: staffKey, staff });
  }

  // ── stampToken Cookie操作 ─────────────────────
  // cookieName: fg_stamp_token (スタンプラリー専用)

  /** stampTokenをcookieに保存 */
  function saveStampToken(token, days = 60) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    document.cookie = [
      `fg_stamp_token=${token}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
      location.protocol === 'https:' ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  /** cookieからstampTokenを取得 */
  function getStampToken() {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith('fg_stamp_token='));
    return match ? match.split('=')[1] : null;
  }

  // ── 企業viewKey Cookie操作 ────────────────────
  // cookieName: fg_company_view (企業のQR閲覧自動記録用)
  // ⚠ 保存するのは viewKey のみ。個人情報・企業IDは保存しない。

  /** 企業viewKeyをcookieに保存(card.htmlの企業QR登録) */
  function saveCompanyViewKey(viewKey, days = 60) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    document.cookie = [
      `fg_company_view=${viewKey}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
      location.protocol === 'https:' ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  /** cookieから企業viewKeyを取得 */
  function getCompanyViewKey() {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith('fg_company_view='));
    return match ? match.split('=')[1] : null;
  }

  // ── URLヘルパー ───────────────────────────────

  /** URLクエリパラメータから値を取得 */
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ── エクスポート ──────────────────────────────
  function getEventList() {
    return call_('getEventList', {});
  }

  return {
    // イベント自動判定
    getCurrentEvent,
    getEventList,
    // 企業向け
    getStudent,
    saveViewLog,
    saveViewLogAuto,
    resolveViewKey,
    // 学生向け
    activateStamp,
    saveStamp,
    getStampProgress,
    exchangePrize,
    // 飛び込み登録
    registerWalkIn,
    // 事前登録
    registerPreStudent,
    // 企業閲覧
    getCompanyView,
    getCompanyStampVisitors,
    // 景品交換(スタッフ)
    getExchangeStatus,
    markPrizeExchanged,
    // Cookie
    saveStampToken,
    getStampToken,
    saveCompanyViewKey,
    getCompanyViewKey,
    // URL
    getParam,
  };

})();
