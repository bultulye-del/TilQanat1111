(function () {
'use strict';
var C = window.TQ_CONFIG;
var sb = window.supabase.createClient(C.url, C.key);
var app = document.getElementById('app'), nav = document.getElementById('nav'), menuBtn = document.getElementById('menuBtn');
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var S = { session: null, profile: null, admin: false }, R = null;
var store = (function () { try { return window.localStorage; } catch (e) { return null; } })();
var getPref = function (k) { return !!store && store.getItem(k) === '1'; };
var setPref = function (k, v) { if (store) store.setItem(k, v ? '1' : '0'); };
var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
var yearsAgo = function (n) { var d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };
var title = function (t) { return t.title_kk ? t.title_kk + ' · ' + t.title_en : t.title_en; };

var ERR = {
  topic_locked: 'Бұл тақырып әлі жабық. Алдыңғы тақырыптан өт.',
  level_locked: 'Бұл деңгей әлі жабық.',
  topics_incomplete: 'Қорытынды тест үшін деңгейдегі барлық тақырыптан өту керек.',
  not_enough_questions: 'Бұл тесттің сұрақтары әлі дайын емес.',
  attempt_not_open: 'Бұл тест әрекеті жабық. Тестті қайта баста.',
  already_answered: 'Бұл сұраққа жауап бұрын берілген.',
  already_finished: 'Бұл тест аяқталған.',
  not_authenticated: 'Алдымен жүйеге кір.',
  forbidden: 'Рұқсат жоқ.'
};
function errMsg(e) {
  var m = (e && e.message) || '';
  for (var k in ERR) if (m.indexOf(k) > -1) return ERR[k];
  if (/already registered|already been registered/i.test(m)) return 'Бұл email бұрын тіркелген.';
  if (/Invalid login/i.test(m)) return 'Email немесе құпиясөз қате.';
  if (/Email not confirmed/i.test(m)) return 'Email әлі расталмаған. Поштаңды тексер.';
  if (/Database error saving new user/i.test(m)) return 'Тіркелу мүмкін болмады. Туған күн мен келісімдерді тексер.';
  if (/rate limit/i.test(m)) return 'Тым көп әрекет. Біраз күтіп, қайта байқап көр.';
  return 'Қате болды. Кейінірек қайталап көр.';
}
async function q(p) { var r = await p; if (r.error) throw r.error; return r.data; }
function loading() { app.innerHTML = '<div class="wrap"><p class="lead">Жүктелуде…</p></div>'; }
function page(html) { app.innerHTML = '<div class="wrap">' + html + '</div>'; }
function note(msg, cls) { return '<div class="msg ' + (cls || '') + '" role="status">' + esc(msg) + '</div>'; }
function vis(v, big) {
  v = v || '';
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return '<span class="sw' + (big ? ' big' : '') + '" style="background:' + v + '"></span>';
  return '<span class="em' + (big ? ' big' : '') + '" aria-hidden="true">' + esc(v) + '</span>';
}
function say(t) {
  if (getPref('tq_nosound') || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.speak(u);
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-say]');
  if (b) { say(b.getAttribute('data-say')); }
});
function applyPrefs() { document.body.classList.toggle('reduce', getPref('tq_reduce')); }

/* ---------- session ---------- */
async function loadMe() {
  var r = await sb.auth.getSession();
  S.session = r.data.session; S.profile = null; S.admin = false;
  if (!S.session) return;
  var res = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', S.session.user.id).maybeSingle(),
    sb.rpc('is_admin')
  ]);
  S.profile = res[0].data; S.admin = res[1].data === true;
}
function renderNav() {
  nav.innerHTML = S.session
    ? '<a href="#/dashboard">Кабинет</a><a href="#/levels">Деңгейлер</a><a href="#/achievements">Жетістіктер</a><a href="#/profile">Профиль</a>' + (S.admin ? '<a href="#/admin">Әкімші</a>' : '') + '<button class="link" id="out">Шығу</button>'
    : '<a href="#/levels">Деңгейлер</a><a href="#/login">Кіру</a><a class="btn" href="#/signup">Оқуды бастау</a>';
  var o = $('#out'); if (o) o.onclick = async function () { await sb.auth.signOut(); S = { session: null, profile: null, admin: false }; renderNav(); location.hash = '#/'; };
}
menuBtn.onclick = function () { var o = nav.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', o); };
nav.addEventListener('click', function (e) { if (e.target.closest('a')) { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

/* ---------- forms ---------- */
function field(id, label, type, extra) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + '><div class="err" id="e-' + id + '" aria-live="polite"></div></div>';
}
function chk(id, label) {
  return '<div class="field chk"><label><input type="checkbox" id="' + id + '"> <span>' + label + '</span></label><div class="err" id="e-' + id + '" aria-live="polite"></div></div>';
}
function setErr(id, m) {
  var i = $('#' + id), e = $('#e-' + id);
  if (e) e.textContent = m || '';
  if (i) i.setAttribute('aria-invalid', m ? 'true' : 'false');
  return !m;
}

/* ---------- pages: public ---------- */
function home() {
  page('<section><span class="tag">Қазақ балаларына арналған ағылшын тілі</span><h1>Ағылшын тілін қызықты әлем арқылы үйрен!</h1>' +
    '<p class="lead">Ойындар, қызықты сабақтар және интерактивті тапсырмалар арқылы ағылшын тілін өз қарқыныңмен меңгер.</p>' +
    '<div class="ctas"><a class="btn" href="#/signup">Оқуды бастау</a><a class="btn sec" href="#/levels">Деңгейлерді көру</a></div>' +
    '<p class="small">Алғашқы сөздерден еркін қарым-қатынасқа дейін.</p></section>' +
    '<h2>Үйрену өте оңай</h2><div class="grid">' +
    ['Тіркел|Жасыңа сәйкес бастапқы деңгейіңді анықта.', 'Сабақтарды орында|Жаңа сөздерді үйреніп, интерактивті тапсырмаларды орында.', 'Тест тапсыр|Әр тақырып соңында біліміңді тексер.', 'Келесі деңгейге өт|Қорытынды тесттен өтіп, жаңа мүмкіндіктерді аш.']
      .map(function (s, i) { var p = s.split('|'); return '<div class="card"><div class="dot">' + (i + 1) + '</div><h3>' + p[0] + '</h3><p class="small">' + p[1] + '</p></div>'; }).join('') +
    '</div><div class="ctas"><a class="btn" href="#/signup">Бүгін алғашқы ағылшын сөзіңді үйрен!</a></div>');
}

function signup() {
  page('<form id="f" class="form" novalidate><h1 style="font-size:1.7rem">Тіркелу</h1>' +
    field('nick', 'Есімі немесе лақап аты', 'text', 'maxlength="40" autocomplete="nickname"') +
    field('bd', 'Туған күні', 'date', 'max="' + new Date().toISOString().slice(0, 10) + '"') +
    field('email', 'Электрондық пошта (14 жасқа дейін — ата-анасының поштасы)', 'email', 'autocomplete="email"') +
    field('pw', 'Құпиясөз (кемінде 8 таңба)', 'password', 'autocomplete="new-password"') +
    field('pc', 'Құпиясөзді растау', 'password', 'autocomplete="new-password"') +
    '<div id="gw" class="hide">' + chk('guard', 'Ата-анамның немесе заңды өкілімнің келісімі бар') + '</div>' +
    chk('terms', '<a href="#/terms">Пайдалану шарттары</a> мен <a href="#/privacy">құпиялық саясатымен</a> келісемін') +
    '<button class="btn" type="submit" style="width:100%">Тіркелу</button><div id="fm"></div>' +
    '<p class="small">Тіркелгенсің бе? <a href="#/login"><b>Кіру</b></a></p></form>');
  $('#bd').onchange = function () { var v = this.value; $('#gw').classList.toggle('hide', !(v && new Date(v) > yearsAgo(14))); };
  $('#f').onsubmit = async function (e) {
    e.preventDefault();
    var nick = $('#nick').value.trim(), bd = $('#bd').value, email = $('#email').value.trim(), pw = $('#pw').value, pc = $('#pc').value;
    var d = new Date(bd), under14 = !!bd && d > yearsAgo(14), ok = true;
    ok = setErr('nick', nick && nick.length <= 40 ? '' : 'Есімді енгіз (1–40 таңба).') && ok;
    ok = setErr('bd', bd && d <= new Date() && d > yearsAgo(110) ? '' : 'Туған күнді дұрыс енгіз.') && ok;
    ok = setErr('email', /^\S+@\S+\.\S+$/.test(email) ? '' : 'Email-ді дұрыс енгіз.') && ok;
    ok = setErr('pw', pw.length >= 8 ? '' : 'Құпиясөз кемінде 8 таңба болсын.') && ok;
    ok = setErr('pc', pc === pw ? '' : 'Құпиясөздер сәйкес емес.') && ok;
    ok = setErr('terms', $('#terms').checked ? '' : 'Келісім қажет.') && ok;
    ok = setErr('guard', !under14 || $('#guard').checked ? '' : '14 жасқа дейін ата-ананың келісімі қажет.') && ok;
    if (!ok) return;
    var btn = $('button[type=submit]'); btn.disabled = true; $('#fm').innerHTML = '';
    var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { display_name: nick, birth_date: bd, terms_accepted: 'true', guardian_consent: under14 ? 'true' : 'false' } } });
    btn.disabled = false;
    if (r.error) { $('#fm').innerHTML = note(errMsg(r.error), 'bad'); return; }
    if (r.data.session) { await loadMe(); renderNav(); location.hash = '#/dashboard'; }
    else $('#fm').innerHTML = note('Тіркелу сәтті! Поштаңа растау хаты жіберілді. Хаттағы сілтемені басып, кейін жүйеге кір.', 'good');
  };
}

