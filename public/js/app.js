// ===== ESTADO GLOBAL =====
var TOKEN = localStorage.getItem('token') || null
var SESSION = JSON.parse(localStorage.getItem('session') || 'null')
var FUNCS = []
var CONFIG = { horas_diarias: 8, tolerancia_min: 5, dias_fotos: 30 }
var camStream = null
var pendente = null
var apuracaoAtual = null
var detalheAtual = null

// ===== UTILITARIOS =====
function el(id) { return document.getElementById(id) }
function ini(nome) { return nome.split(' ').map(function(p){return p[0]}).slice(0,2).join('').toUpperCase() }
function fmtH(mins) {
  var m = Math.abs(Math.round(mins))
  var h = Math.floor(m/60), mn = m%60
  return h+'h'+(mn>0?mn+'min':'')
}
function fmtDT(dt) {
  var d = new Date(dt)
  return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
}
function fmtData(dt) { return new Date(dt).toLocaleDateString('pt-BR') }
function fmtHora(dt) { return new Date(dt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) }
function showErr(id, msg) { var e=el(id); e.querySelector('span')?e.querySelector('span').textContent=msg:e.textContent=msg; e.style.display='flex' }
function hideErr(id) { el(id).style.display='none' }

// Relogio
setInterval(function() {
  var e = el('hdr-clock')
  if (e) e.textContent = new Date().toLocaleTimeString('pt-BR')
}, 1000)

// ===== API =====
async function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json', 'x-session': TOKEN || '' } }
  if (body) opts.body = JSON.stringify(body)
  var res = await fetch('/api' + path, opts)
  var data = await res.json()
  if (!res.ok) throw new Error(data.erro || 'Erro')
  return data
}

// ===== LOGIN =====
async function initLogin() {
  try {
    var lojas = await api('GET', '/lojas')
    var ll = el('ll')
    ll.innerHTML = '<option value="">-- Selecione a loja --</option>'
    lojas.forEach(function(l) { var o=document.createElement('option'); o.value=l; o.textContent=l; ll.appendChild(o) })
  } catch(e) { console.error('Erro ao carregar lojas:', e) }
  if (TOKEN && SESSION) showMain()
}

async function login() {
  var loja = el('ll').value, senha = el('ls').value
  if (!loja) { showErr('le', 'Selecione uma loja.'); return }
  if (!senha) { showErr('le', 'Digite a senha.'); return }
  try {
    hideErr('le')
    var data = await api('POST', '/login', { loja: loja, senha: senha })
    TOKEN = data.token
    SESSION = { lojaId: data.lojaId, lojaNome: data.lojaNome, role: data.role }
    localStorage.setItem('token', TOKEN)
    localStorage.setItem('session', JSON.stringify(SESSION))
    showMain()
  } catch(e) { showErr('le', e.message) }
}

async function logout() {
  try { await api('POST', '/logout') } catch(_) {}
  TOKEN = null; SESSION = null
  localStorage.removeItem('token'); localStorage.removeItem('session')
  location.reload()
}

function showMain() {
  el('pg-login').style.display = 'none'
  el('pg-main').style.display = 'block'
  el('hdr-loja').textContent = SESSION.lojaNome
  el('hdr-role').textContent = SESSION.role === 'master' ? 'Master' : 'Gerente'
  loadConfig()
  loadFuncs()
}

// ===== CONFIG =====
async function loadConfig() {
  try {
    CONFIG = await api('GET', '/config')
    el('cfg-h').value = CONFIG.horas_diarias
    el('cfg-t').value = CONFIG.tolerancia_min
    el('cfg-dias').value = CONFIG.dias_fotos
  } catch(_) {}
}

async function salvarConfig() {
  try {
    await api('PUT', '/config', {
      horas_diarias: parseInt(el('cfg-h').value) || 8,
      tolerancia_min: parseInt(el('cfg-t').value) || 5,
      dias_fotos: parseInt(el('cfg-dias').value) || 30
    })
    await loadConfig()
    alert('Configuracoes salvas!')
  } catch(e) { alert('Erro: '+e.message) }
}

// ===== FUNCIONARIOS =====
async function loadFuncs() {
  try {
    FUNCS = await api('GET', '/funcionarios')
    renderFuncBody()
    atualizarSelects()
  } catch(_) {}
}

