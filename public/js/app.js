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
const getFuncs = async (lj) => (await api('GET', `/api/data/func:${lj}`)) || [];
const setFuncs = (lj, v) => api('PUT', `/api/data/func:${lj}`, v);
const getEsc = async (lj, mk) => (await api('GET', `/api/data/escala:${lj}:${mk}`)) || {};
const setEsc = (lj, mk, v) => api('PUT', `/api/data/escala:${lj}:${mk}`, v);
const getRegs = async (lj, mk) => (await api('GET', `/api/data/reg:${lj}:${mk}`)) || [];
const getOcor = async (lj) => (await api('GET', `/api/data/ocor:${lj}`)) || [];
const setOcor = (lj, v) => api('PUT', `/api/data/ocor:${lj}`, v);
const getAviso = async (lj) => { const r = await api('GET', `/api/data/aviso:${lj}`); return (r && r.texto) || ''; };
const setAviso = (lj, texto) => api('PUT', `/api/data/aviso:${lj}`, { texto });

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
const State = { loja: null, role: 'gerente', cfg: null, tab: 'ponto',
  calMonth: new Date(), calFunc: null, repMonth: new Date(), repFunc: null, repMode: 'func' };

function planoDia(func, escMes, dateStr) {
  if (escMes && escMes[func.id] && escMes[func.id][dateStr]) return escMes[func.id][dateStr];
  const dow = parseYmd(dateStr).getDay();
  return (func.padrao && func.padrao[dow]) ? func.padrao[dow] : { on: false };
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
  if (!State.calFunc || !funcs.find(f => f.id === State.calFunc)) State.calFunc = funcs[0].id;
  const mk = monthKey(State.calMonth);
  const escMes = await getEsc(State.loja.id, mk);
  const func = funcs.find(f => f.id === State.calFunc);
  const total = mesPrevisto(func, escMes, State.calMonth);
  const meta = State.cfg.metaHoras * 60;
  const ok = total >= meta;

  document.getElementById('page').innerHTML = `
    <div class="ph">
      <div><h2>Escala mensal</h2><p>Programe os turnos. Clique num dia para ajustar. As horas previstas são somadas automaticamente.</p></div>
      <div class="row">
        <select class="inp" style="width:auto" onchange="State.calFunc=this.value;renderEscala()">
          ${funcs.map(f => `<option value="${f.id}" ${f.id === State.calFunc ? 'selected' : ''}>${escapeOpt(f.nome)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card cpad" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <button class="btn sm" onclick="shiftMonth(-1)"><i class="ti ti-chevron-left"></i></button>
          <div style="font-weight:700;font-size:15px;min-width:150px;text-align:center">${capWord(State.calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</div>
          <button class="btn sm" onclick="shiftMonth(1)"><i class="ti ti-chevron-right"></i></button>
        </div>
        <div class="row">
          <button class="btn sm" onclick="aplicarPadrao()"><i class="ti ti-wand"></i> Aplicar padrão do funcionário</button>
          <button class="btn sm dgr" onclick="limparMes()"><i class="ti ti-eraser"></i> Limpar mês</button>
        </div>
      </div>
    </div>
    <div class="card cpad" style="margin-bottom:14px">
      <div class="hsum">
        <div><div class="lbl">Horas previstas no mês</div><div class="big mono" style="color:${ok ? 'var(--gr)' : 'var(--am)'}">${fmtH(total)}</div></div>
        <div style="flex:1"></div>
        ${ok ? `<span class="badge bd-gr"><i class="ti ti-circle-check"></i> Meta de ${State.cfg.metaHoras}h atingida</span>`
             : `<span class="badge bd-am"><i class="ti ti-alert-triangle"></i> Abaixo de ${State.cfg.metaHoras}h — faltam ${fmtH(meta - total)}</span>`}
      </div>
    </div>
    <div class="card cpad">
      <div class="cal" style="margin-bottom:6px">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}</div>
      <div class="cal" id="cal-grid"></div>
    </div>`;
  drawCalendar(func, escMes);
}
function shiftMonth(n) { State.calMonth = new Date(State.calMonth.getFullYear(), State.calMonth.getMonth() + n, 1); renderEscala(); }
function mesPrevisto(func, escMes, monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth(), days = new Date(y, m + 1, 0).getDate();
  let total = 0;
  for (let d = 1; d <= days; d++) total += dur(planoDia(func, escMes, `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`));
  return total;
}
function drawCalendar(func, escMes) {
  const y = State.calMonth.getFullYear(), m = State.calMonth.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), ds = todayStr();
  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = planoDia(func, escMes, dateStr);
    html += `<div class="cell ${!p.on ? 'off' : ''} ${dateStr === ds ? 'today' : ''}" onclick="editDia('${dateStr}')">
      <div class="dn">${d}</div>
      ${p.on ? `<div class="sh">${p.ini}<br>${p.fim}</div>` : `<div class="fg">Folga</div>`}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}
let _segOn = null;
async function editDia(dateStr) {
  const funcs = await getFuncs(State.loja.id);
  const func = funcs.find(f => f.id === State.calFunc);
  const escMes = await getEsc(State.loja.id, monthKey(State.calMonth));
  const p = planoDia(func, escMes, dateStr);
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
        <div style="flex:1"><label class="fl">Entrada</label><input id="j-ini" class="inp" type="time" value="${p.ini || '14:00'}"></div>
        <div style="flex:1"><label class="fl">Saída</label><input id="j-fim" class="inp" type="time" value="${p.fim || '22:00'}"></div>
      </div>
      <div><label class="fl">Intervalo (min)</label><input id="j-interv" class="inp" type="number" min="0" step="5" value="${p.interv != null ? p.interv : State.cfg.intervaloPadrao}"></div>
    </div>`,
    [{ lbl: 'Cancelar', cls: '', fn: 'closeModal()' }, { lbl: 'Salvar dia', cls: 'p', fn: `saveDia('${dateStr}')` }]);
}
function segOn(v) {
  _segOn = v;
  document.querySelectorAll('#seg-on button').forEach((b, i) => b.classList.toggle('on', (i === 0) === v));
  document.getElementById('jfields').classList.toggle('hide', !v);
}
async function saveDia(dateStr) {
  const mk = monthKey(State.calMonth);
  const escMes = await getEsc(State.loja.id, mk);
  const on = _segOn !== null ? _segOn : true;
  escMes[State.calFunc] = escMes[State.calFunc] || {};
  escMes[State.calFunc][dateStr] = on
    ? { on: true, ini: document.getElementById('j-ini').value, fim: document.getElementById('j-fim').value, interv: +document.getElementById('j-interv').value || 0 }
    : { on: false };
  await setEsc(State.loja.id, mk, escMes);
  _segOn = null; closeModal(); renderEscala(); toast('Jornada do dia salva', 'ok');
}
async function aplicarPadrao() {
  const mk = monthKey(State.calMonth);
  const funcs = await getFuncs(State.loja.id);
  const func = funcs.find(f => f.id === State.calFunc);
  const escMes = await getEsc(State.loja.id, mk);
  const y = State.calMonth.getFullYear(), m = State.calMonth.getMonth(), days = new Date(y, m + 1, 0).getDate();
  escMes[State.calFunc] = escMes[State.calFunc] || {};
  for (let d = 1; d <= days; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = parseYmd(dateStr).getDay();
    escMes[State.calFunc][dateStr] = (func.padrao && func.padrao[dow]) ? { ...func.padrao[dow] } : { on: false };
  }
  await setEsc(State.loja.id, mk, escMes);
  renderEscala(); toast('Padrão semanal aplicado ao mês', 'ok');
}
async function limparMes() {
  const mk = monthKey(State.calMonth);
  const escMes = await getEsc(State.loja.id, mk);
  delete escMes[State.calFunc];
  await setEsc(State.loja.id, mk, escMes);
  renderEscala(); toast('Escala do mês limpa', 'ok');
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
          return `<tr>
            <td><div class="row" style="gap:9px"><div class="ava" style="background:${avColor(f.nome)};width:32px;height:32px;border-radius:9px;font-size:12px">${initials(f.nome)}</div><b>${esc(f.nome)}</b></div></td>
            <td class="mut">${esc(f.cargo || '—')}</td>
            <td class="mut" style="font-size:12px">${dias} dia(s)/sem · ${ref ? ref.ini + '–' + ref.fim : '—'}</td>
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
function defPadrao() { return [{ on: false }, ...[1, 2, 3, 4, 5, 6].map(() => ({ on: true, ini: '14:00', fim: '22:00', interv: 60 }))]; }
function defShift(f, key) {
  const base = f && (f.padrao || []).find(d => d && d.on);
  const d = { ini: '14:00', fim: '22:00', interv: 60 };
  return base ? (base[key] != null ? base[key] : d[key]) : d[key];
}
async function novoFunc(id) {
  const funcs = await getFuncs(State.loja.id);
  const f = id ? funcs.find(x => x.id === id) : null;
  _padrao = f ? JSON.parse(JSON.stringify(f.padrao || defPadrao())) : defPadrao();
  openModal(f ? 'Editar funcionário' : 'Novo funcionário', `
    <div><label class="fl">Nome</label><input id="f-nome" class="inp" value="${f ? esc(f.nome) : ''}" placeholder="Nome completo"></div>
    <div><label class="fl">Cargo (opcional)</label><input id="f-cargo" class="inp" value="${f ? esc(f.cargo || '') : ''}" placeholder="Ex.: Vendedor(a)"></div>
    <div>
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
}
function toggleDow(i) {
  _padrao[i] = _padrao[i] && _padrao[i].on ? { on: false } : { on: true };
  document.querySelector(`#dow-row button[data-d="${i}"]`).classList.toggle('p', _padrao[i].on);
}
async function saveFunc(id) {
  const nome = document.getElementById('f-nome').value.trim();
  if (!nome) { toast('Informe o nome', 'warn'); return; }
  const ini = document.getElementById('p-ini').value, fim = document.getElementById('p-fim').value, interv = +document.getElementById('p-interv').value || 0;
  const padrao = _padrao.map(d => d && d.on ? { on: true, ini, fim, interv } : { on: false });
  const cargo = document.getElementById('f-cargo').value.trim();
  const funcs = await getFuncs(State.loja.id);
  if (id) { const f = funcs.find(x => x.id === id); f.nome = nome; f.cargo = cargo; f.padrao = padrao; }
  else funcs.push({ id: 'f' + Date.now().toString(36), nome, cargo, padrao });
  await setFuncs(State.loja.id, funcs);
  closeModal(); renderFunc(); toast(id ? 'Funcionário atualizado' : 'Funcionário cadastrado', 'ok');
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
  const abertas = ocs.filter(o => o.status !== 'respondida').length;
  document.getElementById('page').innerHTML = `
    <div class="ph"><div><h2>Ocorrências de ponto</h2><p>${abertas ? `<b style="color:var(--rd)">${abertas} aberta(s)</b> aguardando justificativa.` : 'Tudo justificado.'}</p></div>
      <div class="row"><button class="btn p" onclick="novaOcor()" ${funcs.length ? '' : 'disabled'}><i class="ti ti-file-plus"></i> Nova ocorrência</button></div></div>
    <div class="card">
      ${ocs.length ? `<table class="tbl"><thead><tr><th>Data</th><th>Funcionário</th><th>Problema</th><th>Status</th><th></th></tr></thead><tbody>
        ${ocs.map(o => { const f = funcs.find(x => x.id === o.funcId);
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
      </tbody></table>` : `<div class="empty"><i class="ti ti-checks"></i>Nenhuma ocorrência. Quando um ponto ficar fora do previsto, ela aparece aqui sozinha.</div>`}
    </div>`;
}
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