function login() {
  page('<form id="f" class="form" novalidate><h1 style="font-size:1.7rem">Жүйеге кіру</h1>' +
    field('email', 'Электрондық пошта', 'email', 'autocomplete="username"') + field('pw', 'Құпиясөз', 'password', 'autocomplete="current-password"') +
    '<button class="btn" type="submit" style="width:100%">Кіру</button><div id="fm"></div><p class="small">Тіркелмегенсің бе? <a href="#/signup"><b>Тіркелу</b></a></p></form>');
  $('#f').onsubmit = async function (e) {
    e.preventDefault();
    var email = $('#email').value.trim(), pw = $('#pw').value, ok = true;
    ok = setErr('email', email ? '' : 'Email-ді енгіз.') && ok;
    ok = setErr('pw', pw ? '' : 'Құпиясөзді енгіз.') && ok;
    if (!ok) return;
    var btn = $('button[type=submit]'); btn.disabled = true;
    var r = await sb.auth.signInWithPassword({ email: email, password: pw });
    btn.disabled = false;
    if (r.error) { $('#fm').innerHTML = note(errMsg(r.error), 'bad'); return; }
    await loadMe(); renderNav(); location.hash = '#/dashboard';
  };
}

function legal(kind) {
  var t = kind === 'privacy' ? 'Құпиялық саясаты' : 'Пайдалану шарттары';
  page('<h1>' + t + '</h1>' + note('Бұл — жоба мәтіні (черновик). Іске қоспас бұрын заңгердің тексеруінен өтуі керек.') +
    (kind === 'privacy'
      ? '<p>Біз тек қажетті деректерді жинаймыз: есімі немесе лақап аты, туған күні (деңгейді жасына қарай анықтау үшін), email және оқу нәтижелері. Деректер тек оқуды ұйымдастыру үшін қолданылады.</p><p>14 жасқа дейінгі қолданушылар үшін ата-ана немесе заңды өкілдің келісімі талап етіледі.</p>'
      : '<p>Платформа ағылшын тілін үйренуге арналған. Қолданушы өз аккаунтының қауіпсіздігіне жауап береді және басқа адамдардың деректеріне рұқсатсыз қол жеткізуге әрекет жасамайды.</p>'));
}