function atualizarSelects() {
  var sels = ['func-sel','hist-func','foto-ff']
  sels.forEach(function(sid) {
    var s = el(sid); if (!s) return
    var v = s.value
    s.innerHTML = sid === 'func-sel' ? '<option value="">-- Selecione --</option>' : '<option value="">Todos</option>'
    FUNCS.forEach(function(f) { var o=document.createElement('option'); o.value=f.id; o.textContent=f.nome; s.appendChild(o) })
    if (v) s.value = v
  })
}

function renderFuncBody() {
  var fb = el('func-body'); if (!fb) return
  fb.innerHTML = FUNCS.map(function(f) {
    var jorn = f.hora_inicio && f.hora_fim ? '<span class="badge bi"><i class="ti ti-clock"></i> '+f.hora_inicio+' - '+f.hora_fim+'</span>' : '<span class="badge bg">Sem jornada</span>'
    return '<tr><td><div style="display:flex;align-items:center;gap:8px;"><div class="av">'+ini(f.nome)+'</div>'+f.nome+'</div></td><td>'+f.cargo+'</td><td>'+jorn+'</td><td><span class="badge bk">Ativo</span></td><td><div class="row gap-8"><button class="btn btn-sm btn-i" onclick=\'abrirModal('+JSON.stringify(f).replace(/'/g,"&#39;")+')\'>Editar</button><button class="btn btn-sm" onclick=\'abrirModalFolgas('+JSON.stringify(f).replace(/'/g,"&#39;")+')\'>Folgas</button></div></td></tr>'
  }).join('')
}

async function cadastrarFunc() {
  var nome = el('novo-nome').value.trim(), cargo = el('novo-cargo').value.trim()
  var hi = el('novo-inicio').value.trim(), hf = el('novo-fim').value.trim()
  if (!nome) { alert('Informe o nome.'); return }
  try {
    await api('POST', '/funcionarios', { nome: nome, cargo: cargo, hora_inicio: hi||null, hora_fim: hf||null })
    el('novo-nome').value=''; el('novo-cargo').value=''; el('novo-inicio').value=''; el('novo-fim').value=''
    await loadFuncs()
  } catch(e) { alert('Erro: '+e.message) }
}

function abrirModal(func) {
  el('edit-func-id').value = func.id
  el('edit-nome').value = func.nome
  el('edit-cargo').value = func.cargo || ''
  el('edit-inicio').value = func.hora_inicio || ''
  el('edit-fim').value = func.hora_fim || ''
  el('edit-ok').style.display = 'none'
  el('modal-jornada').style.display = 'flex'
}

function fecharModal() { el('modal-jornada').style.display = 'none' }

async function salvarJornada() {
  var id = el('edit-func-id').value
  var nome = el('edit-nome').value.trim(), cargo = el('edit-cargo').value.trim()
  var hi = el('edit-inicio').value.trim(), hf = el('edit-fim').value.trim()
  if (!nome) { alert('Informe o nome.'); return }
  try {
    await api('PUT', '/funcionarios/'+id, { nome: nome, cargo: cargo, hora_inicio: hi||null, hora_fim: hf||null })
    el('edit-ok').style.display = 'flex'
    setTimeout(function(){ fecharModal(); loadFuncs() }, 1000)
  } catch(e) { alert('Erro: '+e.message) }
}

// ===== MODAL FOLGAS =====
function abrirModalFolgas(func) {
  el('folgas-func-id').value = func.id
  el('folgas-titulo').textContent = 'Folgas - ' + func.nome
  var anoSel = el('folgas-ano'), anoAtual = new Date().getFullYear()
  anoSel.innerHTML = ''
  for (var a = anoAtual; a >= anoAtual-2; a--) {
    var o = document.createElement('option'); o.value=a; o.textContent=a; anoSel.appendChild(o)
  }
  el('folgas-mes').value = new Date().getMonth() + 1
  el('folgas-dias').value = ''
  el('folgas-ok').style.display = 'none'
  el('modal-folgas').style.display = 'flex'
  carregarFolgas(func.id)
}

async function carregarFolgas(funcId) {
  try {
    var mes = el('folgas-mes').value, ano = el('folgas-ano').value
    var folgas = await api('GET', '/folgas?funcId='+funcId+'&mes='+mes+'&ano='+ano)
    el('folgas-dias').value = folgas.map(function(f){return f.dia}).join(', ')
  } catch(_) {}
}

function fecharModalFolgas() { el('modal-folgas').style.display = 'none' }

