/* ============================================================
   Sistema de Ponto — Grupo Shalom (cliente)
   Conversa com a API do server.js. Sessão guardada no navegador.
============================================================ */

/* ---------- sessão ---------- */
let SESS = null;
try { SESS = JSON.parse(localStorage.getItem('ponto_sess') || 'null'); } catch (e) { SESS = null; }
function saveSess() { localStorage.setItem('ponto_sess', JSON.stringify(SESS)); }
function clearSess() { SESS = null; localStorage.removeItem('ponto_sess'); }

/* ---------- API ---------- */
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (SESS) opt.headers['x-token'] = SESS.token;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  if (r.status === 401) { clearSess(); showLogin(); toast('Sessão expirada, entre novamente', 'warn'); throw new Error('401'); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('http_' + r.status)); }
  return r.json();
}
/* cache em memória: evita rebuscar tudo a cada troca de funcionário/aba */
const _cache = new Map(); // path -> { t, data }
const CACHE_TTL = 25000;
let _inflight = new Map(); // evita buscas duplicadas simultâneas
async function apiGet(path) {
  const c = _cache.get(path);
  if (c && Date.now() - c.t < CACHE_TTL) return c.data;
  if (_inflight.has(path)) return _inflight.get(path);
  const pr = api('GET', path).then(data => { _cache.set(path, { t: Date.now(), data }); _inflight.delete(path); return data; })
    .catch(e => { _inflight.delete(path); throw e; });
  _inflight.set(path, pr);
  return pr;
}
function cachePut(path, data) { _cache.set(path, { t: Date.now(), data }); }
function cacheClear(prefixPart) { for (const k of [..._cache.keys()]) if (k.includes(prefixPart)) _cache.delete(k); }

const getFuncs = async (lj) => (await apiGet(`/api/data/func:${lj}`)) || [];
const setFuncs = async (lj, v) => { await api('PUT', `/api/data/func:${lj}`, v); cachePut(`/api/data/func:${lj}`, v); };
const getEsc = async (lj, mk) => (await apiGet(`/api/data/escala:${lj}:${mk}`)) || {};
const setEsc = async (lj, mk, v) => { await api('PUT', `/api/data/escala:${lj}:${mk}`, v); cachePut(`/api/data/escala:${lj}:${mk}`, v); };
const getRegs = async (lj, mk) => (await apiGet(`/api/data/reg:${lj}:${mk}`)) || [];
const getOcor = async (lj) => (await apiGet(`/api/data/ocor:${lj}`)) || [];
const setOcor = async (lj, v) => { await api('PUT', `/api/data/ocor:${lj}`, v); cachePut(`/api/data/ocor:${lj}`, v); };
const getAviso = async (lj) => { const r = await apiGet(`/api/data/aviso:${lj}`); return (r && r.texto) || ''; };
const setAviso = async (lj, texto) => { await api('PUT', `/api/data/aviso:${lj}`, { texto }); cachePut(`/api/data/aviso:${lj}`, { texto }); };

/* ============================================================
   CONSTANTES / HELPERS
============================================================ */
const AV = ['#2B59D6','#0F9D58','#C77700','#7C3AED','#D6342C','#0891B2','#DB2777','#475569','#65A30D','#E11D48'];
const avColor = s => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const initials = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const TIPOS = [
  { k: 'entrada', lbl: 'Entrada', ic: 'ti-login-2' },
  { k: 'pausa', lbl: 'Início pausa', ic: 'ti-cup' },
  { k: 'volta', lbl: 'Fim pausa', ic: 'ti-arrow-back-up' },
  { k: 'saida', lbl: 'Saída', ic: 'ti-logout-2' },
];
const TIPO_LBL = Object.fromEntries(TIPOS.map(t => [t.k, t.lbl]));
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const OCOR_TIPOS = ['Atraso', 'Falta', 'Hora extra', 'Ajuste de horário', 'Abono', 'Esquecimento de ponto', 'Atestado', 'Outro'];