/* ---------- levels & topics ---------- */
async function levels() {
  loading();
  var uid = S.session && S.session.user.id;
  var res = await Promise.all([q(sb.from('levels').select('*').order('id')), uid ? q(sb.from('level_progress').select('*').eq('user_id', uid)) : Promise.resolve([])]);
  var lp = {}; res[1].forEach(function (x) { lp[x.level_id] = x; });
  var adult = S.profile && S.profile.adult_notice;
  page('<h1>Деңгейлер картасы</h1><p class="lead">Жасыңа сәйкес деңгейден басталады, келесі деңгей қорытынды тесттен кейін ашылады.</p>' +
    (adult ? note('18 жастан асқан қолданушыларға жасөспірімдерге арналған деңгейлер автоматты түрде берілмейді.') : '') +
    (!S.session ? note('Оқу үшін алдымен тіркел немесе жүйеге кір.') : '') +
    '<div class="grid">' + res[0].map(function (l) {
      var open = lp[l.id] && lp[l.id].unlocked;
      var inner = '<div class="num">' + l.id + '-ДЕҢГЕЙ</div><h3>' + esc(l.title) + '</h3><span class="age">' + esc(l.age_label) + '</span><p class="small">' + (open ? (lp[l.id].final_passed ? '✔ Деңгей аяқталды' : '🔓 Ашық') : '🔒 Жабық') + '</p>';
      return open ? '<a class="card" href="#/level/' + l.id + '">' + inner + '</a>' : '<div class="card lock">' + inner + '</div>';
    }).join('') + '</div>');
}

async function level(n) {
  n = +n; loading();
  var uid = S.session.user.id;
  var r = await Promise.all([
    q(sb.from('levels').select('*').eq('id', n).single()), q(sb.from('topics').select('*').eq('level_id', n).order('position')),
    q(sb.from('user_progress').select('*').eq('user_id', uid)), q(sb.from('level_progress').select('*').eq('user_id', uid).eq('level_id', n)),
    q(sb.from('lessons').select('id,topic_id')),
    q(sb.from('test_attempts').select('correct_count,total,percent').eq('user_id', uid).eq('kind', 'diagnostic').eq('level_id', n).not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1))
  ]);
  var lv = r[0], tp = r[1], up = {}; r[2].forEach(function (x) { up[x.topic_id] = x; });
  var unlocked = r[3][0] && r[3][0].unlocked, has = {}; r[4].forEach(function (l) { has[l.topic_id] = 1; });
  if (!unlocked) { page('<h1>' + esc(lv.title) + '</h1>' + note('Бұл деңгей әлі жабық.', 'bad') + '<a class="btn" href="#/levels">← Деңгейлерге</a>'); return; }
  var allPassed = tp.every(function (t) { return up[t.id] && up[t.id].passed; }), allContent = tp.every(function (t) { return has[t.id]; });
  var done = tp.filter(function (t) { return up[t.id] && up[t.id].passed; }).length;
  var fin = r[3][0], dg = r[5][0];
  page('<a class="small" href="#/levels">← Деңгейлер</a><h1>' + n + '-деңгей · ' + esc(lv.title) + '</h1><span class="age">' + esc(lv.age_label) + '</span>' +
    '<div class="bar2" role="progressbar" aria-valuenow="' + done + '" aria-valuemin="0" aria-valuemax="' + tp.length + '"><i style="width:' + (tp.length ? done / tp.length * 100 : 0) + '%"></i></div><p class="small">' + done + ' / ' + tp.length + ' тақырып аяқталды</p>' +
    '<div class="card" style="margin:14px 0"><h3>Диагностикалық тапсырма</h3><p class="small">10 сұрақ · нәтиже деңгейіңе әсер етпейді, тек қайдан бастау керегін көрсетеді.' + (dg ? ' Соңғы нәтиже: ' + dg.correct_count + ' / ' + dg.total + ' (' + dg.percent + '%).' : '') + '</p><a class="btn sec" href="#/test/diagnostic/' + n + '">' + (dg ? 'Қайта тапсыру' : 'Бастау') + '</a></div>' +
    '<ul class="rows">' + tp.map(function (t, i) {
      var passed = up[t.id] && up[t.id].passed, open = i === 0 || (up[tp[i - 1].id] && up[tp[i - 1].id].passed);
      var st = passed ? '✔ ' + up[t.id].best_percent + '%' : open ? '🔓 Ашық' : '🔒 Жабық';
      var act = !open ? '' : has[t.id] ? '<a class="btn" href="#/lesson/' + t.id + '">' + (passed ? 'Қайталау' : 'Бастау') + '</a>' : '<span class="small">Мазмұн жақында</span>';
      return '<li><div class="l"><div class="dot">' + (i + 1) + '</div><div><strong>' + esc(title(t)) + '</strong><div class="small">' + st + '</div></div></div>' + act + '</li>';
    }).join('') + '</ul>' +
    '<h2>Деңгейлік қорытынды тест</h2><p class="small">30 сұрақ · өту үшін кемінде 21 дұрыс жауап · ' + (fin && fin.final_best_score != null ? 'үздік нәтиже: ' + fin.final_best_score + ' / 30' : 'әлі тапсырылмаған') + '</p>' +
    (allPassed && allContent ? '<a class="btn" href="#/test/final/' + n + '">' + (fin && fin.final_passed ? 'Қайта тапсыру' : 'Тестті бастау') + '</a>' : note(allContent ? 'Қорытынды тест барлық тақырыптан өткеннен кейін ашылады.' : 'Бұл деңгейдің мазмұны әлі толық емес.')));
}

