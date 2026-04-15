// ─────────────────────────────────────────────────────────────────
//  script.js — Weather Dashboard
// ─────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const r0 = v => v != null ? Math.round(v) : '—';
const r1 = v => v != null ? Math.round(v * 10) / 10 : '—';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ICONS = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'🌨️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',
  95:'⛈️',96:'⛈️',99:'⛈️'
};
const THEME_NAMES = {
  dark:'Dark',light:'Light',sunset:'Sunset',arctic:'Arctic',storm:'Storm',
  barbie:'Barbie',midnight:'Midnight',neon:'Neon',navy:'Navy',gold:'Gold',
  lavender:'Lavender',slate:'Slate',terra:'Terracotta',eco:'Eco',coral:'Coral',
  ember:'Ember',aurora:'Aurora',sakura:'Sakura',galaxy:'Galaxy',waves:'Waves',
  city:'City',disco:'Disco',bubbles:'Bubbles',crystal:'Crystal'
};

// ── Units ─────────────────────────────────────────────────────────
let unit = localStorage.getItem('wx-unit') || 'f';
const toC  = f => f != null ? Math.round((f - 32) * 5 / 9 * 10) / 10 : null;
const fmt  = f => unit === 'c' ? r1(toC(f)) : r1(f);
const fmt0 = f => unit === 'c' ? r0(toC(f)) : r0(f);
const ul   = () => unit === 'c' ? '°C' : '°F';

function setUnit(u) {
  unit = u;
  localStorage.setItem('wx-unit', u);
  $('btn-f').classList.toggle('active', u === 'f');
  $('btn-c').classList.toggle('active', u === 'c');
  if (_last) render(_last);
  locRender();
}

// ── Geolocation ───────────────────────────────────────────────────
function fuzz(v) { return Math.round((v + (Math.random() - 0.5) * 0.018) * 100) / 100; }

function useLocation() {
  if (!navigator.geolocation) { $('status').textContent = 'Geolocation not supported.'; return; }
  $('status').textContent = 'Requesting location…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      $('lat').value = fuzz(pos.coords.latitude);
      $('lon').value = fuzz(pos.coords.longitude);
      $('status').textContent = 'Location set (fuzzed ~1 km for privacy)';
      loadWeather();
    },
    () => { $('status').textContent = 'Location denied — enter coordinates manually.'; }
  );
}

// ── Settings panel ────────────────────────────────────────────────
function toggleSettings() {
  const panel = $('settingsPanel'), btn = $('gearBtn');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
}

// ── Themes ────────────────────────────────────────────────────────
function setTheme(t, btn) {
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  localStorage.setItem('wx-theme', t);
  $('themeName').textContent = THEME_NAMES[t] || t;
  startParticles(t);
}

// ── Auth state ────────────────────────────────────────────────────
let _authToken    = localStorage.getItem('wx-auth-token')   || null;
let _authUsername = localStorage.getItem('wx-auth-username') || null;

// _authMode: 'register' | 'login' | 'reset-ask' | 'reset-verify' | 'reset-set'
let _authMode     = 'register';
let _resetUsername = '';
let _resetAnswer   = '';

function authSetSession(username, token) {
  _authToken    = token;
  _authUsername = username;
  localStorage.setItem('wx-auth-token',    token);
  localStorage.setItem('wx-auth-username', username);
  authUpdateUI();
  syncLocationsFromCloud();
}

function authClear() {
  _authToken    = null;
  _authUsername = null;
  localStorage.removeItem('wx-auth-token');
  localStorage.removeItem('wx-auth-username');
  authUpdateUI();
}

function authUpdateUI() {
  const pill      = $('userPill');
  const pillName  = $('userPillName');
  const hintText  = $('authHintText');
  const loginBtn  = $('headerLoginBtn');

  if (_authUsername) {
    pill.style.display    = 'flex';
    pillName.textContent  = _authUsername;
    if (loginBtn) loginBtn.style.display = 'none';
    if (hintText) hintText.innerHTML = `☁️ Synced as <strong>${_authUsername}</strong>`;
  } else {
    pill.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
    if (hintText) {
      hintText.innerHTML = `<button class="auth-hint-link" id="authHintLoginBtn">Log in</button> to sync locations across devices`;
      $('authHintLoginBtn')?.addEventListener('click', () => openAuthModal('login'));
    }
  }
}

function openAuthModal(mode = 'register') {
  _authMode      = mode;
  _resetUsername = '';
  _resetAnswer   = '';
  $('authOverlay').classList.add('open');
  _authSetTabUI(mode);
  _authClearError();
  $('authPassword').value = '';
  setTimeout(() => $('authUsername').focus(), 80);
}

function closeAuthModal() {
  $('authOverlay').classList.remove('open');
}

function _authSetTabUI(mode) {
  const isRegister = mode === 'register';
  const isLogin    = mode === 'login';
  const isReset    = mode.startsWith('reset');

  $('authTabRegister').classList.toggle('active', isRegister);
  $('authTabRegister').setAttribute('aria-selected', isRegister);
  $('authTabLogin').classList.toggle('active', isLogin || isReset);
  $('authTabLogin').setAttribute('aria-selected', isLogin || isReset);

  // Show/hide security-question row (register only)
  $('authSecurityWrap').classList.toggle('hidden', !isRegister);

  // Show/hide standard username/password rows
  $('authUsernameField').classList.toggle('hidden', mode === 'reset-verify' || mode === 'reset-set');
  $('authPasswordField').classList.toggle('hidden', mode === 'reset-ask'  || mode === 'reset-verify');

  // Show/hide reset-specific rows
  $('authResetAskWrap').classList.toggle('hidden',    mode !== 'reset-ask');
  $('authResetVerifyWrap').classList.toggle('hidden', mode !== 'reset-verify');
  $('authNewPassWrap').classList.toggle('hidden',     mode !== 'reset-set');

  // Show/hide "forgot password" link
  $('authForgotLink').classList.toggle('hidden', !isLogin);

  // Subtitle + button label
  const subtitles = {
    register:      'Create an account to save your locations to the cloud — access them from any device.',
    login:         'Welcome back. Sign in to restore your saved locations.',
    'reset-ask':   "Enter your username and we'll retrieve your security question.",
    'reset-verify':'Answer your security question to verify your identity.',
    'reset-set':   'Choose a new password for your account.',
  };
  const btnLabels = {
    register:      'Create account',
    login:         'Sign in',
    'reset-ask':   'Look up account →',
    'reset-verify':'Verify answer →',
    'reset-set':   'Set new password',
  };
  $('authModalSub').textContent  = subtitles[mode] || '';
  $('authSubmit').textContent    = btnLabels[mode]  || 'Continue';
}

function _authSetError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

function _authClearError() {
  _authSetError('');
}

function _authSetLoading(on) {
  const btnLabels = {
    register:      ['Create account',    'Creating…'],
    login:         ['Sign in',           'Signing in…'],
    'reset-ask':   ['Look up account →', 'Looking up…'],
    'reset-verify':['Verify answer →',   'Verifying…'],
    'reset-set':   ['Set new password',  'Saving…'],
  };
  const [idle, busy] = btnLabels[_authMode] || ['Continue', 'Working…'];
  $('authSubmit').classList.toggle('loading', on);
  $('authSubmit').textContent = on ? busy : idle;
}

// ── Auth submit dispatcher ────────────────────────────────────────
async function authSubmit() {
  _authClearError();
  if (_authMode === 'register')      return _doRegister();
  if (_authMode === 'login')         return _doLogin();
  if (_authMode === 'reset-ask')     return _doResetAsk();
  if (_authMode === 'reset-verify')  return _doResetVerify();
  if (_authMode === 'reset-set')     return _doResetSet();
}

async function _doRegister() {
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  const sq       = $('authSecurityQuestion').value;
  const sa       = $('authSecurityAnswer').value.trim();

  if (!username || !password) { _authSetError('Please fill in username and password.'); return; }
  if (sa && !sq)              { _authSetError('Please select a security question.'); return; }

  _authSetLoading(true);
  try {
    const res  = await fetch('/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password, security_question: sq || null, security_answer: sa || null }),
    });
    const data = await res.json();
    if (!res.ok) { _authSetError(data.detail || 'Something went wrong.'); _authSetLoading(false); return; }
    authSetSession(data.username, data.token);
    closeAuthModal();
    toast(`Welcome, ${data.username} ✓`);
    if (_locs.length > 0) await pushLocationsToCloud();
  } catch { _authSetError('Network error — please try again.'); _authSetLoading(false); }
}