const toMin = t => { if (!t) return 0; const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const fmtMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtH = m => { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`; };
function dur(p) { if (!p || !p.on || !p.ini || !p.fim) return 0; let d = toMin(p.fim) - toMin(p.ini); if (d < 0) d += 1440; return Math.max(0, d - (p.interv || 0)); }
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const capWord = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDateLong = d => capWord(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }));
const fmtTime = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escapeOpt = s => (s || '').replace(/</g, '&lt;');

function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.className = 'toast show ' + kind;
  t.querySelector('i').className = 'ti ' + (kind === 'ok' ? 'ti-check' : kind === 'warn' ? 'ti-alert-triangle' : 'ti-x');
  t.querySelector('span').textContent = msg;
  clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast ' + kind, 2800);
}

/* ============================================================
   STATE
============================================================ */
const State = { loja: null, role: 'gerente', cfg: null, tab: 'ponto', escView: 'loja',
  calMonth: new Date(), calFunc: null, repMonth: new Date(), repFunc: null, repMode: 'func',
  ocorFiltro: { status: 'todas', func: 'todos' } };

/* ajuste manual do mês > rodízio automático (func.regra) > padrão semanal */
function planoDia(func, escMes, dateStr) { return EscalaAuto.planoDia(func, escMes, dateStr); }
/* configuração de escala da loja: horário de funcionamento e mínimo de pessoas */
const getEscCfg = async (lj) => (await apiGet(`/api/data/escala:${lj}:cfg`)) || {};
const setEscCfg = async (lj, v) => { await api('PUT', `/api/data/escala:${lj}:cfg`, v); cachePut(`/api/data/escala:${lj}:cfg`, v); };
function optsLoja(cfgEsc, dateStr) {
  const dom = parseYmd(dateStr).getDay() === 0;
  const h = dom ? cfgEsc.horDom : cfgEsc.horSem;
  return { minLoja: +cfgEsc.minLoja || 1, horario: h && h.ini && h.fim ? h : null };
}

/* ============================================================
   LOGIN
============================================================ */
async function bootLogin() {
  const sel = document.getElementById('lg-loja');
  try {
    const lojas = await fetch('/api/lojas').then(r => r.json());
    sel.innerHTML = lojas.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  } catch (e) { sel.innerHTML = '<option>erro ao carregar</option>'; }
}
async function doLogin() {
  const lojaId = document.getElementById('lg-loja').value;
  const senha = document.getElementById('lg-senha').value;
  const err = document.getElementById('lg-err');
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lojaId, senha }) });
    if (!r.ok) { err.textContent = 'Senha incorreta'; err.classList.remove('hide'); return; }
    SESS = await r.json(); saveSess();
    document.getElementById('lg-senha').value = '';
    err.classList.add('hide');
    enterApp();
  } catch (e) { err.textContent = 'Falha de conexão'; err.classList.remove('hide'); }
}
function enterApp() {
  State.loja = SESS.loja; State.role = SESS.role; State.cfg = SESS.config || {};
  document.getElementById('login').classList.add('hide');
  if (SESS.role === 'funcionario') {
    // funcionário: somente a tela de registro (quiosque), sem abas
    document.getElementById('app').classList.add('hide');
    openPunch();
    return;
  }
  document.getElementById('app').classList.remove('hide');
  document.getElementById('tb-loja').textContent = SESS.loja.nome;
  document.getElementById('tb-role').textContent = SESS.role === 'master' ? 'Acesso master' : 'Gerente da loja';
  buildTabs(); go('ponto');
}
const isKiosk = () => SESS && SESS.role === 'funcionario';
function exitPunch() { if (isKiosk()) doLogout(); else closePunch(); }
function showLogin() {
  document.getElementById('app').classList.add('hide');
  document.getElementById('punch-screen').classList.add('hide');
  document.getElementById('login').classList.remove('hide');
}
function doLogout() { clearSess(); showLogin(); }

/* ============================================================
   TABS / ROUTER
============================================================ */
const TABS = [
  { k: 'ponto', lbl: 'Ponto', ic: 'ti-fingerprint' },
  { k: 'escala', lbl: 'Escala', ic: 'ti-calendar-month' },
  { k: 'func', lbl: 'Funcionários', ic: 'ti-users' },
  { k: 'ocor', lbl: 'Ocorrências', ic: 'ti-file-description' },
  { k: 'rel', lbl: 'Relatórios', ic: 'ti-report-analytics' },
  { k: 'cfg', lbl: 'Config', ic: 'ti-settings' },
];
function buildTabs() {
  document.getElementById('tabs').innerHTML = TABS.map(t =>
    `<button class="tab" data-k="${t.k}" onclick="go('${t.k}')"><i class="ti ${t.ic}"></i>${t.lbl}</button>`).join('');
}
function go(k) {
  State.tab = k;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  ({ ponto: renderPonto, escala: renderEscala, func: renderFunc, ocor: renderOcor, rel: renderRel, cfg: renderCfg }[k])();
}

/* ============================================================
   CLOCK
============================================================ */
function tickClocks() {
  const now = new Date();
  const tb = document.getElementById('tb-time');
  if (tb) {
    tb.textContent = fmtTime(now);
    document.getElementById('tb-date').textContent = capWord(now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }));
  }
  const pt = document.getElementById('pk-time');
  if (pt && !document.getElementById('punch-screen').classList.contains('hide')) {
    pt.textContent = now.toLocaleTimeString('pt-BR');
    document.getElementById('pk-date').textContent = fmtDateLong(now);
  }
}
setInterval(tickClocks, 1000);

/* ============================================================
   TAB: PONTO
============================================================ */
async function renderPonto() {
  const aviso = await getAviso(State.loja.id);
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Registro de ponto</h2><p>Abra a tela de registro para os funcionários baterem o ponto.</p></div></div>
    <div class="card cpad" style="text-align:center">
      <div class="logo" style="margin:6px auto 16px"><i class="ti ti-fingerprint"></i></div>
      <h3 style="font-size:17px;margin-bottom:14px">Tela de registro</h3>
      <button class="btn p" style="padding:12px 22px" onclick="openPunch()"><i class="ti ti-player-play"></i> Abrir tela de registro</button>
    </div>
    <div class="card cpad" style="margin-top:14px">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h3 style="font-size:15px;display:flex;align-items:center;gap:7px"><i class="ti ti-speakerphone" style="color:var(--bl)"></i> Comunicado da empresa</h3>
          <p class="mut" style="font-size:12.5px;margin:4px 0 0">Aparece na tela de registro, para os funcionários verem.</p></div>
        <button class="btn sm" onclick="editAviso()"><i class="ti ti-edit"></i> Editar</button>
      </div>
      <div class="aviso-box ${aviso ? '' : 'vazio'}" style="margin-top:12px">${aviso ? esc(aviso).replace(/\n/g, '<br>') : 'Nenhum comunicado no momento. Clique em “Editar” para escrever um aviso que aparecerá para os funcionários.'}</div>
    </div>`;
}
async function editAviso() {
  let aviso = '';
  try { aviso = await getAviso(State.loja.id); } catch (e) {}
  openModal('Comunicado da empresa', `
    <div><label class="fl">Mensagem</label>
      <textarea id="av-txt" class="inp" rows="4" placeholder="Ex.: Reunião de equipe sexta às 9h. Novo uniforme disponível no estoque.">${esc(aviso)}</textarea></div>
    <p class="mut" style="font-size:12px">Aparece na tela de registro de ponto. Deixe em branco para não exibir nada.</p>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: 'Salvar comunicado', cls: 'p', fn: 'saveAviso()' }]);
}
async function saveAviso() {
  const txt = document.getElementById('av-txt').value.trim();
  try { await setAviso(State.loja.id, txt); closeModal(); renderPonto(); toast('Comunicado salvo', 'ok'); }
  catch (e) { toast('Erro ao salvar: ' + e.message, 'err'); }
}

let PUNCH = { funcs: [], escMes: {}, regs: [], mk: null, selected: null, aviso: '' };
async function openPunch() {
  const mk = monthKey(new Date());
  PUNCH.mk = mk; PUNCH.selected = null;
  try {
    PUNCH.funcs = await getFuncs(State.loja.id);
    PUNCH.escMes = await getEsc(State.loja.id, mk);
    PUNCH.regs = await getRegs(State.loja.id, mk);
    PUNCH.aviso = await getAviso(State.loja.id);
  } catch (e) { toast('Não consegui carregar a loja: ' + e.message, 'err'); return; }
  document.getElementById('pk-loja').textContent = State.loja.nome;
  const back = document.getElementById('pk-back');
  if (back) back.innerHTML = isKiosk() ? '<i class="ti ti-logout-2"></i> Sair' : '<i class="ti ti-arrow-left"></i> Voltar';
  document.getElementById('punch-screen').classList.remove('hide');
  tickClocks(); renderPunch();
}
function closePunch() { document.getElementById('punch-screen').classList.add('hide'); }
function selectFunc(id) { PUNCH.selected = id; renderPunch(); }
function backToList() { PUNCH.selected = null; renderPunch(); }

function regsDoDia(funcId, ds) { return PUNCH.regs.filter(r => r.funcId === funcId && r.data === ds).sort((a, b) => a.ts - b.ts); }
function proximoTipo(funcId, ds) {
  const done = regsDoDia(funcId, ds).map(r => r.tipo);
  for (const t of TIPOS) if (!done.includes(t.k)) return t.k;
  return null;
}
const STEP_SHORT = { entrada: 'Entrada', pausa: 'Pausa', volta: 'Retorno', saida: 'Saída' };
function renderPunch() {
  if (!PUNCH.funcs.length) {
    document.getElementById('pk-grid').innerHTML = `<div class="empty" style="width:100%"><i class="ti ti-users"></i>Nenhum funcionário cadastrado nesta loja.</div>`;
    return;
  }
  if (PUNCH.selected && PUNCH.funcs.find(f => f.id === PUNCH.selected)) renderPunchIndividual();
  else { PUNCH.selected = null; renderPunchSelect(); }
}

/* tela 1: selecionar o funcionário */
function renderPunchSelect() {
  const ds = todayStr();
  const tiles = PUNCH.funcs.map(f => {
    const horaDe = {}; regsDoDia(f.id, ds).forEach(r => horaDe[r.tipo] = r.hora);
    const doneCount = TIPOS.filter(t => horaDe[t.k]).length;
    const nx = proximoTipo(f.id, ds);
    const dots = TIPOS.map(t => `<span class="dot ${horaDe[t.k] ? 'on' : ''}"></span>`).join('');
    const chip = doneCount === 4
      ? `<span class="pe-chip done"><i class="ti ti-check"></i> Concluído</span>`
      : `<span class="pe-chip"><i class="ti ${TIPOS.find(t => t.k === nx).ic}"></i> ${STEP_SHORT[nx]}</span>`;
    return `<button class="pe-tile" onclick="selectFunc('${f.id}')">
      <div class="ava xl" style="background:${avColor(f.nome)}">${initials(f.nome)}</div>
      <div class="pe-name">${esc(f.nome)}</div>
      <div class="pe-dots">${dots}</div>
      ${chip}
    </button>`;
  }).join('');
  document.getElementById('pk-grid').innerHTML = `<div class="pk-wrap">
    ${PUNCH.aviso ? `<div class="pk-aviso"><i class="ti ti-speakerphone"></i><span>${esc(PUNCH.aviso).replace(/\n/g, '<br>')}</span></div>` : ''}
    <div class="pk-hint"><i class="ti ti-hand-finger"></i> Toque no seu nome para registrar o ponto</div>
    <div class="emp-select">${tiles}</div>
  </div>`;
}

/* tela 2: painel individual com a trilha de pontos */
function renderPunchIndividual() {
  const ds = todayStr();
  const f = PUNCH.funcs.find(x => x.id === PUNCH.selected);
  const horaDe = {}; regsDoDia(f.id, ds).forEach(r => horaDe[r.tipo] = r.hora);
  const nx = proximoTipo(f.id, ds);
  const plano = planoDia(f, PUNCH.escMes, ds);
  const turno = plano.on ? `Turno ${plano.ini}–${plano.fim}` : 'Folga hoje';
  const doneCount = TIPOS.filter(t => horaDe[t.k]).length;
  const nodes = TIPOS.map((t, i) => {
    const done = !!horaDe[t.k];
    const lit = i > 0 && !!horaDe[TIPOS[i - 1].k];
    const cls = done ? 'done' : (t.k === nx ? 'next' : 'todo');
    const inner = `<div class="sdot"><i class="ti ${done ? 'ti-check' : t.ic}"></i></div><div class="slabel">${STEP_SHORT[t.k]}</div><div class="stime">${done ? horaDe[t.k] : '—'}</div>`;
    return done
      ? `<div class="snode done ${lit ? 'lit' : ''}">${inner}</div>`
      : `<button class="snode ${cls} ${lit ? 'lit' : ''}" onclick="startCapture('${f.id}','${t.k}')">${inner}</button>`;
  }).join('');
  const cta = nx
    ? `<button class="emp-cta" onclick="startCapture('${f.id}','${nx}')"><i class="ti ${TIPOS.find(t => t.k === nx).ic}"></i> Registrar ${STEP_SHORT[nx]}</button>`
    : `<div class="emp-cta done"><i class="ti ti-circle-check"></i> Jornada concluída</div>`;
  document.getElementById('pk-grid').innerHTML = `<div class="pk-wrap one">
    <button class="btn back-list" onclick="backToList()"><i class="ti ti-arrow-left"></i> Trocar de funcionário</button>
    <div class="emp">
      <div class="emp-head">
        <div class="ava xl" style="background:${avColor(f.nome)}">${initials(f.nome)}</div>
        <div class="emp-id"><div class="nm">${esc(f.nome)}</div><div class="turno mono">${turno}</div></div>
        <div class="emp-count">${doneCount}/4</div>
      </div>
      <div class="stepper">${nodes}</div>
      ${cta}
    </div>
  </div>`;
}

/* ---------- captura ---------- */
let CAM = { stream: null, funcId: null, tipo: null };
async function startCapture(funcId, tipo) {
  let prep;
  try { prep = await api('POST', '/api/punch/prepare', { funcId, tipo }); }
  catch (e) { toast('Não consegui registrar: ' + e.message, 'err'); return; }
  if (prep.erro) { toast('Erro: ' + prep.erro, 'err'); return; }
  if (prep.jaRegistrado) { toast((STEP_SHORT[prep.tipo] || 'Ponto') + ' já foi registrado hoje', 'warn'); return; }
  if (prep.blocked) { openCapBlock(prep); return; }
  CAM = { stream: null, funcId, tipo: prep.tipo };
  openCapUI(prep);
}
function openCapBlock(prep) {
  const nome = (prep.nome || '').split(' ')[0];
  document.getElementById('modal-root').innerHTML = `<div class="ovl" onclick="if(event.target===this)closeModal()">
    <div class="cap-card"><div class="cap-body" style="text-align:center;padding:26px 22px">
      <div class="logo" style="margin:0 auto 14px;background:linear-gradient(135deg,var(--am),#e8a93a)"><i class="ti ti-coffee"></i></div>
      <h3 style="font-size:17px;margin-bottom:8px">Ainda não iniciou sua jornada</h3>
      <p class="mut" style="margin:0 0 4px">Aproveite seu período de descanso, <b>${esc(nome)}</b>!</p>
      <p class="mut" style="margin:0 0 18px">Seu horário começa às <b class="mono">${prep.ini}</b>. Faltam <b>${prep.faltam}</b> min.</p>
      <button class="btn full" onclick="closeModal()">Entendi</button>
    </div></div></div>`;
}
function openCapUI(prep) {
  const t = TIPOS.find(x => x.k === prep.tipo);
  const plano = prep.plano || {};
  document.getElementById('modal-root').innerHTML = `<div id="cap"><div class="cap-card">
    <div class="cap-head">
      <div class="ava" style="background:${avColor(prep.nome)}">${initials(prep.nome)}</div>
      <div style="min-width:0"><div style="font-weight:700;font-size:14px">${esc(prep.nome)}</div>
        <div class="mut" style="font-size:12px"><i class="ti ${t.ic}" style="vertical-align:-2px"></i> ${t.lbl}</div></div>
      <button class="iconbtn" style="margin-left:auto" onclick="closeCapture()"><i class="ti ti-x"></i></button>
    </div>
    <div class="cap-body">
      <div class="camwrap" id="camwrap">
        <video id="cam-video" autoplay playsinline muted></video>
        <div class="ph-ph hide" id="cam-fallback"></div>
      </div>
      <input id="cam-file" type="file" accept="image/*" capture="user" class="hide" onchange="onFilePhoto(event)"/>
      <div class="row" style="justify-content:space-between">
        <span class="mut mono" style="font-size:12px">${plano.on ? plano.ini + '–' + plano.fim : 'Sem turno previsto'}</span>
        <span class="mono" style="font-weight:700;font-size:15px">${fmtTime(new Date())}</span>
      </div>
      <button class="btn g full" id="cap-confirm" disabled><i class="ti ti-camera"></i> Capturar e registrar</button>
    </div>
  </div></div>`;
  startCam();
}
async function startCam() {
  const v = document.getElementById('cam-video'), fb = document.getElementById('cam-fallback'), btn = document.getElementById('cap-confirm');
  try {
    CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480 }, audio: false });
    v.srcObject = CAM.stream;
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-camera"></i> Capturar e registrar';
    btn.onclick = takeAndConfirm;
  } catch (e) {
    v.classList.add('hide'); fb.classList.remove('hide');
    fb.innerHTML = '<i class="ti ti-camera-off" style="font-size:26px;display:block;margin-bottom:6px"></i>Câmera indisponível aqui.<br>Toque para usar a câmera do aparelho.';
    fb.onclick = () => document.getElementById('cam-file').click();
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-camera-plus"></i> Tirar foto';
    btn.onclick = () => document.getElementById('cam-file').click();
  }
}
function drawToBlob(src, w, h) {
  const max = 480, scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
}
async function takeAndConfirm() {
  const v = document.getElementById('cam-video');
  const blob = await drawToBlob(v, v.videoWidth || 480, v.videoHeight || 360);
  confirmPunch(blob);
}
function onFilePhoto(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = async () => { const blob = await drawToBlob(img, img.width, img.height); confirmPunch(blob); };
  img.src = URL.createObjectURL(file);
}
async function confirmPunch(blob) {
  const btn = document.getElementById('cap-confirm'); if (btn) { btn.disabled = true; btn.innerHTML = 'Registrando...'; }
  const fd = new FormData(); fd.append('funcId', CAM.funcId); fd.append('tipo', CAM.tipo); if (blob) fd.append('foto', blob, 'p.jpg');
  let r;
  try { r = await fetch('/api/punch', { method: 'POST', headers: { 'x-token': SESS.token }, body: fd }).then(x => x.json()); }
  catch (e) { toast('Falha ao registrar', 'err'); if (btn) btn.disabled = false; return; }
  if (r.blocked) { closeCapture(); openCapBlock(r); return; }
  if (r.jaRegistrado) { toast((STEP_SHORT[r.tipo] || 'Ponto') + ' já registrado', 'warn'); closeCapture(); renderPunch(); return; }
  if (r.ok) {
    PUNCH.regs.push(r.reg);
    cachePut(`/api/data/reg:${State.loja.id}:${PUNCH.mk}`, PUNCH.regs);
    const f = PUNCH.funcs.find(x => x.id === CAM.funcId);
    toast(`${TIPO_LBL[r.reg.tipo]} registrada · ${f.nome.split(' ')[0]} · ${r.reg.hora}`, 'ok');
    if (r.ocorrencia) setTimeout(() => toast('Saída sem entrada — ocorrência gerada automaticamente', 'warn'), 1300);
    closeCapture(); renderPunch();
    // volta sozinho para a lista, pronto para o próximo funcionário
    setTimeout(() => { if (PUNCH.selected === CAM.funcId && document.getElementById('modal-root').innerHTML === '') backToList(); }, 2200);
  } else { toast(r.error ? ('Erro: ' + r.error) : 'Não foi possível registrar', 'err'); if (btn) btn.disabled = false; }
}
function closeCapture() {
  if (CAM.stream) { CAM.stream.getTracks().forEach(t => t.stop()); CAM.stream = null; }
  document.getElementById('modal-root').innerHTML = '';
}

/* ============================================================
   TAB: ESCALA
============================================================ */
async function renderEscala() {
  const funcs = await getFuncs(State.loja.id);
  if (!funcs.length) { noFuncs('Cadastre funcionários para montar a escala.'); return; }
  const mk = monthKey(State.calMonth);
  const [escMes, cfgEsc] = await Promise.all([getEsc(State.loja.id, mk), getEscCfg(State.loja.id)]);
  const mesLbl = capWord(State.calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const view = State.escView === 'func' ? 'func' : 'loja';
  document.getElementById('page').innerHTML = `
    <div class="ph">
      <div><h2>Escala mensal</h2><p>As folgas saem do rodízio de cada funcionário e os almoços são escalonados para a loja nunca ficar vazia.</p></div>
      <div class="row">
        <div class="seg">
          <button class="${view === 'loja' ? 'on' : ''}" onclick="State.escView='loja';renderEscala()"><i class="ti ti-building-store"></i> Loja</button>
          <button class="${view === 'func' ? 'on' : ''}" onclick="State.escView='func';renderEscala()"><i class="ti ti-user"></i> Por funcionário</button>
        </div>
      </div>
    </div>
    <div class="card cpad" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <button class="btn sm" onclick="shiftMonth(-1)"><i class="ti ti-chevron-left"></i></button>
          <div style="font-weight:700;font-size:15px;min-width:150px;text-align:center">${mesLbl}</div>
          <button class="btn sm" onclick="shiftMonth(1)"><i class="ti ti-chevron-right"></i></button>
        </div>
        <div class="row" id="esc-actions"></div>
      </div>
    </div>
    <div id="esc-body"></div>`;
  if (view === 'loja') renderEscalaLoja(funcs, escMes, cfgEsc);
  else renderEscalaFunc(funcs, escMes, cfgEsc);
}
function shiftMonth(n) { State.calMonth = new Date(State.calMonth.getFullYear(), State.calMonth.getMonth() + n, 1); renderEscala(); }
function diasDoMes(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth(), n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
function mesPrevisto(func, escMes, monthDate) {
  return diasDoMes(monthDate).reduce((t, ds) => t + dur(planoDia(func, escMes, ds)), 0);
}

/* ---------- visão da loja: todos os funcionários no mês ---------- */
function renderEscalaLoja(funcs, escMes, cfgEsc) {
  document.getElementById('esc-actions').innerHTML = `
    <button class="btn sm" onclick="abrirHorarioLoja()"><i class="ti ti-clock"></i> Horário da loja</button>
    <button class="btn sm p" onclick="abrirSugestao()"><i class="ti ti-wand"></i> Sugerir escala da loja</button>`;
  const dias = diasDoMes(State.calMonth), hoje = todayStr();
  const cob = {}; let diasAlerta = 0;
  dias.forEach(ds => { cob[ds] = EscalaAuto.cobertura(funcs, escMes, ds, optsLoja(cfgEsc, ds)); if (cob[ds].faltas.length) diasAlerta++; });
  const semRodizio = funcs.filter(f => !EscalaAuto.regraValida(f.regra));
  const head = dias.map(ds => { const d = parseYmd(ds); const dom = d.getDay() === 0;
    return `<th class="${dom ? 'dom' : ''} ${ds === hoje ? 'hoje' : ''}" onclick="diaLoja('${ds}')" title="Ver o dia"><div>${DOW[d.getDay()].slice(0, 1)}</div><div>${d.getDate()}</div>${dom ? `<div class="sem">${EscalaAuto.semanaLetra(ds)}</div>` : ''}</th>`; }).join('');
  const rows = funcs.map(f => {
    const auto = EscalaAuto.regraValida(f.regra);
    const cells = dias.map(ds => {
      const p = planoDia(f, escMes, ds); const dom = parseYmd(ds).getDay() === 0;
      const man = escMes[f.id] && escMes[f.id][ds];
      if (!p.on) return `<td class="fg ${dom ? 'dom' : ''} ${man ? 'man' : ''}" onclick="diaLoja('${ds}')">F</td>`;
      const alm = cob[ds].almocos[f.id];
      return `<td class="tr ${dom ? 'dom' : ''} ${man ? 'man' : ''}" onclick="diaLoja('${ds}')" title="${p.ini}–${p.fim}${alm ? ' · almoço ' + alm : ''}"><div>${p.ini.slice(0, 2)}</div>${alm ? `<div class="al">${alm}</div>` : ''}</td>`;
    }).join('');
    return `<tr><th class="nm"><div class="row" style="gap:7px;flex-wrap:nowrap"><div class="ava" style="background:${avColor(f.nome)};width:26px;height:26px;border-radius:7px;font-size:10.5px;flex:none">${initials(f.nome)}</div>
      <div style="min-width:0"><div class="t1">${esc(f.nome.split(' ')[0])}</div><div class="t2">${auto ? EscalaAuto.descreverRegra(f.regra).replace(/^.*?· /, '') : 'Dias fixos'}</div></div></div></th>${cells}</tr>`;
  }).join('');
  const rodape = dias.map(ds => { const c = cob[ds]; const n = c.pessoas.length; const alerta = c.faltas.length;
    return `<td class="${alerta ? 'alerta' : ''}" onclick="diaLoja('${ds}')">${n}${alerta ? '<i class="ti ti-alert-triangle"></i>' : ''}</td>`; }).join('');
  document.getElementById('esc-body').innerHTML = `
    ${semRodizio.length ? `<div class="card cpad" style="margin-bottom:14px;border-color:#f0dcb0;background:var(--am-soft)">
      <i class="ti ti-info-circle"></i> ${semRodizio.map(f => esc(f.nome.split(' ')[0])).join(', ')} ainda ${semRodizio.length > 1 ? 'estão' : 'está'} sem rodízio automático.
      Use <b>Sugerir escala da loja</b> ou edite o funcionário para gerar as folgas sozinho.</div>` : ''}
    <div class="card cpad" style="margin-bottom:14px">
      <div class="hsum">
        <div><div class="lbl">Funcionários</div><div class="big mono">${funcs.length}</div></div>
        <div><div class="lbl">Dias com loja descoberta</div><div class="big mono" style="color:${diasAlerta ? 'var(--rd)' : 'var(--gr)'}">${diasAlerta}</div></div>
        <div style="flex:1"></div>
        ${diasAlerta ? `<span class="badge bd-rd"><i class="ti ti-alert-triangle"></i> Há horários com menos de ${+cfgEsc.minLoja || 1} pessoa(s) na loja — clique no dia</span>`
                     : `<span class="badge bd-gr"><i class="ti ti-circle-check"></i> Loja coberta em todos os horários, inclusive nos almoços</span>`}
      </div>
    </div>
    <div class="card escg-wrap"><table class="escg">
      <thead><tr><th class="nm">Funcionário</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th class="nm">Na loja</th>${rodape}</tr></tfoot>
    </table></div>
    <div class="mut" style="font-size:11.5px;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap">
      <span><b>F</b> = folga</span><span>número = hora de entrada</span><span><span style="color:var(--bl-d);font-weight:700">13:00</span> = almoço</span>
      <span>A/B = semana do rodízio de domingo</span><span><span class="lg-man"></span> ajuste manual</span><span>Clique num dia para ver a linha do tempo</span></div>`;
}

/* ---------- linha do tempo de um dia ---------- */
async function diaLoja(ds) {
  const funcs = await getFuncs(State.loja.id);
  const mk = ds.slice(0, 7);
  const [escMes, cfgEsc] = await Promise.all([getEsc(State.loja.id, mk), getEscCfg(State.loja.id)]);
  const c = EscalaAuto.cobertura(funcs, escMes, ds, optsLoja(cfgEsc, ds));
  const d = parseYmd(ds);
  const titulo = capWord(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }));
  let corpo;
  if (!c.pessoas.length) corpo = `<div class="empty"><i class="ti ti-calendar-off"></i>Ninguém escalado neste dia.</div>`;
  else {
    const a = Math.floor(Math.min(c.abre, ...c.pessoas.map(p => p.ini)) / 60) * 60;
    const b = Math.ceil(Math.max(c.fecha, ...c.pessoas.map(p => p.fim)) / 60) * 60;
    const pct = m => ((m - a) / (b - a) * 100).toFixed(2) + '%';
    const horas = []; for (let h = a; h <= b; h += 60) horas.push(`<span style="left:${pct(h)}">${String((h / 60) % 24).padStart(2, '0')}h</span>`);
    const linhas = c.pessoas.map(p => `<div class="tl-row">
        <div class="tl-nm">${esc(p.nome.split(' ')[0])}</div>
        <div class="tl-bar">
          <div class="tl-shift" style="left:${pct(p.ini)};width:calc(${pct(p.fim)} - ${pct(p.ini)})"></div>
          ${p.alm != null ? `<div class="tl-alm" style="left:${pct(p.alm)};width:calc(${pct(p.almFim)} - ${pct(p.alm)})"><i class="ti ti-tools-kitchen-2"></i></div>` : ''}
        </div>
        <div class="tl-alm-inp"><input class="inp" type="time" value="${p.alm != null ? fmtMin(p.alm % 1440) : ''}" ${p.alm == null ? 'disabled' : ''} data-f="${p.id}" title="Horário do almoço"></div>
      </div>`).join('');
    const cobBar = c.slots.map(s => `<div class="tl-cob n${Math.min(s.n, 3)}" style="left:${pct(s.t)};width:calc(${pct(s.t + 15)} - ${pct(s.t)})" title="${fmtMin(s.t % 1440)} · ${s.n} na loja"></div>`).join('');
    corpo = `
      <div class="tl">
        <div class="tl-row tl-head"><div class="tl-nm"></div><div class="tl-bar tl-hours">${horas.join('')}</div><div class="tl-alm-inp mut" style="font-size:11px">Almoço</div></div>
        ${linhas}
        <div class="tl-row"><div class="tl-nm mut">Na loja</div><div class="tl-bar">${cobBar}</div><div class="tl-alm-inp"></div></div>
      </div>
      ${c.faltas.length ? c.faltas.map(f => `<div class="badge bd-rd" style="margin-top:8px"><i class="ti ti-alert-triangle"></i> ${f.ini}–${f.fim}: ${f.n === 0 ? 'loja sem ninguém' : f.n + ' pessoa(s), abaixo do mínimo'}</div>`).join(' ')
        : `<div class="badge bd-gr" style="margin-top:8px"><i class="ti ti-circle-check"></i> Sempre tem alguém na loja, inclusive nos almoços</div>`}
      <p class="mut" style="font-size:11.5px;margin:10px 0 0">Os almoços foram escalonados automaticamente. Para fixar outro horário neste dia, mude o campo e salve.</p>`;
  }
  openModal(titulo, corpo, [
    { lbl: 'Fechar', cls: '', fn: 'closeModal()' },
    ...(c.pessoas.length ? [{ lbl: 'Recalcular almoços', cls: '', fn: `resetAlmocos('${ds}')` }, { lbl: 'Salvar almoços', cls: 'p', fn: `salvarAlmocos('${ds}')` }] : [])]);
  const m = document.querySelector('#modal-root .modal'); if (m) m.style.maxWidth = '760px';
}
async function salvarAlmocos(ds) {
  const funcs = await getFuncs(State.loja.id);
  const mk = ds.slice(0, 7);
  const escMes = await getEsc(State.loja.id, mk);
  const auto = EscalaAuto.almocos(funcs, escMes, ds);
  let mudou = 0;
  document.querySelectorAll('#modal-root input[data-f]').forEach(inp => {
    const fid = inp.dataset.f, v = inp.value; if (!v || v === auto[fid]) return;
    const f = funcs.find(x => x.id === fid); const p = planoDia(f, escMes, ds);
    escMes[fid] = escMes[fid] || {}; escMes[fid][ds] = { on: true, ini: p.ini, fim: p.fim, interv: p.interv || 0, alm: v }; mudou++;
  });
  if (!mudou) { closeModal(); return; }
  await setEsc(State.loja.id, mk, escMes);
  closeModal(); renderEscala(); toast('Almoço ajustado', 'ok'); setTimeout(() => diaLoja(ds), 50);
}
async function resetAlmocos(ds) {
  const funcs = await getFuncs(State.loja.id);
  const mk = ds.slice(0, 7);
  const escMes = await getEsc(State.loja.id, mk);
  for (const f of funcs) { const e = escMes[f.id] && escMes[f.id][ds]; if (e && e.alm) delete e.alm; }
  await setEsc(State.loja.id, mk, escMes);
  closeModal(); renderEscala(); toast('Almoços recalculados', 'ok'); setTimeout(() => diaLoja(ds), 50);
}

/* ---------- horário de funcionamento / mínimo de pessoas ---------- */
async function abrirHorarioLoja() {
  const c = await getEscCfg(State.loja.id);
  const hs = c.horSem || {}, hd = c.horDom || {};
  openModal('Horário da loja', `
    <p class="mut" style="margin:0;font-size:12.5px">Usado para conferir se sempre há alguém na loja. Deixe em branco para considerar do primeiro que entra ao último que sai.</p>
    <div><label class="fl">Segunda a sábado</label><div class="row" style="gap:8px">
      <div style="flex:1"><span class="mut" style="font-size:11px">Abre</span><input id="hl-s-ini" class="inp" type="time" value="${hs.ini || ''}"></div>
      <div style="flex:1"><span class="mut" style="font-size:11px">Fecha</span><input id="hl-s-fim" class="inp" type="time" value="${hs.fim || ''}"></div></div></div>
    <div><label class="fl">Domingo e feriado</label><div class="row" style="gap:8px">
      <div style="flex:1"><span class="mut" style="font-size:11px">Abre</span><input id="hl-d-ini" class="inp" type="time" value="${hd.ini || ''}"></div>
      <div style="flex:1"><span class="mut" style="font-size:11px">Fecha</span><input id="hl-d-fim" class="inp" type="time" value="${hd.fim || ''}"></div></div></div>
    <div><label class="fl">Mínimo de pessoas na loja a todo momento</label>
      <select id="hl-min" class="inp">${[1, 2, 3].map(n => `<option value="${n}" ${(+c.minLoja || 1) === n ? 'selected' : ''}>${n} pessoa${n > 1 ? 's' : ''}</option>`).join('')}</select></div>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: 'Salvar', cls: 'p', fn: 'salvarHorarioLoja()' }]);
}
async function salvarHorarioLoja() {
  const v = id => document.getElementById(id).value;
  await setEscCfg(State.loja.id, { horSem: { ini: v('hl-s-ini'), fim: v('hl-s-fim') }, horDom: { ini: v('hl-d-ini'), fim: v('hl-d-fim') }, minLoja: +v('hl-min') || 1 });
  closeModal(); renderEscala(); toast('Horário da loja salvo', 'ok');
}