async function salvarFolgas() {
  var funcId = el('folgas-func-id').value
  var mes = el('folgas-mes').value, ano = el('folgas-ano').value
  var diasStr = el('folgas-dias').value
  var dias = diasStr ? diasStr.split(',').map(function(d){return parseInt(d.trim())}).filter(function(d){return !isNaN(d)&&d>0&&d<=31}) : []
  try {
    await api('POST', '/folgas', { funcionarioId: funcId, mes: parseInt(mes), ano: parseInt(ano), dias: dias })
    el('folgas-ok').style.display = 'flex'
    setTimeout(function(){ el('folgas-ok').style.display='none' }, 2000)
  } catch(e) { alert('Erro: '+e.message) }
}

// ===== REGISTRO DE PONTO =====
function iniciarReg(tipo) {
  var funcId = el('func-sel').value
  if (!funcId) { alert('Selecione um funcionario.'); return }
  var func = FUNCS.find(function(f){return String(f.id)===String(funcId)})
  pendente = { funcId: funcId, tipo: tipo, funcNome: func ? func.nome : '' }
  abrirCamera()
}

async function abrirCamera() {
  el('cam-card').style.display = 'block'
  el('conf-card').style.display = 'none'
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    el('cam-video').srcObject = camStream
  } catch(e) { alert('Erro ao abrir camera: '+e.message) }
}

function tirarFoto() {
  var video = el('cam-video'), canvas = el('cam-canvas')
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  var dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  pararCamera()
  el('cam-card').style.display = 'none'
  el('conf-card').style.display = 'block'
  el('reg-ok').style.display = 'none'
  el('reg-err').style.display = 'none'
  el('conf-foto').src = dataUrl
  var tipos = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
  el('conf-info').innerHTML = '<strong>'+pendente.funcNome+'</strong> - '+tipos[pendente.tipo]
  pendente.foto = dataUrl
}

function pararCamera() {
  if (camStream) { camStream.getTracks().forEach(function(t){t.stop()}); camStream = null }
}

function cancelarReg() {
  pararCamera()
  el('cam-card').style.display = 'none'
  el('conf-card').style.display = 'none'
  pendente = null
}

async function confirmarReg() {
  if (!pendente) return
  try {
    var r = await api('POST', '/registros', { funcionarioId: pendente.funcId, tipo: pendente.tipo, fotoBase64: pendente.foto || null })
    el('reg-ok').querySelector('span').textContent = 'Registro confirmado!'
    el('reg-ok').style.display = 'flex'
    el('reg-err').style.display = 'none'
    setTimeout(function(){ el('conf-card').style.display='none'; pendente=null }, 2000)
  } catch(e) {
    el('reg-err').querySelector('span').textContent = e.message
    el('reg-err').style.display = 'flex'
    el('reg-ok').style.display = 'none'
  }
}

// ===== HISTORICO =====
async function renderHist() {
  var funcId = el('hist-func').value, tipo = el('hist-tipo').value
  var url = '/registros?limite=100'
  if (funcId) url += '&funcId='+funcId
  if (tipo) url += '&tipo='+tipo
  try {
    var regs = await api('GET', url)
    var tipos = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta' }
    var cores = { entrada: 'bk', saida: 'bd', pausa: 'bw', volta: 'bi' }
    el('hist-body').innerHTML = regs.map(function(r) {
      var foto = r.foto_arquivo ? '<a href="/fotos/'+r.foto_arquivo+'" target="_blank" class="btn btn-sm"><i class="ti ti-photo"></i> Ver</a>' : '--'
      return '<tr><td>'+r.funcNome+'</td><td><span class="badge '+cores[r.tipo]+'">'+tipos[r.tipo]+'</span></td><td>'+fmtDT(r.dt)+'</td><td>'+foto+'</td></tr>'
    }).join('')
  } catch(_) {}
}

// ===== FOTOS =====
async function renderFotos() {
  var funcId = el('foto-ff').value
  var url = '/fotos' + (funcId ? '?funcId='+funcId : '')
  try {
    var fotos = await api('GET', url)
    el('foto-info').textContent = fotos.length + ' foto(s) armazenadas'
    var tipos = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta' }
    var cores = { entrada: 'bk', saida: 'bd', pausa: 'bw', volta: 'bi' }
    if (!fotos.length) { el('foto-grid').innerHTML = ''; el('foto-empty').style.display='block'; return }
    el('foto-empty').style.display = 'none'
    el('foto-grid').innerHTML = fotos.map(function(f) {
      return '<div class="foto-card"><img src="/fotos/'+f.foto_arquivo+'" alt="Foto" style="cursor:pointer;" onclick="window.open(\'/fotos/'+f.foto_arquivo+'\',\'_blank\')"/><div style="font-size:12px;font-weight:500;margin-bottom:3px;">'+f.funcNome+'</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px;">'+fmtDT(f.dt)+'</div><span class="badge '+cores[f.tipo]+'">'+tipos[f.tipo]+'</span></div>'
    }).join('')
  } catch(_) {}
}

