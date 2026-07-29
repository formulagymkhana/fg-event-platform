/**
 * 全ページのスクリーンショットを docs/screenshots/ に保存する
 * 実行: node docs/screenshots/take-screenshots.js
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8744/app';
const OUT  = path.join(__dirname);

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  console.log('✓', name + '.png');
}

(async () => {
  const browser = await chromium.launch();
  const ctx     = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p       = await ctx.newPage();

  // ── 1. register.html (当日参加登録) ──────────────────────
  await p.goto(BASE + '/register.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.querySelectorAll('[id^="state-"]').forEach(el => el.style.display = 'none');
    const f = document.getElementById('state-form');
    if (f) f.style.display = '';
    typeof fillSchoolList_ === 'function' && fillSchoolList_(['金沢大学', '名古屋大学', '早稲田大学']);
  });
  await shot(p, '01_register');

  // ── 2. register-pre.html (事前登録) ──────────────────────
  await p.goto(BASE + '/register-pre.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.querySelectorAll('[id^="state-"]').forEach(el => el.style.display = 'none');
    const f = document.getElementById('state-form');
    if (f) f.style.display = '';
    const en = document.getElementById('event-name-label');
    if (en) en.textContent = '第12回FG全日本学生選手権';
    document.querySelectorAll('.day1-label').forEach(e => e.textContent = '8月22日（土）');
    document.querySelectorAll('.day2-label').forEach(e => e.textContent = '8月23日（日）');
    const comp = document.getElementById('label-competing');
    if (comp) comp.textContent = '所属する学校は、第12回FG全日本学生選手権に出場しますか？';
    typeof fillSchoolList_ === 'function' && fillSchoolList_(['金沢大学', '名古屋大学', '早稲田大学']);
  });
  await shot(p, '02_register-pre');

  // ── 3. admin.html — ログイン画面 ─────────────────────────
  await p.goto(BASE + '/admin.html');
  await p.waitForTimeout(600);
  await shot(p, '03_admin-login');

  // ── 4. admin — ダッシュボード ─────────────────────────────
  await p.evaluate(() => {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-app').style.display = '';
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-events').style.display = '';
    document.getElementById('page-dashboard').style.display = '';
  });
  await shot(p, '04_admin-dashboard');

  // ── 5. admin — フォーム管理 ───────────────────────────────
  await p.evaluate(() => {
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-forms').style.display = '';
  });
  await shot(p, '05_admin-forms');

  // ── 6. admin — 大学管理 ───────────────────────────────────
  await p.evaluate(() => {
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-universities').style.display = '';
  });
  await shot(p, '06_admin-universities');

  // ── 7. admin — 企業管理 ───────────────────────────────────
  await p.evaluate(() => {
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-companies').style.display = '';
  });
  await shot(p, '07_admin-companies');

  // ── 8. admin — 学生管理 ───────────────────────────────────
  await p.evaluate(() => {
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-students').style.display = '';
  });
  await shot(p, '08_admin-students');

  // ── 9. admin — 全体設定 ───────────────────────────────────
  await p.evaluate(() => {
    const app = document.getElementById('view-app');
    [...app.children].forEach(el => el.style.display = 'none');
    document.getElementById('page-settings').style.display = '';
  });
  await shot(p, '09_admin-settings');

  // ── 10. company.html (来訪学生一覧) ──────────────────────
  await p.goto(BASE + '/company.html');
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    document.getElementById('state-loading').style.display = 'none';
    document.getElementById('state-error').style.display = 'none';
    document.getElementById('state-main').style.display = '';
    document.getElementById('co-name').textContent = '株式会社モータースポーツジャパン';
    document.getElementById('qr-count').textContent = ' 3名';
    document.getElementById('stamp-count').textContent = ' 5名';
    window._event = 'EVT001';
    const visitors = [
      { name: '山田 太郎', furigana: 'やまだたろう', school: '金沢大学', department: '工学部', year: '3', category: 'ドライバー', email: 'yamada@example.com', cardToken: 'abc123', time: '2026/08/22 10:30' },
      { name: '鈴木 花子', furigana: 'すずきはなこ', school: '名古屋大学', department: '工学部', year: '2', category: '女子ドライバー', email: 'suzuki@example.com', cardToken: 'def456', time: '2026/08/22 11:15' },
      { name: '田中 一郎', furigana: 'たなかいちろう', school: '東京工業大学', department: '理工学部', year: '4', category: '見学', email: 'tanaka@example.com', cardToken: 'ghi789', time: '2026/08/22 13:00' },
    ];
    renderQrList(visitors);
    renderStampList([
      { name: '佐藤 二郎', furigana: 'さとうじろう', school: '大阪大学', department: '工学部', year: '3', category: 'ドライバー', email: 's@ex.com', cardToken: 'jkl012', time: '2026/08/22 09:45' },
      ...visitors,
    ]);
  });
  await shot(p, '10_company');

  // ── 11〜19. card.html 区分バリエーション ─────────────────
  const categories = [
    { cat: 'Aドライバー',             sid: '62102A01', suffix: '11_card-A-driver' },
    { cat: 'Bドライバー',             sid: '62102B01', suffix: '12_card-B-driver' },
    { cat: 'Cドライバー',             sid: '62102C01', suffix: '13_card-C-driver' },
    { cat: '女子クラスドライバー',     sid: '62102L01', suffix: '14_card-ladies-driver' },
    { cat: 'ドライバー登録メカニック', sid: '62102D01', suffix: '15_card-driver-mech' },
    { cat: 'メカニック',               sid: '62102M01', suffix: '16_card-mechanic' },
    { cat: '応援学生',                 sid: '62102S01', suffix: '17_card-supporter' },
    { cat: '一般参加学生',             sid: '62102V01', suffix: '18_card-walkin' },
  ];

  await p.goto(BASE + '/card.html');
  await p.waitForTimeout(600);

  const mockData = (cat, sid) => ({
    studentId: sid,
    name: '山田 太郎', furigana: 'やまだ たろう',
    school: '金沢大学', department: '工学部機械工学科', year: '3',
    category: cat, clubYears: '3年',
    prefecture: '石川県', birthday: '2004/05/15',
    email: 'yamada.taro@example.com',
    eventName: '第12回 FG全日本学生選手権',
  });

  // 企業QR未登録状態（📷 企業QRを読み取るボタンあり）
  for (const { cat, sid, suffix } of categories) {
    await p.evaluate(({ data }) => {
      render(data);
      // 企業cookie未設定 → 企業セクションを表示
      document.getElementById('company-section').style.display = 'block';
      document.getElementById('company-box').style.display = '';
      document.getElementById('company-registered').style.display = 'none';
    }, { data: mockData(cat, sid) });
    await shot(p, suffix);
  }

  // Aドライバーのみ「企業登録済み」パターンも撮影
  await p.evaluate(({ data }) => {
    render(data);
    document.getElementById('company-section').style.display = 'block';
    document.getElementById('company-box').style.display = 'none';
    const reg = document.getElementById('company-registered');
    reg.style.display = 'block';
    reg.textContent = '✓ 株式会社モータースポーツジャパン の閲覧リストに自動記録されています';
  }, { data: mockData('Aドライバー', '62102A01') });
  await shot(p, '19_card-company-registered');

  await browser.close();
  console.log('\n完了: docs/screenshots/ に保存されました');
})();