/* ---------- sugestão de escala para a loja inteira ---------- */
let _sug = null;
async function abrirSugestao() {
  const funcs = await getFuncs(State.loja.id);
  const ref = funcs.find(f => EscalaAuto.regraValida(f.regra));
  _sug = { modelo: ref ? ref.regra.modelo : 'alt',
    sem: ref ? { ...ref.regra.sem } : { ...EscalaAuto.DEF_SEM }, dom: ref ? { ...ref.regra.dom } : { ...EscalaAuto.DEF_DOM } };
  openModal('Sugerir escala da loja', `
    <p class="mut" style="margin:0;font-size:12.5px">O sistema espalha as folgas fixas pela semana (evitando o sábado) e divide os domingos em dois grupos, para a loja nunca ficar sem gente. Você pode ajustar cada pessoa depois em Funcionários.</p>
    <div><label class="fl">Modelo</label><select id="sg-modelo" class="inp" onchange="sugPreview()">
      ${Object.entries(EscalaAuto.MODELOS).map(([k, v]) => `<option value="${k}" ${_sug.modelo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="row" style="gap:8px">
      <div style="flex:1"><label class="fl">Seg a sáb</label><div class="row" style="gap:6px">
        <input id="sg-s-ini" class="inp" type="time" value="${_sug.sem.ini}" onchange="sugPreview()"><input id="sg-s-fim" class="inp" type="time" value="${_sug.sem.fim}" onchange="sugPreview()">
        <input id="sg-s-int" class="inp" type="number" style="width:70px" min="0" step="5" value="${_sug.sem.interv}" onchange="sugPreview()" title="Almoço (min)"></div></div>
    </div>
    <div class="row" style="gap:8px">
      <div style="flex:1"><label class="fl">Domingo</label><div class="row" style="gap:6px">
        <input id="sg-d-ini" class="inp" type="time" value="${_sug.dom.ini}" onchange="sugPreview()"><input id="sg-d-fim" class="inp" type="time" value="${_sug.dom.fim}" onchange="sugPreview()">
        <input id="sg-d-int" class="inp" type="number" style="width:70px" min="0" step="5" value="${_sug.dom.interv}" onchange="sugPreview()" title="Intervalo (min)"></div></div>
    </div>
    <div id="sg-prev"></div>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: 'Aplicar a todos', cls: 'p', fn: 'aplicarSugestao()' }]);
  const m = document.querySelector('#modal-root .modal'); if (m) m.style.maxWidth = '640px';
  sugPreview();
}
async function sugPreview() {
  const v = id => document.getElementById(id).value;
  _sug.modelo = v('sg-modelo');
  _sug.sem = { ini: v('sg-s-ini'), fim: v('sg-s-fim'), interv: +v('sg-s-int') || 0 };
  _sug.dom = { ini: v('sg-d-ini'), fim: v('sg-d-fim'), interv: +v('sg-d-int') || 0 };
  const funcs = await getFuncs(State.loja.id);
  _sug.regras = EscalaAuto.sugerirLoja(funcs, _sug.modelo, { sem: _sug.sem, dom: _sug.dom });
  const sim = funcs.map(f => ({ ...f, regra: _sug.regras[f.id] }));
  const seg = parseYmd(todayStr()); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const semanas = [0, 7].map(off => Array.from({ length: 7 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + off + i); return ymd(d); }));
  const tab = semanas.map(sem => `<tr><th class="mut" style="font-size:11px">Sem. ${EscalaAuto.semanaLetra(sem[0])}</th>${sem.map(ds => {
    const c = EscalaAuto.cobertura(sim, {}, ds); const n = c.pessoas.length;
    return `<td class="${c.faltas.length ? 'alerta' : ''}">${n}</td>`; }).join('')}</tr>`).join('');
  document.getElementById('sg-prev').innerHTML = `
    <table class="tbl" style="margin-top:4px"><thead><tr><th>Funcionário</th><th>Folga fixa</th><th>Domingo</th>${_sug.modelo === '5x2' ? '<th>2ª folga</th>' : ''}</tr></thead><tbody>
    ${funcs.map(f => { const r = _sug.regras[f.id]; return `<tr><td><b>${esc(f.nome)}</b></td><td>${EscalaAuto.DOW_NOME[r.folgaFixa]}</td><td>Grupo ${r.grupoDom}</td>${_sug.modelo === '5x2' ? `<td>${EscalaAuto.DOW_NOME[r.folga2]}</td>` : ''}</tr>`; }).join('')}
    </tbody></table>
    <div class="fl" style="margin-top:12px">Pessoas na loja por dia</div>
    <table class="escg mini"><thead><tr><th></th>${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${tab}</tbody></table>`;
}
async function aplicarSugestao() {
  if (!_sug || !_sug.regras) return;
  if (!confirm('Aplicar o rodízio sugerido a todos os funcionários desta loja? Os ajustes manuais de dias específicos continuam valendo.')) return;
  const funcs = await getFuncs(State.loja.id);
  funcs.forEach(f => { const r = _sug.regras[f.id]; if (!r) return; if (r.modelo !== '5x2') delete r.folga2; f.regra = r; });
  await setFuncs(State.loja.id, funcs);
  closeModal(); State.escView = 'loja'; renderEscala(); toast('Escala da loja gerada', 'ok');
}