async function _doLogin() {
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  if (!username || !password) { _authSetError('Please fill in both fields.'); return; }

  _authSetLoading(true);
  try {
    const res  = await fetch('/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { _authSetError(data.detail || 'Something went wrong.'); _authSetLoading(false); return; }
    authSetSession(data.username, data.token);
    closeAuthModal();
    toast(`Welcome back, ${data.username} ✓`);
  } catch { _authSetError('Network error — please try again.'); _authSetLoading(false); }
}

async function _doResetAsk() {
  const username = $('authResetUsername').value.trim();
  if (!username) { _authSetError('Please enter your username.'); return; }

  _authSetLoading(true);
  try {
    const res  = await fetch(`/auth/reset-question?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok) { _authSetError(data.detail || 'Account not found.'); _authSetLoading(false); return; }
    _resetUsername = data.username;
    $('authResetQuestionText').textContent = data.security_question;
    _authMode = 'reset-verify';
    _authSetTabUI('reset-verify');
    _authSetLoading(false);
    $('authResetVerifyAnswer').value = '';
    setTimeout(() => $('authResetVerifyAnswer').focus(), 80);
  } catch { _authSetError('Network error — please try again.'); _authSetLoading(false); }
}

async function _doResetVerify() {
  const answer = $('authResetVerifyAnswer').value.trim();
  if (!answer) { _authSetError('Please enter your answer.'); return; }

  _authSetLoading(true);
  try {
    const res  = await fetch('/auth/reset-verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: _resetUsername, security_answer: answer }),
    });
    const data = await res.json();
    if (!res.ok) { _authSetError(data.detail || 'Incorrect answer.'); _authSetLoading(false); return; }
    _resetAnswer = answer;
    _authMode = 'reset-set';
    _authSetTabUI('reset-set');
    _authSetLoading(false);
    $('authNewPassword').value  = '';
    $('authNewPassword2').value = '';
    setTimeout(() => $('authNewPassword').focus(), 80);
  } catch { _authSetError('Network error — please try again.'); _authSetLoading(false); }
}

async function _doResetSet() {
  const p1 = $('authNewPassword').value;
  const p2 = $('authNewPassword2').value;
  if (!p1)       { _authSetError('Please enter a new password.'); return; }
  if (p1 !== p2) { _authSetError('Passwords do not match.'); return; }
  if (p1.length < 6) { _authSetError('Password must be at least 6 characters.'); return; }

  _authSetLoading(true);
  try {
    const res  = await fetch('/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: _resetUsername, security_answer: _resetAnswer, new_password: p1 }),
    });
    const data = await res.json();
    if (!res.ok) { _authSetError(data.detail || 'Reset failed.'); _authSetLoading(false); return; }
    authSetSession(data.username, data.token);
    closeAuthModal();
    toast("Password reset — you're now signed in ✓");
  } catch { _authSetError('Network error — please try again.'); _authSetLoading(false); }
}

// ── Cloud sync ────────────────────────────────────────────────────
async function pushLocationsToCloud() {
  if (!_authToken) return;
  try {
    await fetch('/locations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_authToken}` },
      body:    JSON.stringify({ locations: _locs })
    });
  } catch (e) { /* silent */ }
}

async function syncLocationsFromCloud() {
  if (!_authToken) return;
  try {
    const res = await fetch('/locations', { headers: { 'Authorization': `Bearer ${_authToken}` } });
    if (!res.ok) { if (res.status === 401) authClear(); return; }
    const data = await res.json();
    if (data.locations?.length) {
      const cloudIds = new Set(data.locations.map(l => l.id));
      _locs = [...data.locations, ..._locs.filter(l => !cloudIds.has(l.id))];
      localStorage.setItem(LOC_KEY, JSON.stringify(_locs));
      locRender();
      _locs.forEach(l => locRefreshCache(l.id));
    }
  } catch (e) { /* silent */ }
}

// ── Saved Locations ───────────────────────────────────────────────
const LOC_KEY = 'wx-saved-locations';
let _locs = [];
let _activeLocId = null;
let _drawerOpen = false;

function locsLoad() {
  try { _locs = JSON.parse(localStorage.getItem(LOC_KEY) || '[]'); } catch (e) { _locs = []; }
  locRender();
  _locs.forEach(l => locRefreshCache(l.id));
}

function locsSave() {
  localStorage.setItem(LOC_KEY, JSON.stringify(_locs));
  pushLocationsToCloud();
}

function toggleDrawer() {
  _drawerOpen = !_drawerOpen;
  $('locDrawer').classList.toggle('open', _drawerOpen);
  $('locTab').classList.toggle('open', _drawerOpen);
}

function closeDrawer() {
  _drawerOpen = false;
  $('locDrawer').classList.remove('open');
  $('locTab').classList.remove('open');
}

function showAddForm() {
  const lat = $('lat').value, lon = $('lon').value;
  if (lat) $('newLocLat').value = lat;
  if (lon) $('newLocLon').value = lon;
  $('locAddForm').classList.remove('hidden');
  $('newLocName').focus();
}

function hideAddForm() { $('locAddForm').classList.add('hidden'); }

function promptSave() {
  if (!$('locDrawer').classList.contains('open')) toggleDrawer();
  showAddForm();
}

function saveNewLocation() {
  const name = $('newLocName').value.trim();
  const lat  = parseFloat($('newLocLat').value);
  const lon  = parseFloat($('newLocLon').value);
  if (!name) { $('newLocName').focus(); return; }
  if (isNaN(lat) || isNaN(lon)) { toast('Enter valid coordinates'); return; }
  const id = Date.now().toString();
  _locs.push({ id, name, lat, lon, cachedTemp: null, cachedIcon: '🌡️' });
  locsSave(); locRender(); hideAddForm();
  $('newLocName').value = ''; $('newLocLat').value = ''; $('newLocLon').value = '';
  toast(`"${name}" saved`);
  locRefreshCache(id);
}

async function locRefreshCache(id) {
  const loc = _locs.find(l => l.id === id); if (!loc) return;
  try {
    const r = await fetch(`/weather?lat=${loc.lat}&lon=${loc.lon}`);
    if (!r.ok) return;
    const d = await r.json();
    loc.cachedTemp = d.current?.temperature_f;
    loc.cachedIcon = ICONS[d.condition?.code] ?? '🌡️';
    locsSave(); locRender();
  } catch (e) {}
}

function locLoad(id) {
  const loc = _locs.find(l => l.id === id);
  if (!loc) return;
  _activeLocId = id;
  $('lat').value = loc.lat;
  $('lon').value = loc.lon;
  locRender();
  closeDrawer();
  loadWeather();
}

function locDelete(id, e) {
  e.stopPropagation();
  _locs = _locs.filter(l => l.id !== id);
  if (_activeLocId === id) _activeLocId = null;
  locsSave(); locRender();
}