async function descartarFotos() {
  if (!confirm('Descartar fotos com mais de '+CONFIG.dias_fotos+' dias?')) return
  try { var r = await api('DELETE', '/fotos/antigas'); alert(r.removidas+' fotos descartadas.') } catch(e) { alert('Erro: '+e.message) }
}

// ===== RELATORIO =====
async function renderRel() {
  try {
    var d = await api('GET', '/relatorio')
    var funcs = d.funcionarios, cfg = d.config
    var totalE = funcs.reduce(function(s,f){return s+f.entradas},0)
    var totalExtra = funcs.reduce(function(s,f){return s+(f.saldo>0?f.saldo:0)},0)
    var totalDeve = funcs.reduce(function(s,f){return s+(f.saldo<0?Math.abs(f.saldo):0)},0)
    el('rel-metrics').innerHTML = '<div class="metric"><div class="ml">Funcionarios</div><div class="mv">'+funcs.length+'</div></div><div class="metric"><div class="ml">Total entradas</div><div class="mv">'+totalE+'</div></div><div class="metric"><div class="ml">Horas extras</div><div class="mv" style="color:var(--red)">'+fmtH(totalExtra)+'</div></div><div class="metric"><div class="ml">A compensar</div><div class="mv" style="color:var(--warn)">'+fmtH(totalDeve)+'</div></div>'
    el('rel-body').innerHTML = funcs.map(function(f) {
      var pct = Math.min(100, f.jornadaEsperada>0?Math.round(f.minTrab/f.jornadaEsperada*100):0)
      var saldoTxt = f.saldo>0?'+'+fmtH(f.saldo):f.saldo<0?'-'+fmtH(Math.abs(f.saldo)):'0h'
      var corSaldo = f.saldo>cfg.tolerancia_min?'var(--red)':f.saldo<-cfg.tolerancia_min?'var(--warn)':'var(--green)'
      var badge = f.status==='Hora extra'?'<span class="badge bd">'+f.status+'</span>':f.status==='A compensar'?'<span class="badge bw">'+f.status+'</span>':f.status==='Regular'?'<span class="badge bk">'+f.status+'</span>':'<span class="badge bg">'+f.status+'</span>'
      return '<tr><td><div style="display:flex;align-items:center;gap:8px;"><div class="av">'+ini(f.nome)+'</div>'+f.nome+'</div></td><td>'+f.entradas+'</td><td>'+fmtH(f.minTrab)+'</td><td><div style="display:flex;align-items:center;gap:6px;"><div class="pb" style="width:60px;"><div class="pf" style="width:'+pct+'%;"></div></div>'+pct+'%</div></td><td style="color:'+corSaldo+';font-weight:500;">'+saldoTxt+'</td><td>'+f.fotos+'</td><td>'+badge+'</td></tr>'
    }).join('')
  } catch(_) {}
}

// ===== APURACAO =====
function initApuracao() {
  var anoSel = el('apur-ano'), anoAtual = new Date().getFullYear()
  if (!anoSel.options.length) {
    for (var a = anoAtual; a >= anoAtual-2; a--) {
      var o = document.createElement('option'); o.value=a; o.textContent=a; anoSel.appendChild(o)
    }
    el('apur-mes').value = new Date().getMonth() + 1
  }
}