/* ---------- visão por funcionário (calendário) ---------- */
function renderEscalaFunc(funcs, escMes, cfgEsc) {
  if (!State.calFunc || !funcs.find(f => f.id === State.calFunc)) State.calFunc = funcs[0].id;
  const func = funcs.find(f => f.id === State.calFunc);
  const auto = EscalaAuto.regraValida(func.regra);
  const total = mesPrevisto(func, escMes, State.calMonth);
  const meta = State.cfg.metaHoras * 60;
  const ok = total >= meta;
  const ajustes = Object.keys(escMes[func.id] || {}).length;
  document.getElementById('esc-actions').innerHTML = `
    <select class="inp" style="width:auto" onchange="State.calFunc=this.value;renderEscala()">
      ${funcs.map(f => `<option value="${f.id}" ${f.id === State.calFunc ? 'selected' : ''}>${escapeOpt(f.nome)}</option>`).join('')}
    </select>
    <button class="btn sm" onclick="novoFunc('${func.id}')"><i class="ti ti-refresh"></i> Rodízio</button>
    ${auto ? '' : `<button class="btn sm" onclick="aplicarPadrao()"><i class="ti ti-wand"></i> Aplicar padrão</button>`}
    ${ajustes ? `<button class="btn sm dgr" onclick="limparMes()"><i class="ti ti-eraser"></i> Desfazer ajustes do mês</button>` : ''}`;
  document.getElementById('esc-body').innerHTML = `
    <div class="card cpad" style="margin-bottom:14px">
      <div class="hsum">
        <div><div class="lbl">Horas previstas no mês</div><div class="big mono" style="color:${ok ? 'var(--gr)' : 'var(--am)'}">${fmtH(total)}</div></div>
        <div><div class="lbl">Folgas no mês</div><div class="big mono">${diasDoMes(State.calMonth).filter(ds => !planoDia(func, escMes, ds).on).length}</div></div>
        <div style="flex:1"></div>
        ${auto ? `<span class="badge bd-bl"><i class="ti ti-refresh"></i> ${EscalaAuto.descreverRegra(func.regra)}</span>` : `<span class="badge bd-gy">Dias fixos</span>`}
        ${ok ? `<span class="badge bd-gr"><i class="ti ti-circle-check"></i> Meta de ${State.cfg.metaHoras}h atingida</span>`
             : `<span class="badge bd-am"><i class="ti ti-alert-triangle"></i> Abaixo de ${State.cfg.metaHoras}h — faltam ${fmtH(meta - total)}</span>`}
      </div>
    </div>
    <div class="card cpad">
      <div class="cal" style="margin-bottom:6px">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}</div>
      <div class="cal" id="cal-grid"></div>
      <p class="mut" style="font-size:11.5px;margin:10px 0 0">Clique num dia para trocar uma folga ou mudar o horário só daquele dia (fica marcado como ajuste).</p>
    </div>`;
  drawCalendar(func, escMes, funcs, cfgEsc);
}
function drawCalendar(func, escMes, funcs, cfgEsc) {
  const y = State.calMonth.getFullYear(), m = State.calMonth.getMonth();
  const first = new Date(y, m, 1).getDay(), ds = todayStr();
  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="cell empty"></div>';
  for (const dateStr of diasDoMes(State.calMonth)) {
    const p = planoDia(func, escMes, dateStr);
    const man = escMes[func.id] && escMes[func.id][dateStr];
    const alm = p.on && funcs ? EscalaAuto.almocos(funcs, escMes, dateStr, optsLoja(cfgEsc || {}, dateStr))[func.id] : null;
    html += `<div class="cell ${!p.on ? 'off' : ''} ${dateStr === ds ? 'today' : ''} ${man ? 'man' : ''}" onclick="editDia('${dateStr}')">
      <div class="dn">${+dateStr.slice(8)}</div>
      ${p.on ? `<div class="sh">${p.ini}<br>${p.fim}</div>${alm ? `<div class="al"><i class="ti ti-tools-kitchen-2"></i> ${alm}</div>` : ''}` : `<div class="fg">Folga</div>`}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}
let _segOn = null;
async function editDia(dateStr) {
  const funcs = await getFuncs(State.loja.id);
  const func = funcs.find(f => f.id === State.calFunc);
  const escMes = await getEsc(State.loja.id, monthKey(State.calMonth));
  const p = planoDia(func, escMes, dateStr);
  const auto = EscalaAuto.regraDia(func, dateStr);
  const ref = (auto && auto.on) ? auto : (EscalaAuto.regraValida(func.regra) ? { ...EscalaAuto.DEF_SEM, ...func.regra.sem } : {});
  _segOn = null;
  const date = parseYmd(dateStr);
  openModal(`Jornada · ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`, `
    <div class="row" style="gap:8px">
      <div class="seg" id="seg-on">
        <button class="${p.on ? 'on' : ''}" onclick="segOn(true)">Trabalha</button>
        <button class="${!p.on ? 'on' : ''}" onclick="segOn(false)">Folga</button>
      </div>
      <span class="mut" style="font-size:12px">${esc(func.nome)}</span>
    </div>
    <div id="jfields" class="${p.on ? '' : 'hide'}" style="display:flex;flex-direction:column;gap:13px">
      <div class="row" style="gap:12px">
        <div style="flex:1"><label class="fl">Entrada</label><input id="j-ini" class="inp" type="time" value="${p.ini || ref.ini || '10:00'}"></div>
        <div style="flex:1"><label class="fl">Saída</label><input id="j-fim" class="inp" type="time" value="${p.fim || ref.fim || '18:00'}"></div>
      </div>
      <div class="row" style="gap:12px">
        <div style="flex:1"><label class="fl">Intervalo (min)</label><input id="j-interv" class="inp" type="number" min="0" step="5" value="${p.interv != null ? p.interv : (ref.interv != null ? ref.interv : State.cfg.intervaloPadrao)}"></div>
        <div style="flex:1"><label class="fl">Almoço às (opcional)</label><input id="j-alm" class="inp" type="time" value="${p.alm || ''}"></div>
      </div>
      <p class="mut" style="font-size:11.5px;margin:0">Sem horário de almoço, o sistema escalona sozinho junto com o resto da loja.</p>
    </div>
    ${auto ? `<p class="mut" style="font-size:11.5px;margin:0">Pelo rodízio este dia seria <b>${auto.on ? 'trabalho ' + auto.ini + '–' + auto.fim : 'folga'}</b>.</p>` : ''}`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' },
     ...((escMes[func.id] && escMes[func.id][dateStr]) ? [{ lbl: 'Voltar ao rodízio', cls: '', fn: `voltarRodizio('${dateStr}')` }] : []),
     { lbl: 'Salvar dia', cls: 'p', fn: `saveDia('${dateStr}')` }]);
}

/* ============================================================
   TAB: FUNCIONÁRIOS
============================================================ */
async function renderFunc() {
  const funcs = await getFuncs(State.loja.id);
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Funcionários</h2><p>${funcs.length} cadastrado(s) nesta loja.</p></div>
      <div class="row"><button class="btn p" onclick="novoFunc()"><i class="ti ti-user-plus"></i> Novo funcionário</button></div></div>
    <div class="card">
      ${funcs.length ? `<table class="tbl"><thead><tr><th>Funcionário</th><th>Cargo</th><th>Jornada padrão</th><th>Prev. mês</th><th></th></tr></thead><tbody>
        ${funcs.map(f => {
          const prev = mesPrevisto(f, {}, new Date());
          const dias = (f.padrao || []).filter(d => d && d.on).length;
          const ref = (f.padrao || []).find(d => d && d.on);
          const auto = EscalaAuto.regraValida(f.regra);
          return `<tr>
            <td><div class="row" style="gap:9px"><div class="ava" style="background:${avColor(f.nome)};width:32px;height:32px;border-radius:9px;font-size:12px">${initials(f.nome)}</div><b>${esc(f.nome)}</b></div></td>
            <td class="mut">${esc(f.cargo || '—')}</td>
            <td class="mut" style="font-size:12px">${auto
              ? `<span class="badge bd-bl"><i class="ti ti-refresh"></i> Rodízio</span> ${EscalaAuto.descreverRegra(f.regra)}<br>${f.regra.sem.ini}–${f.regra.sem.fim} · Dom ${f.regra.dom.ini}–${f.regra.dom.fim}`
              : `${dias} dia(s)/sem · ${ref ? ref.ini + '–' + ref.fim : '—'}`}</td>
            <td class="mono">${fmtH(prev)}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn sm" onclick="novoFunc('${f.id}')"><i class="ti ti-edit"></i></button>
              <button class="btn sm dgr" onclick="delFunc('${f.id}')"><i class="ti ti-trash"></i></button></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : `<div class="empty"><i class="ti ti-users"></i>Nenhum funcionário ainda.<br>Clique em "Novo funcionário".</div>`}
    </div>`;
}
let _padrao = null;
let _fm = null; // estado do formulário de funcionário (modo + regra de rodízio)
function defPadrao() { return [{ on: false }, ...[1, 2, 3, 4, 5, 6].map(() => ({ on: true, ini: '14:00', fim: '22:00', interv: 60 }))]; }
function defShift(f, key) {
  const base = f && (f.padrao || []).find(d => d && d.on);
  const d = { ini: '14:00', fim: '22:00', interv: 60 };
  return base ? (base[key] != null ? base[key] : d[key]) : d[key];
}
function defRegra() {
  return { modelo: 'alt', folgaFixa: 3, folga2: 1, grupoDom: 'A', sem: { ...EscalaAuto.DEF_SEM }, dom: { ...EscalaAuto.DEF_DOM } };
}
const fmtDM = s => { const d = parseYmd(s); return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const optDow = (sel, dias) => dias.map(i => `<option value="${i}" ${+sel === i ? 'selected' : ''}>${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]}</option>`).join('');
async function novoFunc(id) {
  const funcs = await getFuncs(State.loja.id);
  const f = id ? funcs.find(x => x.id === id) : null;
  _padrao = f ? JSON.parse(JSON.stringify(f.padrao || defPadrao())) : defPadrao();
  const temRegra = f && EscalaAuto.regraValida(f.regra);
  _fm = { modo: (!f || temRegra) ? 'auto' : 'manual', regra: temRegra ? JSON.parse(JSON.stringify(f.regra)) : defRegra() };
  const r = _fm.regra;
  openModal(f ? 'Editar funcionário' : 'Novo funcionário', `
    <div><label class="fl">Nome</label><input id="f-nome" class="inp" value="${f ? esc(f.nome) : ''}" placeholder="Nome completo"></div>
    <div><label class="fl">Cargo (opcional)</label><input id="f-cargo" class="inp" value="${f ? esc(f.cargo || '') : ''}" placeholder="Ex.: Vendedor(a)"></div>
    <div>
      <label class="fl">Como é a escala</label>
      <div class="seg" id="seg-modo" style="width:100%">
        <button type="button" style="flex:1" class="${_fm.modo === 'auto' ? 'on' : ''}" onclick="fmModo('auto')"><i class="ti ti-refresh"></i> Rodízio automático</button>
        <button type="button" style="flex:1" class="${_fm.modo === 'manual' ? 'on' : ''}" onclick="fmModo('manual')"><i class="ti ti-calendar"></i> Dias fixos</button>
      </div>
    </div>

    <div id="fm-auto" class="${_fm.modo === 'auto' ? '' : 'hide'}" style="display:flex;flex-direction:column;gap:12px">
      <div><label class="fl">Modelo</label>
        <select id="r-modelo" class="inp" onchange="fmAtualiza()">
          ${Object.entries(EscalaAuto.MODELOS).map(([k, v]) => `<option value="${k}" ${r.modelo === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      <div class="row" style="gap:10px">
        <div style="flex:1"><label class="fl">Folga fixa</label><select id="r-fixa" class="inp" onchange="fmAtualiza()">${optDow(r.folgaFixa, [1, 2, 3, 4, 5, 6])}</select></div>
        <div style="flex:1" id="r-f2-box"><label class="fl">2ª folga (semana do domingo)</label><select id="r-f2" class="inp" onchange="fmAtualiza()">${optDow(r.folga2, [1, 2, 3, 4, 5, 6])}</select></div>
      </div>
      <div><label class="fl">Domingo de folga</label>
        <div class="seg" id="seg-dom" style="width:100%">
          <button type="button" style="flex:1" class="${r.grupoDom !== 'B' ? 'on' : ''}" onclick="fmDom('A')">Grupo A</button>
          <button type="button" style="flex:1" class="${r.grupoDom === 'B' ? 'on' : ''}" onclick="fmDom('B')">Grupo B</button>
        </div>
        <p class="mut" id="r-dom-hint" style="font-size:11.5px;margin:6px 0 0"></p></div>
      <div><label class="fl">Horário de segunda a sábado</label>
        <div class="row" style="gap:8px">
          <div style="flex:1"><span class="mut" style="font-size:11px">Entrada</span><input id="r-s-ini" class="inp" type="time" value="${r.sem.ini}" onchange="fmAtualiza()"></div>
          <div style="flex:1"><span class="mut" style="font-size:11px">Saída</span><input id="r-s-fim" class="inp" type="time" value="${r.sem.fim}" onchange="fmAtualiza()"></div>
          <div style="width:90px"><span class="mut" style="font-size:11px">Almoço (min)</span><input id="r-s-int" class="inp" type="number" min="0" step="5" value="${r.sem.interv}" onchange="fmAtualiza()"></div>
        </div></div>
      <div><label class="fl">Horário de domingo</label>
        <div class="row" style="gap:8px">
          <div style="flex:1"><span class="mut" style="font-size:11px">Entrada</span><input id="r-d-ini" class="inp" type="time" value="${r.dom.ini}" onchange="fmAtualiza()"></div>
          <div style="flex:1"><span class="mut" style="font-size:11px">Saída</span><input id="r-d-fim" class="inp" type="time" value="${r.dom.fim}" onchange="fmAtualiza()"></div>
          <div style="width:90px"><span class="mut" style="font-size:11px">Interv. (min)</span><input id="r-d-int" class="inp" type="number" min="0" step="5" value="${r.dom.interv}" onchange="fmAtualiza()"></div>
        </div></div>
      <div class="fm-prev" id="r-prev"></div>
      <p class="mut" style="font-size:11.5px;margin:0">O sistema gera as folgas de todos os meses sozinho. O horário de almoço de cada dia é escalonado pela loja (aba Escala) para nunca ficar ninguém sozinho no almoço de todos.</p>
    </div>

    <div id="fm-manual" class="${_fm.modo === 'manual' ? '' : 'hide'}">
      <label class="fl">Jornada padrão semanal</label>
      <div class="row" style="gap:8px;margin-bottom:10px">
        <div style="flex:1"><span class="mut" style="font-size:11px">Entrada</span><input id="p-ini" class="inp" type="time" value="${defShift(f, 'ini')}"></div>
        <div style="flex:1"><span class="mut" style="font-size:11px">Saída</span><input id="p-fim" class="inp" type="time" value="${defShift(f, 'fim')}"></div>
        <div style="width:90px"><span class="mut" style="font-size:11px">Interv.</span><input id="p-interv" class="inp" type="number" min="0" step="5" value="${defShift(f, 'interv')}"></div>
      </div>
      <div class="row" id="dow-row" style="gap:6px">
        ${DOW.map((d, i) => `<button type="button" class="btn sm ${_padrao[i] && _padrao[i].on ? 'p' : ''}" data-d="${i}" onclick="toggleDow(${i})" style="flex:1;min-width:40px">${d}</button>`).join('')}
      </div>
      <p class="mut" style="font-size:11.5px;margin:8px 0 0">Selecione os dias de trabalho. Dias específicos você ajusta depois na aba Escala.</p>
    </div>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: f ? 'Salvar' : 'Cadastrar', cls: 'p', fn: `saveFunc(${f ? `'${f.id}'` : 'null'})` }]);
  fmAtualiza();
}
function fmModo(m) {
  _fm.modo = m;
  document.querySelectorAll('#seg-modo button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'auto')));
  document.getElementById('fm-auto').classList.toggle('hide', m !== 'auto');
  document.getElementById('fm-manual').classList.toggle('hide', m !== 'manual');
}
function fmDom(g) {
  _fm.regra.grupoDom = g;
  document.querySelectorAll('#seg-dom button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (g === 'A')));
  fmAtualiza();
}
function fmLeRegra() {
  const v = id => document.getElementById(id).value;
  const r = _fm.regra;
  r.modelo = v('r-modelo'); r.folgaFixa = +v('r-fixa'); r.folga2 = +v('r-f2');
  r.sem = { ini: v('r-s-ini'), fim: v('r-s-fim'), interv: +v('r-s-int') || 0 };
  r.dom = { ini: v('r-d-ini'), fim: v('r-d-fim'), interv: +v('r-d-int') || 0 };
  return r;
}
function fmAtualiza() {
  if (!document.getElementById('r-modelo')) return;
  const r = fmLeRegra();
  const f2box = document.getElementById('r-f2-box');
  f2box.style.visibility = r.modelo === '5x2' ? 'visible' : 'hidden';
  const avisos = [];
  if (r.modelo === '5x2' && r.folga2 === r.folgaFixa) avisos.push('A 2ª folga precisa ser diferente da folga fixa.');
  const sem = dur({ on: true, ...r.sem }), dom = dur({ on: true, ...r.dom });
  const jSem = toMin(r.sem.fim) - toMin(r.sem.ini), jDom = toMin(r.dom.fim) - toMin(r.dom.ini);
  if (jSem > 360 && r.sem.interv < 60) avisos.push('Jornada acima de 6h pede intervalo de no mínimo 1h (CLT, art. 71).');
  if (jDom > 360 && r.dom.interv < 60) avisos.push('Domingo acima de 6h pede intervalo de no mínimo 1h.');
  else if (jDom > 240 && jDom <= 360 && r.dom.interv < 15) avisos.push('Domingo entre 4h e 6h pede intervalo de 15 min.');
  const fake = { id: '_prev', regra: r };
  const hoje = todayStr();
  const prox = EscalaAuto.proximasFolgas(fake, {}, hoje, 8);
  const domProx = prox.find(s => parseYmd(s).getDay() === 0);
  document.getElementById('r-dom-hint').textContent = domProx ? `Próximo domingo de folga: ${fmtDM(domProx)} (e depois a cada 2 semanas)` : '';
  const semanas = [0, 7].map(off => { const d0 = parseYmd(hoje); d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7) + off);
    let t = 0; for (let i = 0; i < 7; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); t += dur(EscalaAuto.regraDia(fake, ymd(d))); } return t; });
  document.getElementById('r-prev').innerHTML = `
    <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
      <span><i class="ti ti-calendar-off"></i> <b>Próximas folgas:</b> ${prox.map(fmtDM).join(' · ')}</span>
    </div>
    <div class="mut" style="font-size:12px;margin-top:4px">Horas por semana: ${fmtH(semanas[0])} e ${fmtH(semanas[1])} (alternando) · dia útil ${fmtH(sem)} · domingo ${fmtH(dom)}</div>
    ${avisos.map(a => `<div class="badge bd-am" style="margin-top:6px"><i class="ti ti-alert-triangle"></i> ${a}</div>`).join('')}`;
}
function toggleDow(i) {
  _padrao[i] = _padrao[i] && _padrao[i].on ? { on: false } : { on: true };
  document.querySelector(`#dow-row button[data-d="${i}"]`).classList.toggle('p', _padrao[i].on);
}
async function saveFunc(id) {
  const nome = document.getElementById('f-nome').value.trim();
  if (!nome) { toast('Informe o nome', 'warn'); return; }
  const cargo = document.getElementById('f-cargo').value.trim();
  let regra = null, padrao;
  if (_fm && _fm.modo === 'auto') {
    regra = fmLeRegra();
    if (regra.modelo !== '5x2') delete regra.folga2;
    else if (regra.folga2 === regra.folgaFixa) { toast('A 2ª folga precisa ser diferente da folga fixa', 'warn'); return; }
    padrao = [0, 1, 2, 3, 4, 5, 6].map(d => d === 0 ? { on: true, ...regra.dom } : d === regra.folgaFixa ? { on: false } : { on: true, ...regra.sem });
  } else {
    const ini = document.getElementById('p-ini').value, fim = document.getElementById('p-fim').value, interv = +document.getElementById('p-interv').value || 0;
    padrao = _padrao.map(d => d && d.on ? { on: true, ini, fim, interv } : { on: false });
  }
  const funcs = await getFuncs(State.loja.id);
  if (id) { const f = funcs.find(x => x.id === id); f.nome = nome; f.cargo = cargo; f.padrao = padrao; if (regra) f.regra = regra; else delete f.regra; }
  else { const nf = { id: 'f' + Date.now().toString(36), nome, cargo, padrao }; if (regra) nf.regra = regra; funcs.push(nf); }
  await setFuncs(State.loja.id, funcs);
  closeModal(); if (State.tab === 'escala') renderEscala(); else renderFunc();
  toast(id ? 'Funcionário atualizado' : 'Funcionário cadastrado', 'ok');
}
async function delFunc(id) {
  if (!confirm('Remover este funcionário? Os registros já lançados são mantidos.')) return;
  let funcs = await getFuncs(State.loja.id);
  funcs = funcs.filter(f => f.id !== id);
  await setFuncs(State.loja.id, funcs);
  renderFunc(); toast('Funcionário removido', 'ok');
}

/* ============================================================
   TAB: OCORRÊNCIAS
============================================================ */
/* varre o mês e abre uma ocorrência para cada dia com problema (sem duplicar) */
async function scanOcorrencias() {
  const mk = monthKey(new Date());
  const funcs = await getFuncs(State.loja.id);
  const escMes = await getEsc(State.loja.id, mk);
  const regs = await getRegs(State.loja.id, mk);
  let ocs = await getOcor(State.loja.id);
  const today = todayStr();
  const [Y, M] = mk.split('-').map(Number);
  const days = new Date(Y, M, 0).getDate();
  const temOcor = new Set(ocs.filter(o => o.data).map(o => o.funcId + '|' + o.data));
  let changed = false;
  for (const f of funcs) {
    const ativoNoMes = regs.some(r => r.funcId === f.id && r.data.slice(0, 7) === mk);
    if (!ativoNoMes) continue;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${mk}-${String(d).padStart(2, '0')}`;
      if (dateStr > today) break;
      const temSaida = regs.some(r => r.funcId === f.id && r.data === dateStr && r.tipo === 'saida');
      const avaliavel = dateStr < today || temSaida;
      if (!avaliavel) continue;
      const c = computeDia(f, escMes, regs, dateStr);
      const problema = c.status === 'falta' || (c.status === 'problema' && c.issues.length);
      if (!problema) continue;
      const key = f.id + '|' + dateStr;
      if (temOcor.has(key)) continue;
      ocs.push({ id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        funcId: f.id, data: dateStr, auto: true, status: 'aberta',
        tipo: c.issues[0] || 'Pendência de ponto', problemas: c.issues, criadoEm: Date.now() });
      temOcor.add(key); changed = true;
    }
  }
  if (changed) await setOcor(State.loja.id, ocs);
  return ocs;
}
function badgeStatus(s) {
  return s === 'respondida'
    ? '<span class="badge bd-gr"><i class="ti ti-check"></i> Respondida</span>'
    : '<span class="badge bd-rd"><i class="ti ti-alert-triangle"></i> Aberta</span>';
}
async function renderOcor() {
  const funcs = await getFuncs(State.loja.id);
  let ocs;
  try { ocs = await scanOcorrencias(); } catch (e) { ocs = await getOcor(State.loja.id); }
  ocs = ocs.slice().sort((a, b) => (a.status === 'aberta' ? 0 : 1) - (b.status === 'aberta' ? 0 : 1) || (b.criadoEm || 0) - (a.criadoEm || 0));
  const totalAbertas = ocs.filter(o => o.status !== 'respondida').length;
  const ft = State.ocorFiltro;
  const lista = ocs.filter(o =>
    (ft.status === 'todas' || (ft.status === 'aberta' ? o.status !== 'respondida' : o.status === 'respondida')) &&
    (ft.func === 'todos' || o.funcId === ft.func));
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Ocorrências de ponto</h2><p>${totalAbertas ? `<b style="color:var(--rd)">${totalAbertas} aberta(s)</b> aguardando justificativa.` : 'Tudo justificado.'}</p></div>
      <div class="row"><button class="btn p" onclick="novaOcor()" ${funcs.length ? '' : 'disabled'}><i class="ti ti-file-plus"></i> Nova ocorrência</button></div></div>
    <div class="row" style="gap:10px;margin-bottom:14px">
      <div class="seg">
        <button class="${ft.status === 'todas' ? 'on' : ''}" onclick="setOcorFiltro('status','todas')">Todas</button>
        <button class="${ft.status === 'aberta' ? 'on' : ''}" onclick="setOcorFiltro('status','aberta')">Abertas</button>
        <button class="${ft.status === 'respondida' ? 'on' : ''}" onclick="setOcorFiltro('status','respondida')">Respondidas</button>
      </div>
      <select class="inp" style="width:auto" onchange="setOcorFiltro('func',this.value)">
        <option value="todos" ${ft.func === 'todos' ? 'selected' : ''}>Todos os funcionários</option>
        ${funcs.map(f => `<option value="${f.id}" ${ft.func === f.id ? 'selected' : ''}>${escapeOpt(f.nome)}</option>`).join('')}
      </select>
      <span class="mut" style="font-size:12.5px;align-self:center">${lista.length} ocorrência(s)</span>
    </div>
    <div class="card">
      ${lista.length ? `<table class="tbl"><thead><tr><th>Data</th><th>Funcionário</th><th>Problema</th><th>Status</th><th></th></tr></thead><tbody>
        ${lista.map(o => { const f = funcs.find(x => x.id === o.funcId);
          const probl = (o.problemas && o.problemas.length) ? o.problemas.join(' · ') : (o.motivo || o.tipo || '—');
          return `<tr>
            <td class="mono">${o.data ? o.data.split('-').reverse().join('/') : '—'}</td>
            <td><b>${f ? esc(f.nome) : '—'}</b></td>
            <td class="mut" style="max-width:300px">${esc(probl)}${o.anexo ? ` <i class="ti ti-paperclip" title="${esc(o.anexo.nome)}" style="color:var(--bl)"></i>` : ''}</td>
            <td>${badgeStatus(o.status)}</td>
            <td style="text-align:right;white-space:nowrap">
              ${o.status === 'respondida'
                ? `<button class="btn sm" onclick="responderOcor('${o.id}')"><i class="ti ti-eye"></i> Ver</button>`
                : `<button class="btn sm p" onclick="responderOcor('${o.id}')"><i class="ti ti-message-2-check"></i> Justificar</button>`}
              <button class="btn sm" onclick="printOcor('${o.id}')"><i class="ti ti-printer"></i></button>
              <button class="btn sm dgr" onclick="delOcor('${o.id}')"><i class="ti ti-trash"></i></button>
            </td></tr>`; }).join('')}
      </tbody></table>` : `<div class="empty"><i class="ti ti-checks"></i>${ocs.length ? 'Nenhuma ocorrência com esse filtro.' : 'Nenhuma ocorrência. Quando um ponto ficar fora do previsto, ela aparece aqui sozinha.'}</div>`}
    </div>`;
}
function setOcorFiltro(key, val) { State.ocorFiltro[key] = val; renderOcor(); }
async function responderOcor(id) {
  const ocs = await getOcor(State.loja.id);
  const o = ocs.find(x => x.id === id); if (!o) return;
  const funcs = await getFuncs(State.loja.id);
  const f = funcs.find(x => x.id === o.funcId);
  const probl = (o.problemas && o.problemas.length) ? o.problemas.join(' · ') : (o.motivo || o.tipo || '—');
  openModal(o.status === 'respondida' ? 'Ocorrência respondida' : 'Justificar ocorrência', `
    <div class="grid" style="gap:8px">
      <div class="row" style="justify-content:space-between"><b>${esc(f ? f.nome : '—')}</b><span class="mono mut">${o.data ? o.data.split('-').reverse().join('/') : ''}</span></div>
      <div class="aviso-box" style="background:var(--am-soft);border-color:#f0dcb0;color:#7a4f00;font-size:13px">${esc(probl)}</div>
    </div>
    <div><label class="fl">Tipo de justificativa</label><select id="r-tipo" class="inp">${OCOR_TIPOS.map(t => `<option ${o.tipoJustif === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label class="fl">Justificativa</label><textarea id="r-just" class="inp" rows="3" placeholder="Ex.: apresentou atestado médico de 1 dia.">${esc(o.justificativa || '')}</textarea></div>
    <div><label class="fl">Anexar documento (atestado, foto ou PDF — opcional)</label><input id="r-file" class="inp" type="file" accept="image/*,application/pdf"></div>
    ${o.anexo ? `<div class="mut" style="font-size:12.5px"><i class="ti ti-paperclip" style="vertical-align:-2px"></i> Anexo: <a href="/api/anexo/${o.anexo.arquivo}?t=${encodeURIComponent(SESS.token)}" target="_blank" style="color:var(--bl)">${esc(o.anexo.nome)}</a></div>` : ''}`,
    [{ lbl: 'Fechar', cls: '', fn: 'closeModal()' },
     { lbl: o.status === 'respondida' ? 'Atualizar' : 'Marcar como respondida', cls: 'g', fn: `salvarResposta('${id}')` }]);
}
async function salvarResposta(id) {
  const just = document.getElementById('r-just').value.trim();
  const tipoJ = document.getElementById('r-tipo').value;
  const fileInput = document.getElementById('r-file');
  if (!just) { toast('Escreva a justificativa', 'warn'); return; }
  try {
    let anexo = null;
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const fd = new FormData(); fd.append('ocorId', id); fd.append('arquivo', fileInput.files[0]);
      const up = await fetch('/api/ocor/anexo', { method: 'POST', headers: { 'x-token': SESS.token }, body: fd }).then(x => x.json());
      if (up.ok) anexo = up.anexo; else throw new Error(up.error || 'falha no anexo');
    }
    const ocs = await getOcor(State.loja.id);
    const o = ocs.find(x => x.id === id);
    if (o) { o.justificativa = just; o.tipoJustif = tipoJ; if (anexo) o.anexo = anexo; o.status = 'respondida'; o.respondidoEm = Date.now(); }
    await setOcor(State.loja.id, ocs);
    closeModal(); renderOcor(); toast('Ocorrência respondida', 'ok');
  } catch (e) { toast('Erro ao responder: ' + e.message, 'err'); }
}
async function novaOcor() {
  const funcs = await getFuncs(State.loja.id);
  openModal('Nova ocorrência', `
    <div><label class="fl">Funcionário</label><select id="o-func" class="inp">${funcs.map(f => `<option value="${f.id}">${escapeOpt(f.nome)}</option>`).join('')}</select></div>
    <div class="row" style="gap:12px">
      <div style="flex:1"><label class="fl">Data</label><input id="o-data" class="inp" type="date" value="${todayStr()}"></div>
      <div style="flex:1"><label class="fl">Tipo</label><select id="o-tipo" class="inp">${OCOR_TIPOS.map(t => `<option>${t}</option>`).join('')}</select></div>
    </div>
    <div><label class="fl">Motivo</label><input id="o-motivo" class="inp" placeholder="Ex.: troca de turno combinada, abono…"></div>
    <div><label class="fl">Observações</label><textarea id="o-obs" class="inp" rows="2" placeholder="Detalhes adicionais"></textarea></div>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: 'Salvar ocorrência', cls: 'p', fn: 'saveOcor()' }]);
}
async function saveOcor() {
  const o = { id: 'o' + Date.now().toString(36), funcId: document.getElementById('o-func').value,
    data: document.getElementById('o-data').value, tipo: document.getElementById('o-tipo').value,
    motivo: document.getElementById('o-motivo').value.trim(), obs: document.getElementById('o-obs').value.trim(),
    auto: false, status: 'aberta', criadoEm: Date.now() };
  const ocs = await getOcor(State.loja.id); ocs.push(o); await setOcor(State.loja.id, ocs);
  closeModal(); renderOcor(); toast('Ocorrência registrada', 'ok');
}
async function delOcor(id) {
  if (!confirm('Remover esta ocorrência?')) return;
  let ocs = await getOcor(State.loja.id); ocs = ocs.filter(o => o.id !== id); await setOcor(State.loja.id, ocs);
  renderOcor(); toast('Ocorrência removida', 'ok');
}
async function printOcor(id) {
  const funcs = await getFuncs(State.loja.id);
  const o = (await getOcor(State.loja.id)).find(x => x.id === id);
  const f = funcs.find(x => x.id === o.funcId);
  const probl = (o.problemas && o.problemas.length) ? o.problemas.join(' · ') : (o.motivo || o.tipo || '—');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Ocorrência de Ponto</title><meta charset="utf-8">
  <style>body{font-family:Arial,sans-serif;color:#0F1C2E;max-width:720px;margin:30px auto;padding:0 24px}
  h1{font-size:18px;border-bottom:2px solid #2B59D6;padding-bottom:10px}.r{display:flex;gap:24px;margin:10px 0}
  .fld{flex:1}.fld span{display:block;font-size:11px;color:#7A8AA0;text-transform:uppercase;letter-spacing:.05em}
  .fld b{font-size:15px}.box{border:1px solid #E6EAF1;border-radius:8px;padding:12px;margin-top:6px;min-height:46px}
  .st{font-weight:bold}.sign{display:flex;gap:40px;margin-top:60px}.sign div{flex:1;text-align:center;border-top:1px solid #333;padding-top:6px;font-size:12px}</style></head><body>
  <h1>Formulário de Ocorrência de Ponto</h1>
  <div class="r"><div class="fld"><span>Loja</span><b>${esc(State.loja.nome)}</b></div><div class="fld"><span>Data</span><b>${o.data ? o.data.split('-').reverse().join('/') : '—'}</b></div></div>
  <div class="r"><div class="fld"><span>Funcionário</span><b>${esc(f ? f.nome : '—')}</b></div><div class="fld"><span>Cargo</span><b>${esc(f && f.cargo || '—')}</b></div></div>
  <div class="r"><div class="fld"><span>Situação</span><b>${esc(o.tipo || '—')}</b></div><div class="fld"><span>Status</span><b class="st">${o.status === 'respondida' ? 'Respondida' : 'Aberta'}</b></div></div>
  <div><span style="font-size:11px;color:#7A8AA0;text-transform:uppercase">Problema apontado</span><div class="box">${esc(probl)}</div></div>
  <div style="margin-top:14px"><span style="font-size:11px;color:#7A8AA0;text-transform:uppercase">Justificativa${o.tipoJustif ? ' (' + esc(o.tipoJustif) + ')' : ''}</span><div class="box">${esc(o.justificativa || '')}</div></div>
  ${o.anexo ? `<p style="font-size:12px;margin-top:8px">Documento anexado: ${esc(o.anexo.nome)}</p>` : ''}
  <div class="sign"><div>Assinatura do funcionário</div><div>Assinatura do gerente</div></div>
  <p style="text-align:center;color:#7A8AA0;font-size:11px;margin-top:40px">Grupo Shalom · gerado em ${new Date().toLocaleString('pt-BR')}</p>
  <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   TAB: RELATÓRIOS
============================================================ */
async function renderRel() {
  const funcs = await getFuncs(State.loja.id);
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Relatórios</h2><p>Previsto x realizado, faltas e ocorrências.</p></div>
      <div class="row noprint">
        <div class="seg"><button class="${State.repMode !== 'loja' ? 'on' : ''}" onclick="State.repMode='func';renderRel()">Por funcionário</button>
        <button class="${State.repMode === 'loja' ? 'on' : ''}" onclick="State.repMode='loja';renderRel()">Por loja</button></div>
        <button class="btn sm" onclick="shiftRep(-1)"><i class="ti ti-chevron-left"></i></button>
        <div style="font-weight:700;min-width:130px;text-align:center">${capWord(State.repMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</div>
        <button class="btn sm" onclick="shiftRep(1)"><i class="ti ti-chevron-right"></i></button>
        <button class="btn sm" onclick="window.print()"><i class="ti ti-printer"></i> Imprimir</button>
      </div></div>
    <div id="rel-body"><div class="card"><div class="empty"><i class="ti ti-loader"></i>Carregando…</div></div></div>`;
  if (State.repMode === 'loja') await relLoja(funcs); else await relFunc(funcs);
}
function shiftRep(n) { State.repMonth = new Date(State.repMonth.getFullYear(), State.repMonth.getMonth() + n, 1); renderRel(); }
function realDoDia(rday) {
  const ent = rday.find(r => r.tipo === 'entrada'), sai = rday.find(r => r.tipo === 'saida');
  if (!ent || !sai) return 0;
  const pa = rday.find(r => r.tipo === 'pausa'), vo = rday.find(r => r.tipo === 'volta');
  let real = (sai.ts - ent.ts) / 60000; if (pa && vo) real -= (vo.ts - pa.ts) / 60000;
  return Math.max(0, Math.round(real));
}
/* resumo de um dia: previsto, trabalhado (sem pausa), extras, status */
function computeDia(func, escMes, regs, dateStr) {
  const p = planoDia(func, escMes, dateStr);
  const rday = regs.filter(r => r.funcId === func.id && r.data === dateStr).sort((a, b) => a.ts - b.ts);
  const ent = rday.find(r => r.tipo === 'entrada'), pausa = rday.find(r => r.tipo === 'pausa'),
        volta = rday.find(r => r.tipo === 'volta'), sai = rday.find(r => r.tipo === 'saida');
  const prev = dur(p), trab = realDoDia(rday);
  const TOL = 5; // minutos de tolerância
  const issues = []; let extra = 0, falta = false, status;
  if (!p.on) {
    status = (ent || sai) ? 'extra' : 'folga';
    if (ent && sai) extra = trab;
  } else if (!ent && !sai) {
    status = 'falta'; falta = true; issues.push('Falta');
  } else {
    if (!ent) issues.push('Sem entrada');
    if (!sai) issues.push('Sem saída');
    // horas a menos (só dá pra medir com entrada e saída)
    if (ent && sai) {
      const def = prev - trab;
      if (def > TOL) issues.push('Horas a menos (' + fmtMin(def) + ')');
      else if (trab - prev > TOL) extra = trab - prev;
    }
    // pausa de refeição
    if ((p.interv || 0) > 0) {
      if (!pausa && !volta) issues.push('Pausa não registrada');
      else if (pausa && !volta) issues.push('Pausa em aberto');
      else if (pausa && volta) {
        const pr = Math.round((volta.ts - pausa.ts) / 60000);
        if (pr < p.interv - TOL) issues.push('Pausa curta (' + fmtMin(pr) + ' de ' + fmtMin(p.interv) + ')');
      }
    }
    status = issues.length ? 'problema' : 'ok';
  }
  const ok = status === 'ok';
  return { p, ent, pausa, volta, sai, prev, trab, extra, falta, issues, ok, status };
}
function renderStatus(c) {
  if (c.status === 'folga') return '<span class="badge bd-gy">Folga</span>';
  if (c.status === 'extra') return '<span class="badge bd-bl">Extra (folga)</span>';
  if (c.ok) return '<span class="badge bd-gr">OK</span>';
  return c.issues.map(i => `<span class="badge ${/^(Falta|Sem )/.test(i) ? 'bd-rd' : 'bd-am'}">${i}</span>`).join(' ');
}
async function relFunc(funcs) {
  if (!funcs.length) { document.getElementById('rel-body').innerHTML = emptyCard('Sem funcionários.'); return; }
  if (!State.repFunc || !funcs.find(f => f.id === State.repFunc)) State.repFunc = funcs[0].id;
  const func = funcs.find(f => f.id === State.repFunc);
  const mk = monthKey(State.repMonth);
  const escMes = await getEsc(State.loja.id, mk);
  const regs = await getRegs(State.loja.id, mk);
  const y = State.repMonth.getFullYear(), m = State.repMonth.getMonth(), days = new Date(y, m + 1, 0).getDate();
  let prevTot = 0, trabTot = 0, extraTot = 0, faltas = 0, rows = '';
  const fh = d => d ? d.hora : '—';
  for (let d = 1; d <= days; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const c = computeDia(func, escMes, regs, dateStr);
    prevTot += c.prev; trabTot += c.trab; extraTot += c.extra; if (c.falta) faltas++;
    if (!c.p.on && !c.ent) continue;
    rows += `<tr><td class="mono">${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')} ${DOW[parseYmd(dateStr).getDay()]}</td>
      <td class="mono">${c.p.on ? c.p.ini + '–' + c.p.fim : '—'}</td>
      <td class="mono">${fh(c.ent)}</td><td class="mono mut">${fh(c.pausa)}</td><td class="mono mut">${fh(c.volta)}</td><td class="mono">${fh(c.sai)}</td>
      <td class="mono">${c.trab ? fmtMin(c.trab) : '—'}</td>
      <td class="mono" style="color:${c.extra ? 'var(--bl)' : 'var(--mut)'}">${c.extra ? fmtMin(c.extra) : '—'}</td>
      <td>${renderStatus(c)}</td></tr>`;
  }
  const meta = State.cfg.metaHoras * 60;
  document.getElementById('rel-body').innerHTML = `
    <div class="row noprint" style="margin-bottom:14px;justify-content:space-between">
      <select class="inp" style="width:auto" onchange="State.repFunc=this.value;renderRel()">
        ${funcs.map(f => `<option value="${f.id}" ${f.id === State.repFunc ? 'selected' : ''}>${escapeOpt(f.nome)}</option>`).join('')}</select>
      <button class="btn p sm" onclick="gerarFolhaFunc('${func.id}')"><i class="ti ti-file-text"></i> Folha de ponto (assinatura)</button>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px">
      ${kpi('Previsto', fmtH(prevTot), prevTot >= meta ? 'gr' : 'am')}
      ${kpi('Trabalhado', fmtH(trabTot), 'ink')}
      ${kpi('Horas extras', fmtH(extraTot), extraTot ? 'bl' : 'mut')}
      ${kpi('Faltas', faltas, faltas ? 'rd' : 'gr')}
    </div>
    <div class="card" style="overflow-x:auto"><div class="cpad" style="border-bottom:1px solid var(--line2)"><b>${esc(func.nome)}</b> <span class="mut">· ${esc(func.cargo || '')}</span></div>
    <table class="tbl"><thead><tr><th>Dia</th><th>Turno</th><th>Entrada</th><th>Pausa</th><th>Retorno</th><th>Saída</th><th>Trab.</th><th>Extra</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="9" class="empty">Sem registros neste mês.</td></tr>`}</tbody></table></div>`;
}
async function relLoja(funcs) {
  const mk = monthKey(State.repMonth);
  const escMes = await getEsc(State.loja.id, mk);
  const regs = await getRegs(State.loja.id, mk);
  const ocs = await getOcor(State.loja.id);
  const y = State.repMonth.getFullYear(), m = State.repMonth.getMonth(), days = new Date(y, m + 1, 0).getDate();
  const meta = State.cfg.metaHoras * 60;
  let rows = '', totPrev = 0, totTrab = 0, totExtra = 0, totFalt = 0;
  for (const func of funcs) {
    let prev = 0, trab = 0, extra = 0, falt = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const c = computeDia(func, escMes, regs, dateStr);
      prev += c.prev; trab += c.trab; extra += c.extra; if (c.falta) falt++;
    }
    const noc = ocs.filter(o => o.funcId === func.id && o.data.startsWith(mk)).length;
    totPrev += prev; totTrab += trab; totExtra += extra; totFalt += falt;
    rows += `<tr><td><div class="row" style="gap:8px"><div class="ava" style="background:${avColor(func.nome)};width:30px;height:30px;border-radius:8px;font-size:11px">${initials(func.nome)}</div><b>${esc(func.nome)}</b></div></td>
      <td class="mono">${fmtH(prev)}</td><td class="mono">${fmtH(trab)}</td>
      <td class="mono" style="color:${extra ? 'var(--bl)' : 'var(--mut)'}">${extra ? fmtH(extra) : '—'}</td>
      <td>${falt ? `<span class="badge bd-rd">${falt}</span>` : '<span class="mut">0</span>'}</td>
      <td>${noc ? `<span class="badge bd-gy">${noc}</span>` : '<span class="mut">0</span>'}</td></tr>`;
  }
  document.getElementById('rel-body').innerHTML = `
    <div class="row noprint" style="margin-bottom:14px;justify-content:flex-end">
      <button class="btn p sm" onclick="gerarFolhaLoja()"><i class="ti ti-files"></i> Folhas de ponto da loja (todos)</button>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px">
      ${kpi('Funcionários', funcs.length, 'ink')}
      ${kpi('Previsto', fmtH(totPrev), 'gr')}
      ${kpi('Trabalhado', fmtH(totTrab), 'ink')}
      ${kpi('Horas extras', fmtH(totExtra), totExtra ? 'bl' : 'mut')}
      ${kpi('Faltas', totFalt, totFalt ? 'rd' : 'gr')}
    </div>
    <div class="card" style="overflow-x:auto"><div class="cpad" style="border-bottom:1px solid var(--line2)"><b>${esc(State.loja.nome)}</b> <span class="mut">· ${capWord(State.repMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</span></div>
    <table class="tbl"><thead><tr><th>Funcionário</th><th>Previsto</th><th>Trabalhado</th><th>Extras</th><th>Faltas</th><th>Ocorr.</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="empty">Sem funcionários.</td></tr>`}</tbody></table></div>`;
}
function kpi(lbl, val, c) { return `<div class="card cpad"><div class="lbl mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">${lbl}</div><div class="mono" style="font-size:24px;font-weight:700;color:var(--${c})">${val}</div></div>`; }
function emptyCard(t) { return `<div class="card"><div class="empty"><i class="ti ti-mood-empty"></i>${t}</div></div>`; }

/* ---------- Folha de ponto (impressão / PDF com assinatura) ---------- */
const FOLHA_CSS = `@page{size:A4;margin:8mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#0F1C2E;margin:0;font-size:11px}
.fp{margin:0 auto}.fp + .fp{page-break-before:always}
.fhead{display:flex;justify-content:space-between;border-bottom:2px solid #2B59D6;padding-bottom:6px;margin-bottom:7px}
.fhead h1{font-size:15px;margin:0}.sub{font-size:10px;color:#5b6b82;margin-top:1px}
.meta{display:flex;gap:26px;margin:7px 0 8px}.meta span{display:block;font-size:8px;color:#7A8AA0;text-transform:uppercase;letter-spacing:.05em}.meta b{font-size:12px}
.ft{width:100%;border-collapse:collapse}
.ft th{background:#f1f4f9;font-size:8px;text-transform:uppercase;letter-spacing:.02em;color:#5b6b82;padding:3px 5px;border:1px solid #e0e6ef;text-align:left}
.ft td{padding:1.5px 5px;border:1px solid #e9edf3;font-variant-numeric:tabular-nums;line-height:1.15}
.ft tr.folga td{color:#9aa7ba}.ft tr.falta td{background:#fdeceb}.ft td.st{font-size:9px;font-weight:bold}
.ft tfoot td{font-weight:bold;background:#f7f9fc;border:1px solid #e0e6ef;padding:4px 5px}
.sign{display:flex;gap:50px;margin-top:24px}.sign div{flex:1;text-align:center;border-top:1px solid #333;padding-top:5px;font-size:10px}`;

function folhaHTML(func, escMes, regs, monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth(), days = new Date(y, m + 1, 0).getDate();
  const mesNome = capWord(monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const hh = d => d ? d.hora : '';
  let prevTot = 0, trabTot = 0, extraTot = 0, faltas = 0, rows = '';
  for (let d = 1; d <= days; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const c = computeDia(func, escMes, regs, dateStr);
    prevTot += c.prev; trabTot += c.trab; extraTot += c.extra; if (c.falta) faltas++;
    const obs = c.status === 'folga' ? 'Folga' : c.status === 'extra' ? 'Extra' : c.ok ? '' : c.issues.join(' · ');
    rows += `<tr class="${c.falta ? 'falta' : ''} ${!c.p.on ? 'folga' : ''}">
      <td>${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}</td><td>${DOW[parseYmd(dateStr).getDay()]}</td>
      <td>${c.p.on ? c.p.ini + '-' + c.p.fim : '—'}</td><td>${hh(c.ent)}</td><td>${hh(c.pausa)}</td><td>${hh(c.volta)}</td><td>${hh(c.sai)}</td>
      <td>${c.trab ? fmtMin(c.trab) : ''}</td><td>${c.extra ? fmtMin(c.extra) : ''}</td><td class="st">${obs}</td></tr>`;
  }
  const saldo = trabTot - prevTot;
  return `<div class="fp">
    <div class="fhead"><div><h1>Folha de Ponto</h1><div class="sub">Grupo Shalom · ${esc(State.loja.nome)}</div></div>
      <div style="text-align:right"><div class="sub">${mesNome}</div></div></div>
    <div class="meta">
      <div><span>Funcionário</span><b>${esc(func.nome)}</b></div>
      <div><span>Cargo</span><b>${esc(func.cargo || '—')}</b></div>
      <div><span>Meta mensal</span><b>${State.cfg.metaHoras}h</b></div></div>
    <table class="ft"><thead><tr><th>Dia</th><th>Sem.</th><th>Turno</th><th>Entrada</th><th>Pausa</th><th>Retorno</th><th>Saída</th><th>Trab.</th><th>Extra</th><th>Obs.</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="7">Totais — Trabalhadas / Extras / Faltas</td><td>${fmtH(trabTot)}</td><td>${fmtH(extraTot)}</td><td>${faltas}</td></tr>
        <tr><td colspan="10">Previsto no mês: ${fmtH(prevTot)} &nbsp;·&nbsp; Saldo: ${saldo >= 0 ? '+' : '−'}${fmtH(Math.abs(saldo))} ${saldo >= 0 ? '(crédito)' : '(a compensar)'}</td></tr>
      </tfoot></table>
    <p style="font-size:10px;color:#7A8AA0;margin-top:8px">A pausa de refeição (Pausa → Retorno) não é contada nas horas trabalhadas.</p>
    <div class="sign"><div>Assinatura do funcionário</div><div>Assinatura do gerente</div></div>
  </div>`;
}
function abrirImpressao(corpo) {
  const w = window.open('', '_blank');
  if (!w) { toast('Permita pop-ups no navegador para gerar a folha', 'warn'); return; }
  w.document.write(`<html><head><meta charset="utf-8"><title>Folha de Ponto</title><style>${FOLHA_CSS}</style></head><body>${corpo}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
async function gerarFolhaFunc(funcId) {
  try {
    const funcs = await getFuncs(State.loja.id);
    const func = funcs.find(f => f.id === funcId);
    const mk = monthKey(State.repMonth);
    const escMes = await getEsc(State.loja.id, mk), regs = await getRegs(State.loja.id, mk);
    abrirImpressao(folhaHTML(func, escMes, regs, State.repMonth));
  } catch (e) { toast('Erro ao gerar folha: ' + e.message, 'err'); }
}
async function gerarFolhaLoja() {
  try {
    const funcs = await getFuncs(State.loja.id);
    if (!funcs.length) { toast('Sem funcionários', 'warn'); return; }
    const mk = monthKey(State.repMonth);
    const escMes = await getEsc(State.loja.id, mk), regs = await getRegs(State.loja.id, mk);
    abrirImpressao(funcs.map(f => folhaHTML(f, escMes, regs, State.repMonth)).join(''));
  } catch (e) { toast('Erro ao gerar folhas: ' + e.message, 'err'); }
}

/* ============================================================
   TAB: CONFIG
============================================================ */
async function renderCfg() {
  const c = State.cfg;
  let senhas = { senha: '', senhaFunc: '' };
  try { senhas = await api('GET', '/api/config'); } catch (e) {}
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Configurações</h2><p>Ajustes gerais e senhas de acesso da loja.</p></div></div>
    <div class="card cpad grid" style="max-width:560px;gap:16px">
      <div class="row" style="gap:12px">
        <div style="flex:1"><label class="fl">Meta de horas / mês</label><input id="c-meta" class="inp" type="number" value="${c.metaHoras}"></div>
        <div style="flex:1"><label class="fl">Tolerância (min)</label><input id="c-tol" class="inp" type="number" value="${c.tolerancia}"></div>
        <div style="flex:1"><label class="fl">Intervalo padrão</label><input id="c-int" class="inp" type="number" value="${c.intervaloPadrao}"></div>
      </div>
      <div style="border-top:1px solid var(--line2);padding-top:14px">
        <h3 style="font-size:14px;margin-bottom:10px"><i class="ti ti-key" style="color:var(--bl);vertical-align:-2px"></i> Senhas de acesso desta loja</h3>
        <div class="row" style="gap:12px">
          <div style="flex:1"><label class="fl">Funcionários (só registra ponto)</label><input id="c-senhaf" class="inp" type="text" value="${esc(senhas.senhaFunc || '')}"></div>
          <div style="flex:1"><label class="fl">Gerente (acesso total)</label><input id="c-senha" class="inp" type="text" value="${esc(senhas.senha || '')}"></div>
        </div>
        <p class="mut" style="font-size:11.5px;margin:8px 0 0">A senha dos funcionários abre apenas a tela de registro. A do gerente dá acesso a escala, relatórios, comunicado e configurações.</p>
      </div>
      <div><button class="btn p" onclick="saveCfg()"><i class="ti ti-device-floppy"></i> Salvar configurações</button></div>
    </div>`;
}
async function saveCfg() {
  const meta = +document.getElementById('c-meta').value || 180;
  const tol = +document.getElementById('c-tol').value || 0;
  const intv = +document.getElementById('c-int').value || 0;
  const senha = document.getElementById('c-senha').value.trim();
  const senhaFunc = document.getElementById('c-senhaf').value.trim();
  try {
    await api('PUT', '/api/config', { metaHoras: meta, tolerancia: tol, intervaloPadrao: intv });
    if (senha || senhaFunc) await api('PUT', '/api/loja/senha', { senha, senhaFunc });
    State.cfg.metaHoras = meta; State.cfg.tolerancia = tol; State.cfg.intervaloPadrao = intv;
    SESS.config = State.cfg; saveSess();
    toast('Configurações salvas', 'ok');
  } catch (e) { toast('Erro ao salvar: ' + e.message, 'err'); }
}

/* ============================================================
   MODAL
============================================================ */
function openModal(title, body, actions) {
  document.getElementById('modal-root').innerHTML = `<div class="ovl" onclick="if(event.target===this)closeModal()">
    <div class="modal"><div class="m-head"><h3>${title}</h3><button class="iconbtn" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
    <div class="m-body">${body}</div>
    <div class="m-foot">${actions.map(a => `<button class="btn ${a.cls}" onclick="${a.fn}">${a.lbl}</button>`).join('')}</div></div></div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
function noFuncs(msg) {
  document.getElementById('page').innerHTML = `<div class="ph"><div><h2>${TABS.find(t => t.k === State.tab).lbl}</h2></div></div><div class="card"><div class="empty"><i class="ti ti-users"></i>${msg}</div></div>`;
}

/* ============================================================
   BOOT
============================================================ */
bootLogin();
tickClocks();
if (SESS && SESS.token) enterApp();
