/**
 * FG Event Platform — 出場校エントリーフォーム
 *
 * register-school.html?event=<eventId> でアクセス。
 * 学校名で重複時は既存行を上書き（GAS側で処理）。
 * 承諾書ファイルはbase64でGASへ送信し、専用Driveフォルダに保存。
 *
 * config.js / api.js より後に読み込むこと。
 */

const $ = id => document.getElementById(id);

const MAX_FILE = 10 * 1024 * 1024; // 10MB
const PHONE_RE = /^[0-9]{10,11}$/;
const POSTAL_RE = /^[0-9]{7}$/;
const stripHyphen_ = s => String(s || '').replace(/[-−ー－]/g, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let _event = null;

(async () => {
  _event = FG_API.getParam('event');
  if (!_event) { showState('no-event'); return; }

  const [cfgRes, schoolRes] = await Promise.all([
    FG_API.getSchoolEntryFormConfig(_event),
    FG_API.getSchoolList(),
  ]);
  if (!cfgRes.ok) {
    if (cfgRes.error === 'event_inactive') { showState('expired'); return; }
    showState('no-event');
    return;
  }
  const d = cfgRes.data || {};
  if (d.state === 'not_open') { showState('not-open'); return; }
  if (d.state === 'expired')  { showState('expired');  return; }
  if (d.state === 'inactive') { showState('expired');  return; }

  $('event-name-label').textContent = d.eventName || _event;
  if (schoolRes.ok) fillSchoolList_(schoolRes.data.schools || []);
  if (d.approvalUrl) {
    const a = $('link-approval-doc');
    if (a) a.href = d.approvalUrl;
  }

  showState('form');

  $('btn-submit').addEventListener('click', submit);
  $('f-school').addEventListener('blur', checkOverwrite);
  $('f-school').addEventListener('input', () => {
    // 学校名が変わったら再判定するまで警告を隠す
    $('sec-overwrite').style.display = 'none';
    _overwriteChecked = '';
  });
})();

function fillSchoolList_(list) {
  const dl = $('dl-universities');
  if (!dl) return;
  dl.innerHTML = list.map(s => `<option value="${String(s.name || s).replace(/"/g, '&quot;')}">`).join('');
}

let _overwriteChecked = ''; // 直近チェック済みの学校名（重複警告表示時のみ非空）

async function checkOverwrite() {
  const name = $('f-school').value.trim();
  if (!name) { $('sec-overwrite').style.display = 'none'; _overwriteChecked = ''; return; }
  if (name === _overwriteChecked) return;
  try {
    const r = await FG_API.checkSchoolEntryExists(_event, name);
    if (r.ok && r.data && r.data.exists) {
      const info = $('overwrite-info');
      const upd  = r.data.updateCount || 1;
      const at   = r.data.submittedAt || '';
      info.textContent = `「${name}」は${at ? at + ' に' : ''}既に提出されています（更新${upd}回）。`;
      $('sec-overwrite').style.display = '';
      _overwriteChecked = name;
    } else {
      $('sec-overwrite').style.display = 'none';
      _overwriteChecked = '';
    }
  } catch (e) {
    // 通信失敗時は警告を出さない（送信時にサーバー側で対応）
    $('sec-overwrite').style.display = 'none';
    _overwriteChecked = '';
  }
}

function showState(name) {
  ['no-event','not-open','expired','loading','form','done'].forEach(s => {
    const el = $('state-' + s);
    if (el) el.style.display = (s === name) ? '' : 'none';
  });
}

function setErr(id, on) {
  const err = $('err-' + id);
  const inp = $('f-' + id);
  if (err) err.classList.toggle('show', !!on);
  if (inp) inp.classList.toggle('error', !!on);
}

function getRadio(name) {
  const r = document.querySelector(`input[name="${name}"]:checked`);
  return r ? r.value : '';
}

function readB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', b64: String(r.result).split(',')[1] || '' });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function submit() {
  const btn = $('btn-submit');
  const banner = $('form-error-banner');
  banner.classList.remove('show');
  banner.textContent = '';

  const rule       = $('f-rule').checked;
  const school     = $('f-school').value.trim();
  const repName    = $('f-repname').value.trim();
  const repPhone   = $('f-repphone').value.trim();
  const repEmail   = $('f-repemail').value.trim();
  const shipName   = $('f-shipname').value.trim();
  const shipPostal = $('f-shippostal').value.trim();
  const shipAddr   = $('f-shipaddress').value.trim();
  const shipPhone  = $('f-shipphone').value.trim();
  const carPass    = getRadio('carPassCount');
  const permission = getRadio('permission');
  const note       = $('f-note').value.trim();
  const file       = ($('f-approval').files || [])[0];

  let ok = true;
  document.getElementById('cb-rule').classList.toggle('error', !rule);
  $('err-rule').classList.toggle('show', !rule);
  if (!rule) ok = false;

  setErr('school',      !school);                                 if (!school) ok = false;
  setErr('repname',     !repName);                                if (!repName) ok = false;
  setErr('repphone',    !PHONE_RE.test(stripHyphen_(repPhone))); if (!PHONE_RE.test(stripHyphen_(repPhone))) ok = false;
  setErr('repemail',    !EMAIL_RE.test(repEmail));                if (!EMAIL_RE.test(repEmail)) ok = false;
  setErr('shipname',    !shipName);                               if (!shipName) ok = false;
  setErr('shippostal',  !POSTAL_RE.test(stripHyphen_(shipPostal))); if (!POSTAL_RE.test(stripHyphen_(shipPostal))) ok = false;
  setErr('shipaddress', !shipAddr);                               if (!shipAddr) ok = false;
  setErr('shipphone',   !PHONE_RE.test(stripHyphen_(shipPhone))); if (!PHONE_RE.test(stripHyphen_(shipPhone))) ok = false;

  const rgCarErr = $('err-carpass'); rgCarErr.classList.toggle('show', !carPass); if (!carPass) ok = false;
  const rgPermErr = $('err-permission'); rgPermErr.classList.toggle('show', !permission); if (!permission) ok = false;

  const fileTooBig = file && file.size > MAX_FILE;
  $('err-approval').classList.toggle('show', !!fileTooBig);
  $('f-approval').classList.toggle('error', !!fileTooBig);
  if (fileTooBig) ok = false;

  // 上書き確認: 警告表示中はチェック必須
  const overwriteShown = $('sec-overwrite').style.display !== 'none';
  const overwriteAgreed = $('f-overwrite').checked;
  document.getElementById('cb-overwrite').classList.toggle('error', overwriteShown && !overwriteAgreed);
  $('err-overwrite').classList.toggle('show', overwriteShown && !overwriteAgreed);
  if (overwriteShown && !overwriteAgreed) ok = false;

  if (!ok) {
    banner.textContent = '入力内容に不備があります。赤字の項目をご確認ください。';
    banner.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const params = {
      event:            _event,
      schoolName:       school,
      repName:          repName,
      repPhone:         repPhone,
      repEmail:         repEmail,
      shipName:         shipName,
      shipPostal:       shipPostal,
      shipAddress:      shipAddr,
      shipPhone:        shipPhone,
      carPassCount:     carPass,
      schoolPermission: permission,
      note:             note,
      ruleConsent:      'true',
    };
    if (file) params.approval = await readB64(file);

    const res = await FG_API.registerSchoolEntry(params);
    if (!res.ok) {
      const msg = res.error === 'form_not_open' ? '受付開始前です。' :
                  res.error === 'registration_closed' ? '受付期間が終了しました。' :
                  res.error === 'event_inactive' ? 'このイベントは公開停止中です。' :
                  ('送信に失敗しました：' + (res.error || 'unknown'));
      banner.textContent = msg;
      banner.classList.add('show');
      btn.disabled = false;
      btn.textContent = '送信する';
      return;
    }

    $('done-title').textContent = res.data.isUpdate ? '更新しました' : '受付しました';
    $('done-msg').innerHTML = res.data.isUpdate
      ? '以前の入力内容は破棄され、今回の内容が最新として保存されました。<br>ご登録のメールアドレスに確認メールをお送りしています。'
      : 'エントリー内容を受け付けました。<br>ご登録のメールアドレスに確認メールをお送りしています。';
    showState('done');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    banner.textContent = '通信エラーが発生しました。時間をおいて再度お試しください。';
    banner.classList.add('show');
    btn.disabled = false;
    btn.textContent = '送信する';
  }
}
