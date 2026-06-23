/**
 * FG Event Platform — フロントエンド設定
 *
 * バックエンドをGASから別サービスに移行する場合は
 * API_BASE_URL を書き換えるだけでOK。
 *
 * EVENT_ID はフォールバック専用。
 * 通常はGASの getCurrentEvent により今日の日付から自動判定され、
 * localStorage にキャッシュされる(1日1回のみGAS問い合わせ)。
 */

const FG_CONFIG = {
  // GASデプロイURL(変更時はここだけ書き換える)
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbwdXCvSIcv9n9LtwqqDHSTV1bYY_JqscGzZu1bjBkoPD2b8gHkEVt54flboJuJYpSVNrg/exec',

  // フォールバック用イベントID(GAS側でイベントが見つからない場合のみ使用)
  EVENT_ID: null,
};