async function carregarApuracao() {
  var mes = parseInt(el('apur-mes').value)
  var ano = parseInt(el('apur-ano').value)
  var diasNoMes = new Date(ano, mes, 0).getDate()
  var diasUteis = 0
  for (var d = 1; d <= diasNoMes; d++) {
    var diaSemana = new Date(ano, mes-1, d).getDay()
    if (diaSemana !== 0) diasUteis++
  }
  var nomeMes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1]
  try {
    var regs = await api('GET', '/registros?limite=5000')
    var rows = []
    var totalMins = 0
    for (var i = 0; i < FUNCS.length; i++) {
      var func = FUNCS[i]
      // Buscar folgas do funcionario no mes
      var folgasData = []
      try { folgasData = await api('GET', '/folgas?funcId='+func.id+'&mes='+mes+'&ano='+ano) } catch(_) {}
      var diasFolga = folgasData.map(function(f){return f.dia})

      var regsFunc = regs.filter(function(r){return String(r.funcionario_id)===String(func.id)})
      var porDia = {}
      regsFunc.forEach(function(r) {
        var dataStr = new Date(r.dt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})
        var partes = dataStr.split('/')
        var dNum = parseInt(partes[0]), mNum = parseInt(partes[1]), aNum = parseInt(partes[2])
        if (mNum === mes && aNum === ano) {
          if (!porDia[dNum]) porDia[dNum] = {}
          porDia[dNum][r.tipo] = r.dt
        }
      })

      var minsTrabalhados = 0, diasTrabalhados = 0, diasCompletos = 0
      Object.keys(porDia).forEach(function(diaKey) {
        var d = porDia[diaKey]
        if (d.entrada) diasTrabalhados++
        if (d.entrada && d.saida) {
          var p = 0
          if (d.pausa && d.volta) p = (new Date(d.volta)-new Date(d.pausa))/60000
          minsTrabalhados += (new Date(d.saida)-new Date(d.entrada))/60000 - p
          diasCompletos++
        }
      })
      minsTrabalhados = Math.round(minsTrabalhados)
      totalMins += minsTrabalhados

      // Calcular horas esperadas considerando folgas e domingos
      var minsEsperados = 0
      for (var dNum = 1; dNum <= diasNoMes; dNum++) {
        var diaSemana = new Date(ano, mes-1, dNum).getDay()
        var ehFolga = diasFolga.indexOf(dNum) >= 0
        if (!ehFolga) {
          if (diaSemana === 0) minsEsperados += 6*60  // domingo = 6h
          else minsEsperados += CONFIG.horas_diarias*60  // outros dias = horas configuradas
        }
      }

      var saldoMins = minsTrabalhados - minsEsperados
      var diasEsperados = diasNoMes - diasFolga.length
      var faltas = Math.max(0, diasEsperados - diasTrabalhados)
      rows.push({ func: func, diasTrabalhados: diasTrabalhados, diasCompletos: diasCompletos, diasUteis: diasNoMes, diasEsperados: diasEsperados, minsTrabalhados: minsTrabalhados, minsEsperados: minsEsperados, saldoMins: saldoMins, faltas: faltas, porDia: porDia })
    }
    apuracaoAtual = { rows: rows, nomeMes: nomeMes, ano: ano, diasUteis: diasNoMes, lojaNome: SESSION.lojaNome }

    var totalExtra = rows.reduce(function(s,r){return s+Math.max(0,r.saldoMins)},0)
    var totalDeve = rows.reduce(function(s,r){return s+Math.max(0,-r.saldoMins)},0)
    var totalFaltas = rows.reduce(function(s,r){return s+r.faltas},0)
    el('apur-metrics').innerHTML = '<div class="metric"><div class="ml">Mes</div><div class="mv" style="font-size:16px;">'+nomeMes+' '+ano+'</div></div><div class="metric"><div class="ml">Dias no mes</div><div class="mv">'+diasNoMes+'</div></div><div class="metric"><div class="ml">Horas extras</div><div class="mv" style="color:var(--red)">'+fmtH(totalExtra)+'</div></div><div class="metric"><div class="ml">A compensar</div><div class="mv" style="color:var(--warn)">'+fmtH(totalDeve)+'</div></div><div class="metric"><div class="ml">Faltas</div><div class="mv" style="color:var(--red)">'+totalFaltas+'</div></div>'

    el('apur-body').innerHTML = rows.map(function(r) {
      var saldoTxt = r.saldoMins>0?'+'+fmtH(r.saldoMins):r.saldoMins<0?'-'+fmtH(Math.abs(r.saldoMins)):'0h'
      var corSaldo = r.saldoMins>CONFIG.tolerancia_min*60?'var(--red)':r.saldoMins<-CONFIG.tolerancia_min*60?'var(--warn)':'var(--green)'
      var badge = r.saldoMins>CONFIG.tolerancia_min*60?'<span class="badge bd">Hora extra</span>':r.saldoMins<-CONFIG.tolerancia_min*60?'<span class="badge bw">A compensar</span>':r.diasTrabalhados>0?'<span class="badge bk">Regular</span>':'<span class="badge bg">Sem reg.</span>'
      return '<tr style="cursor:pointer;" onclick="verDetalhe('+JSON.stringify(r.func).replace(/"/g,"'")+', '+JSON.stringify(r.porDia).replace(/"/g,"'")+', \''+nomeMes+' '+ano+'\')"><td><div style="display:flex;align-items:center;gap:8px;"><div class="av">'+ini(r.func.nome)+'</div>'+r.func.nome+'</div></td><td>'+r.diasTrabalhados+' / '+r.diasEsperados+'</td><td>'+fmtH(r.minsTrabalhados)+'</td><td>'+fmtH(r.minsEsperados)+'</td><td style="color:'+corSaldo+';font-weight:500;">'+saldoTxt+'</td><td style="color:'+(r.faltas>0?'var(--red)':'var(--muted)')+'">'+r.faltas+'</td><td>'+badge+'</td></tr>'
    }).join('')
    el('apur-detalhe-card').style.display = 'none'
  } catch(e) { console.error(e) }
}

