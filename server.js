/* =========================================================================
   Sistema de Ponto — Grupo Shalom
   Mesma estrutura do projeto anterior: Express + SQLite + pasta /public.
   Deploy: GitHub -> Render (mesmo serviço, mesma URL ponto-shalom.onrender.com).

   Correções de raiz em relação à versão antiga:
   - Fuso horário: todo horário é calculado em America/Sao_Paulo no servidor,
     independente do fuso do Render (acaba o bug do UTC).
   - Persistência: banco e fotos vivem no disco persistente (DATA_DIR=/data),
     então nada é perdido em deploy/restart.
========================================================================= */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TZ = process.env.TZ || 'America/Sao_Paulo';
const PORT = process.env.PORT || 3000;
const RETENCAO_FOTOS_DIAS = 60;

/* ---- diretório de dados (disco persistente do Render em /data) ---- */
function pickDataDir() {
  const pref = process.env.DATA_DIR || '/data';
  try { fs.mkdirSync(pref, { recursive: true }); fs.accessSync(pref, fs.constants.W_OK); return pref; }
  catch (e) { const local = path.join(__dirname, 'data'); fs.mkdirSync(local, { recursive: true }); return local; }
}
const DATA_DIR = pickDataDir();
const FOTOS_DIR = path.join(DATA_DIR, 'fotos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });
console.log('[ponto] DATA_DIR =', DATA_DIR);

/* ---- banco ---- */
const db = new Database(path.join(DATA_DIR, 'ponto.db'));
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, val TEXT)');