/* ---------- lesson ---------- */
async function lesson(tid) {
  loading();
  var uid = S.session.user.id;
  var t = await q(sb.from('topics').select('*').eq('id', tid).single());
  var r = await Promise.all([
    q(sb.from('vocabulary').select('*').eq('topic_id', tid).order('position')), q(sb.from('lessons').select('*').eq('topic_id', tid).limit(1)),
    q(sb.from('topics').select('id,position').eq('level_id', t.level_id)), q(sb.from('user_progress').select('topic_id,passed').eq('user_id', uid)),
    q(sb.from('level_progress').select('unlocked').eq('user_id', uid).eq('level_id', t.level_id))
  ]);
  var words = r[0], ls = r[1][0], passed = {}; r[3].forEach(function (x) { if (x.passed) passed[x.topic_id] = 1; });
  var prev = r[2].filter(function (x) { return x.position === t.position - 1; })[0];
  var open = r[4][0] && r[4][0].unlocked && (t.position === 1 || (prev && passed[prev.id]));
  if (!open) { page('<h1>' + esc(title(t)) + '</h1>' + note('Бұл тақырып әлі жабық. Алдыңғы тақырыптан өт.', 'bad') + '<a class="btn" href="#/level/' + t.level_id + '">← Тақырыптарға</a>'); return; }
  if (!words.length) { page('<h1>' + esc(title(t)) + '</h1>' + note('Бұл тақырыптың мазмұны жақында қосылады.') + '<a class="btn" href="#/level/' + t.level_id + '">← Тақырыптарға</a>'); return; }
  sb.rpc('touch_activity', { p_topic: tid, p_lesson: ls ? ls.id : null }).then(function () {}, function () {});
  page('<a class="small" href="#/level/' + t.level_id + '">← Тақырыптар</a><h1>' + esc(title(t)) + '</h1>' +
    (ls && ls.goal ? '<p class="lead">Мақсат: ' + esc(ls.goal) + '</p>' : '') + (ls && ls.intro ? '<p><b>Мысал:</b> ' + esc(ls.intro) + '</p>' : '') +
    '<h2>Жаңа сөздер</h2><div class="wgrid">' + words.map(function (w) {
      return '<div class="wc">' + vis(w.visual, true) + '<strong>' + esc(w.en) + '</strong><span class="kk">' + esc(w.kk) + '</span><button class="btn sec" data-say="' + esc(w.en) + '" aria-label="' + esc(w.en) + ' тыңдау">🔊 Тыңда</button></div>';
    }).join('') + '</div>' +
    (words.length >= 4 ? '<h2>Жаттығу</h2><div id="ex"></div>' : '') +
    '<h2>Тақырыптық тест</h2><p class="small">5 сұрақ · өту шегі 70%</p><a class="btn" href="#/test/topic/' + tid + '">Тестке өту</a>');
  if (words.length >= 4 && $('#ex')) exercise($('#ex'), words);
}
function exercise(box, words) {
  var rounds = shuffle(words).slice(0, 3).map(function (t) { return { t: t, opts: shuffle([t].concat(shuffle(words.filter(function (w) { return w !== t; })).slice(0, 3))) }; });
  var i = 0, ok = false, bad = {}, fb = '';
  function draw() {
    if (i >= rounds.length) { box.innerHTML = note('Жаттығу аяқталды! 🎉 Енді тестке өте аласың.', 'good'); return; }
    var r = rounds[i];
    box.innerHTML = '<p class="lead">' + (i + 1) + ' / ' + rounds.length + ' · Дұрыс суретті тап: <b>' + esc(r.t.en) + '</b> <button class="btn sec" data-say="' + esc(r.t.en) + '" aria-label="Тыңдау">🔊</button></p>' +
      '<div class="swrow">' + r.opts.map(function (o, k) { return '<button class="swb" data-k="' + k + '" aria-label="' + esc(o.kk) + '"' + (ok || bad[k] ? ' disabled' : '') + '>' + vis(o.visual, true) + '</button>'; }).join('') + '</div>' +
      '<div class="fb" role="status" aria-live="polite">' + esc(fb) + '</div>' + (ok ? '<button class="btn" id="nx">Келесі</button>' : '');
    $$('.swb', box).forEach(function (b) {
      b.onclick = function () {
        var o = r.opts[+b.getAttribute('data-k')];
        if (o === r.t) { ok = true; fb = 'Дұрыс! ' + r.t.en + ' — ' + r.t.kk + '.'; } else { bad[b.getAttribute('data-k')] = 1; fb = 'Қателесу — қалыпты жағдай. Қайта байқап көр!'; }
        draw();
      };
    });
    var nx = $('#nx', box); if (nx) nx.onclick = function () { i++; ok = false; bad = {}; fb = ''; draw(); };
  }
  draw();
}

