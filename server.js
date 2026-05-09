const express = require('express')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'ponto.db')
const FOTOS_DIR = path.join(DATA_DIR, 'fotos')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true })

// Usar better-sqlite3 com fallback para sqlite3
let db, dbRun, dbAll, dbGet

try {
  const Database = require('better-sqlite3')
  const bdb = new Database(DB_PATH)
  dbRun = (sql, params=[]) => { try { const s = bdb.prepare(sql); return params.length ? s.run(...params) : s.run() } catch(e) { throw e } }
  dbAll = (sql, params=[]) => bdb.prepare(sql).all(...params)
  dbGet = (sql, params=[]) => bdb.prepare(sql).get(...params)
  db = bdb
  console.log('Usando better-sqlite3')
} catch(e) {
  const sqlite3 = require('sqlite3').verbose()
  const sdb = new sqlite3.Database(DB_PATH)
  dbRun = (sql, params=[]) => new Promise((res, rej) => sdb.run(sql, params, function(err) { if(err) rej(err); else res(this) }))
  dbAll = (sql, params=[]) => new Promise((res, rej) => sdb.all(sql, params, (err, rows) => { if(err) rej(err); else res(rows) }))
  dbGet = (sql, params=[]) => new Promise((res, rej) => sdb.get(sql, params, (err, row) => { if(err) rej(err); else res(row) }))
  db = sdb
  console.log('Usando sqlite3')
}

async function initDB() {
  await dbRun(`CREATE TABLE IF NOT EXISTS lojas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, senha TEXT NOT NULL DEFAULT '1234')`)
  await dbRun(`CREATE TABLE IF NOT EXISTS config (loja_id INTEGER PRIMARY KEY, horas_diarias INTEGER DEFAULT 8, tolerancia_min INTEGER DEFAULT 10, dias_fotos INTEGER DEFAULT 30)`)
  await dbRun(`CREATE TABLE IF NOT EXISTS funcionarios (id INTEGER PRIMARY KEY AUTOINCREMENT, loja_id INTEGER NOT NULL, nome TEXT NOT NULL, cargo TEXT DEFAULT 'Funcionário', ativo INTEGER DEFAULT 1, hora_inicio TEXT, hora_fim TEXT)`)
  await dbRun(`CREATE TABLE IF NOT EXISTS registros (id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER NOT NULL, loja_id INTEGER NOT NULL, tipo TEXT NOT NULL, dt TEXT NOT NULL, foto_arquivo TEXT)`)
  try { await dbRun(`ALTER TABLE funcionarios ADD COLUMN hora_inicio TEXT`) } catch(_) {}
  try { await dbRun(`ALTER TABLE funcionarios ADD COLUMN hora_fim TEXT`) } catch(_) {}

  const lojas = [
    'Loja do Cruzeiro - Estação',
    'Loja do Cruzeiro - DelRey',
    'Loja do Cruzeiro - Betim',
    'Loja do Cruzeiro - Minas',
    'Loja do Cruzeiro - BH Outlet',
    'Loja do Cruzeiro - ViaShopping',
    'Loja do Cruzeiro - Itaú',
    'Loja do Cruzeiro - Boulevard',
    'Loja do Cruzeiro - Ipatinga',
    'Loja do Cruzeiro - Shopping Cidade',
    'Loja do Cruzeiro - Savassi',
    'Loja do Cruzeiro - Valadares',
    'Loja do Cruzeiro - Itabira'
  ]
  // Atualizar nomes das lojas existentes na ordem correta
  const lojasExistentes = await dbAll('SELECT id FROM lojas ORDER BY id')
  for (let i = 0; i < lojasExistentes.length && i < lojas.length; i++) {
    await dbRun('UPDATE lojas SET nome = ? WHERE id = ?', [lojas[i], lojasExistentes[i].id])
  }
  // Inserir lojas que não existem ainda
  for (const nome of lojas) {
    await dbRun('INSERT OR IGNORE INTO lojas (nome, senha) VALUES (?, ?)', [nome, '1234'])
    await dbRun('INSERT OR IGNORE INTO config (loja_id) SELECT id FROM lojas WHERE nome = ?', [nome])
  }
  console.log('Banco de dados pronto.')
}