function verDetalhe(func, porDia, periodo) {
  detalheAtual = { func: func, porDia: porDia, periodo: periodo }
  el('apur-detalhe-titulo').textContent = func.nome + ' - ' + periodo
  var dias = Object.keys(porDia).sort(function(a,b){return parseInt(a)-parseInt(b)})
  var DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
  var mesAno = periodo.split(' ')
  var meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  var mes = meses.indexOf(mesAno[0])+1, ano = parseInt(mesAno[1])

  function calcMins(d) {
    if (!d.entrada || !d.saida) return 0
    var p = 0; if (d.pausa && d.volta) p = (new Date(d.volta)-new Date(d.pausa))/60000
    return Math.round((new Date(d.saida)-new Date(d.entrada))/60000-p)
  }

  el('apur-detalhe-body').innerHTML = dias.map(function(diaNum) {
    var d = porDia[diaNum]
    var dt = new Date(ano, mes-1, parseInt(diaNum))
    var diaSemana = DIAS_PT[dt.getDay()]
    var mins = calcMins(d)
    var status = !d.entrada ? 'Falta' : !d.saida ? 'Incompleto' : 'Ok'
    var corStatus = status==='Ok'?'var(--green)':status==='Falta'?'var(--red)':'var(--warn)'
    return '<tr><td>'+String(diaNum).padStart(2,'0')+'/'+(mes<10?'0':'')+mes+'/'+ano+'</td><td>'+diaSemana+'</td><td>'+(d.entrada?fmtHora(d.entrada):'--')+'</td><td>'+(d.pausa?fmtHora(d.pausa):'--')+'</td><td>'+(d.volta?fmtHora(d.volta):'--')+'</td><td>'+(d.saida?fmtHora(d.saida):'--')+'</td><td>'+(mins>0?fmtH(mins):'0h')+'</td><td style="color:'+corStatus+'">'+status+'</td></tr>'
  }).join('')
  el('apur-detalhe-card').style.display = 'block'
}

// ===== SENHAS E LOJAS (MASTER) =====
async function alterarSenha() {
  var s = el('nova-senha').value
  if (!s || s.length < 4) { alert('Minimo 4 caracteres.'); return }
  try { await api('PUT', '/senha', { senha: s }); el('nova-senha').value=''; el('senha-ok').style.display='flex'; setTimeout(function(){el('senha-ok').style.display='none'},2000) } catch(e) { alert('Erro: '+e.message) }
}

async function renomearLoja() {
  var nome = el('novo-nome-loja').value.trim()
  if (!nome) { alert('Informe o novo nome.'); return }
  try {
    var r = await api('PUT', '/loja/renomear', { nome: nome })
    SESSION.lojaNome = r.nome; el('hdr-loja').textContent = r.nome; el('novo-nome-loja').value=''
    el('loja-ok').style.display='flex'; setTimeout(function(){el('loja-ok').style.display='none'},2000)
    if (SESSION.role==='master') renderTodasLojas()
  } catch(e) { alert('Erro: '+e.message) }
}

