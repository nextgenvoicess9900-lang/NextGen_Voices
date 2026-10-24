/* QA-TEST BATTERY v3 — drives the REAL HTTP API end-to-end.
   Run: node utils/qaBattery.js   ·   Cleanup: node utils/qaCleanup.js
   Uses one cookie jar per role so each account logs in exactly once
   (keeps us under the 8-per-15min auth rate limiter). */
require('dotenv').config();
const fs = require('fs');
const BASE = process.env.QA_BASE || 'http://localhost:5000';
const API = BASE + '/api';

const QA_ADMIN = 'QA_TEST_admin_audit';
const QA_ADMIN_PW = 'QA-TEST-pw-9x7';
const QA_EMAIL = 'qa-test-audit@nextgen-test.invalid';
const QA_EMAIL_B = 'qa-test-audit-b@nextgen-test.invalid';
const QA_OTP = '424242';
const MARK = 'QA-TEST';

/* ---------- session helper: independent cookie jar + CSRF per role ---------- */
function mkSession() {
  const jar = {};
  let csrf = null;
  function cookieHeader() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  function absorb(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  }
  async function getCsrf() {
    const res = await fetch(API + '/csrf-token', { headers: { cookie: cookieHeader() } });
    absorb(res); const d = await res.json(); csrf = d.csrfToken; return csrf;
  }
  async function call(method, p, body) {
    if (!csrf) await getCsrf();
    const headers = { cookie: cookieHeader(), 'x-csrf-token': csrf };
    let payload;
    if (body instanceof FormData) { payload = body; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(API + p, { method, headers, body: payload });
    absorb(res);
    let data = null; try { data = await res.json(); } catch (e) {}
    return { status: res.status, data, ok: res.ok };
  }
  return { getCsrf, call, cookieHeader };
}

const mongoose = require('mongoose');
const Viewer = require('../models/Viewer');
const { hashOtp } = require('./otp');
async function primeOtp(email) {
  if (mongoose.connection.readyState !== 1) {
    const { connectDB } = require('../config/db');
    await connectDB({ retry: false });
  }
  await Viewer.updateOne({ email }, { $set: { otpHash: hashOtp(QA_OTP), otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 } });
}

async function viewerLogin(email) {
  const s = mkSession();
  await primeOtp(email);
  await s.getCsrf();
  const r = await s.call('POST', '/auth/viewer/verify-otp', { email, code: QA_OTP });
  return { s, r };
}

const results = [];
function check(id, cond, detail) { results.push({ id, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`); }

(async () => {
  console.log('=== QA BATTERY v3 against ' + API + ' ===\n');
  const anon = mkSession();

  /* ---------- TEST F: PUBLISHING PERMISSIONS ---------- */
  console.log('--- TEST F: publishing permissions ---');
  let r = await anon.call('POST', '/posts', { title: `${MARK} anon`, content: 'x', contentType: 'article' });
  check('F1 anon cannot create post', r.status === 401 || r.status === 403, `status=${r.status}`);

  const { s: vA, r: vAr } = await viewerLogin(QA_EMAIL);
  check('F2a viewerA login via OTP', vAr.ok, `status=${vAr.status}`);
  if (vAr.ok) {
    r = await vA.call('POST', '/posts', { title: `${MARK} student post`, content: 'x', contentType: 'article' });
    check('F2b student cannot create post', r.status === 401 || r.status === 403, `status=${r.status}`);
    r = await vA.call('POST', '/content-items', { type: 'event', title: `${MARK} student event` });
    check('F2c student cannot create event', r.status === 401 || r.status === 403, `status=${r.status}`);
    r = await vA.call('POST', '/workshops', { title: `${MARK} student workshop` });
    check('F2d student cannot create workshop', r.status === 401 || r.status === 403, `status=${r.status}`);
    r = await vA.call('POST', '/announcements', { title: `${MARK} student ann`, description: 'x' });
    check('F2e student cannot create announcement', r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  const ed = mkSession();
  await ed.getCsrf();
  r = await ed.call('POST', '/auth/editor/login', { username: 'qa_test_editor', password: QA_ADMIN_PW });
  const editorOk = r.ok; check('F3a editor login', editorOk, `status=${r.status}`);
  if (editorOk) {
    r = await ed.call('POST', '/posts', { title: `${MARK} editor publish`, content: 'x', contentType: 'article', publish: true });
    const pub = r.ok && r.data && r.data.status === 'published';
    check('F3b editor CANNOT publish directly', !pub, `status=${r.status} resulting_status=${r.data && r.data.status}`);
    r = await ed.call('POST', '/content-items', { type: 'event', title: `${MARK} editor event` });
    check('F3c editor cannot create event (admin-only)', r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  const adm = mkSession();
  await adm.getCsrf();
  r = await adm.call('POST', '/auth/admin/login', { userId: QA_ADMIN, password: QA_ADMIN_PW });
  const adminOk = r.ok; check('F4 admin login', adminOk, `status=${r.status} ${r.data && r.data.error ? r.data.error.slice(0, 40) : ''}`);
  if (!adminOk) { finish(); return; }

  /* ---------- TEST A: POST ---------- */
  console.log('\n--- TEST A: post publish → homepage feed ---');
  const postTitle = `${MARK} post ${Date.now()}`;
  r = await adm.call('POST', '/posts', { title: postTitle, content: `<p>${MARK} body</p>`, contentType: 'article', excerpt: `${MARK} excerpt`, publish: true });
  const postId = r.data && r.data._id;
  check('A1 admin publishes post', r.ok && r.data.status === 'published', `status=${r.status} id=${postId}`);

  r = await anon.call('GET', '/posts');
  check('A2 post in PUBLIC published feed (anon view)', (r.data.posts || []).some(p => p._id === postId), `total=${r.data && r.data.total}`);

  r = await anon.call('GET', `/posts/${postId}`);
  check('A3 post detail reachable', r.ok && ((r.data.post || r.data)._id === postId), `status=${r.status}`);

  r = await adm.call('POST', '/posts', { title: `${MARK} draft ${Date.now()}`, content: 'x', contentType: 'article', publish: false });
  const draftId = r.data && r.data._id;
  check('A4 draft created', r.ok && r.data.status === 'draft', `status=${r.data && r.data.status}`);
  r = await anon.call('GET', '/posts');
  check('A5 draft EXCLUDED from public feed', !(r.data.posts || []).some(p => p._id === draftId), ``);

  /* ---------- TEST D: STORAGE ---------- */
  console.log('\n--- TEST D: storage upload ---');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), `${MARK}.png`);
  r = await adm.call('POST', '/uploads', fd);
  const imgUrl = r.data && r.data.url;
  check('D1 image uploads (admin)', r.ok && !!imgUrl, `status=${r.status} url=${imgUrl} ${r.data && r.data.error ? r.data.error.slice(0, 40) : ''}`);

  if (imgUrl) {
    const abs = imgUrl.startsWith('http') ? imgUrl : BASE + imgUrl;
    const g = await fetch(abs);
    check('D2 image RETRIEVES over HTTP', g.status === 200, `status=${g.status}`);
    const g2 = await fetch(abs);
    check('D3 image works on REFRESH', g2.status === 200, `status=${g2.status}`);
    check('D4 served as image/*', (g.headers.get('content-type') || '').includes('image'), `type=${g.headers.get('content-type')}`);
    r = await adm.call('POST', '/posts', { title: `${MARK} cover ${Date.now()}`, content: 'x', contentType: 'article', coverImage: imgUrl, publish: true });
    check('D5 cover image ref SAVED to post', r.ok && r.data.coverImage === imgUrl, `stored=${r.data && r.data.coverImage}`);
    r = await anon.call('GET', `/posts/${(r.data && r.data._id) || postId}`);
    const fetchedCover = ((r.data && r.data.post) || r.data || {}).coverImage;
    check('D5b cover ref survives RE-FETCH', fetchedCover === imgUrl, `fetched=${fetchedCover}`);
  }

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  fd = new FormData(); fd.append('file', new Blob([pdf], { type: 'application/pdf' }), `${MARK}.pdf`);
  r = await adm.call('POST', '/uploads', fd);
  const pdfUrl = r.data && r.data.url;
  check('D6 PDF uploads (RESOURCE FILES)', r.ok && !!pdfUrl, `status=${r.status} url=${pdfUrl} ${r.data && r.data.error ? r.data.error.slice(0, 50) : ''}`);
  if (pdfUrl) {
    const pg = await fetch(pdfUrl.startsWith('http') ? pdfUrl : BASE + pdfUrl);
    check('D6b PDF RETRIEVES with correct type', pg.status === 200 && (pg.headers.get('content-type') || '').includes('pdf'), `status=${pg.status} type=${pg.headers.get('content-type')}`);
  }

  r = await anon.call('POST', '/uploads', (() => { const f = new FormData(); f.append('file', new Blob([png], { type: 'image/png' }), 'x.png'); return f; })());
  check('D7 anonymous CANNOT upload', r.status === 401 || r.status === 403, `status=${r.status}`);

  /* ---------- TEST B: EVENT ---------- */
  console.log('\n--- TEST B: event ---');
  const evTitle = `${MARK} event ${Date.now()}`;
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  r = await adm.call('POST', '/content-items', { type: 'event', title: evTitle, status: 'published', date: future, location: 'QA Virtual', link: 'https://example.com/qa' });
  const evId = r.data && (r.data.id || (r.data.item && r.data.item.id));
  check('B1 admin publishes FUTURE event', r.ok, `status=${r.status} id=${evId}`);
  r = await anon.call('GET', '/content-items?type=event');
  const evList = r.data.items || r.data || [];
  check('B2 future event in PUBLIC events list (anon)', Array.isArray(evList) && evList.some(e => (e.id || e._id) === evId), `count=${Array.isArray(evList) ? evList.length : 'n/a'}`);

  const past = new Date(Date.now() - 7 * 864e5).toISOString();
  r = await adm.call('POST', '/content-items', { type: 'event', title: `${MARK} past-ev ${Date.now()}`, status: 'published', date: past });
  const pastId = r.data && (r.data.id || (r.data.item && r.data.item.id));
  r = await anon.call('GET', '/content-items?type=event');
  const evList2 = r.data.items || r.data || [];
  check('B3 PAST event does not hide FUTURE ones', Array.isArray(evList2) && evList2.some(e => (e.id || e._id) === evId), `past_listed=${evList2.some(e => (e.id || e._id) === pastId)}`);

  /* ---------- TEST C: WORKSHOP ---------- */
  console.log('\n--- TEST C: workshop + registration ---');
  const wsTitle = `${MARK} workshop ${Date.now()}`;
  const wsStart = new Date(Date.now() + 10 * 864e5).toISOString();
  const wsEnd = new Date(Date.now() + 10 * 864e5 + 36e5).toISOString();
  // Creation always yields draft; publishing is the separate status endpoint.
  r = await adm.call('POST', '/workshops', { title: wsTitle, description: `${MARK} desc`, startTime: wsStart, endTime: wsEnd, timezone: 'Asia/Kolkata', registration: { maxParticipants: 10 } });
  let wsId = r.data && (r.data._id || r.data.id);
  check('C1a workshop created as DRAFT', r.ok && r.data.status === 'draft', `status=${r.status} resulting=${r.data && r.data.status}`);
  if (wsId) {
    r = await adm.call('POST', `/workshops/${wsId}/status`, { status: 'published' });
    check('C1b admin PUBLISHES via status endpoint', r.ok, `status=${r.status} ${r.data && r.data.error ? r.data.error.slice(0, 50) : ''}`);
  }

  r = await anon.call('GET', '/workshops');
  check('C2 workshop in PUBLIC workshops list (anon)', (r.data.workshops || []).some(w => (w._id || w.id) === wsId), `total=${r.data && r.data.total}`);

  if (wsId) {
    check('C3 viewerA authenticated for registration', vAr.ok, `status=${vAr.status}`);
    r = await vA.call('POST', `/workshops/${wsId}/register`, { institution: 'QA Audit' });
    check('C4 viewerA registers for workshop', r.ok && r.data.status === 'registered', `status=${r.status} reg_status=${r.data && r.data.status} ${r.data && r.data.error ? r.data.error.slice(0, 50) : ''}`);
    r = await vA.call('GET', `/workshops/${wsId}/my-status`);
    check('C5 registration PERSISTED (my-status)', r.ok, `status=${r.status}`);
    r = await vA.call('GET', '/registrations/mine');
    const mine = Array.isArray(r.data) ? r.data : (r.data.registrations || []);
    check('C6 registration in my-registrations', r.ok && mine.length >= 1, `count=${mine.length}`);
    const dup = await vA.call('POST', `/workshops/${wsId}/register`, {});
    check('C7 duplicate registration REJECTED', dup.status === 409, `second_status=${dup.status}`);
  }

  /* ---------- TEST E: ANNOUNCEMENTS + PRIVATE NOTIFICATIONS ---------- */
  console.log('\n--- TEST E: announcements + private notifications ---');
  const annTitle = `${MARK} ann ${Date.now()}`;
  r = await adm.call('POST', '/announcements', { title: annTitle, description: `${MARK} public desc`, visibility: 'public' });
  const annId = r.data && (r.data._id || r.data.id);
  check('E1 admin creates PUBLIC announcement', r.ok, `status=${r.status} id=${annId} ${r.data && r.data.error ? r.data.error.slice(0, 50) : ''}`);
  r = await anon.call('GET', '/announcements');
  const anns = Array.isArray(r.data) ? r.data : (r.data.announcements || []);
  check('E2 announcement visible on PUBLIC endpoint (anon)', anns.some(a => (a._id || a.id) === annId), `count=${anns.length}`);

  const ntTitle = `${MARK} broadcast ${Date.now()}`;
  r = await adm.call('POST', '/notifications', { title: ntTitle, message: `${MARK} broadcast msg`, priority: 'medium', category: 'announcement' });
  const ntId = r.data && (r.data._id || r.data.id);
  check('E3 admin creates broadcast notification', r.ok, `status=${r.status} id=${ntId} ${r.data && r.data.error ? r.data.error.slice(0, 50) : ''}`);
  r = await anon.call('GET', '/notifications');
  const pubNotifs = Array.isArray(r.data) ? r.data : (r.data.notifications || []);
  check('E4 broadcast on PUBLIC feed (anon)', pubNotifs.some(n => (n._id || n.id) === ntId), `count=${pubNotifs.length}`);

  // Private per-user notifications (created by the registration flow in C4).
  r = await vA.call('GET', '/my-notifications');
  const mine2 = Array.isArray(r.data) ? r.data : (r.data.notifications || r.data.items || []);
  check('E5 recipientA sees own private notifications', r.ok && mine2.length >= 1, `count=${mine2.length} status=${r.status}`);
  const target = mine2.find(n => (n.title || '').includes('Registration')) || mine2[0];
  if (target) {
    const nid = target._id || target.id;
    r = await vA.call('POST', `/my-notifications/${nid}/read`, {});
    check('E6 mark-as-read works', r.ok, `status=${r.status}`);
    r = await vA.call('GET', '/my-notifications');
    const after = Array.isArray(r.data) ? r.data : (r.data.notifications || r.data.items || []);
    const still = after.find(n => (n._id || n.id) === nid);
    check('E7 read status PERSISTED after refetch', still && still.read === true, `read=${still && still.read}`);
  } else { check('E6 mark-as-read works', false, 'no notification'); check('E7 read status PERSISTED after refetch', false, 'n/a'); }

  // Recipient scoping: a different signed-in student must not see A's private notifications.
  const { s: vB, r: vBr } = await viewerLogin(QA_EMAIL_B);
  check('E8 viewerB login', vBr.ok, `status=${vBr.status}`);
  if (vBr.ok) {
    r = await vB.call('GET', '/my-notifications');
    const mineB = Array.isArray(r.data) ? r.data : (r.data.notifications || r.data.items || []);
    const leaked = mineB.filter(n => (n.title || '').includes('Registration'));
    check('E9 private notifications NOT visible to other users', leaked.length === 0, `viewerB_count=${mineB.length} leaked=${leaked.length}`);
  }
  r = await anon.call('GET', '/my-notifications');
  check('E10 anon cannot access private notifications', r.status === 401 || r.status === 403, `status=${r.status}`);

  /* ---------- TEST G: SCHEDULER ---------- */
  console.log('\n--- TEST G: scheduler / reminders ---');
  const schedTitle = `${MARK} sched ${Date.now()}`;
  r = await adm.call('POST', '/announcements', { title: schedTitle, description: 'x', scheduleDate: new Date(Date.now() + 2000).toISOString() });
  check('G1 scheduled announcement created', r.ok && r.data.status === 'scheduled', `status=${r.status} resulting=${r.data && r.data.status}`);
  // The cron tick runs every minute — poll up to 90s instead of assuming.
  let flipped = false, flipStatus = 'unknown';
  for (let i = 0; i < 18; i++) {
    await new Promise(s => setTimeout(s, 5000));
    const q = await adm.call('GET', '/announcements/all');
    const all = Array.isArray(q.data) ? q.data : (q.data.announcements || []);
    const a = all.find(x => x.title === schedTitle);
    if (a && a.status === 'published') { flipped = true; flipStatus = 'published'; break; }
    if (a) flipStatus = a.status;
  }
  check('G2 scheduler AUTO-PUBLISHED due announcement', flipped, `final_status=${flipStatus}`);

  r = await anon.call('GET', '/workshops');
  const wsl = r.data.workshops || [];
  const wq = wsl.find(w => (w.title || '').includes(MARK));
  check('G3 workshop reminderSchedule field exposed', wq ? ('reminderSchedule' in wq) : false, `field_present=${wq ? ('reminderSchedule' in wq) : 'n/a'}`);

  finish();

  function finish() {
    console.log('\n=== SUMMARY ===');
    const pass = results.filter(x => x.pass).length;
    console.log(`PASS ${pass} / ${results.length}`);
    fs.writeFileSync('.qa-results.json', JSON.stringify(results, null, 2));
    process.exit(0);
  }
})().catch(e => { console.error('BATTERY_ERROR', e.message); process.exit(1); });