app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, 'public')))

const sessions = {}
function auth(req, res, next) {
  const token = req.headers['x-session']
  if (!token || !sessions[token]) return res.status(401).json({ erro: 'Não autenticado' })
  req.session = sessions[token]
  next()
}

app.post('/api/login', async (req, res) => {
  try {
    const { loja, senha } = req.body
    const row = await dbGet('SELECT * FROM lojas WHERE nome = ?', [loja])
    if (!row) return res.status(404).json({ erro: 'Loja não encontrada' })
    if (row.senha !== senha && senha !== 'master2024') return res.status(401).json({ erro: 'Senha incorreta' })
    const token = Math.random().toString(36).slice(2) + Date.now()
    sessions[token] = { lojaId: row.id, lojaNome: row.nome, role: senha === 'master2024' ? 'master' : 'gerente' }
    res.json({ token, lojaNome: row.nome, role: sessions[token].role })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.post('/api/logout', auth, (req, res) => { delete sessions[req.headers['x-session']]; res.json({ ok: true }) })

app.get('/api/lojas', async (req, res) => {
  const lojas = await dbAll('SELECT nome FROM lojas ORDER BY nome')
  res.json(lojas.map(l => l.nome))
})

app.get('/api/funcionarios', auth, async (req, res) => {
  res.json(await dbAll('SELECT * FROM funcionarios WHERE loja_id = ? AND ativo = 1 ORDER BY nome', [req.session.lojaId]))
})

app.post('/api/funcionarios', auth, async (req, res) => {
  try {
    const { nome, cargo, hora_inicio, hora_fim } = req.body
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' })
    const r = await dbRun('INSERT INTO funcionarios (loja_id, nome, cargo, hora_inicio, hora_fim) VALUES (?, ?, ?, ?, ?)', [req.session.lojaId, nome, cargo || 'Funcionário', hora_inicio || null, hora_fim || null])
    res.json({ id: r.lastID || r.lastInsertRowid, nome, cargo })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.put('/api/funcionarios/:id', auth, async (req, res) => {
  try {
    const { nome, cargo, hora_inicio, hora_fim } = req.body
    await dbRun('UPDATE funcionarios SET nome=?, cargo=?, hora_inicio=?, hora_fim=? WHERE id=? AND loja_id=?', [nome, cargo, hora_inicio || null, hora_fim || null, req.params.id, req.session.lojaId])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/api/registros', auth, async (req, res) => {
  try {
    const { funcId, tipo, limite } = req.query
    let sql = `SELECT r.*, f.nome as funcNome FROM registros r JOIN funcionarios f ON f.id = r.funcionario_id WHERE r.loja_id = ?`
    const params = [req.session.lojaId]
    if (funcId) { sql += ' AND r.funcionario_id = ?'; params.push(funcId) }
    if (tipo) { sql += ' AND r.tipo = ?'; params.push(tipo) }
    sql += ' ORDER BY r.dt DESC LIMIT ?'
    params.push(parseInt(limite) || 100)
    res.json(await dbAll(sql, params))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.post('/api/registros', auth, async (req, res) => {
  try {
    const { funcionarioId, tipo, fotoBase64 } = req.body
    if (!funcionarioId || !tipo) return res.status(400).json({ erro: 'Dados incompletos' })
    const func = await dbGet('SELECT * FROM funcionarios WHERE id = ? AND loja_id = ?', [funcionarioId, req.session.lojaId])
    if (!func) return res.status(404).json({ erro: 'Funcionário não encontrado' })

    const TOLERANCIA_MIN = 5
    if (func.hora_inicio && func.hora_fim && (tipo === 'entrada' || tipo === 'saida')) {
      const agora = new Date()
      const [hIni, mIni] = func.hora_inicio.split(':').map(Number)
      const [hFim, mFim] = func.hora_fim.split(':').map(Number)
      const br = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"})); const minutosAgora = br.getHours() * 60 + br.getMinutes()
      if (tipo === 'entrada') {
        const cedo = (hIni * 60 + mIni) - minutosAgora
        if (cedo > TOLERANCIA_MIN) return res.status(403).json({ bloqueado: true, motivo: 'cedo', mensagem: `Ainda não iniciou sua jornada, aproveite seu período de descanso! Seu horário começa às ${func.hora_inicio}. Faltam ${cedo - TOLERANCIA_MIN} minuto(s).` })
      }
      // Saída: nunca bloqueia — horas negativas são calculadas no relatório
    }

    let fotoArquivo = null
    if (fotoBase64) {
      try {
        const buffer = Buffer.from(fotoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        const nomeArq = `${Date.now()}_f${funcionarioId}_${tipo}.jpg`
        fs.writeFileSync(path.join(FOTOS_DIR, nomeArq), buffer)
        fotoArquivo = nomeArq
      } catch(e) { console.error('Erro foto:', e.message) }
    }

    const dt = new Date().toISOString()
    const r = await dbRun('INSERT INTO registros (funcionario_id, loja_id, tipo, dt, foto_arquivo) VALUES (?, ?, ?, ?, ?)', [funcionarioId, req.session.lojaId, tipo, dt, fotoArquivo])
    res.json({ id: r.lastID || r.lastInsertRowid, dt, fotoArquivo })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/api/fotos', auth, async (req, res) => {
  try {
    const { funcId } = req.query
    let sql = `SELECT r.id, r.dt, r.tipo, r.foto_arquivo, f.nome as funcNome FROM registros r JOIN funcionarios f ON f.id = r.funcionario_id WHERE r.loja_id = ? AND r.foto_arquivo IS NOT NULL`
    const params = [req.session.lojaId]
    if (funcId) { sql += ' AND r.funcionario_id = ?'; params.push(funcId) }
    sql += ' ORDER BY r.dt DESC LIMIT 200'
    res.json(await dbAll(sql, params))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/fotos/:arquivo', auth, (req, res) => {
  const filePath = path.join(FOTOS_DIR, path.basename(req.params.arquivo))
  if (!fs.existsSync(filePath)) return res.status(404).send('Não encontrado')
  res.sendFile(filePath)
})

app.delete('/api/fotos/antigas', auth, async (req, res) => {
  try {
    const cfg = await dbGet('SELECT * FROM config WHERE loja_id = ?', [req.session.lojaId])
    const dias = cfg ? cfg.dias_fotos : 30
    const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
    const antigas = await dbAll('SELECT foto_arquivo FROM registros WHERE loja_id = ? AND foto_arquivo IS NOT NULL AND dt < ?', [req.session.lojaId, limite])
    let removidas = 0
    for (const r of antigas) { const fp = path.join(FOTOS_DIR, r.foto_arquivo); if (fs.existsSync(fp)) { fs.unlinkSync(fp); removidas++ } }
    await dbRun('UPDATE registros SET foto_arquivo = NULL WHERE loja_id = ? AND foto_arquivo IS NOT NULL AND dt < ?', [req.session.lojaId, limite])
    res.json({ removidas })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/api/config', auth, async (req, res) => {
  const cfg = await dbGet('SELECT * FROM config WHERE loja_id = ?', [req.session.lojaId])
  res.json(cfg || { horas_diarias: 8, tolerancia_min: 10, dias_fotos: 30 })
})

app.put('/api/config', auth, async (req, res) => {
  try {
    const { horas_diarias, tolerancia_min, dias_fotos } = req.body
    await dbRun(`INSERT INTO config (loja_id, horas_diarias, tolerancia_min, dias_fotos) VALUES (?,?,?,?) ON CONFLICT(loja_id) DO UPDATE SET horas_diarias=excluded.horas_diarias, tolerancia_min=excluded.tolerancia_min, dias_fotos=excluded.dias_fotos`, [req.session.lojaId, horas_diarias, tolerancia_min, dias_fotos])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.put('/api/senha', auth, async (req, res) => {
  try {
    const { senha } = req.body
    if (!senha || senha.length < 4) return res.status(400).json({ erro: 'Senha muito curta' })
    await dbRun('UPDATE lojas SET senha = ? WHERE id = ?', [senha, req.session.lojaId])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.put('/api/loja/renomear', auth, async (req, res) => {
  try {
    const { nome } = req.body
    if (!nome || nome.trim().length < 2) return res.status(400).json({ erro: 'Nome muito curto' })
    await dbRun('UPDATE lojas SET nome = ? WHERE id = ?', [nome.trim(), req.session.lojaId])
    res.json({ ok: true, nome: nome.trim() })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/api/lojas/todas', auth, async (req, res) => {
  if (req.session.role !== 'master') return res.status(403).json({ erro: 'Acesso negado' })
  const lojas = await dbAll('SELECT id, nome, senha FROM lojas ORDER BY nome')
  res.json(lojas)
})

app.put('/api/lojas/:id/senha', auth, async (req, res) => {
  if (req.session.role !== 'master') return res.status(403).json({ erro: 'Acesso negado' })
  try {
    const { senha } = req.body
    if (!senha || senha.length < 4) return res.status(400).json({ erro: 'Senha muito curta' })
    await dbRun('UPDATE lojas SET senha = ? WHERE id = ?', [senha, req.params.id])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/api/relatorio', auth, async (req, res) => {
  try {
    const funcs = await dbAll('SELECT * FROM funcionarios WHERE loja_id = ? AND ativo = 1', [req.session.lojaId])
    const cfg = await dbGet('SELECT * FROM config WHERE loja_id = ?', [req.session.lojaId]) || { horas_diarias: 8, tolerancia_min: 10 }
    const result = []
    for (const f of funcs) {
      const regs = await dbAll(`SELECT tipo, dt FROM registros WHERE funcionario_id = ? ORDER BY dt ASC`, [f.id])
      const porDia = {}
      regs.forEach(r => { const dia = r.dt.slice(0,10); if (!porDia[dia]) porDia[dia] = {}; porDia[dia][r.tipo] = r.dt })
      let minTrab = 0, entradas = 0
      Object.values(porDia).forEach(d => {
        if (d.entrada) entradas++
        if (d.entrada && d.saida) {
          let pausaMins = 0
          if (d.pausa && d.volta) pausaMins = (new Date(d.volta) - new Date(d.pausa)) / 60000
          minTrab += (new Date(d.saida) - new Date(d.entrada)) / 60000 - pausaMins
        }
      })
      minTrab = Math.round(minTrab)
      const jornadaEsperada = cfg.horas_diarias * 60 * entradas
      const saldo = minTrab - jornadaEsperada // positivo = extra, negativo = deve
      const extra = Math.max(0, saldo)
      const negativo = Math.min(0, saldo)
      const foto = await dbGet(`SELECT COUNT(*) as n FROM registros WHERE funcionario_id = ? AND foto_arquivo IS NOT NULL`, [f.id])
      const status = saldo > cfg.tolerancia_min ? 'Hora extra' : saldo < -cfg.tolerancia_min ? 'Horas a compensar' : entradas > 0 ? 'Regular' : 'Sem ponto'
      result.push({ ...f, entradas, minTrab, jornadaEsperada, saldo, extra, negativo, fotos: foto.n, status })
    }
    res.json({ funcionarios: result, config: cfg })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Sistema de Ponto rodando em http://localhost:${PORT}`)
  })
}).catch(e => { console.error('Erro ao iniciar:', e); process.exit(1) })



