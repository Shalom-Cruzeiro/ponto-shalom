const express = require('express')
const path = require('path')
const fs = require('fs')
const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'ponto.db')
const FOTOS_DIR = path.join(DATA_DIR, 'fotos')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true })
const sqlite3 = require('sqlite3').verbose()
const sdb = new sqlite3.Database(DB_PATH)
const dbRun = (sql, p=[]) => new Promise((res,rej) => sdb.run(sql,p,function(e){if(e)rej(e);else res(this)}))
const dbAll = (sql, p=[]) => new Promise((res,rej) => sdb.all(sql,p,(e,r)=>{if(e)rej(e);else res(r)}))
const dbGet = (sql, p=[]) => new Promise((res,rej) => sdb.get(sql,p,(e,r)=>{if(e)rej(e);else res(r)}))
function horaBrasilia(){
  const s = new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false})
  const [h,m] = s.split(':').map(Number)
  return h*60+m
}
async function initDB(){
  await dbRun("CREATE TABLE IF NOT EXISTS lojas(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT UNIQUE NOT NULL,senha TEXT NOT NULL DEFAULT '1234')")
  await dbRun("CREATE TABLE IF NOT EXISTS config(loja_id INTEGER PRIMARY KEY,horas_diarias INTEGER DEFAULT 8,tolerancia_min INTEGER DEFAULT 5,dias_fotos INTEGER DEFAULT 30)")
  await dbRun("CREATE TABLE IF NOT EXISTS funcionarios(id INTEGER PRIMARY KEY AUTOINCREMENT,loja_id INTEGER NOT NULL,nome TEXT NOT NULL,cargo TEXT DEFAULT 'Funcionario',ativo INTEGER DEFAULT 1,hora_inicio TEXT,hora_fim TEXT)")
  await dbRun("CREATE TABLE IF NOT EXISTS registros(id INTEGER PRIMARY KEY AUTOINCREMENT,funcionario_id INTEGER NOT NULL,loja_id INTEGER NOT NULL,tipo TEXT NOT NULL,dt TEXT NOT NULL,foto_arquivo TEXT)")
  try{await dbRun("ALTER TABLE funcionarios ADD COLUMN hora_inicio TEXT")}catch(_){}
  try{await dbRun("ALTER TABLE funcionarios ADD COLUMN hora_fim TEXT")}catch(_){}
  const n = await dbGet("SELECT COUNT(*) as n FROM lojas")
  if(n.n === 0){
    const L=['Loja do Cruzeiro - Estacao','Loja do Cruzeiro - DelRey','Loja do Cruzeiro - Betim','Loja do Cruzeiro - Minas','Loja do Cruzeiro - BH Outlet','Loja do Cruzeiro - ViaShopping','Loja do Cruzeiro - Itau','Loja do Cruzeiro - Boulevard','Loja do Cruzeiro - Ipatinga','Loja do Cruzeiro - Shopping Cidade','Loja do Cruzeiro - Savassi','Loja do Cruzeiro - Valadares','Loja do Cruzeiro - Itabira']
    for(const nome of L){await dbRun("INSERT INTO lojas(nome,senha)VALUES(?,?)",[nome,'1234'])}
    const ids=await dbAll("SELECT id FROM lojas ORDER BY id")
    for(const l of ids){await dbRun("INSERT OR IGNORE INTO config(loja_id)VALUES(?)",[l.id])}
    console.log('13 lojas criadas.')
  } else {
    const ids=await dbAll("SELECT id FROM lojas ORDER BY id")
    for(const l of ids){await dbRun("INSERT OR IGNORE INTO config(loja_id)VALUES(?)",[l.id])}
    console.log('Banco existente: '+n.n+' lojas.')
  }
}
app.use(express.json({limit:'10mb'}))
app.use(express.static(path.join(__dirname,'public')))
const sessions={}
function auth(req,res,next){const t=req.headers['x-session'];if(!t||!sessions[t])return res.status(401).json({erro:'Nao autenticado'});req.session=sessions[t];next()}
app.post('/api/login',async(req,res)=>{try{const{loja,senha}=req.body;const row=await dbGet("SELECT * FROM lojas WHERE nome=?",[loja]);if(!row)return res.status(404).json({erro:'Loja nao encontrada'});if(row.senha!==senha&&senha!=='master2024')return res.status(401).json({erro:'Senha incorreta'});const t=Math.random().toString(36).slice(2)+Date.now();sessions[t]={lojaId:row.id,lojaNome:row.nome,role:senha==='master2024'?'master':'gerente'};res.json({token:t,lojaNome:row.nome,role:sessions[t].role})}catch(e){res.status(500).json({erro:e.message})}})
app.post('/api/logout',auth,(req,res)=>{delete sessions[req.headers['x-session']];res.json({ok:true})})
app.get('/api/lojas',async(req,res)=>{try{const l=await dbAll("SELECT nome FROM lojas ORDER BY id");res.json(l.map(x=>x.nome))}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/funcionarios',auth,async(req,res)=>{try{res.json(await dbAll("SELECT * FROM funcionarios WHERE loja_id=? AND ativo=1 ORDER BY nome",[req.session.lojaId]))}catch(e){res.status(500).json({erro:e.message})}})
app.post('/api/funcionarios',auth,async(req,res)=>{try{const{nome,cargo,hora_inicio,hora_fim}=req.body;if(!nome)return res.status(400).json({erro:'Nome obrigatorio'});const r=await dbRun("INSERT INTO funcionarios(loja_id,nome,cargo,hora_inicio,hora_fim)VALUES(?,?,?,?,?)",[req.session.lojaId,nome,cargo||'Funcionario',hora_inicio||null,hora_fim||null]);res.json({id:r.lastID,nome,cargo})}catch(e){res.status(500).json({erro:e.message})}})
app.put('/api/funcionarios/:id',auth,async(req,res)=>{try{const{nome,cargo,hora_inicio,hora_fim}=req.body;await dbRun("UPDATE funcionarios SET nome=?,cargo=?,hora_inicio=?,hora_fim=? WHERE id=? AND loja_id=?",[nome,cargo,hora_inicio||null,hora_fim||null,req.params.id,req.session.lojaId]);res.json({ok:true})}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/registros',auth,async(req,res)=>{try{const{funcId,tipo,limite}=req.query;let sql="SELECT r.*,f.nome as funcNome,f.hora_inicio,f.hora_fim FROM registros r JOIN funcionarios f ON f.id=r.funcionario_id WHERE r.loja_id=?";const p=[req.session.lojaId];if(funcId){sql+=" AND r.funcionario_id=?";p.push(funcId)}if(tipo){sql+=" AND r.tipo=?";p.push(tipo)}sql+=" ORDER BY r.dt DESC LIMIT ?";p.push(parseInt(limite)||100);res.json(await dbAll(sql,p))}catch(e){res.status(500).json({erro:e.message})}})
app.post('/api/registros',auth,async(req,res)=>{try{
  const{funcionarioId,tipo,fotoBase64}=req.body
  if(!funcionarioId||!tipo)return res.status(400).json({erro:'Dados incompletos'})
  const func=await dbGet("SELECT * FROM funcionarios WHERE id=? AND loja_id=?",[funcionarioId,req.session.lojaId])
  if(!func)return res.status(404).json({erro:'Funcionario nao encontrado'})
  if(tipo==='entrada'&&func.hora_inicio){
    const agora=horaBrasilia()
    const[hI,mI]=func.hora_inicio.split(':').map(Number)
    const cedo=(hI*60+mI)-agora
    if(cedo>5)return res.status(403).json({bloqueado:true,mensagem:'Jornada comeca as '+func.hora_inicio+'. Faltam '+(cedo-5)+' minuto(s).'})
  }
  let fotoArquivo=null
  if(fotoBase64){try{const buf=Buffer.from(fotoBase64.replace(/^data:image\/\w+;base64,/,''),'base64');const nm=Date.now()+'_'+funcionarioId+'_'+tipo+'.jpg';fs.writeFileSync(path.join(FOTOS_DIR,nm),buf);fotoArquivo=nm}catch(e){}}
  const dt=new Date().toISOString()
  const r=await dbRun("INSERT INTO registros(funcionario_id,loja_id,tipo,dt,foto_arquivo)VALUES(?,?,?,?,?)",[funcionarioId,req.session.lojaId,tipo,dt,fotoArquivo])
  res.json({id:r.lastID,dt,fotoArquivo})
}catch(e){res.status(500).json({erro:e.message})}})
app.get('/fotos/:arquivo',(req,res)=>{const fp=path.join(FOTOS_DIR,path.basename(req.params.arquivo));if(!fs.existsSync(fp))return res.status(404).send('404');res.sendFile(fp)})
app.get('/api/fotos',auth,async(req,res)=>{try{const{funcId}=req.query;let sql="SELECT r.id,r.dt,r.tipo,r.foto_arquivo,f.nome as funcNome FROM registros r JOIN funcionarios f ON f.id=r.funcionario_id WHERE r.loja_id=? AND r.foto_arquivo IS NOT NULL";const p=[req.session.lojaId];if(funcId){sql+=" AND r.funcionario_id=?";p.push(funcId)}sql+=" ORDER BY r.dt DESC LIMIT 200";res.json(await dbAll(sql,p))}catch(e){res.status(500).json({erro:e.message})}})
app.delete('/api/fotos/antigas',auth,async(req,res)=>{try{const cfg=await dbGet("SELECT * FROM config WHERE loja_id=?",[req.session.lojaId]);const dias=cfg?cfg.dias_fotos:30;const lim=new Date(Date.now()-dias*24*60*60*1000).toISOString();const antig=await dbAll("SELECT foto_arquivo FROM registros WHERE loja_id=? AND foto_arquivo IS NOT NULL AND dt<?",[req.session.lojaId,lim]);let n=0;for(const r of antig){const fp=path.join(FOTOS_DIR,r.foto_arquivo);if(fs.existsSync(fp)){fs.unlinkSync(fp);n++}}await dbRun("UPDATE registros SET foto_arquivo=NULL WHERE loja_id=? AND foto_arquivo IS NOT NULL AND dt<?",[req.session.lojaId,lim]);res.json({removidas:n})}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/config',auth,async(req,res)=>{try{const cfg=await dbGet("SELECT * FROM config WHERE loja_id=?",[req.session.lojaId]);res.json(cfg||{horas_diarias:8,tolerancia_min:5,dias_fotos:30})}catch(e){res.status(500).json({erro:e.message})}})
app.put('/api/config',auth,async(req,res)=>{try{const{horas_diarias,tolerancia_min,dias_fotos}=req.body;await dbRun("INSERT INTO config(loja_id,horas_diarias,tolerancia_min,dias_fotos)VALUES(?,?,?,?)ON CONFLICT(loja_id)DO UPDATE SET horas_diarias=excluded.horas_diarias,tolerancia_min=excluded.tolerancia_min,dias_fotos=excluded.dias_fotos",[req.session.lojaId,horas_diarias,tolerancia_min,dias_fotos]);res.json({ok:true})}catch(e){res.status(500).json({erro:e.message})}})
app.put('/api/senha',auth,async(req,res)=>{try{const{senha}=req.body;if(!senha||senha.length<4)return res.status(400).json({erro:'Senha curta'});await dbRun("UPDATE lojas SET senha=? WHERE id=?",[senha,req.session.lojaId]);res.json({ok:true})}catch(e){res.status(500).json({erro:e.message})}})
app.put('/api/loja/renomear',auth,async(req,res)=>{try{const{nome}=req.body;if(!nome||nome.trim().length<2)return res.status(400).json({erro:'Nome curto'});await dbRun("UPDATE lojas SET nome=? WHERE id=?",[nome.trim(),req.session.lojaId]);res.json({ok:true,nome:nome.trim()})}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/lojas/todas',auth,async(req,res)=>{if(req.session.role!=='master')return res.status(403).json({erro:'Negado'});try{res.json(await dbAll("SELECT id,nome,senha FROM lojas ORDER BY id"))}catch(e){res.status(500).json({erro:e.message})}})
app.put('/api/lojas/:id/senha',auth,async(req,res)=>{if(req.session.role!=='master')return res.status(403).json({erro:'Negado'});try{const{senha}=req.body;if(!senha||senha.length<4)return res.status(400).json({erro:'Senha curta'});await dbRun("UPDATE lojas SET senha=? WHERE id=?",[senha,req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/folgas',auth,async(req,res)=>{try{const{funcId,mes,ano}=req.query;res.json(await dbAll("SELECT * FROM folgas WHERE funcionario_id=? AND loja_id=? AND mes=? AND ano=?",[funcId,req.session.lojaId,mes,ano]))}catch(e){res.status(500).json({erro:e.message})}})
app.post('/api/folgas',auth,async(req,res)=>{try{const{funcionarioId,mes,ano,dias}=req.body;await dbRun("DELETE FROM folgas WHERE funcionario_id=? AND loja_id=? AND mes=? AND ano=?",[funcionarioId,req.session.lojaId,mes,ano]);if(dias&&dias.length>0){for(const d of dias){await dbRun("INSERT INTO folgas(funcionario_id,loja_id,mes,ano,dia)VALUES(?,?,?,?,?)",[funcionarioId,req.session.lojaId,mes,ano,d])}}res.json({ok:true})}catch(e){res.status(500).json({erro:e.message})}})
app.get('/api/relatorio',auth,async(req,res)=>{try{
  const funcs=await dbAll("SELECT * FROM funcionarios WHERE loja_id=? AND ativo=1",[req.session.lojaId])
  const cfg=await dbGet("SELECT * FROM config WHERE loja_id=?",[req.session.lojaId])||{horas_diarias:8,tolerancia_min:5}
  const result=[]
  for(const f of funcs){
    const regs=await dbAll("SELECT tipo,dt FROM registros WHERE funcionario_id=? ORDER BY dt ASC",[f.id])
    const porDia={}
    regs.forEach(r=>{const dia=r.dt.slice(0,10);if(!porDia[dia])porDia[dia]={};porDia[dia][r.tipo]=r.dt})
    let minTrab=0,entradas=0
    Object.values(porDia).forEach(d=>{if(d.entrada)entradas++;if(d.entrada&&d.saida){let p=0;if(d.pausa&&d.volta)p=(new Date(d.volta)-new Date(d.pausa))/60000;minTrab+=(new Date(d.saida)-new Date(d.entrada))/60000-p}})
    minTrab=Math.round(minTrab)
    const jornadaEsperada=cfg.horas_diarias*60*entradas
    const saldo=minTrab-jornadaEsperada
    const foto=await dbGet("SELECT COUNT(*) as n FROM registros WHERE funcionario_id=? AND foto_arquivo IS NOT NULL",[f.id])
    const status=saldo>cfg.tolerancia_min?'Hora extra':saldo<-cfg.tolerancia_min?'A compensar':entradas>0?'Regular':'Sem ponto'
    result.push({...f,entradas,minTrab,jornadaEsperada,saldo,fotos:foto.n,status})
  }
  res.json({funcionarios:result,config:cfg})
}catch(e){res.status(500).json({erro:e.message})}})
initDB().then(async()=>{
  await dbRun("CREATE TABLE IF NOT EXISTS folgas(id INTEGER PRIMARY KEY AUTOINCREMENT,funcionario_id INTEGER NOT NULL,loja_id INTEGER NOT NULL,mes INTEGER NOT NULL,ano INTEGER NOT NULL,dia INTEGER NOT NULL,UNIQUE(funcionario_id,loja_id,mes,ano,dia))")
  app.listen(PORT,'0.0.0.0',()=>{console.log('Sistema Ponto Shalom v2 rodando na porta '+PORT)})
}).catch(e=>{console.error('Erro:',e);process.exit(1)})