function locRender() {
  const el = $('locList');
  if (_locs.length === 0) {
    el.innerHTML = `<div class="loc-empty"><span class="loc-empty-icon">📍</span>No saved locations.<br>Add one to get started.</div>`;
    return;
  }
  el.innerHTML = _locs.map(loc => {
    const active  = loc.id === _activeLocId;
    const tempStr = loc.cachedTemp != null ? `${fmt0(loc.cachedTemp)}${ul()}` : '—';
    return `<div class="loc-item${active ? ' active' : ''}" data-loc-id="${loc.id}">
      <div class="loc-item-left">
        <div class="loc-item-name">${esc(loc.name)}</div>
        <div class="loc-item-coords">${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}</div>
      </div>
      <div class="loc-item-right">
        <span class="loc-item-icon">${loc.cachedIcon || '🌡️'}</span>
        <span class="loc-item-temp">${tempStr}</span>
        <button class="loc-del-btn" data-del-id="${loc.id}" title="Remove">✕</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.loc-item').forEach(item => {
    item.addEventListener('click', () => locLoad(item.dataset.locId));
  });
  el.querySelectorAll('.loc-del-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); locDelete(btn.dataset.delId, e); });
  });
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Toast ─────────────────────────────────────────────────────────
let _toastT = null;
function toast(msg) {
  const t = $('wxToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Fun Facts ─────────────────────────────────────────────────────
const FACTS = [
  { icon: '⚡',  text: 'A bolt of lightning is about 5 times hotter than the surface of the Sun — reaching around 30,000 Kelvin.' },
  { icon: '🌪️', text: 'The average tornado lasts only around 10 minutes, but the longest ever recorded stayed on the ground for over 3.5 hours.' },
  { icon: '🌧️', text: 'The wettest place on Earth is Mawsynram, India, which receives over 11,800 mm of rain per year.' },
  { icon: '🌡️', text: 'The highest air temperature ever recorded was 56.7°C (134.1°F) in Furnace Creek, Death Valley, in 1913.' },
  { icon: '🧊',  text: "The lowest natural temperature ever recorded on Earth's surface was −89.2°C at Vostok Station, Antarctica." },
  { icon: '🌬️', text: 'The fastest wind speed ever recorded outside a tornado was 408 km/h at Barrow Island, Australia, in 1996.' },
  { icon: '🌊',  text: 'A tsunami can travel across the ocean at the speed of a commercial jet — up to 800 km/h in deep water.' },
  { icon: '❄️',  text: 'No two snowflakes are truly identical — each one forms along a unique path through the atmosphere.' },
  { icon: '☀️',  text: 'On a clear day, sunlight takes about 8 minutes and 20 seconds to travel from the Sun to Earth.' },
  { icon: '🌈',  text: 'A rainbow is always a full circle — the ground just hides the bottom half. You can see a complete ring from an aircraft.' },
  { icon: '🌫️', text: 'Fog is essentially a cloud that formed at ground level. The only difference between fog and cloud is altitude.' },
  { icon: '🌀',  text: 'Hurricanes in the Northern Hemisphere spin counterclockwise; in the Southern Hemisphere they spin clockwise — thanks to the Coriolis effect.' },
  { icon: '🌤️', text: 'A cumulus cloud can weigh over 500,000 kg yet stays aloft because the water droplets are tiny enough to be held up by rising warm air.' },
  { icon: '🏔️', text: "Weather only occurs in the troposphere — Earth's lowest atmospheric layer, extending about 12 km up." },
  { icon: '💧',  text: "Earth's water cycle moves roughly 577,000 km³ of water every year through evaporation, condensation, and precipitation." },
  { icon: '🌿',  text: 'A single large tree can transpire over 400 litres of water into the atmosphere on a hot summer day.' },
  { icon: '🐘',  text: 'Elephants can detect rain falling up to 240 km away and will walk toward it even before local clouds appear.' },
  { icon: '🐦',  text: 'Birds can sense changes in barometric pressure with a tiny organ in their inner ear, letting them predict storms hours ahead.' },
  { icon: '🌺',  text: 'Some flowers open and close in response to humidity — a behaviour called nyctinasty — acting as natural weather indicators.' },
  { icon: '🦈',  text: 'Sharks have been observed swimming to deeper water before hurricanes arrive, apparently sensing the drop in barometric pressure.' },
  { icon: '🌲',  text: 'Tree rings record past climate: wide rings mean warm, wet years; narrow rings indicate cold or dry growing seasons.' },
  { icon: '🐸',  text: "Some frog species can freeze solid in winter and thaw back to life in spring — surviving temperatures well below 0°C." },
  { icon: '🌍',  text: "The Amazon rainforest generates its own rainfall — trees release so much water vapour they create 'flying rivers' that feed clouds inland." },
  { icon: '🌌',  text: 'The aurora borealis is caused by charged solar particles colliding with gases in the upper atmosphere, glowing like a giant neon sign.' },
  { icon: '☄️',  text: 'Venus has weather too — its clouds are made of sulfuric acid droplets, and wind speeds at cloud level can reach 360 km/h.' },
  { icon: '🪐',  text: "Jupiter's Great Red Spot is a storm that has raged for at least 350 years and is wide enough to swallow two Earths." },
  { icon: '🌙',  text: 'The Moon has almost no weather — no wind, no rain, no clouds — because it has virtually no atmosphere.' },
];

let _factIdx     = Math.floor(Math.random() * FACTS.length);
let _factElapsed = 0;
let _factTimer   = null;

function _factShow(i) {
  const icon = $('factIcon'), text = $('factText'), ctr = $('factCounter'), bar = $('factBar');
  if (!icon) return;
  icon.textContent = FACTS[i].icon;
  text.textContent = FACTS[i].text;
  ctr.textContent  = `${i + 1} / ${FACTS.length}`;
  _factElapsed = 0;
  bar.style.width = '0%';
}

function factNext() { _factIdx = (_factIdx + 1) % FACTS.length; _factShow(_factIdx); }
function factPrev() { _factIdx = (_factIdx - 1 + FACTS.length) % FACTS.length; _factShow(_factIdx); }

function initFacts() {
  if (_factTimer) clearInterval(_factTimer);
  _factShow(_factIdx);
  _factTimer = setInterval(() => {
    _factElapsed += 100;
    const bar = $('factBar');
    if (bar) bar.style.width = Math.min(100, (_factElapsed / 12000) * 100) + '%';
    if (_factElapsed >= 12000) factNext();
  }, 100);
  const btnNext = $('factBtnNext'), btnPrev = $('factBtnPrev');
  if (btnNext) btnNext.onclick = factNext;
  if (btnPrev) btnPrev.onclick = factPrev;
}

// ── Particle System ───────────────────────────────────────────────
const canvas = $('particle-canvas');
const ctx    = canvas.getContext('2d');
let _particles = [], _rafId = null, _paused = false;

const PARTICLE_THEMES = {
  sakura:{count:38,init(p){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=4+Math.random()*5;p.vx=-0.4+Math.random()*0.5;p.vy=0.6+Math.random()*0.8;p.angle=Math.random()*Math.PI*2;p.spin=(Math.random()-0.5)*0.03;p.sway=Math.random()*Math.PI*2;p.swaySpeed=0.015+Math.random()*0.01;p.swayAmp=0.6+Math.random()*0.8;p.alpha=0.5+Math.random()*0.45;const cols=['#ffb7c5','#ff9ab5','#ffd0e0','#f9a8c9','#ffc2d4'];p.color=cols[Math.floor(Math.random()*cols.length)];},update(p){p.sway+=p.swaySpeed;p.x+=p.vx+Math.sin(p.sway)*p.swayAmp;p.y+=p.vy;p.angle+=p.spin;if(p.y>canvas.height+20){p.y=-20;p.x=Math.random()*canvas.width;}if(p.x<-20)p.x=canvas.width+20;if(p.x>canvas.width+20)p.x=-20;},draw(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=p.alpha;ctx.fillStyle=p.color;ctx.beginPath();for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2-Math.PI/2;ctx.ellipse(Math.cos(a)*p.size*.5,Math.sin(a)*p.size*.5,p.size*.45,p.size*.28,a,0,Math.PI*2);}ctx.fill();ctx.fillStyle='#fff0f5';ctx.beginPath();ctx.arc(0,0,p.size*.12,0,Math.PI*2);ctx.fill();ctx.restore();}},
  ember:{count:30,init(p){p.x=Math.random()*canvas.width;p.y=canvas.height+Math.random()*40;p.size=2+Math.random()*4;p.vx=(Math.random()-0.5)*0.7;p.vy=-(0.5+Math.random()*1.2);p.alpha=0.6+Math.random()*0.4;p.flicker=Math.random()*Math.PI*2;p.flickerSpeed=0.08+Math.random()*0.12;const cols=['#f77f00','#ff4400','#ffaa00','#ff6600','#cc3300','#ffdd88'];p.color=cols[Math.floor(Math.random()*cols.length)];p.pts=Array.from({length:5},()=>({r:p.size*(0.5+Math.random()*0.5),a:Math.random()*Math.PI*2}));},update(p){p.flicker+=p.flickerSpeed;p.x+=p.vx;p.y+=p.vy;p.alpha-=0.0015;if(p.alpha<=0||p.y<-20){p.y=canvas.height+10;p.x=Math.random()*canvas.width;p.alpha=0.6+Math.random()*0.4;}},draw(p){ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=p.alpha*(0.7+0.3*Math.sin(p.flicker));ctx.fillStyle=p.color;ctx.beginPath();p.pts.forEach((pt,i)=>{const x=Math.cos(pt.a)*pt.r,y=Math.sin(pt.a)*pt.r;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.closePath();ctx.fill();ctx.restore();}},
  arctic:{count:55,init(p){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=1.5+Math.random()*3;p.vx=(Math.random()-0.5)*0.3;p.vy=0.4+Math.random()*0.9;p.alpha=0.4+Math.random()*0.5;p.wobble=Math.random()*Math.PI*2;p.wobbleSpeed=0.02+Math.random()*0.02;},update(p){p.wobble+=p.wobbleSpeed;p.x+=p.vx+Math.sin(p.wobble)*0.25;p.y+=p.vy;if(p.y>canvas.height+10){p.y=-10;p.x=Math.random()*canvas.width;}},draw(p){ctx.save();ctx.globalAlpha=p.alpha;ctx.fillStyle='#c8e8ff';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.6)';ctx.beginPath();ctx.arc(p.x-p.size*.25,p.y-p.size*.25,p.size*.4,0,Math.PI*2);ctx.fill();ctx.restore();}},
  storm:{count:70,init(p){p.x=Math.random()*(canvas.width+200)-100;p.y=Math.random()*canvas.height;p.len=8+Math.random()*14;p.speed=12+Math.random()*8;p.alpha=0.12+Math.random()*0.2;p.angle=Math.PI/5;},update(p){p.x+=Math.cos(p.angle)*p.speed;p.y+=Math.sin(p.angle)*p.speed;if(p.y>canvas.height+20||p.x>canvas.width+20){p.x=Math.random()*canvas.width-100;p.y=-20;}},draw(p){ctx.save();ctx.globalAlpha=p.alpha;ctx.strokeStyle='#8899aa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(p.angle)*p.len,p.y+Math.sin(p.angle)*p.len);ctx.stroke();ctx.restore();}},
  midnight:{count:60,init(p){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=0.8+Math.random()*2;p.alpha=0.2+Math.random()*0.7;p.twinkleSpeed=0.008+Math.random()*0.015;p.twinklePhase=Math.random()*Math.PI*2;p.vx=(Math.random()-0.5)*0.05;p.vy=(Math.random()-0.5)*0.05;},update(p){p.twinklePhase+=p.twinkleSpeed;p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;},draw(p){const a=p.alpha*(0.4+0.6*Math.abs(Math.sin(p.twinklePhase)));ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#5bc0eb';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();}},
  neon:{count:25,init(p){p.x=Math.random()*canvas.width;p.y=canvas.height+Math.random()*50;p.size=1.5+Math.random()*2.5;p.vy=-(1.5+Math.random()*2.5);p.vx=(Math.random()-0.5)*0.5;p.alpha=0.5+Math.random()*0.5;p.flicker=Math.random()*Math.PI*2;p.flickerSpeed=0.1+Math.random()*0.15;const cols=['#39ff14','#00ffff','#ccff00'];p.color=cols[Math.floor(Math.random()*cols.length)];},update(p){p.flicker+=p.flickerSpeed;p.x+=p.vx;p.y+=p.vy;p.alpha-=0.005;if(p.alpha<=0||p.y<-10){p.y=canvas.height+10;p.x=Math.random()*canvas.width;p.alpha=0.5+Math.random()*0.5;}},draw(p){ctx.save();ctx.globalAlpha=p.alpha*(0.6+0.4*Math.abs(Math.sin(p.flicker)));ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();}},
  aurora:{count:8,init(p){p.x=(Math.random()*1.4-0.2)*canvas.width;p.y=canvas.height*(0.04+Math.random()*0.42);p.bandW=canvas.width*(0.4+Math.random()*0.55);p.bandH=70+Math.random()*160;p.drift=(Math.random()-0.5)*0.15;p.phase=Math.random()*Math.PI*2;p.phaseSpd=0.003+Math.random()*0.005;p.breathe=Math.random()*Math.PI*2;p.breatheSpd=0.006+Math.random()*0.007;p.waveAmp=20+Math.random()*35;p.waveFreq=1.2+Math.random()*2.2;p.alphaMax=0.06+Math.random()*0.09;const palettes=[['#00ffaa','#00e896','#00cfff'],['#00ff80','#40ff60','#00e0a0'],['#00cfff','#4080ff','#6040e0'],['#80ffdd','#00ffcc','#00e8ff'],['#b0ffe8','#60ffcc','#00ffee'],['#a0f0ff','#60d8ff','#20c0ff']];p.pal=palettes[Math.floor(Math.random()*palettes.length)];},update(p){p.phase+=p.phaseSpd;p.breathe+=p.breatheSpd;p.x+=p.drift;const hw=p.bandW*0.5+50;if(p.x>canvas.width+hw)p.x=-hw;if(p.x<-hw-p.bandW)p.x=canvas.width+hw;},draw(p){const aMax=p.alphaMax*(0.45+0.55*Math.abs(Math.sin(p.breathe)));if(aMax<0.004)return;const steps=48,sliceW=p.bandW/steps,ox=p.x-p.bandW*0.5;ctx.save();for(let i=0;i<steps;i++){const t=i/steps,sx=ox+i*sliceW;if(sx+sliceW<0||sx>canvas.width)continue;const wave=Math.sin(t*p.waveFreq*Math.PI*2+p.phase)*p.waveAmp;const topY=p.y+wave,botY=p.y+p.bandH+wave*0.35;const ci=Math.floor(((t+p.phase*0.12)%1)*p.pal.length)%p.pal.length;const col=p.pal[ci],ef=Math.sin(t*Math.PI);const g=ctx.createLinearGradient(sx,topY,sx,botY);g.addColorStop(0,col+'00');g.addColorStop(0.18,col+'bb');g.addColorStop(0.5,col+'ff');g.addColorStop(0.82,col+'99');g.addColorStop(1,col+'00');ctx.fillStyle=g;ctx.globalAlpha=aMax*ef*(0.75+0.25*Math.sin(p.phase+t*7));ctx.fillRect(sx,topY,sliceW+0.5,botY-topY);}ctx.restore();}},
  gold:{count:28,init(p){p.x=Math.random()*canvas.width;p.y=canvas.height+Math.random()*80;p.size=4+Math.random()*9;p.vx=(Math.random()-0.5)*0.4;p.vy=-(0.3+Math.random()*0.7);p.rot=Math.random()*Math.PI*2;p.spin=(Math.random()-0.5)*0.04;p.alpha=0.7+Math.random()*0.3;p.glint=Math.random()*Math.PI*2;p.glintSpd=0.05+Math.random()*0.08;p.sides=Math.floor(4+Math.random()*3);p.radii=Array.from({length:p.sides},()=>p.size*(0.55+Math.random()*0.45));const cols=['#d4af37','#f0c040','#b8860b','#ffd700','#c8960c','#e8b820'];p.color=cols[Math.floor(Math.random()*cols.length)];},update(p){p.glint+=p.glintSpd;p.rot+=p.spin;p.x+=p.vx;p.y+=p.vy;p.alpha-=0.0008;if(p.alpha<=0||p.y<-30){p.y=canvas.height+10+Math.random()*60;p.x=Math.random()*canvas.width;p.alpha=0.7+Math.random()*0.3;}},draw(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=p.alpha;ctx.fillStyle=p.color;ctx.beginPath();for(let i=0;i<p.sides;i++){const a=(i/p.sides)*Math.PI*2-Math.PI/2;const r=p.radii[i];i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=1;ctx.stroke();const gi=Math.abs(Math.sin(p.glint));ctx.globalAlpha=p.alpha*gi*0.9;ctx.fillStyle='#fffbe0';ctx.beginPath();ctx.ellipse(-p.size*0.18,-p.size*0.22,p.size*0.22,p.size*0.12,-0.6,0,Math.PI*2);ctx.fill();ctx.restore();}},
  galaxy:{count:120,init(p){const type=Math.random();if(type<0.6){p.type='star';p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=0.5+Math.random()*2;p.alpha=0.3+Math.random()*0.7;p.twinkle=Math.random()*Math.PI*2;p.twinkleSpd=0.02+Math.random()*0.04;const cols=['#ffffff','#ffe8c0','#c0d8ff','#ffd0ff','#d0ffff'];p.color=cols[Math.floor(Math.random()*cols.length)];}else if(type<0.85){p.type='dust';p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=30+Math.random()*80;p.alpha=0.015+Math.random()*0.03;p.drift=(Math.random()-0.5)*0.04;p.driftY=(Math.random()-0.5)*0.02;const cols=['#6020c0','#2040c0','#c02080','#4060e0','#8020a0'];p.color=cols[Math.floor(Math.random()*cols.length)];}else{p.type='shoot';p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height*0.5;p.vx=3+Math.random()*5;p.vy=1+Math.random()*2;p.len=20+Math.random()*40;p.alpha=0;p.life=0;p.lifeMax=40+Math.random()*60;p.delay=Math.random()*300;}},update(p){if(p.type==='star'){p.twinkle+=p.twinkleSpd;}else if(p.type==='dust'){p.x+=p.drift;p.y+=p.driftY;if(p.x<-p.size)p.x=canvas.width+p.size;if(p.x>canvas.width+p.size)p.x=-p.size;}else if(p.type==='shoot'){if(p.delay>0){p.delay--;return;}p.life++;if(p.life<10)p.alpha=p.life/10*0.8;else if(p.life>p.lifeMax-10)p.alpha=(p.lifeMax-p.life)/10*0.8;p.x+=p.vx;p.y+=p.vy;if(p.life>=p.lifeMax){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height*0.5;p.life=0;p.alpha=0;p.delay=Math.random()*300;}}},draw(p){if(p.type==='star'){const a=p.alpha*(0.4+0.6*Math.abs(Math.sin(p.twinkle)));ctx.save();ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();}else if(p.type==='dust'){ctx.save();ctx.globalAlpha=p.alpha;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);g.addColorStop(0,p.color+'ff');g.addColorStop(1,p.color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();}else if(p.type==='shoot'&&p.alpha>0){ctx.save();ctx.globalAlpha=p.alpha;const g=ctx.createLinearGradient(p.x,p.y,p.x-p.vx/Math.abs(p.vx)*p.len,p.y-p.vy/Math.abs(p.vy)*p.len);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#ffffff00');ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx/Math.abs(p.vx)*p.len,p.y-p.vy/Math.abs(p.vy)*p.len);ctx.stroke();ctx.restore();}}},
  waves:{count:5,_foam:[],_foamReady:false,init(p,i){const layer=i??0;p.layer=layer;p.y=canvas.height*(0.38+layer*0.1);p.amp=22+layer*8+Math.random()*10;p.freq=0.0028-layer*0.0002+Math.random()*0.001;p.phase=Math.random()*Math.PI*2;p.speed=0.008+layer*0.005+Math.random()*0.006;p.alpha=0.18+layer*0.12;const bodyColors=['#004d80','#005fa0','#0077c0','#009ae0','#00b4ff'];p.color=bodyColors[Math.min(layer,4)];},update(p){p.phase+=p.speed;},draw(p){const W=canvas.width,H=canvas.height;if(!this._foamReady){this._foam=Array.from({length:80},()=>({x:Math.random()*W,y:0,vx:(Math.random()-0.5)*0.8,vy:-0.2-Math.random()*0.5,life:0,maxLife:20+Math.random()*30,size:1+Math.random()*2.5,alpha:0,layer:Math.floor(Math.random()*5)}));this._foamReady=true;}ctx.save();ctx.beginPath();const pts=[];for(let x=0;x<=W;x+=2){const t=x*p.freq+p.phase;const y=p.y+Math.sin(t)*p.amp+Math.sin(t*2+1.2)*p.amp*0.28;pts.push({x,y});x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.lineTo(W,H+20);ctx.lineTo(0,H+20);ctx.closePath();ctx.fillStyle=p.color;ctx.globalAlpha=p.alpha;ctx.fill();ctx.beginPath();for(let i=0;i<pts.length;i++){const{x,y}=pts[i];const cy=y-3-p.amp*0.08;i===0?ctx.moveTo(x,cy):ctx.lineTo(x,cy);}ctx.strokeStyle=p.color;ctx.lineWidth=2.5;ctx.globalAlpha=p.alpha*0.7;ctx.stroke();if(p.layer>=3){ctx.beginPath();for(let i=0;i<pts.length;i++){const{x,y}=pts[i];i===0?ctx.moveTo(x,y-1):ctx.lineTo(x,y-1);}ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=1.8;ctx.globalAlpha=1;ctx.stroke();this._foam.forEach(f=>{if(f.layer!==p.layer)return;f.life++;if(f.life===1){const xi=Math.floor(Math.random()*(pts.length-1));f.x=pts[xi].x;f.y=pts[xi].y-2;}const prog=f.life/f.maxLife;f.alpha=prog<0.2?prog/0.2:prog>0.7?(1-prog)/0.3:1;f.x+=f.vx;f.y+=f.vy;if(f.life>=f.maxLife){f.life=0;f.vx=(Math.random()-0.5)*0.8;f.vy=-0.2-Math.random()*0.5;f.maxLife=20+Math.random()*30;f.size=1+Math.random()*2.5;}ctx.save();ctx.globalAlpha=f.alpha*0.8;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(f.x,f.y,f.size,0,Math.PI*2);ctx.fill();ctx.restore();});}ctx.restore();}},
  city:{count:1,_built:false,_buildings:[],_windows:[],_moon:{x:0,y:0,r:0},_buildScene(){const W=canvas.width,H=canvas.height;this._buildings=[];this._windows=[];this._moon={x:W*0.78,y:H*0.12,r:28+Math.random()*14};const makeSkyline=(count,minH,maxH,minW,maxW,yBase,layer)=>{let x=0;while(x<W+100){const bw=minW+Math.random()*(maxW-minW);const bh=minH+Math.random()*(maxH-minH);const by=yBase-bh;const hasSpire=Math.random()<0.25&&bh>H*0.2;this._buildings.push({x,y:by,w:bw,h:bh,layer,hasSpire,spireH:hasSpire?bh*0.18:0,spireW:4+Math.random()*4});const ww=5+Math.random()*4,wh=4+Math.random()*3;const gapX=7+Math.random()*4,gapY=8+Math.random()*4;const cols=Math.floor((bw-8)/(ww+gapX));const rows=Math.floor((bh-10)/(wh+gapY));for(let r=0;r<rows;r++){for(let c=0;c<cols;c++){const wx=x+6+c*(ww+gapX),wy=by+8+r*(wh+gapY);const on=Math.random()>0.38;const cols2=['#ffc83c','#ffe090','#80c0ff','#ffffff','#ffddaa','#c0e8ff'];const color=cols2[Math.floor(Math.random()*cols2.length)];this._windows.push({x:wx,y:wy,w:ww,h:wh,on,layer,timer:Math.random()*300,rate:100+Math.random()*400,color,alpha:0.5+Math.random()*0.5});}}x+=bw+1+Math.random()*4;}};makeSkyline(18,H*0.18,H*0.38,40,90,H*0.72,0);makeSkyline(12,H*0.24,H*0.52,55,120,H*0.78,1);this._built=true;},init(p){p.tick=0;},update(p){if(!this._built)this._buildScene();p.tick++;this._windows.forEach(w=>{w.timer--;if(w.timer<=0){w.on=!w.on;w.timer=w.rate+Math.random()*200;}});},draw(p){if(!this._built)return;const W=canvas.width,H=canvas.height;ctx.save();const sky=ctx.createLinearGradient(0,0,0,H*0.75);sky.addColorStop(0,'#050810');sky.addColorStop(0.6,'#0a1228');sky.addColorStop(1,'#141830');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H*0.78);const{x:mx,y:my,r:mr}=this._moon;ctx.globalAlpha=0.85;const mg=ctx.createRadialGradient(mx,my,0,mx,my,mr*1.6);mg.addColorStop(0,'#fffde8');mg.addColorStop(0.35,'#ffeebb');mg.addColorStop(1,'rgba(255,220,100,0)');ctx.fillStyle=mg;ctx.beginPath();ctx.arc(mx,my,mr*1.6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#fffbe0';ctx.beginPath();ctx.arc(mx,my,mr,0,Math.PI*2);ctx.fill();[0,1].forEach(layer=>{const alpha=layer===0?0.75:1;const fillColor=layer===0?'#0d1520':'#111c2a';ctx.globalAlpha=alpha;this._buildings.filter(b=>b.layer===layer).forEach(b=>{ctx.fillStyle=fillColor;ctx.fillRect(b.x,b.y,b.w,b.h);if(b.hasSpire){ctx.beginPath();ctx.moveTo(b.x+b.w/2,b.y-b.spireH);ctx.lineTo(b.x+b.w/2-b.spireW/2,b.y);ctx.lineTo(b.x+b.w/2+b.spireW/2,b.y);ctx.closePath();ctx.fill();}});ctx.globalAlpha=1;this._windows.filter(w=>w.layer===layer&&w.on).forEach(w=>{ctx.globalAlpha=w.alpha*alpha;ctx.fillStyle=w.color;ctx.fillRect(w.x,w.y,w.w,w.h);ctx.globalAlpha=w.alpha*alpha*0.12;const g=ctx.createRadialGradient(w.x+w.w/2,w.y+w.h/2,0,w.x+w.w/2,w.y+w.h/2,w.w*4);g.addColorStop(0,w.color);g.addColorStop(1,w.color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(w.x+w.w/2,w.y+w.h/2,w.w*4,0,Math.PI*2);ctx.fill();});});const waterY=H*0.78;ctx.globalAlpha=1;const wg=ctx.createLinearGradient(0,waterY,0,H);wg.addColorStop(0,'#080f1e');wg.addColorStop(1,'#060c18');ctx.fillStyle=wg;ctx.fillRect(0,waterY,W,H-waterY);ctx.globalAlpha=0.18;for(let ry=waterY;ry<H;ry+=3){const prog=(ry-waterY)/(H-waterY);const wobble=Math.sin(ry*0.18+p.tick*0.04)*6*(1-prog*0.5);const rw=mr*(0.4+prog*0.5);ctx.fillStyle='#ffe88a';ctx.fillRect(mx+wobble-rw/2,ry,rw,2);}ctx.globalAlpha=0.08;this._windows.filter(w=>w.on).forEach(w=>{const ry=waterY+(waterY-w.y)*0.15;if(ry>H)return;ctx.fillStyle=w.color;ctx.fillRect(w.x,ry,w.w,2);});ctx.globalAlpha=1;ctx.restore();}},
  disco:{count:55,init(p){const type=Math.random();if(type<0.4){p.type='beam';p.x=canvas.width*(0.2+Math.random()*0.6);p.angle=Math.random()*Math.PI*2;p.rotSpd=(Math.random()-0.5)*0.025;p.len=canvas.height*(0.4+Math.random()*0.5);p.width=2+Math.random()*5;const cols=['#ff40ff','#40ffff','#ff4040','#40ff40','#ffff40','#ff80ff'];p.color=cols[Math.floor(Math.random()*cols.length)];p.alpha=0.06+Math.random()*0.1;p.pulse=Math.random()*Math.PI*2;p.pulseSpd=0.04+Math.random()*0.06;}else{p.type='conf';p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=3+Math.random()*7;p.vx=(Math.random()-0.5)*1.2;p.vy=0.4+Math.random()*1;p.rot=Math.random()*Math.PI*2;p.spin=(Math.random()-0.5)*0.1;const cols=['#ff40ff','#40ffff','#ffff40','#ff4444','#44ff44','#ff80c0','#80c0ff'];p.color=cols[Math.floor(Math.random()*cols.length)];p.alpha=0.6+Math.random()*0.4;}},update(p){if(p.type==='beam'){p.angle+=p.rotSpd;p.pulse+=p.pulseSpd;}else{p.x+=p.vx;p.y+=p.vy;p.rot+=p.spin;if(p.y>canvas.height+20){p.y=-10;p.x=Math.random()*canvas.width;}}},draw(p){if(p.type==='beam'){ctx.save();ctx.translate(p.x,0);ctx.rotate(p.angle);ctx.globalAlpha=p.alpha*(0.5+0.5*Math.abs(Math.sin(p.pulse)));const g=ctx.createLinearGradient(0,0,0,p.len);g.addColorStop(0,p.color+'ff');g.addColorStop(0.6,p.color+'60');g.addColorStop(1,p.color+'00');ctx.fillStyle=g;ctx.fillRect(-p.width/2,0,p.width,p.len);ctx.restore();}else{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=p.alpha;ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}}},
  bubbles:{count:35,init(p){p.x=Math.random()*canvas.width;p.y=canvas.height+Math.random()*canvas.height;p.r=6+Math.random()*28;p.vx=(Math.random()-0.5)*0.4;p.vy=-(0.3+Math.random()*0.8);p.wobble=Math.random()*Math.PI*2;p.wobSpd=0.02+Math.random()*0.02;p.alpha=0.12+Math.random()*0.18;},update(p){p.wobble+=p.wobSpd;p.x+=p.vx+Math.sin(p.wobble)*0.3;p.y+=p.vy;if(p.y<-p.r*2){p.y=canvas.height+p.r;p.x=Math.random()*canvas.width;}},draw(p){ctx.save();ctx.globalAlpha=p.alpha;ctx.strokeStyle='#40dcff';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=p.alpha*0.5;const g=ctx.createRadialGradient(p.x-p.r*0.3,p.y-p.r*0.35,0,p.x,p.y,p.r);g.addColorStop(0,'#c0f8ff');g.addColorStop(0.5,'#40dcff20');g.addColorStop(1,'#40dcff00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p.alpha*1.5;ctx.fillStyle='rgba(255,255,255,0.7)';ctx.beginPath();ctx.ellipse(p.x-p.r*0.28,p.y-p.r*0.3,p.r*0.22,p.r*0.13,-0.5,0,Math.PI*2);ctx.fill();ctx.restore();}},
  crystal:{count:22,init(p){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.size=8+Math.random()*20;p.vx=(Math.random()-0.5)*0.25;p.vy=(Math.random()-0.5)*0.25;p.rot=Math.random()*Math.PI*2;p.spin=(Math.random()-0.5)*0.008;p.shimmer=Math.random()*Math.PI*2;p.shimSpd=0.02+Math.random()*0.03;p.alpha=0.08+Math.random()*0.14;const sides=6;p.radii=Array.from({length:sides},(_,i)=>p.size*(i%2===0?1:0.6+Math.random()*0.25));},update(p){p.shimmer+=p.shimSpd;p.rot+=p.spin;p.x+=p.vx;p.y+=p.vy;if(p.x<-50)p.x=canvas.width+50;if(p.x>canvas.width+50)p.x=-50;if(p.y<-50)p.y=canvas.height+50;if(p.y>canvas.height+50)p.y=-50;},draw(p){const shimA=0.5+0.5*Math.sin(p.shimmer);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=p.alpha;const sides=p.radii.length;ctx.beginPath();for(let i=0;i<sides;i++){const a=(i/sides)*Math.PI*2-Math.PI/2;const r=p.radii[i];i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();const g=ctx.createLinearGradient(-p.size,-p.size,p.size,p.size);g.addColorStop(0,'#8060ff');g.addColorStop(0.5,'#4090ff');g.addColorStop(1,'#c060ff');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='rgba(180,200,255,0.6)';ctx.lineWidth=0.8;ctx.stroke();ctx.globalAlpha=p.alpha*shimA*1.8;ctx.fillStyle='rgba(255,255,255,0.9)';ctx.beginPath();ctx.ellipse(-p.size*0.15,-p.size*0.2,p.size*0.18,p.size*0.06,-0.8,0,Math.PI*2);ctx.fill();ctx.restore();}}
};

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function spawnParticles(cfg) {
  _particles = Array.from({ length: cfg.count }, () => { const p = {}; cfg.init(p); return p; });
}

function stopParticles() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  _particles = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function startParticles(theme) {
  stopParticles();
  const cfg = PARTICLE_THEMES[theme];
  if (!cfg) return;
  resizeCanvas(); spawnParticles(cfg);
  function loop() {
    if (_paused) { _rafId = requestAnimationFrame(loop); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _particles.forEach(p => { cfg.update(p); cfg.draw(p); });
    _rafId = requestAnimationFrame(loop);
  }
  _rafId = requestAnimationFrame(loop);
}

// ── Hourly chart instance ─────────────────────────────────────────
let _hourlyChart = null;

// ── Weather fetch & render ────────────────────────────────────────
let _last = null;

async function loadWeather() {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if (isNaN(lat) || isNaN(lon)) { $('status').textContent = 'Enter coordinates or press 📍'; return; }
  $('status').textContent = 'Fetching…';
  try {
    const [fRes, pRes, aRes, hRes] = await Promise.all([
      fetch(`/forecast?lat=${lat}&lon=${lon}`),
      fetch(`/predict?lat=${lat}&lon=${lon}`),
      fetch(`/airquality?lat=${lat}&lon=${lon}`),
      fetch(`/historical?lat=${lat}&lon=${lon}`)
    ]);
    if (!fRes.ok) { const e = await fRes.json(); throw new Error(e.detail || fRes.status); }
    const forecast   = await fRes.json();
    const predict    = pRes.ok ? await pRes.json() : null;
    const air        = aRes.ok ? await aRes.json() : null;
    const historical = hRes.ok ? await hRes.json() : null;

    if (_activeLocId) {
      const loc = _locs.find(l => l.id === _activeLocId);
      if (loc) {
        loc.cachedTemp = forecast.current?.temperature_f;
        loc.cachedIcon = ICONS[forecast.current?.condition?.code] ?? '🌡️';
        locsSave(); locRender();
      }
    }

    _last = { forecast, predict, air, historical };
    render(_last);
    $('status').textContent = 'Updated ' + (forecast.current.time ?? '');
  } catch (e) {
    $('status').textContent = 'Error: ' + e.message;
  }
}

function _factCardHtml() {
  return `<div>
    <div class="section-title">did you know</div>
    <div class="stat" style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px">
      <span id="factIcon" style="font-size:1.6rem;flex-shrink:0;line-height:1.3"></span>
      <div style="flex:1;min-width:0">
        <div id="factText" style="font-size:.78rem;line-height:1.65;color:var(--text)"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
          <span id="factCounter" style="font-size:.6rem;color:var(--muted)"></span>
          <div style="display:flex;gap:6px">
            <button id="factBtnPrev" class="loc-cancel-btn" style="font-size:.6rem;padding:3px 10px">← prev</button>
            <button id="factBtnNext" class="loc-cancel-btn" style="font-size:.6rem;padding:3px 10px">next →</button>
          </div>
        </div>
        <div style="height:2px;background:var(--border);border-radius:2px;margin-top:10px;overflow:hidden">
          <div id="factBar" style="height:100%;background:var(--muted);width:0%;transition:width .1s linear"></div>
        </div>
      </div>
    </div>
  </div>`;
}

const UV_COLORS = ['#58a6ff','#58a6ff','#58a6ff','#f0c060','#f0c060','#f0c060','#f0883e','#f0883e','#ff6060','#ff6060','#ff6060','#c060ff'];

function _buildHourlyChart(forecast) {
  if (_hourlyChart) { _hourlyChart.destroy(); _hourlyChart = null; }

  const hourly = forecast.hourly ?? {};
  const hTimes = hourly.time ?? [];
  const hTemps = hourly.temperature_2m ?? [];
  const hFeels = hourly.apparent_temperature ?? [];
  const hPop   = hourly.precipitation_probability ?? [];

  if (!hTimes.length) return;

  const nowIso = new Date().toISOString().slice(0, 13);
  let startIdx = hTimes.findIndex(t => t.slice(0, 13) >= nowIso);
  if (startIdx < 0) startIdx = 0;

  const labels = [], temps = [], feels = [], pop = [];

  for (let i = startIdx; i < startIdx + 24 && i < hTimes.length; i++) {
    const hr = new Date(hTimes[i]).getHours();
    labels.push(
      hr === 0  ? 'midnight' :
      hr === 12 ? 'noon' :
      (hr % 12 || 12) + (hr < 12 ? 'am' : 'pm')
    );
    const rawT = hTemps[i] ?? null;
    const rawF = hFeels[i] ?? null;
    temps.push(rawT != null ? (unit === 'c' ? Math.round((rawT - 32) * 5 / 9 * 10) / 10 : Math.round(rawT * 10) / 10) : null);
    feels.push(rawF != null ? (unit === 'c' ? Math.round((rawF - 32) * 5 / 9 * 10) / 10 : Math.round(rawF * 10) / 10) : null);
    pop.push(hPop[i] ?? 0);
  }

  const validTemps = temps.filter(v => v != null);
  const hiTemp = validTemps.length ? Math.max(...validTemps) : null;
  const loTemp = validTemps.length ? Math.min(...validTemps) : null;
  const rangeStr = hiTemp != null ? `${Math.round(loTemp)}–${Math.round(hiTemp)} ${ul()}` : '';

  const rangeEl = document.getElementById('hourly-range');
  if (rangeEl) rangeEl.textContent = rangeStr;

  const hCtx = document.getElementById('hourlyChart');
  if (!hCtx) return;

  _hourlyChart = new Chart(hCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temperature',
          data: temps,
          borderColor: '#f0883e',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#f0883e',
          fill: true,
          backgroundColor: (ctx2) => {
            const g = ctx2.chart.ctx.createLinearGradient(0, 0, 0, 180);
            g.addColorStop(0, 'rgba(240,136,62,0.18)');
            g.addColorStop(1, 'rgba(240,136,62,0.02)');
            return g;
          },
          tension: 0.45,
          yAxisID: 'y',
          spanGaps: true
        },
        {
          label: 'Feels like',
          data: feels,
          borderColor: '#79c0ff',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#79c0ff',
          fill: false,
          tension: 0.45,
          yAxisID: 'y',
          spanGaps: true
        },
        {
          label: 'Rain %',
          data: pop,
          borderColor: 'transparent',
          backgroundColor: 'rgba(121,192,255,0.15)',
          fill: true,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22,27,34,0.96)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          padding: 10,
          callbacks: {
            label: (item) => {
              if (item.datasetIndex === 0) return `  Temp: ${item.raw}${ul()}`;
              if (item.datasetIndex === 1) return `  Feels: ${item.raw}${ul()}`;
              return `  Rain: ${item.raw}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#8b949e',
            font: { size: 10, family: "'DM Mono', monospace" },
            maxTicksLimit: 8,
            maxRotation: 0,
            autoSkip: true
          },
          border: { display: false }
        },
        y: {
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#8b949e',
            font: { size: 10 },
            callback: v => v + '°'
          },
          border: { display: false }
        },
        y2: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#8b949e',
            font: { size: 10 },
            callback: v => v + '%',
            maxTicksLimit: 5
          },
          border: { display: false }
        }
      }
    }
  });
}