const getKV = (k) => { const r = db.prepare('SELECT val FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.val) : null; };
const setKV = (k, v) => db.prepare('INSERT INTO kv(key,val) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val').run(k, JSON.stringify(v));

/* ---- config inicial (semeia 13 lojas só na primeira vez) ---- */
function seedCfg() {
  if (getKV('cfg')) return;
  const nomes = ["Loja do Cruzeiro - Estação","Cruzeiro - Shopping","DelRey","Outlet","Centro",
    "Barreiro","Contagem","Betim","Savassi","Buritis","Pampulha","Venda Nova","Eldorado"];
  const lojas = nomes.map((nome, i) => ({ id: 'L' + String(i + 1).padStart(2, '0'), nome, senha: '1234' }));
  setKV('cfg', { lojas, masterSenha: 'master2024', metaHoras: 180, tolerancia: 5, intervaloPadrao: 60 });
  console.log('[ponto] config inicial criada (13 lojas, senha 1234)');
}
seedCfg();
const cfg = () => getKV('cfg');

/* ---- helpers de tempo (sempre America/Sao_Paulo) ---- */
function nowSP() {
  const d = new Date();
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [H, M] = hora.split(':').map(Number);
  return { data, hora, ts: d.getTime(), min: H * 60 + M };
}
const toMin = (t) => { if (!t) return 0; const [a, b] = t.split(':').map(Number); return a * 60 + b; };
function dur(p) { if (!p || !p.on || !p.ini || !p.fim) return 0; let d = toMin(p.fim) - toMin(p.ini); if (d < 0) d += 1440; return Math.max(0, d - (p.interv || 0)); }
function planoDia(func, escMes, dateStr) {
  if (escMes && escMes[func.id] && escMes[func.id][dateStr]) return escMes[func.id][dateStr];
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return (func.padrao && func.padrao[dow]) ? func.padrao[dow] : { on: false };
}

/* ---- auth simples por token em memória ---- */
const tokens = new Map();
const randTok = () => 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
function auth(req, res, next) {
  const t = req.headers['x-token'] || req.query.t;
  const s = tokens.get(t);
  if (!s) return res.status(401).json({ error: 'sessao_expirada' });
  req.sess = s; next();
}
function lojaDaKey(key) { const m = key.match(/^(?:func|escala|reg|ocor):(L\d+)/); return m ? m[1] : null; }
function podeAcessar(sess, key) { if (sess.role === 'master') return true; return lojaDaKey(key) === sess.lojaId; }

/* =========================================================================
   API
========================================================================= */
const app = express();
app.use(express.json({ limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/* lista de lojas para o login (sem senhas) */
app.get('/api/lojas', (req, res) => res.json(cfg().lojas.map(l => ({ id: l.id, nome: l.nome }))));

/* login */
app.post('/api/login', (req, res) => {
  const { lojaId, senha } = req.body || {};
  const c = cfg();
  const loja = c.lojas.find(l => l.id === lojaId);
  if (!loja) return res.status(400).json({ error: 'loja_invalida' });
  let role = null;
  if (senha === c.masterSenha) role = 'master';
  else if (senha === loja.senha) role = 'gerente';
  if (!role) return res.status(401).json({ error: 'senha_incorreta' });
  const token = randTok();
  tokens.set(token, { lojaId, role });
  res.json({ token, role, loja: { id: loja.id, nome: loja.nome },
    config: { metaHoras: c.metaHoras, tolerancia: c.tolerancia, intervaloPadrao: c.intervaloPadrao } });
});

/* KV genérico (escopado por loja) */
app.get('/api/data/:key', auth, (req, res) => {
  const key = req.params.key;
  if (!podeAcessar(req.sess, key)) return res.status(403).json({ error: 'sem_acesso' });
  res.json(getKV(key));
});
app.put('/api/data/:key', auth, (req, res) => {
  const key = req.params.key;
  if (key.startsWith('reg:')) return res.status(403).json({ error: 'reg_somente_via_ponto' });
  if (!podeAcessar(req.sess, key)) return res.status(403).json({ error: 'sem_acesso' });
  setKV(key, req.body);
  res.json({ ok: true });
});

/* config / senha */
app.get('/api/config', auth, (req, res) => {
  const c = cfg();
  res.json({ metaHoras: c.metaHoras, tolerancia: c.tolerancia, intervaloPadrao: c.intervaloPadrao });
});
app.put('/api/config', auth, (req, res) => {
  const c = cfg();
  if (req.body.metaHoras != null) c.metaHoras = +req.body.metaHoras;
  if (req.body.tolerancia != null) c.tolerancia = +req.body.tolerancia;
  if (req.body.intervaloPadrao != null) c.intervaloPadrao = +req.body.intervaloPadrao;
  setKV('cfg', c);
  res.json({ ok: true });
});
app.put('/api/loja/senha', auth, (req, res) => {
  const c = cfg();
  const loja = c.lojas.find(l => l.id === req.sess.lojaId);
  if (loja && req.body.senha) { loja.senha = String(req.body.senha); setKV('cfg', c); }
  res.json({ ok: true });
});

/* preparar ponto: calcula próximo tipo + tolerância (timezone SP) */
function prepararPonto(lojaId, funcId) {
  const { data, min } = nowSP();
  const mk = data.slice(0, 7);
  const funcs = getKV(`func:${lojaId}`) || [];
  const f = funcs.find(x => x.id === funcId);
  if (!f) return { erro: 'funcionario' };
  const escMes = getKV(`escala:${lojaId}:${mk}`) || {};
  const regs = getKV(`reg:${lojaId}:${mk}`) || [];
  const done = regs.filter(r => r.funcId === funcId && r.data === data).map(r => r.tipo);
  const ordem = ['entrada', 'pausa', 'volta', 'saida'];
  const tipo = ordem.find(t => !done.includes(t)) || null;
  const plano = planoDia(f, escMes, data);
  if (!tipo) return { concluido: true, nome: f.nome };
  if (tipo === 'entrada' && plano.on && plano.ini) {
    const lim = toMin(plano.ini) - (cfg().tolerancia || 0);
    if (min < lim) return { blocked: true, nome: f.nome, ini: plano.ini, faltam: toMin(plano.ini) - min,
      message: `Ainda não iniciou sua jornada, aproveite seu período de descanso! Seu horário começa às ${plano.ini}.` };
  }
  return { tipo, plano, nome: f.nome, data };
}
app.post('/api/punch/prepare', auth, (req, res) => {
  res.json(prepararPonto(req.sess.lojaId, req.body.funcId));
});

/* registrar ponto (com foto) */
app.post('/api/punch', auth, upload.single('foto'), async (req, res) => {
  const lojaId = req.sess.lojaId;
  const funcId = req.body.funcId;
  const prep = prepararPonto(lojaId, funcId);
  if (prep.erro) return res.status(400).json({ error: prep.erro });
  if (prep.blocked) return res.json(prep);
  if (prep.concluido) return res.status(400).json({ error: 'dia_concluido' });

  const { data, hora, ts } = nowSP();
  const mk = data.slice(0, 7);
  const regId = 'r' + ts + Math.random().toString(36).slice(2, 6);
  let foto = false;
  if (req.file) {
    try {
      await sharp(req.file.buffer).rotate().resize(360, 270, { fit: 'cover' }).jpeg({ quality: 62 })
        .toFile(path.join(FOTOS_DIR, `${lojaId}_${regId}.jpg`));
      foto = true;
    } catch (e) { console.error('foto', e.message); }
  }
  const regs = getKV(`reg:${lojaId}:${mk}`) || [];
  const reg = { id: regId, funcId, tipo: prep.tipo, data, hora, ts, foto };
  regs.push(reg);
  setKV(`reg:${lojaId}:${mk}`, regs);
  res.json({ ok: true, reg });
});

/* servir foto */
app.get('/api/foto/:loja/:reg', auth, (req, res) => {
  if (req.sess.role !== 'master' && req.sess.lojaId !== req.params.loja) return res.sendStatus(403);
  const fp = path.join(FOTOS_DIR, `${req.params.loja}_${req.params.reg}.jpg`);
  if (!fs.existsSync(fp)) return res.sendStatus(404);
  res.sendFile(fp);
});

/* estáticos */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* limpeza automática de fotos antigas */
function limparFotos() {
  const limite = Date.now() - RETENCAO_FOTOS_DIAS * 86400000;
  let n = 0;
  for (const f of fs.readdirSync(FOTOS_DIR)) {
    const fp = path.join(FOTOS_DIR, f);
    try { if (fs.statSync(fp).mtimeMs < limite) { fs.unlinkSync(fp); n++; } } catch (e) {}
  }
  if (n) console.log(`[ponto] limpeza: ${n} foto(s) antiga(s) removida(s)`);
}
setInterval(limparFotos, 24 * 3600 * 1000);
limparFotos();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Sistema de Ponto no ar — porta ${PORT} — fuso ${TZ}\n`);
});