/* ---------- tests ---------- */
async function test(kind, id) {
  loading();
  var args = kind === 'topic' ? { p_kind: 'topic', p_topic: id } : { p_kind: kind === 'diagnostic' ? 'diagnostic' : 'final', p_level: +id };
  var r = await q(sb.rpc('start_attempt', args));
  runTest(kind, id, r);
}
function runTest(kind, id, r) {
  var qs = r.questions, total = qs.length, i = 0, chosen = {}, answered = {}, busy = false, fbHtml = '';
  function qHtml(x) {
    var media = x.format === 'image' && x.image ? '<div>' + vis(x.image, true) + '</div>' : x.format === 'audio' ? '<button class="btn sec" data-say="' + esc(x.audio_text) + '">🔊 Тыңдау</button>' : '';
    return '<h2>' + esc(x.prompt) + '</h2>' + media;
  }
  function draw() {
    var x = qs[i], isTopic = kind === 'topic', a = answered[x.id];
    var head = '<p class="small">' + (isTopic ? 'Тақырыптық тест' : kind === 'diagnostic' ? 'Диагностикалық тапсырма' : 'Деңгейлік тест') + ' · сұрақ ' + (i + 1) + ' / ' + total + '</p><div class="bar2"><i style="width:' + (i / total * 100) + '%"></i></div>';
    var opts = x.options.map(function (o, k) {
      var cls = '';
      if (isTopic && a) cls = k === a.correct_index ? ' good' : (k === a.choice ? ' bad' : '');
      else if (!isTopic && chosen[x.id] === k) cls = ' sel';
      return '<button class="opt' + cls + '" data-k="' + k + '"' + (isTopic && a ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('');
    var foot = '';
    if (isTopic) {
      foot = a ? '<div class="fb" role="status" aria-live="polite">' + esc((a.is_correct ? 'Дұрыс! ' : 'Қателесу — үйренудің бір бөлігі. ') + (a.explanation || '')) + '</div><button class="btn" id="nx">' + (i < total - 1 ? 'Келесі сұрақ' : 'Нәтижені көру') + '</button>' : '';
    } else {
      var cnt = Object.keys(chosen).length;
      foot = '<div class="fb" role="status" aria-live="polite">' + esc(fbHtml) + '</div><div class="ctas">' + (i > 0 ? '<button class="btn sec" id="pv">← Алдыңғы</button>' : '') +
        (i < total - 1 ? '<button class="btn" id="nx">Келесі →</button>' : '<button class="btn" id="fin">Тапсыру</button>') + '</div><p class="small">Жауап берілді: ' + cnt + ' / ' + total + '</p>';
    }
    app.innerHTML = '<div class="wrap">' + head + qHtml(x) + '<div class="opts">' + opts + '</div>' + foot + '</div>';
    $$('.opt').forEach(function (b) { b.onclick = function () { pick(+b.getAttribute('data-k')); }; });
    var nx = $('#nx'); if (nx) nx.onclick = function () { if (isTopic && i >= total - 1) return finish(); i++; fbHtml = ''; draw(); };
    var pv = $('#pv'); if (pv) pv.onclick = function () { i--; fbHtml = ''; draw(); };
    var fn = $('#fin'); if (fn) fn.onclick = function () {
      var miss = total - Object.keys(chosen).length;
      if (miss > 0 && !confirm('Жауап берілмеген сұрақтар: ' + miss + '. Бәрібір тапсырасың ба?')) return;
      finish();
    };
  }
  async function pick(k) {
    if (busy) return; busy = true;
    var x = qs[i];
    try {
      var res = await q(sb.rpc('answer_question', { p_attempt: r.attempt_id, p_question: x.id, p_choice: k }));
      if (kind === 'topic') answered[x.id] = { choice: k, is_correct: res.is_correct, correct_index: res.correct_index, explanation: res.explanation };
      else { chosen[x.id] = k; fbHtml = 'Жауап сақталды. Қаласаң, өзгерте аласың.'; }
    } catch (e) { fbHtml = errMsg(e); }
    busy = false; draw();
  }
  async function finish() {
    try {
      var res = await q(sb.rpc('finish_attempt', { p_attempt: r.attempt_id }));
      R = { attempt: r.attempt_id, res: res };
      location.hash = '#/results/' + r.attempt_id;
    } catch (e) { app.innerHTML = '<div class="wrap">' + note(errMsg(e), 'bad') + '<a class="btn" href="#/levels">← Деңгейлер</a></div>'; }
  }
  draw();
}

async function results(aid) {
  loading();
  var a = await q(sb.from('test_attempts').select('*').eq('id', aid).single());
  if (!a.finished_at) { page(note('Бұл тест әлі аяқталмаған.', 'bad') + '<a class="btn" href="#/levels">← Деңгейлер</a>'); return; }
  if (a.kind === 'diagnostic') {
    var tips = { low: 'Бұл деңгейдің материалы саған әлі қиындау болуы мүмкін. Тақырыптарды ретімен, асықпай өт, ал алдыңғы деңгей тақырыптарын қайталау пайдалы.', mid: 'Жақсы бастама! Бұл деңгей саған сай. Тақырыптарды ретімен өтуді жалғастыр.', high: 'Тамаша нәтиже! Бұл деңгейдің көп бөлігін білесің. Тақырыптарды жылдамырақ өтіп, қорытынды тестке тезірек жетуге болады.' };
    var bd = a.percent < 40 ? 'low' : a.percent < 80 ? 'mid' : 'high';
    page('<h1>Диагностикалық нәтиже</h1><div class="stat"><div><strong>' + a.correct_count + '</strong>дұрыс</div><div><strong>' + (a.total - a.correct_count) + '</strong>қате</div><div><strong>' + a.percent + '%</strong>нәтиже</div></div>' + note(tips[bd]) + '<p class="small">Бұл тапсырма — тек бағыт-бағдар. Ол деңгейіңді өзгертпейді, ұпай бермейді және келесі деңгейді ашпайды.</p><div class="ctas"><a class="btn" href="#/level/' + a.level_id + '">Тақырыптарға өту →</a><a class="btn sec" href="#/test/diagnostic/' + a.level_id + '">Қайта тапсыру</a></div>');
    return;
  }
  var weak = R && R.attempt === aid ? R.res.weak_topics : null, tp = [];
  if (weak && weak.length) tp = await q(sb.from('topics').select('*').in('id', weak));
  var pass = a.passed, final = a.kind === 'final';
  var next = '';
  if (!final) next = pass ? '<a class="btn" href="#/level/' + a.level_id + '">Келесі қадам →</a>' : '<a class="btn" href="#/lesson/' + a.topic_id + '">Материалды қайталау</a><a class="btn sec" href="#/test/topic/' + a.topic_id + '">Тестті қайта тапсыру</a>';
  else next = pass ? (a.level_id < 4 ? '<a class="btn" href="#/level/' + (a.level_id + 1) + '">Келесі деңгейге өту →</a>' : note('Құттықтаймыз! Барлық деңгей аяқталды 🎉', 'good')) : '<a class="btn" href="#/level/' + a.level_id + '">Тақырыптарды қайталау</a><a class="btn sec" href="#/test/final/' + a.level_id + '">Тестті қайта тапсыру</a>';
  page('<h1>Тест нәтижесі</h1><div class="stat"><div><strong>' + a.correct_count + '</strong>дұрыс</div><div><strong>' + (a.total - a.correct_count) + '</strong>қате</div><div><strong>' + a.percent + '%</strong>нәтиже</div></div>' +
    note(pass ? (final ? 'Өттің! 🎉 Келесі деңгей ашылды.' : 'Өттің! 🎉 Келесі тақырып ашылды.') : 'Бұл жолы өту шегіне жетпедің. Материалды қайталап, қайта тапсыр — міндетті түрде шығады!', pass ? 'good' : '') +
    (tp.length ? '<h2>Қайталауға ұсынылатын тақырыптар</h2><ul class="rows">' + tp.map(function (t) { return '<li><strong>' + esc(title(t)) + '</strong><a class="btn sec" href="#/lesson/' + t.id + '">Қайталау</a></li>'; }).join('') + '</ul>' : '') +
    '<div class="ctas">' + next + '</div>');
}

/* ---------- dashboard & profile ---------- */
async function dashboard() {
  loading();
  var uid = S.session.user.id;
  var r = await Promise.all([
    q(sb.from('levels').select('*').order('id')), q(sb.from('level_progress').select('*').eq('user_id', uid)), q(sb.from('topics').select('*').order('level_id').order('position')),
    q(sb.from('user_progress').select('*').eq('user_id', uid)), q(sb.from('last_activity').select('*').eq('user_id', uid).maybeSingle()),
    q(sb.from('test_attempts').select('*').eq('user_id', uid).not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(10)),
    q(sb.from('activity_days').select('day').eq('user_id', uid).order('day', { ascending: false }).limit(60)),
    q(sb.from('user_achievements').select('code')), q(sb.from('achievements').select('*'))
  ]);
  var p = S.profile || {}, lp = r[1].filter(function (x) { return x.unlocked; }), cur = lp.reduce(function (m, x) { return Math.max(m, x.level_id); }, 0);
  var up = {}; r[3].forEach(function (x) { up[x.topic_id] = x; });
  var topics = r[2], tmap = {}; topics.forEach(function (t) { tmap[t.id] = t; });
  var lvTopics = topics.filter(function (t) { return t.level_id === cur; });
  var done = lvTopics.filter(function (t) { return up[t.id] && up[t.id].passed; }), todo = lvTopics.filter(function (t) { return !(up[t.id] && up[t.id].passed); });
  var review = lvTopics.filter(function (t) { return up[t.id] && up[t.id].attempts > 0 && !up[t.id].passed; });
  var days = {}; r[6].forEach(function (x) { days[x.day] = 1; });
  var d = new Date(), streak = 0, key = function (x) { return x.toISOString().slice(0, 10); };
  if (!days[key(d)]) d.setUTCDate(d.getUTCDate() - 1);
  while (days[key(d)]) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  var got = {}; r[7].forEach(function (x) { got[x.code] = 1; });
  var lvl = r[0].filter(function (l) { return l.id === cur; })[0];
  var la = r[4];
  page('<h1>Сәлем, ' + esc(p.display_name || '') + '! 👋</h1>' +
    (p.adult_notice ? note('18 жастан асқан қолданушыларға жасөспірімдерге арналған деңгейлер автоматты түрде берілмейді. Ересектерге арналған бағдарлама кейін қосылады.') : '') +
    (cur ? '<div class="card"><div class="num">ҚАЗІРГІ ДЕҢГЕЙ</div><h2 style="margin:.2em 0">' + cur + '-деңгей · ' + esc(lvl ? lvl.title : '') + '</h2>' +
      '<div class="bar2"><i style="width:' + (lvTopics.length ? done.length / lvTopics.length * 100 : 0) + '%"></i></div><p class="small">' + done.length + ' / ' + lvTopics.length + ' тақырып аяқталды</p>' +
      '<div class="ctas">' + (la && la.topic_id && tmap[la.topic_id] ? '<a class="btn" href="#/lesson/' + la.topic_id + '">Оқуды жалғастыру: ' + esc(tmap[la.topic_id].title_en) + '</a>' : '') + '<a class="btn sec" href="#/level/' + cur + '">Тақырыптар</a></div></div>' : '') +
    '<div class="stat"><div><strong>⭐ ' + (p.points || 0) + '</strong>ұпай</div><div><strong>🔥 ' + streak + '</strong>күн қатарынан</div><div><strong>' + Object.keys(got).length + ' / ' + r[8].length + '</strong>жетістік</div></div>' +
    (review.length ? '<h2>Қайталауды қажет ететін тақырыптар</h2><ul class="rows">' + review.map(function (t) { return '<li><strong>' + esc(title(t)) + '</strong><a class="btn sec" href="#/lesson/' + t.id + '">Қайталау</a></li>'; }).join('') + '</ul>' : '') +
    '<h2>Аяқталған тақырыптар</h2>' + (done.length ? done.map(function (t) { return '<span class="badge">✔ ' + esc(t.title_en) + ' · ' + up[t.id].best_percent + '%</span>'; }).join('') : '<p class="small">Әзірге жоқ.</p>') +
    '<h2>Аяқталмаған тақырыптар</h2>' + (todo.length ? todo.map(function (t) { return '<span class="badge off">' + esc(t.title_en) + '</span>'; }).join('') : '<p class="small">Барлығы аяқталды 🎉</p>') +
    '<h2>Тест нәтижелері</h2>' + (r[5].length ? '<div class="scroll"><table><tr><th>Күні</th><th>Түрі</th><th>Тақырып</th><th>Нәтиже</th><th>Статус</th></tr>' + r[5].map(function (a) {
      return '<tr><td>' + new Date(a.finished_at).toLocaleDateString('kk-KZ') + '</td><td>' + (a.kind === 'final' ? 'Деңгейлік' : a.kind === 'diagnostic' ? 'Диагностикалық' : 'Тақырыптық') + '</td><td>' + esc(a.kind !== 'topic' ? a.level_id + '-деңгей' : (tmap[a.topic_id] ? tmap[a.topic_id].title_en : '')) + '</td><td>' + a.correct_count + ' / ' + a.total + ' (' + a.percent + '%)</td><td>' + (a.kind === 'diagnostic' ? '—' : a.passed ? '✔ Өтті' : '✖ Өтпеді') + '</td></tr>';
    }).join('') + '</table></div>' : '<p class="small">Әзірге тест тапсырылмаған.</p>'));
}

async function achievements() {
  loading();
  var r = await Promise.all([q(sb.from('achievements').select('*')), q(sb.from('user_achievements').select('*'))]);
  var got = {}; r[1].forEach(function (x) { got[x.code] = x; });
  page('<h1>Жетістіктер</h1><div class="grid">' + r[0].map(function (a) {
    return '<div class="card' + (got[a.code] ? '' : ' lock') + '"><div class="em">' + (got[a.code] ? '🏅' : '🔒') + '</div><h3>' + esc(a.title_kk) + '</h3><p class="small">' + esc(a.description_kk) + '</p></div>';
  }).join('') + '</div>');
}

async function profile() {
  var p = S.profile || {};
  page('<h1>Профиль және баптаулар</h1><form id="f" class="form" style="margin:0" novalidate>' + field('nick', 'Есімі немесе лақап аты', 'text', 'maxlength="40" value="' + esc(p.display_name) + '"') +
    '<button class="btn" type="submit">Сақтау</button><div id="fm"></div></form><h2>Қолданбаның баптаулары</h2>' +
    '<div class="field chk"><label><input type="checkbox" id="snd"' + (getPref('tq_nosound') ? '' : ' checked') + '> <span>Дыбысты қосу</span></label></div>' +
    '<div class="field chk"><label><input type="checkbox" id="rm"' + (getPref('tq_reduce') ? ' checked' : '') + '> <span>Анимацияны азайту</span></label></div>');
  $('#snd').onchange = function () { setPref('tq_nosound', !this.checked); };
  $('#rm').onchange = function () { setPref('tq_reduce', this.checked); applyPrefs(); };
  $('#f').onsubmit = async function (e) {
    e.preventDefault();
    var v = $('#nick').value.trim();
    if (!setErr('nick', v && v.length <= 40 ? '' : 'Есімді енгіз (1–40 таңба).')) return;
    var r = await sb.from('profiles').update({ display_name: v }).eq('user_id', S.session.user.id);
    if (r.error) { $('#fm').innerHTML = note(errMsg(r.error), 'bad'); return; }
    S.profile.display_name = v; $('#fm').innerHTML = note('Сақталды.', 'good');
  };
}

/* ---------- admin ---------- */
async function admin(tab) {
  if (!S.admin) { page('<h1>Әкімші панелі</h1>' + note('Бұл бетке рұқсат жоқ.', 'bad')); return; }
  tab = tab || 'stats';
  var tabs = [['stats', 'Қателер статистикасы'], ['settings', 'Өту шегі'], ['users', 'Пайдаланушылар'], ['content', 'Сөздер мен сұрақтар']];
  var head = '<h1>Әкімші панелі</h1><div class="tabs">' + tabs.map(function (t) { return '<a class="btn' + (t[0] === tab ? '' : ' sec') + '" href="#/admin/' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div><div id="ab"></div>';
  page(head); var box = $('#ab'); box.innerHTML = '<p class="lead">Жүктелуде…</p>';
  if (tab === 'stats') {
    var r = await Promise.all([q(sb.rpc('admin_topic_error_stats')), q(sb.from('topics').select('id,title_en'))]), tm = {}; r[1].forEach(function (t) { tm[t.id] = t.title_en; });
    box.innerHTML = r[0].length ? '<div class="scroll"><table><tr><th>Тақырып</th><th>Жауап саны</th><th>Қате</th><th>Қате үлесі</th></tr>' + r[0].map(function (x) { return '<tr><td>' + esc(tm[x.topic_id] || x.topic_id) + '</td><td>' + x.answered + '</td><td>' + x.wrong + '</td><td>' + x.error_rate + '%</td></tr>'; }).join('') + '</table></div>' : '<p class="small">Әзірге деректер жоқ.</p>';
  } else if (tab === 'settings') {
    var s = await q(sb.from('app_settings').select('*')), sv = {}; s.forEach(function (x) { sv[x.key] = x.value; });
    box.innerHTML = '<form id="sf" class="form" style="margin:0" novalidate>' + field('tp', 'Тақырыптық тесттің өту шегі (%)', 'number', 'min="1" max="100" value="' + esc(sv.topic_pass_percent) + '"') + field('fp', 'Деңгейлік тесттің өту шегі (%)', 'number', 'min="1" max="100" value="' + esc(sv.final_pass_percent) + '"') + '<button class="btn" type="submit">Сақтау</button><div id="fm"></div></form>';
    $('#sf').onsubmit = async function (e) {
      e.preventDefault();
      var a = +$('#tp').value, b = +$('#fp').value;
      var ok = setErr('tp', a >= 1 && a <= 100 ? '' : '1–100 аралығында') && setErr('fp', b >= 1 && b <= 100 ? '' : '1–100 аралығында');
      if (!ok) return;
      var r1 = await sb.from('app_settings').update({ value: a, updated_at: new Date().toISOString() }).eq('key', 'topic_pass_percent');
      var r2 = await sb.from('app_settings').update({ value: b, updated_at: new Date().toISOString() }).eq('key', 'final_pass_percent');
      $('#fm').innerHTML = (r1.error || r2.error) ? note(errMsg(r1.error || r2.error), 'bad') : note('Сақталды.', 'good');
    };
  } else if (tab === 'users') {
    var u = await q(sb.from('profiles').select('display_name,initial_level,points,created_at').order('created_at', { ascending: false }).limit(200));
    box.innerHTML = '<p class="small">Барлығы: ' + u.length + '</p><div class="scroll"><table><tr><th>Аты</th><th>Бастапқы деңгей</th><th>Ұпай</th><th>Тіркелген күні</th></tr>' + u.map(function (x) { return '<tr><td>' + esc(x.display_name) + '</td><td>' + (x.initial_level || '—') + '</td><td>' + x.points + '</td><td>' + new Date(x.created_at).toLocaleDateString('kk-KZ') + '</td></tr>'; }).join('') + '</table></div>';
  } else { await adminContent(box); }
}
async function adminContent(box, tid) {
  var all = await q(sb.from('topics').select('id,title_en,level_id,position').order('level_id').order('position'));
  tid = tid || (all[0] && all[0].id);
  var r = await Promise.all([q(sb.from('vocabulary').select('*').eq('topic_id', tid).order('position')), q(sb.from('questions').select('*, question_answers(correct_index,explanation)').eq('topic_id', tid).order('id'))]);
  var ans = function (x) { return Array.isArray(x.question_answers) ? x.question_answers[0] : x.question_answers; };
  box.innerHTML = '<div class="field"><label for="tsel">Тақырып</label><select id="tsel">' + all.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === tid ? ' selected' : '') + '>' + t.level_id + '-деңгей · ' + t.position + '. ' + esc(t.title_en) + '</option>'; }).join('') + '</select></div>' +
    '<h2>Сөздер (' + r[0].length + ')</h2><ul class="rows">' + r[0].map(function (w) { return '<li><span>' + esc(w.visual) + ' <b>' + esc(w.en) + '</b> — ' + esc(w.kk) + '</span><button class="btn sec" data-dv="' + w.id + '">Жою</button></li>'; }).join('') + '</ul>' +
    '<form id="vf" class="form" style="margin:14px 0" novalidate><h3>Сөз қосу</h3>' + field('ven', 'English', 'text') + field('vkk', 'Қазақша', 'text') + field('vvi', 'Көрнекі (эмодзи немесе #түс)', 'text') + '<button class="btn" type="submit">Қосу</button><div id="vm"></div></form>' +
    '<h2>Сұрақтар (' + r[1].length + ')</h2><div class="scroll"><table><tr><th>Түрі</th><th>Сұрақ</th><th>Нұсқалар</th><th>Дұрыс</th><th></th></tr>' + r[1].map(function (x) { var a = ans(x) || {}; return '<tr><td>' + x.kind + '</td><td>' + esc(x.prompt) + '</td><td>' + x.options.map(esc).join(' / ') + '</td><td>' + esc(x.options[a.correct_index]) + '</td><td><button class="btn sec" data-dq="' + x.id + '">Жою</button></td></tr>'; }).join('') + '</table></div>' +
    '<form id="qf" class="form" style="margin:14px 0" novalidate><h3>Сұрақ қосу</h3><div class="field"><label for="qk">Түрі</label><select id="qk"><option value="topic">Тақырыптық</option><option value="final">Қорытынды</option></select></div>' +
    '<div class="field"><label for="qfm">Формат</label><select id="qfm"><option value="choice">choice</option><option value="image">image</option><option value="audio">audio</option><option value="fill">fill</option></select></div>' +
    field('qp', 'Сұрақ мәтіні', 'text') + field('qi', 'Сурет (image форматы үшін)', 'text') + field('qa', 'Дыбыстайтын сөз (audio форматы үшін)', 'text') +
    [0, 1, 2, 3].map(function (k) { return field('qo' + k, 'Нұсқа ' + (k + 1), 'text'); }).join('') +
    '<div class="field"><label for="qc">Дұрыс нұсқа</label><select id="qc"><option value="0">1</option><option value="1">2</option><option value="2">3</option><option value="3">4</option></select></div>' + field('qe', 'Түсіндірме', 'text') +
    '<button class="btn" type="submit">Қосу</button><div id="qm"></div></form>';
  $('#tsel').onchange = function () { adminContent(box, this.value); };
  $$('[data-dv]', box).forEach(function (b) { b.onclick = async function () { if (!confirm('Сөзді жою керек пе?')) return; await sb.from('vocabulary').delete().eq('id', b.getAttribute('data-dv')); adminContent(box, tid); }; });
  $$('[data-dq]', box).forEach(function (b) { b.onclick = async function () { if (!confirm('Сұрақты жою керек пе?')) return; await sb.from('questions').delete().eq('id', b.getAttribute('data-dq')); adminContent(box, tid); }; });
  $('#vf').onsubmit = async function (e) {
    e.preventDefault();
    var en = $('#ven').value.trim(), kk = $('#vkk').value.trim(), vi = $('#vvi').value.trim();
    var ok = setErr('ven', en ? '' : 'Міндетті') && setErr('vkk', kk ? '' : 'Міндетті');
    if (!ok) return;
    var res = await sb.from('vocabulary').insert({ topic_id: tid, position: r[0].length + 1, en: en, kk: kk, visual: vi || null });
    if (res.error) $('#vm').innerHTML = note(errMsg(res.error), 'bad'); else adminContent(box, tid);
  };
  $('#qf').onsubmit = async function (e) {
    e.preventDefault();
    var opts = [0, 1, 2, 3].map(function (k) { return $('#qo' + k).value.trim(); }), p = $('#qp').value.trim(), ok = true;
    ok = setErr('qp', p ? '' : 'Міндетті') && ok;
    [0, 1, 2, 3].forEach(function (k) { ok = setErr('qo' + k, opts[k] ? '' : 'Міндетті') && ok; });
    if (new Set(opts).size < 4) { $('#qm').innerHTML = note('Төрт нұсқа бір-бірінен өзгеше болуы керек.', 'bad'); ok = false; }
    if (!ok) return;
    var ins = await sb.from('questions').insert({ topic_id: tid, kind: $('#qk').value, format: $('#qfm').value, prompt: p, image: $('#qi').value.trim() || null, audio_text: $('#qa').value.trim() || null, options: opts }).select('id').single();
    if (ins.error) { $('#qm').innerHTML = note(errMsg(ins.error), 'bad'); return; }
    var a2 = await sb.from('question_answers').insert({ question_id: ins.data.id, correct_index: +$('#qc').value, explanation: $('#qe').value.trim() || null });
    if (a2.error) { await sb.from('questions').delete().eq('id', ins.data.id); $('#qm').innerHTML = note(errMsg(a2.error), 'bad'); return; }
    adminContent(box, tid);
  };
}

/* ---------- router ---------- */
var PROTECTED = ['level', 'lesson', 'test', 'results', 'dashboard', 'achievements', 'profile', 'admin'];
async function route() {
  var parts = location.hash.replace(/^#\/?/, '').split('/'), name = parts[0] || '', a = parts.slice(1);
  if (PROTECTED.indexOf(name) > -1 && !S.session) { location.hash = '#/login'; return; }
  if ((name === 'login' || name === 'signup') && S.session) { location.hash = '#/dashboard'; return; }
  try {
    switch (name) {
      case '': home(); break;
      case 'login': login(); break;
      case 'signup': signup(); break;
      case 'privacy': legal('privacy'); break;
      case 'terms': legal('terms'); break;
      case 'levels': await levels(); break;
      case 'level': await level(a[0]); break;
      case 'lesson': await lesson(a[0]); break;
      case 'test': await test(a[0], a[1]); break;
      case 'results': await results(a[0]); break;
      case 'dashboard': await dashboard(); break;
      case 'achievements': await achievements(); break;
      case 'profile': await profile(); break;
      case 'admin': await admin(a[0]); break;
      default: home();
    }
  } catch (e) {
    page(note(errMsg(e), 'bad') + '<a class="btn" href="#/">Басты бетке</a>');
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange(function (ev) {
  if (ev === 'SIGNED_OUT' && S.session) setTimeout(function () { S = { session: null, profile: null, admin: false }; renderNav(); location.hash = '#/'; }, 0);
});
(async function init() {
  applyPrefs();
  try { await loadMe(); } catch (e) { /* offline or misconfigured: show public pages */ }
  renderNav(); route();
})();
})();