function render({ forecast, predict, air, historical }) {
  const c  = forecast.current;
  const df = forecast.daily_forecast;

  const activeLoc = _locs.find(l => l.id === _activeLocId);
  const locLabel  = activeLoc ? `<div class="hero-loc-label">📍 ${esc(activeLoc.name)}</div>` : '';

  let histBadge = '';
  if (historical?.avg_f != null) {
    const cur = (c.temperature_f ?? 0), avg = historical.avg_f, diff = cur - avg, absDiff = Math.abs(diff), fmtAvg = fmt(avg);
    if (absDiff < 2)   histBadge = `<div class="hist-badge hist-normal">Near average for today (avg ${fmtAvg}${ul()})</div>`;
    else if (diff > 0) histBadge = `<div class="hist-badge hist-above">🌡️ ${fmt0(absDiff)}${ul()} above the ${historical.samples}-yr average (${fmtAvg}${ul()})</div>`;
    else               histBadge = `<div class="hist-badge hist-below">🧊 ${fmt0(absDiff)}${ul()} below the ${historical.samples}-yr average (${fmtAvg}${ul()})</div>`;
  }

  const alertsHtml = (forecast.alerts || []).map(a =>
    `<div class="alert ${a.level}"><span class="alert-icon">${a.icon}</span><span>${a.text}</span></div>`
  ).join('');

  let aqiHtml = '';
  if (air?.aqi != null) {
    const pct = Math.min(100, (air.aqi / 300) * 100);
    const pollenHtml = (air.pollen || []).map(p =>
      `<div class="pollen-card"><div class="pollen-name">${p.name}</div><div class="pollen-val">${p.level}</div></div>`
    ).join('');
    aqiHtml = `<div>
      <div class="section-title">Air quality & pollen</div>
      <div class="stat" style="margin-bottom:8px">
        <div class="stat-label">US AQI — ${air.aqi_label} ${air.aqi_emoji}</div>
        <div class="stat-value">${air.aqi}</div>
        <div class="aqi-bar"></div>
        <div class="aqi-marker-wrap"><div class="aqi-marker" style="left:${pct}%"></div></div>
        <div style="font-size:.65rem;color:var(--muted);margin-top:4px">
          ${air.pm25 != null ? `PM2.5: ${air.pm25} µg/m³` : ''} ${air.pm10 != null ? `PM10: ${air.pm10} µg/m³` : ''}
        </div>
      </div>
      ${pollenHtml ? `<div class="pollen-row">${pollenHtml}</div>` : ''}
    </div>`;
  }

  const mlRow = predict?.ml_prediction?.temp_avg_f != null ? `<div>
    <div class="section-title">ML prediction <span class="ml-badge">${predict.model ?? 'linear'}</span></div>
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Tomorrow avg</div><div class="stat-value">${fmt(predict.ml_prediction.temp_avg_f)}<span class="stat-unit"> ${ul()}</span></div></div>
      <div class="stat"><div class="stat-label">NWP high</div><div class="stat-value">${fmt0(predict.tomorrow?.temp_high_f)}<span class="stat-unit"> ${ul()}</span></div></div>
      <div class="stat"><div class="stat-label">NWP low</div><div class="stat-value">${fmt0(predict.tomorrow?.temp_low_f)}<span class="stat-unit"> ${ul()}</span></div></div>
    </div>
  </div>` : '';

  const dayCards = df.map((d, i) => {
    const name = i === 0 ? 'Today' : DAYS[new Date(d.date + 'T12:00:00').getDay()];
    const wc = d.condition?.code, uv = d.uv_index_max;
    const uvColor = uv != null ? (UV_COLORS[Math.min(Math.round(uv), 11)] || '#c060ff') : null;
    return `<div class="day-card ${i === 0 ? 'today' : ''}">
      <div class="day-name">${name}</div>
      <div class="day-icon">${ICONS[wc] ?? '🌡️'}</div>
      <div class="day-hi">${fmt0(d.temp_high_f)}${ul()}</div>
      <div class="day-lo">${fmt0(d.temp_low_f)}${ul()}</div>
      ${d.precipitation_probability != null ? `<div class="day-pop">💧${r0(d.precipitation_probability)}%</div>` : ''}
      ${d.windspeed_max_mph != null ? `<div class="day-wind">💨${r0(d.windspeed_max_mph)}mph</div>` : ''}
      ${uv != null ? `<div class="day-uv" style="color:${uvColor}">UV ${r1(uv)}</div>` : ''}
    </div>`;
  }).join('');

  const wc = c.condition?.code;

  const hourlyChartHtml = `<div>
    <div class="section-title">next 24 hours</div>
    <div class="stat" style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <span id="hourly-range" style="font-size:.8rem;font-weight:500;color:var(--text)"></span>
        <div class="hourly-legend">
          <span class="hourly-legend-item">
            <span class="leg-line" style="background:var(--warm)"></span>temp
          </span>
          <span class="hourly-legend-item">
            <span class="leg-dash" style="border-color:var(--cold)"></span>feels like
          </span>
          <span class="hourly-legend-item">
            <span class="leg-fill" style="background:var(--cold)"></span>rain %
          </span>
        </div>
      </div>
      <div style="position:relative;width:100%;height:185px">
        <canvas id="hourlyChart"></canvas>
      </div>
    </div>
  </div>`;

  $('content').innerHTML = `<div class="grid">
    <div class="hero">
      <div>
        ${locLabel}
        <div class="temp-big">${fmt(c.temperature_f)}${ul()}</div>
        <div class="condition-label">${c.condition?.description ?? ''}</div>
        <div class="feels-like">Feels like ${fmt(c.feels_like_f)}${ul()}</div>
        ${histBadge}
      </div>
      <div class="weather-icon">${ICONS[wc] ?? '🌡️'}</div>
    </div>
    ${alertsHtml ? `<div class="alert-stack">${alertsHtml}</div>` : ''}
    <div>
      <div class="section-title">Current conditions</div>
      <div class="stat-row">
        <div class="stat"><div class="stat-label">Humidity</div><div class="stat-value">${r0(c.humidity_pct)}<span class="stat-unit"> %</span></div></div>
        <div class="stat"><div class="stat-label">Wind</div><div class="stat-value">${r0(c.windspeed_mph)}<span class="stat-unit"> mph</span></div></div>
        <div class="stat"><div class="stat-label">Gusts</div><div class="stat-value">${r0(c.windgusts_mph)}<span class="stat-unit"> mph</span></div></div>
        <div class="stat"><div class="stat-label">Pressure</div><div class="stat-value">${r0(c.pressure_hpa)}<span class="stat-unit"> hPa</span></div></div>
        <div class="stat"><div class="stat-label">Cloud cover</div><div class="stat-value">${r0(c.cloudcover_pct)}<span class="stat-unit"> %</span></div></div>
        <div class="stat"><div class="stat-label">Dew point</div><div class="stat-value">${fmt(c.dewpoint_f)}<span class="stat-unit"> ${ul()}</span></div></div>
        <div class="stat"><div class="stat-label">Precip.</div><div class="stat-value">${r1(c.precipitation_in)}<span class="stat-unit"> in</span></div></div>
        <div class="stat"><div class="stat-label">Visibility</div><div class="stat-value">${c.visibility_m != null ? r0(c.visibility_m / 1000) : '—'}<span class="stat-unit"> km</span></div></div>
      </div>
    </div>
    ${hourlyChartHtml}
    ${aqiHtml}
    ${mlRow}
    ${_factCardHtml()}
    <div>
      <div class="section-title">7-day forecast</div>
      <div class="forecast-row">${dayCards}</div>
    </div>
  </div>`;

  _buildHourlyChart(forecast);
  initFacts();
}

