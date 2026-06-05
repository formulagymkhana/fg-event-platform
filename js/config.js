/**
 * FG Event Platform — フロントエンド設定
 *
 * バックエンドをGASから別サービスに移行する場合は
 * API_BASE_URL を書き換えるだけでOK。
 */

const FG_CONFIG = {
  // GASデプロイURL(変更時はここだけ書き換える)
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbwdXCvSIcv9n9LtwqqDHSTV1bYY_Jqsc1GzZu1bjBkoPD2b8gHkEVt54flboJuJYpSVNrg/exec',

  // 現在のイベントID(設定シートのeventIdと一致させる)
  EVENT_ID: '2026_rd2',
};