async function renderTodasLojas() {
  if (SESSION.role !== 'master') return
  try {
    var lojas = await api('GET', '/lojas/todas')
    el('card-todas-lojas').style.display = 'block'
    el('todas-lojas-body').innerHTML = lojas.map(function(l) {
      return '<tr><td><strong>'+l.nome+'</strong></td><td>'+l.senha+'</td><td><input type="password" id="sl-'+l.id+'" placeholder="Nova senha" style="width:130px;margin-bottom:0;padding:6px 10px;font-size:12px;"/></td><td><button class="btn btn-sm btn-i" onclick="alterarSenhaLoja('+l.id+')">Salvar</button></td></tr>'
    }).join('')
  } catch(_) {}
}

async function alterarSenhaLoja(id) {
  var s = el('sl-'+id).value
  if (!s || s.length < 4) { alert('Minimo 4 caracteres.'); return }
  try { await api('PUT', '/lojas/'+id+'/senha', { senha: s }); el('sl-'+id).value=''; alert('Senha alterada!'); renderTodasLojas() } catch(e) { alert('Erro: '+e.message) }
}

// ===== PDF =====
function gerarPDF() {
  if (!apuracaoAtual) { alert('Carregue a apuracao primeiro.'); return }
  var { rows, nomeMes, ano, lojaNome } = apuracaoAtual
  var { jsPDF } = window.jspdf
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  var W = 210, mg = 14

  doc.setFillColor(24,95,165); doc.rect(0,0,W,28,'F')
  doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont(undefined,'bold')
  doc.text('Grupo Shalom', mg, 11)
  doc.setFontSize(10); doc.setFont(undefined,'normal')
  doc.text('Folha de Ponto - '+nomeMes+' '+ano, mg, 18)
  doc.text(lojaNome, mg, 24)
  doc.text('Gerado em: '+new Date().toLocaleString('pt-BR'), W-mg, 18, {align:'right'})

  var tableData = rows.map(function(r) {
    var saldo = r.saldoMins
    var saldoTxt = saldo>0?'+'+fmtH(saldo):saldo<0?'-'+fmtH(Math.abs(saldo)):'0h'
    var status = saldo>CONFIG.tolerancia_min*60?'Hora extra':saldo<-CONFIG.tolerancia_min*60?'A compensar':r.diasTrabalhados>0?'Regular':'Sem reg.'
    return [r.func.nome, r.func.cargo||'--', r.diasTrabalhados+' / '+r.diasEsperados, fmtH(r.minsTrabalhados), fmtH(r.minsEsperados), saldoTxt, r.faltas>0?String(r.faltas):'--', status]
  })

  doc.autoTable({
    startY: 36,
    head: [['Funcionario','Cargo','Dias','Horas trab.','Esperado','Saldo','Faltas','Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [24,95,165], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245,247,250] },
    columnStyles: { 0:{cellWidth:38}, 1:{cellWidth:25}, 2:{cellWidth:16,halign:'center'}, 3:{cellWidth:22,halign:'center'}, 4:{cellWidth:22,halign:'center'}, 5:{cellWidth:16,halign:'center'}, 6:{cellWidth:13,halign:'center'}, 7:{cellWidth:24,halign:'center'} },
    didParseCell: function(data) {
      if (data.section==='body') {
        if (data.column.index===5) { if (data.cell.raw.startsWith('+')) data.cell.styles.textColor=[163,45,45]; else if (data.cell.raw.startsWith('-')) data.cell.styles.textColor=[133,79,11] }
        if (data.column.index===7) { if (data.cell.raw==='Regular') data.cell.styles.textColor=[59,109,17]; else if (data.cell.raw==='Hora extra') data.cell.styles.textColor=[163,45,45]; else if (data.cell.raw==='A compensar') data.cell.styles.textColor=[133,79,11] }
      }
    }
  })

  var totalExtra = rows.reduce(function(s,r){return s+Math.max(0,r.saldoMins)},0)
  var totalDeve = rows.reduce(function(s,r){return s+Math.max(0,-r.saldoMins)},0)
  var fy = doc.lastAutoTable.finalY + 6
  doc.setFontSize(9); doc.setTextColor(80,80,80)
  doc.text('Total horas extras: '+fmtH(totalExtra)+'   |   Total a compensar: '+fmtH(totalDeve), mg, fy)

  var pH = doc.internal.pageSize.height
  doc.setDrawColor(200,200,200); doc.line(mg,pH-14,W-mg,pH-14)
  doc.setFontSize(8); doc.setTextColor(150,150,150)
  doc.text('Grupo Shalom - Sistema de Registro de Ponto', mg, pH-8)
  doc.save('folha_ponto_'+nomeMes+'_'+ano+'.pdf')
}

function gerarPDFDetalhe() {
  if (!detalheAtual) return
  var { func, porDia, periodo } = detalheAtual
  var { jsPDF } = window.jspdf
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  var W = 210, mg = 14
  var mesAno = periodo.split(' ')
  var meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  var mes = meses.indexOf(mesAno[0])+1, ano = parseInt(mesAno[1])

  doc.setFillColor(24,95,165); doc.rect(0,0,W,28,'F')
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont(undefined,'bold')
  doc.text('Grupo Shalom - Folha Individual', mg, 11)
  doc.setFontSize(10); doc.setFont(undefined,'normal')
  doc.text(func.nome+' - '+func.cargo, mg, 18)
  doc.text(periodo, mg, 24)

  var DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
  var dias = Object.keys(porDia).sort(function(a,b){return parseInt(a)-parseInt(b)})
  var totalMins = 0
  var tableData = dias.map(function(dNum) {
    var d = porDia[dNum]
    var dt = new Date(ano, mes-1, parseInt(dNum))
    var p = 0; if (d.pausa && d.volta) p = (new Date(d.volta)-new Date(d.pausa))/60000
    var mins = d.entrada && d.saida ? Math.round((new Date(d.saida)-new Date(d.entrada))/60000-p) : 0
    totalMins += mins
    return [String(dNum).padStart(2,'0')+'/'+(mes<10?'0':'')+mes, DIAS_PT[dt.getDay()], d.entrada?fmtHora(d.entrada):'--', d.pausa?fmtHora(d.pausa):'--', d.volta?fmtHora(d.volta):'--', d.saida?fmtHora(d.saida):'--', mins>0?fmtH(mins):'0h', !d.entrada?'Falta':!d.saida?'Incompleto':'Ok']
  })

  doc.autoTable({
    startY: 36,
    head: [['Data','Dia','Entrada','Pausa','Volta','Saida','Horas','Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [24,95,165], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245,247,250] },
    columnStyles: { 0:{cellWidth:22,halign:'center'}, 1:{cellWidth:14,halign:'center'}, 2:{cellWidth:22,halign:'center'}, 3:{cellWidth:22,halign:'center'}, 4:{cellWidth:22,halign:'center'}, 5:{cellWidth:22,halign:'center'}, 6:{cellWidth:20,halign:'center'}, 7:{cellWidth:24,halign:'center'} },
    didParseCell: function(data) {
      if (data.section==='body'&&data.column.index===7) {
        if (data.cell.raw==='Ok') data.cell.styles.textColor=[59,109,17]
        else if (data.cell.raw==='Falta') data.cell.styles.textColor=[163,45,45]
        else data.cell.styles.textColor=[133,79,11]
      }
    }
  })

  var fy = doc.lastAutoTable.finalY + 6
  var jornadaEsp = dias.length * CONFIG.horas_diarias * 60
  var saldo = totalMins - jornadaEsp
  var saldoTxt = saldo>0?'+'+fmtH(saldo):saldo<0?'-'+fmtH(Math.abs(saldo)):'0h'
  doc.setFontSize(9); doc.setTextColor(80,80,80)
  doc.text('Total dias: '+dias.length+' | Horas trabalhadas: '+fmtH(totalMins)+' | Saldo: '+saldoTxt, mg, fy)

  var sigY = fy + 24
  doc.setDrawColor(150,150,150)
  doc.line(mg, sigY, mg+70, sigY); doc.line(W-mg-70, sigY, W-mg, sigY)
  doc.setFontSize(8); doc.setTextColor(120,120,120)
  doc.text('Assinatura do Funcionario', mg+35, sigY+5, {align:'center'})
  doc.text('Assinatura do Gerente', W-mg-35, sigY+5, {align:'center'})

  doc.save('ponto_'+func.nome.replace(/ /g,'_')+'_'+periodo.replace(/ /g,'_')+'.pdf')
}

// ===== NAVEGACAO =====
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on')})
  if (btn) btn.classList.add('on')
  document.querySelectorAll('.pg').forEach(function(p){p.style.display='none'})
  el('pg-'+name).style.display = 'block'
  if (name==='hist') renderHist()
  if (name==='rel') renderRel()
  if (name==='fotos') renderFotos()
  if (name==='apuracao') initApuracao()
  if (name==='cfg') { renderFuncBody(); if (SESSION&&SESSION.role==='master') renderTodasLojas() }
}

// ===== INICIAR =====
initLogin()