// ── Boot ──────────────────────────────────────────────────────────
function init() {
  // Apply saved unit
  if (unit === 'c') {
    $('btn-f').classList.remove('active');
    $('btn-c').classList.add('active');
  }

  // Apply saved theme
  const savedTheme = localStorage.getItem('wx-theme');
  if (savedTheme) {
    document.body.setAttribute('data-theme', savedTheme);
    const b = document.querySelector(`.theme-btn[data-t="${savedTheme}"]`);
    if (b) {
      document.querySelectorAll('.theme-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    }
    $('themeName').textContent = THEME_NAMES[savedTheme] || savedTheme;
    startParticles(savedTheme);
  }

  // Unit buttons
  $('btn-f').addEventListener('click', () => setUnit('f'));
  $('btn-c').addEventListener('click', () => setUnit('c'));

  // Gear / settings
  $('gearBtn').addEventListener('click', e => { e.stopPropagation(); toggleSettings(); });
  document.addEventListener('click', e => {
    const wrap = $('settingsWrap');
    if (wrap && !wrap.contains(e.target)) {
      $('settingsPanel').classList.remove('open');
      $('gearBtn').classList.remove('open');
    }
  });

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.t, btn));
  });

  // Location drawer
  $('locTab').addEventListener('click', toggleDrawer);
  $('locDrawerClose').addEventListener('click', closeDrawer);

  // Add-location form buttons
  $('locCancelBtn').addEventListener('click', hideAddForm);
  $('locSaveBtn').addEventListener('click', saveNewLocation);
  $('locAddBtn').addEventListener('click', showAddForm);

  // Search row
  $('locBtn').addEventListener('click', useLocation);
  $('saveLocBtn').addEventListener('click', promptSave);
  $('fetchBtn').addEventListener('click', loadWeather);

  // Header login button
  $('headerLoginBtn')?.addEventListener('click', () => openAuthModal('login'));

  // Auth modal — tab switcher
  $('authTabRegister').addEventListener('click', () => {
    _authMode = 'register';
    _authClearError();
    _authSetTabUI('register');
  });
  $('authTabLogin').addEventListener('click', () => {
    _authMode = 'login';
    _authClearError();
    _authSetTabUI('login');
  });

  // "Forgot password?" link
  $('authForgotLink').addEventListener('click', () => {
    _authMode = 'reset-ask';
    _authClearError();
    _authSetTabUI('reset-ask');
    const typed = $('authUsername').value.trim();
    if (typed) $('authResetUsername').value = typed;
    setTimeout(() => $('authResetUsername').focus(), 40);
  });

  // Enter-key nav for reset steps
  $('authResetUsername').addEventListener('keydown',    e => { if (e.key === 'Enter') authSubmit(); });
  $('authResetVerifyAnswer').addEventListener('keydown',e => { if (e.key === 'Enter') authSubmit(); });
  $('authNewPassword').addEventListener('keydown',      e => { if (e.key === 'Enter') $('authNewPassword2').focus(); });
  $('authNewPassword2').addEventListener('keydown',     e => { if (e.key === 'Enter') authSubmit(); });

  $('authSubmit').addEventListener('click', authSubmit);
  $('authModalClose').addEventListener('click', closeAuthModal);

  // Close on backdrop click
  $('authOverlay').addEventListener('click', e => {
    if (e.target === $('authOverlay')) closeAuthModal();
  });

  // Keyboard nav inside modal (register/login fields)
  $('authUsername').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('authPassword').focus();
  });
  $('authPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') authSubmit();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('authOverlay').classList.contains('open')) closeAuthModal();
  });

  // User pill → sign out
  $('userPill').addEventListener('click', () => {
    authClear();
    toast('Signed out');
  });

  // Auth hint login button (initial render)
  $('authHintLoginBtn')?.addEventListener('click', () => openAuthModal('login'));

  // Visibility / resize
  document.addEventListener('visibilitychange', () => { _paused = document.hidden; });
  window.addEventListener('resize', () => {
    resizeCanvas();
    const t = document.body.getAttribute('data-theme');
    if (PARTICLE_THEMES[t]) spawnParticles(PARTICLE_THEMES[t]);
  });

  // Restore auth session + sync locations from cloud if logged in
  authUpdateUI();
  if (_authToken) syncLocationsFromCloud();

  locsLoad();
  loadWeather();
}

init();