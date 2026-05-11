// Estado global
let TOKEN = localStorage.getItem('ponto_token') || null
let SESSION = JSON.parse(localStorage.getItem('ponto_session') || 'null')
let FUNCS = []
let CONFIG = { horas_diarias: 8, tolerancia_min: 10, dias_fotos: 30 }
let camStream = null
let pendente = { funcId: null, tipo: null, fNome: null }
let fotoDataUrl = null

// Helpers
const el = id => document.getElementById(id)
const fmtH = m => { const h = Math.floor(m / 60), mn = Math.round(m % 60); return h + 'h' + (mn ? mn.toString().padStart(2, '0') : '') }
const fmtDT = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ini = n => n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-session': TOKEN || '' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch('/api' + path, opts)
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.erro || 'Erro na requisicao')
    err.data = data
    err.status = res.status
    throw err
  }
  return data
}

// Relogio
setInterval(() => {
  if (SESSION) el('hdr-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}, 1000)

// Init - carregar lojas
async function initLogin() {
  const lojas = await api('GET', '/lojas')
  const ll = el('ll')
  ll.innerHTML = '<option value=""> Selecione a loja </option>'
  lojas.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; ll.appendChild(o) })
  if (TOKEN && SESSION) {
    showMain()
  }
}

async function login() {
  const loja = el('ll').value, senha = el('ls').value
  if (!loja) { showErr('le', 'Selecione uma loja.'); return }
  try {
    const data = await api('POST', '/login', { loja, senha })
    TOKEN = data.token
    SESSION = { lojaNome: data.lojaNome, role: data.role }
    localStorage.setItem('ponto_token', TOKEN)
    localStorage.setItem('ponto_session', JSON.stringify(SESSION))
    el('le').style.display = 'none'
    showMain()
  } catch (e) {
    showErr('le', e.message)
  }
}

async function logout() {
  try { await api('POST', '/logout') } catch (_) {}
  TOKEN = null; SESSION = null
  localStorage.removeItem('ponto_token')
  localStorage.removeItem('ponto_session')
  stopCam()
  el('screen-login').style.display = 'flex'
  el('screen-main').style.display = 'none'
  el('ls').value = ''
}

async function showMain() {
  el('screen-login').style.display = 'none'
  el('screen-main').style.display = 'block'
  el('hdr-loja').textContent = SESSION.lojaNome
  el('hdr-role').textContent = SESSION.role === 'master' ? 'Master' : 'Gerente'
  await loadConfig()
  await loadFuncs()
  renderHist()
  renderRel()
  renderFotos()
}

async function loadConfig() {
  try {
    CONFIG = await api('GET', '/config')
    el('cfg-h').value = CONFIG.horas_diarias
    el('cfg-t').value = CONFIG.tolerancia_min
    el('cfg-dias').value = CONFIG.dias_fotos
  } catch (_) {}
}

async function loadFuncs() {
  FUNCS = await api('GET', '/funcionarios')

  // sel-func (registrar ponto)
  const sf = el('sel-func')
  sf.innerHTML = '<option value=""> Selecione o funcionario </option>'
  FUNCS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.nome; sf.appendChild(o) })

  // hf (filtro historico)
  const hf = el('hf')
  if (hf) {
    hf.innerHTML = '<option value="">Todos os funcionarios</option>'
    FUNCS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.nome; hf.appendChild(o) })
  }

  // foto-ff (filtro fotos)
  const ff = el('foto-ff')
  if (ff) {
    ff.innerHTML = '<option value="">Todos</option>'
    FUNCS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.nome; ff.appendChild(o) })
  }

  renderFuncBody()
}

// --- Registrar ponto ---
async function onFuncChange() {
  await updJorn()
}

async function updJorn() {
  const fid = el('sel-func').value, jb = el('jorn-bar')
  if (!fid) { jb.style.display = 'none'; return }
  try {
    const regs = await api('GET', `/registros?funcId=${fid}&limite=100`)
    const hoje = new Date().toDateString()
    const regsHoje = regs.filter(r => new Date(r.dt).toDateString() === hoje)
    const entrada = regsHoje.find(r => r.tipo === 'entrada')
    const saida = regsHoje.find(r => r.tipo === 'saida')
    const pausa = regsHoje.find(r => r.tipo === 'pausa')
    const volta = regsHoje.find(r => r.tipo === 'volta')
    jb.style.display = 'block'
    const je = el('jorn-extra')
    if (!entrada) {
      el('jorn-lbl').textContent = 'Sem registro hoje'
      el('jorn-pct').textContent = ''
      el('jorn-fill').style.width = '0%'
      je.style.display = 'none'
      return
    }
    if (entrada && !saida) {
      el('jorn-lbl').textContent = 'Jornada em andamento...'
      el('jorn-pct').textContent = ''
      el('jorn-fill').style.width = '30%'
      el('jorn-fill').style.background = '#185FA5'
      je.style.display = 'flex'
      je.className = 'alert alert-i'
      je.innerHTML = '<i class="ti ti-clock-play"></i><span>Horas calculadas apos registrar a saida</span>'
      return
    }
    // Entrada e saida registradas  calcular horas reais
    let pausaMins = 0
    if (pausa && volta) pausaMins = (new Date(volta.dt) - new Date(pausa.dt)) / 60000
    const minT = Math.max(0, (new Date(saida.dt) - new Date(entrada.dt)) / 60000 - pausaMins)
    const maxM = CONFIG.horas_diarias * 60
    const pct = Math.min(100, Math.round((minT / maxM) * 100))
    const extra = Math.max(0, minT - maxM)
    el('jorn-lbl').textContent = 'Jornada: ' + fmtH(Math.round(minT)) + ' / ' + CONFIG.horas_diarias + 'h'
    el('jorn-pct').textContent = pct + '%'
    el('jorn-fill').style.width = pct + '%'
    el('jorn-fill').style.background = extra > CONFIG.tolerancia_min ? '#E24B4A' : pct >= 80 ? '#639922' : '#185FA5'
    if (extra > CONFIG.tolerancia_min) {
      je.style.display = 'flex'
      je.className = 'alert alert-w'
      je.innerHTML = '<i class="ti ti-alert-triangle"></i><span>Hora extra: +' + fmtH(Math.round(extra)) + '</span>'
    } else {
      je.style.display = 'none'
    }
  } catch (_) {}
}

function selTipo(tipo) {
  const fid = el('sel-func').value
  if (!fid) { showErr('s1-err', 'Selecione um funcionario.'); return }
  el('s1-err').style.display = 'none'
  const func = FUNCS.find(f => f.id == fid)
  const L = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
  pendente = { funcId: fid, tipo, fNome: func.nome }
  el('s2-title').textContent = 'Confirmacao  ' + L[tipo]
  el('s2-sub').textContent = func.nome + '  ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  el('step1').style.display = 'none'
  el('step2').style.display = 'block'
  setStepDots(1)
  fotoDataUrl = null
  el('foto-preview').style.display = 'none'
  el('btn-cam').style.display = 'inline-flex'
  el('btn-foto').style.display = 'none'
  el('s2-err').style.display = 'none'
  stopCam()
}

function voltarStep1() {
  stopCam()
  el('step2').style.display = 'none'
  el('step1').style.display = 'block'
  setStepDots(0)
}

async function toggleCam() {
  if (camStream) { stopCam(); return }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 800 }, height: { ideal: 600 } }, audio: false })
    const vid = el('vid')
    vid.srcObject = camStream
    vid.style.display = 'block'
    el('cam-ph').style.display = 'none'
    el('btn-cam').innerHTML = '<i class="ti ti-camera-off"></i> Desligar'
    el('btn-foto').style.display = 'inline-flex'
    el('s2-err').style.display = 'none'
  } catch (e) {
    showErr('s2-err', 'Camera nao disponivel. Voce pode confirmar sem foto.')
    adicionarBtnSemFoto()
  }
}

function adicionarBtnSemFoto() {
  if (el('btn-semfoto')) return
  const b = document.createElement('button')
  b.className = 'btn'; b.id = 'btn-semfoto'
  b.innerHTML = '<i class="ti ti-user-check"></i> Confirmar sem foto'
  b.onclick = () => confirmarRegistro()
  el('cam-actions').appendChild(b)
}

function stopCam() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null }
  const vid = el('vid')
  vid.style.display = 'none'; vid.srcObject = null
  el('cam-ph').style.display = 'flex'
  el('btn-cam').innerHTML = '<i class="ti ti-camera"></i> Ativar camera'
  el('btn-foto').style.display = 'none'
}

function tirarFoto() {
  const vid = el('vid'), cv = el('snap-canvas')
  cv.width = vid.videoWidth || 800; cv.height = vid.videoHeight || 600
  const ctx = cv.getContext('2d')
  // Espelhar horizontalmente (corrige camera frontal)
  ctx.save(); ctx.scale(-1, 1); ctx.drawImage(vid, -cv.width, 0); ctx.restore()
  fotoDataUrl = cv.toDataURL('image/jpeg', 0.7)
  el('foto-img').src = fotoDataUrl
  el('foto-ok-msg').textContent = 'Foto capturada! Verifique e confirme o registro.'
  el('foto-preview').style.display = 'block'
  el('btn-foto').style.display = 'none'
  stopCam()
}

function refazerFoto() {
  fotoDataUrl = null
  el('foto-preview').style.display = 'none'
  el('btn-cam').style.display = 'inline-flex'
  toggleCam()
}

async function confirmarRegistro() {
  try {
    await api('POST', '/registros', { funcionarioId: pendente.funcId, tipo: pendente.tipo, fotoBase64: fotoDataUrl || null })
    const L = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
    el('s3-msg').textContent = L[pendente.tipo] + ' registrada!'
    el('s3-sub').textContent = pendente.fNome + '  ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (fotoDataUrl ? '  com foto' : '  sem foto')
    el('step2').style.display = 'none'
    el('step3').style.display = 'block'
    setStepDots(2)
    stopCam()
    renderHist(); renderRel()
  } catch (e) {
    if (e.status === 403 && e.data && e.data.bloqueado) {
      const errEl = el('s2-err')
      errEl.innerHTML = `<i class="ti ti-clock-pause" style="font-size:24px;flex-shrink:0;"></i><span>${e.data.mensagem}</span>`
      errEl.className = 'alert alert-w'
      errEl.style.display = 'flex'
    } else {
      const errEl = el('s2-err')
      errEl.innerHTML = `<i class="ti ti-alert-circle"></i><span>Erro ao registrar: ${e.message}</span>`
      errEl.className = 'alert alert-d'
      errEl.style.display = 'flex'
    }
  }
}

function novoRegistro() {
  el('step3').style.display = 'none'
  el('step1').style.display = 'block'
  el('sel-func').value = ''
  el('jorn-bar').style.display = 'none'
  fotoDataUrl = null; setStepDots(0)
  const bsf = el('btn-semfoto'); if (bsf) bsf.remove()
}

// --- Historico ---
async function renderHist() {
  const tb = el('hist-body'); if (!tb) return
  const ff = el('hf') ? el('hf').value : ''
  const ft = el('ht') ? el('ht').value : ''
  try {
    let url = '/registros?limite=80'
    if (ff) url += '&funcId=' + ff
    if (ft) url += '&tipo=' + ft
    const regs = await api('GET', url)
    if (!regs.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted);">Nenhum registro ainda</td></tr>'; return }
    const BC = { entrada: 'bk', saida: 'bd', pausa: 'bw', volta: 'bi' }
    const L = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
    tb.innerHTML = regs.map(r => `<tr>
      <td style="white-space:nowrap;">${fmtDT(r.dt)}</td>
      <td><div style="display:flex;align-items:center;gap:8px;"><div class="av">${ini(r.funcNome)}</div>${r.funcNome}</div></td>
      <td><span class="badge ${BC[r.tipo]}">${L[r.tipo]}</span></td>
      <td>${r.foto_arquivo ? '<span class="badge bk"><i class="ti ti-camera"></i> sim</span>' : '<span class="badge bg">nao</span>'}</td>
    </tr>`).join('')
  } catch (e) { tb.innerHTML = '<tr><td colspan="4" style="padding:12px;color:var(--muted);">Erro ao carregar</td></tr>' }
}

// --- Fotos ---
async function renderFotos() {
  const grid = el('foto-grid'), empty = el('foto-empty'); if (!grid) return
  const ff = el('foto-ff') ? el('foto-ff').value : ''
  try {
    let url = '/fotos?'
    if (ff) url += 'funcId=' + ff
    const fotos = await api('GET', url)
    el('foto-info').textContent = fotos.length + ' foto(s) armazenadas'
    if (!fotos.length) { grid.innerHTML = ''; empty.style.display = 'block'; return }
    empty.style.display = 'none'
    const L = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
    const BC = { entrada: 'bk', saida: 'bd', pausa: 'bw', volta: 'bi' }
    grid.innerHTML = fotos.map(f => `
      <div class="foto-card">
        <img src="/fotos/${f.foto_arquivo}?t=${TOKEN}" alt="Foto de ${f.funcNome}"/>
        <div style="font-size:12px;font-weight:500;margin-bottom:3px;">${f.funcNome}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">${fmtDT(f.dt)}</div>
        <span class="badge ${BC[f.tipo]}">${L[f.tipo]}</span>
      </div>`).join('')
  } catch (_) {}
}

async function limparFotosAntigas() {
  if (!confirm(`Descartar fotos com mais de ${CONFIG.dias_fotos} dias?`)) return
  try {
    const r = await api('DELETE', '/fotos/antigas')
    alert(r.removidas > 0 ? `${r.removidas} foto(s) removida(s).` : 'Nenhuma foto para remover.')
    renderFotos()
  } catch (e) { alert('Erro: ' + e.message) }
}

// --- Relatorio ---
async function renderRel() {
  const rm = el('rel-metrics'), rb = el('rel-body'); if (!rm || !rb) return
  try {
    const { funcionarios: funcs, config: cfg } = await api('GET', '/relatorio')
    const totalE = funcs.reduce((s, f) => s + f.entradas, 0)
    const totalExtra = funcs.reduce((s, f) => s + (f.saldo > 0 ? f.saldo : 0), 0)
    const totalDeve = funcs.reduce((s, f) => s + (f.saldo < 0 ? Math.abs(f.saldo) : 0), 0)
    const totalF = funcs.reduce((s, f) => s + f.fotos, 0)
    rm.innerHTML = `
      <div class="metric"><div class="ml">Funcionarios</div><div class="mv">${funcs.length}</div></div>
      <div class="metric"><div class="ml">Total entradas</div><div class="mv">${totalE}</div></div>
      <div class="metric"><div class="ml">Horas extras</div><div class="mv" style="color:${totalExtra > 0 ? 'var(--red)' : 'var(--green)'}">${totalExtra > 0 ? '+' : ''}${fmtH(totalExtra)}</div></div>
      <div class="metric"><div class="ml">A compensar</div><div class="mv" style="color:${totalDeve > 0 ? 'var(--warn)' : 'var(--green)'}">${totalDeve > 0 ? '-' : ''}${fmtH(totalDeve)}</div></div>
      <div class="metric"><div class="ml">Fotos salvas</div><div class="mv">${totalF}</div></div>`
    const statusBadge = (f) => {
      if (!f.saldo && f.saldo !== 0) return f.entradas > 0 ? '<span class="badge bk">Regular</span>' : '<span class="badge bg">Sem ponto</span>'
      if (f.saldo > cfg.tolerancia_min) return `<span class="badge bd">+${fmtH(f.saldo)} extra</span>`
      if (f.saldo < -cfg.tolerancia_min) return `<span class="badge bw">${fmtH(f.saldo)} a compensar</span>`
      if (f.entradas > 0) return '<span class="badge bk">Regular</span>'
      return '<span class="badge bg">Sem ponto</span>'
    }
    rb.innerHTML = funcs.map(f => {
      const pct = Math.min(100, f.jornadaEsperada > 0 ? Math.round((f.minTrab / f.jornadaEsperada) * 100) : 0)
      const corBarra = f.saldo > cfg.tolerancia_min ? '#E24B4A' : f.saldo < -cfg.tolerancia_min ? '#BA7517' : '#185FA5'
      const saldoTexto = f.saldo > 0 ? `+${fmtH(f.saldo)}` : f.saldo < 0 ? `-${fmtH(Math.abs(f.saldo))}` : '0h'
      const corSaldo = f.saldo > cfg.tolerancia_min ? 'var(--red)' : f.saldo < -cfg.tolerancia_min ? 'var(--warn)' : 'var(--green)'
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px;"><div class="av">${ini(f.nome)}</div>${f.nome}</div></td>
        <td>${f.entradas}</td>
        <td>${fmtH(f.minTrab)}</td>
        <td><div style="display:flex;align-items:center;gap:6px;"><div class="pb" style="width:80px;"><div class="pf" style="width:${pct}%;background:${corBarra};"></div></div>${pct}%</div></td>
        <td style="color:${corSaldo};font-weight:500;">${saldoTexto}</td>
        <td>${f.fotos > 0 ? `<span class="badge bk"><i class="ti ti-camera"></i> ${f.fotos}</span>` : '<span class="badge bg">0</span>'}</td>
        <td>${statusBadge(f)}</td>
      </tr>`
    }).join('')
  } catch (_) {}
}

async function exportCSV() {
  try {
    const { funcionarios: funcs, config: cfg } = await api('GET', '/relatorio')
    const regs = await api('GET', '/registros?limite=2000')
    let csv = 'Funcionario,Cargo,Entradas,Horas Trab.,Horas Extras,Fotos,Status\n'
    funcs.forEach(f => { csv += `"${f.nome}","${f.cargo}",${f.entradas},"${fmtH(f.minTrab)}","${fmtH(f.extra)}",${f.fotos},"${f.status}"\n` })
    csv += '\nHistorico\nData/Hora,Funcionario,Evento,Com foto\n'
    const L = { entrada: 'Entrada', saida: 'Saida', pausa: 'Pausa', volta: 'Volta da pausa' }
    regs.forEach(r => { csv += `"${fmtDT(r.dt)}","${r.funcNome}","${L[r.tipo]}","${r.foto_arquivo ? 'sim' : 'nao'}"\n` })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `ponto_${SESSION.lojaNome.replace(/ /g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
  } catch (e) { alert('Erro ao exportar: ' + e.message) }
}

// --- Config ---
async function salvarCfg() {
  try {
    await api('PUT', '/config', { horas_diarias: parseInt(el('cfg-h').value) || 8, tolerancia_min: parseInt(el('cfg-t').value) || 10, dias_fotos: parseInt(el('cfg-dias').value) || 30 })
    await loadConfig()
    el('cfg-ok').textContent = 'Configuracoes salvas!'; el('cfg-ok').style.display = 'block'
    setTimeout(() => el('cfg-ok').style.display = 'none', 2500)
  } catch (e) { alert('Erro: ' + e.message) }
}

async function cadastrarFunc() {
  const nome = el('novo-nome').value.trim(), cargo = el('novo-cargo').value.trim()
  const hora_inicio = el('novo-inicio').value.trim(), hora_fim = el('novo-fim').value.trim()
  const dias_semana = parseInt(el('novo-dias-semana').value) || 5
  const folgas_mes = el('novo-folgas').value.trim()
  if (!nome) { alert('Informe o nome.'); return }
  if ((hora_inicio && !validarHora(hora_inicio)) || (hora_fim && !validarHora(hora_fim))) {
    alert('Horario invalido. Use o formato HH:MM, ex: 14:00'); return
  }
  try {
    await api('POST', '/funcionarios', { nome, cargo, hora_inicio, hora_fim, dias_semana, folgas_mes })
    el('novo-nome').value = ''; el('novo-cargo').value = ''
    el('novo-inicio').value = ''; el('novo-fim').value = ''
    el('novo-dias-semana').value = ''
    await loadFuncs()
  } catch (e) { alert('Erro: ' + e.message) }
}

async function alterarSenha() {
  const s = el('nova-senha').value
  if (s.length < 4) { alert('Minimo 4 caracteres.'); return }
  try {
    await api('PUT', '/senha', { senha: s })
    el('nova-senha').value = ''
    el('senha-ok').textContent = 'Senha alterada!'; el('senha-ok').style.display = 'block'
    setTimeout(() => el('senha-ok').style.display = 'none', 2500)
  } catch (e) { alert('Erro: ' + e.message) }
}

function renderFuncBody() {
  const fb = el('func-body'); if (!fb) return
  fb.innerHTML = FUNCS.map(f => `<tr>
    <td><div style="display:flex;align-items:center;gap:8px;"><div class="av">${ini(f.nome)}</div>${f.nome}</div></td>
    <td>${f.cargo || ''}</td>
    <td>${f.hora_inicio && f.hora_fim
      ? `<span class="badge bi"><i class="ti ti-clock"></i> ${f.hora_inicio}  ${f.hora_fim}</span>`
      : '<span class="badge bg">Sem jornada</span>'}</td>
    <td>${f.dias_semana ? `<span class="badge bg">${f.dias_semana}x/sem</span>` : '<span class="badge bg">5x/sem</span>'}</td>
    <td><span class="badge bk">Ativo</span></td>
    <td><button class="btn btn-sm btn-i" onclick='abrirModal(${JSON.stringify(f).replace(/'/g,"&#39;")})'>
      <i class="ti ti-pencil"></i> Editar
    </button></td>
  </tr>`).join('')
}

function validarHora(h) {
  return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(h)
}

function abrirModal(func) {
  el('edit-func-id').value = func.id
  el('edit-nome').value = func.nome
  el('edit-cargo').value = func.cargo || ''
  el('edit-inicio').value = func.hora_inicio || ''
  el('edit-fim').value = func.hora_fim || ''
  el('edit-dias-semana').value = func.dias_semana || 5
  el('edit-folgas').value = func.folgas_mes || ''
  el('edit-ok').style.display = 'none'
  const modal = el('modal-jornada')
  modal.style.display = 'flex'
}

function fecharModal() {
  el('modal-jornada').style.display = 'none'
}

async function salvarJornada() {
  const id = el('edit-func-id').value
  const nome = el('edit-nome').value.trim()
  const cargo = el('edit-cargo').value.trim()
  const hora_inicio = el('edit-inicio').value.trim()
  const hora_fim = el('edit-fim').value.trim()
  const dias_semana = parseInt(el('edit-dias-semana').value) || 5
  const folgas_mes = el('edit-folgas').value.trim()
  if (!nome) { alert('Informe o nome.'); return }
  if ((hora_inicio && !validarHora(hora_inicio)) || (hora_fim && !validarHora(hora_fim))) {
    alert('Horario invalido. Use o formato HH:MM, ex: 14:00'); return
  }
  try {
    await api('PUT', `/funcionarios/${id}`, { nome, cargo, hora_inicio, hora_fim, dias_semana, folgas_mes })
    el('edit-ok').style.display = 'flex'
    setTimeout(() => fecharModal(), 1200)
    await loadFuncs()
  } catch (e) { alert('Erro: ' + e.message) }
}

function switchTab(name, btn) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'))
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'))
  el('pg-' + name).classList.add('on'); btn.classList.add('on')
  stopCam()
  if (name === 'hist') renderHist()
  if (name === 'rel') renderRel()
  if (name === 'fotos') renderFotos()
  if (name === 'cfg') { renderFuncBody(); if (SESSION.role === 'master') renderTodasLojas() }
  if (name === 'apuracao') initApuracao()
  if (name === 'escala') initEscala()
}

function setStepDots(active) {
  document.querySelectorAll('.step-dot').forEach((d, i) => { d.className = 'step-dot' + (i < active ? ' done' : i === active ? ' on' : '') })
}

function showErr(id, msg) {
  const e = el(id); e.textContent = msg; e.style.display = 'block'
}

// --- Apuracao mensal ---
function initApuracao() {
  // Popular anos (ultimos 3 anos)
  const anoSel = el('apur-ano')
  const anoAtual = new Date().getFullYear()
  anoSel.innerHTML = ''
  for (let a = anoAtual; a >= anoAtual - 2; a--) {
    const o = document.createElement('option'); o.value = a; o.textContent = a; anoSel.appendChild(o)
  }
  // Mes atual
  el('apur-mes').value = new Date().getMonth() + 1

  // Popular funcionarios
  const af = el('apur-func')
  af.innerHTML = '<option value="">Todos</option>'
  FUNCS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.nome; af.appendChild(o) })

  renderApuracao()
}

async function renderApuracao() {
  const mes = parseInt(el('apur-mes').value)
  const ano = parseInt(el('apur-ano').value)
  const funcFiltro = el('apur-func').value
  if (!mes || !ano) return

  // Datas do mes
  const dtInicio = new Date(ano, mes - 1, 1).toISOString()
  const dtFim = new Date(ano, mes, 0, 23, 59, 59).toISOString()
  const diasNoMes = new Date(ano, mes, 0).getDate()

  // Dias uteis no mes (seg-sex)
  let diasUteis = 0
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = new Date(ano, mes - 1, d).getDay()
    if (dia !== 0 && dia !== 6) diasUteis++
  }

  try {
    const funcsApurar = funcFiltro ? FUNCS.filter(f => f.id == funcFiltro) : FUNCS
    const regs = await api('GET', `/registros?limite=5000`)
    const regsDoMes = regs.filter(r => r.dt >= dtInicio && r.dt <= dtFim)

    const rows = funcsApurar.map(func => {
      const regsFunc = regsDoMes.filter(r => r.funcionario_id == func.id || r.funcNome === func.nome)

      // Agrupar por dia
      const porDia = {}
      regsFunc.forEach(r => {
        const dia = new Date(r.dt).toLocaleDateString('pt-BR')
        if (!porDia[dia]) porDia[dia] = {}
        porDia[dia][r.tipo] = r.dt
      })

      // Calcular dias trabalhados e horas reais (so conta dias com entrada E saida)
      const diasTrabalhados = Object.keys(porDia).filter(d => porDia[d].entrada).length
      const diasCompletos = Object.keys(porDia).filter(d => porDia[d].entrada && porDia[d].saida).length
      let minsTrabalhados = 0
      Object.values(porDia).forEach(d => {
        minsTrabalhados += calcMins(d)
      })
      minsTrabalhados = Math.round(minsTrabalhados)
      // Calcular jornada esperada pela escala cadastrada
      let minsEsperados = 0
      let diasEsperados = 0
      try {
        const escalaTotal = await api('GET', `/escala/total?funcId=${func.id}&mes=${mes}&ano=${ano}`)
        if (escalaTotal.totalDias > 0) {
          minsEsperados = escalaTotal.totalHoras * 60
          diasEsperados = escalaTotal.totalDias
        } else {
          // Fallback: usar dias por semana
          const dpw = func.dias_semana || 5
          diasEsperados = Math.round(diasUteis * dpw / 5)
          minsEsperados = diasEsperados * CONFIG.horas_diarias * 60
        }
      } catch(_) {
        const dpw = func.dias_semana || 5
        diasEsperados = Math.round(diasUteis * dpw / 5)
        minsEsperados = diasEsperados * CONFIG.horas_diarias * 60
      }
      const saldoMins = minsTrabalhados - minsEsperados
      const minsExtras = Math.max(0, saldoMins)
      const faltas = Math.max(0, diasEsperados - diasTrabalhados)

      return { func, diasTrabalhados, diasCompletos, diasUteis, diasEsperados, minsTrabalhados, minsEsperados, minsExtras, saldoMins, faltas, porDia }
    })

    // Metricas totais
    const totalDias = rows.reduce((s, r) => s + r.diasTrabalhados, 0)
    const totalMins = rows.reduce((s, r) => s + r.minsTrabalhados, 0)
    const totalExtras = rows.reduce((s, r) => s + Math.max(0, r.saldoMins), 0)
    const totalDeve = rows.reduce((s, r) => s + Math.max(0, -r.saldoMins), 0)
    const totalFaltas = rows.reduce((s, r) => s + r.faltas, 0)
    const nomeMes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1]

    apuracaoAtual = { rows, nomeMes, ano, diasUteis, lojaNome: SESSION.lojaNome }

    el('apur-metrics').innerHTML = `
      <div class="metric"><div class="ml">Mes</div><div class="mv" style="font-size:16px;">${nomeMes} ${ano}</div></div>
      <div class="metric"><div class="ml">Dias uteis</div><div class="mv">${diasUteis}</div></div>
      <div class="metric"><div class="ml">Total horas trab.</div><div class="mv">${fmtH(totalMins)}</div></div>
      <div class="metric"><div class="ml">Horas extras</div><div class="mv" style="color:${totalExtras>0?'var(--red)':'var(--green)'}">${totalExtras>0?'+':''}${fmtH(totalExtras)}</div></div>
      <div class="metric"><div class="ml">A compensar</div><div class="mv" style="color:${totalDeve>0?'var(--warn)':'var(--green)'}">${totalDeve>0?'-':''}${fmtH(totalDeve)}</div></div>
      <div class="metric"><div class="ml">Faltas</div><div class="mv" style="color:${totalFaltas>0?'var(--red)':'var(--green)'}">${totalFaltas}</div></div>`

    const ab = el('apur-body')
    ab.innerHTML = rows.map(r => {
      const pct = Math.min(100, r.minsEsperados > 0 ? Math.round((r.minsTrabalhados / r.minsEsperados) * 100) : 0)
      const saldoTxt = r.saldoMins > 0 ? `+${fmtH(r.saldoMins)}` : r.saldoMins < 0 ? `-${fmtH(Math.abs(r.saldoMins))}` : '0h'
      const corSaldo = r.saldoMins > 0 ? 'var(--red)' : r.saldoMins < 0 ? 'var(--warn)' : 'var(--green)'
      const badge = r.saldoMins > CONFIG.tolerancia_min*60 ? `<span class="badge bd">+${fmtH(r.saldoMins)} extra</span>` :
                    r.saldoMins < -CONFIG.tolerancia_min*60 ? `<span class="badge bw">${fmtH(Math.abs(r.saldoMins))} compensar</span>` :
                    r.diasTrabalhados > 0 ? '<span class="badge bk">Regular</span>' : '<span class="badge bg">Sem registros</span>'
      return `<tr style="cursor:pointer;" onclick="verDetalhe(${JSON.stringify(r.func).replace(/"/g,'&quot;')}, ${JSON.stringify(r.porDia).replace(/"/g,'&quot;')}, '${nomeMes} ${ano}')">
        <td><div style="display:flex;align-items:center;gap:8px;"><div class="av">${ini(r.func.nome)}</div>${r.func.nome}</div></td>
        <td>${r.diasTrabalhados} / ${r.diasEsperados}</td>
        <td>${fmtH(r.minsTrabalhados)}</td>
        <td>${fmtH(r.minsEsperados)}</td>
        <td style="color:${corSaldo};font-weight:500;">${saldoTxt}</td>
        <td style="color:${r.faltas>0?'var(--red)':'var(--muted)'}">${r.faltas > 0 ? r.faltas : ''}</td>
        <td>${badge}</td>
      </tr>`
    }).join('')

    // Esconder detalhe ao recarregar
    el('apur-detalhe-card').style.display = 'none'

  } catch(e) { console.error(e) }
}

function verDetalhe(func, porDia, periodo) {
  el('apur-detalhe-titulo').textContent = `Detalhe  ${func.nome}  ${periodo}`
  el('apur-detalhe-card').style.display = 'block'
  el('apur-detalhe-card').scrollIntoView({ behavior: 'smooth' })

  const dias = Object.keys(porDia).sort((a, b) => {
    const [da, ma, aa] = a.split('/'); const [db, mb, ab] = b.split('/')
    return new Date(aa, ma-1, da) - new Date(ab, mb-1, db)
  })

  detalheAtual = { func, dias, porDia, periodo, lojaNome: SESSION.lojaNome }

  const fmtHora = dt => dt ? new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

  el('apur-detalhe-body').innerHTML = dias.map(dia => {
    const d = porDia[dia]
    const [dd, mm, aa] = dia.split('/')
    const diaSemana = DIAS_SEMANA[new Date(aa, mm - 1, dd).getDay()]
    const temEntrada = !!d.entrada
    const temSaida = !!d.saida
    const mins = calcMins(d)
    const status = !temEntrada ? '<span class="badge bd">Falta</span>' :
                   !temSaida ? '<span class="badge bw">Sem saida</span>' :
                   '<span class="badge bk">Ok</span>'
    return `<tr>
      <td>${dia}</td>
      <td style="color:var(--muted)">${diaSemana}</td>
      <td>${fmtHora(d.entrada)}</td>
      <td>${fmtHora(d.pausa)}</td>
      <td>${fmtHora(d.volta)}</td>
      <td>${fmtHora(d.saida)}</td>
      <td>${temEntrada && temSaida ? fmtH(Math.round(mins)) : ''}</td>
      <td>${status}</td>
    </tr>`
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--muted);">Nenhum registro neste periodo</td></tr>'
}

async function exportApuracaoCSV() {
  const mes = parseInt(el('apur-mes').value)
  const ano = parseInt(el('apur-ano').value)
  const nomeMes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1]
  const dtInicio = new Date(ano, mes - 1, 1).toISOString()
  const dtFim = new Date(ano, mes, 0, 23, 59, 59).toISOString()
  const diasNoMes = new Date(ano, mes, 0).getDate()
  let diasUteis = 0
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = new Date(ano, mes - 1, d).getDay()
    if (dia !== 0 && dia !== 6) diasUteis++
  }

  const regs = await api('GET', `/registros?limite=5000`)
  const regsDoMes = regs.filter(r => r.dt >= dtInicio && r.dt <= dtFim)

  let csv = `Apuracao de Horas  ${nomeMes} ${ano}  ${SESSION.lojaNome}\n`
  csv += `Dias uteis no mes: ${diasUteis}\n\n`
  csv += `Funcionario,Cargo,Dias Trabalhados,Dias Uteis,Horas Trabalhadas,Horas Esperadas,Horas Extras,Faltas,Status\n`

  for (const func of FUNCS) {
    const regsFunc = regsDoMes.filter(r => r.funcNome === func.nome)
    const porDia = {}
    regsFunc.forEach(r => {
      const dia = new Date(r.dt).toLocaleDateString('pt-BR')
      if (!porDia[dia]) porDia[dia] = {}
      porDia[dia][r.tipo] = r.dt
    })
    const diasTrab = Object.keys(porDia).filter(d => porDia[d].entrada).length
    let minsTrab = 0
    Object.values(porDia).forEach(d => { minsTrab += calcMins(d) })
    minsTrab = Math.round(minsTrab)
    const minsEsp = diasUteis * CONFIG.horas_diarias * 60
    const extras = Math.max(0, minsTrab - minsEsp)
    const faltas = Math.max(0, diasUteis - diasTrab)
    const status = faltas > 3 ? 'Muitas faltas' : extras > 0 ? 'Hora extra' : diasTrab > 0 ? 'Regular' : 'Sem registros'
    csv += `"${func.nome}","${func.cargo}",${diasTrab},${diasUteis},"${fmtH(minsTrab)}","${fmtH(minsEsp)}","${fmtH(extras)}",${faltas},"${status}"\n`
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `apuracao_${nomeMes}_${ano}_${SESSION.lojaNome.replace(/ /g,'_')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// Calcula minutos reais trabalhados num dia a partir do objeto porDia
function calcMins(d) {
  if (!d || !d.entrada || !d.saida) return 0
  let pausaMins = 0
  if (d.pausa && d.volta) pausaMins = (new Date(d.volta) - new Date(d.pausa)) / 60000
  return Math.max(0, (new Date(d.saida) - new Date(d.entrada)) / 60000 - pausaMins)
}

async function renomearLoja() {
  const nome = el('novo-nome-loja').value.trim()
  if (!nome) { alert('Informe o novo nome.'); return }
  try {
    const r = await api('PUT', '/loja/renomear', { nome })
    SESSION.lojaNome = r.nome
    el('hdr-loja').textContent = r.nome
    el('novo-nome-loja').value = ''
    el('loja-ok').style.display = 'flex'
    setTimeout(() => el('loja-ok').style.display = 'none', 2500)
    // Recarregar lista de lojas no login e na tabela
    const lojas = await api('GET', '/lojas')
    const ll = el('ll'); if(ll){ ll.innerHTML='<option value=""> Selecione a loja </option>'; lojas.forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;ll.appendChild(o)}) }
    if (SESSION.role === 'master') renderTodasLojas()
  } catch (e) { alert('Erro: ' + e.message) }
}

async function renderTodasLojas() {
  if (SESSION.role !== 'master') return
  try {
    const lojas = await api('GET', '/lojas/todas')
    const tb = el('todas-lojas-body'); if (!tb) return
    tb.innerHTML = lojas.map(l => `<tr>
      <td><strong>${l.nome}</strong></td>
      <td><span class="badge bg">${l.senha}</span></td>
      <td><input type="password" id="senha-loja-${l.id}" placeholder="Nova senha" style="width:140px;margin-bottom:0;padding:7px 10px;font-size:12px;"/></td>
      <td><button class="btn btn-sm btn-i" onclick="alterarSenhaLoja(${l.id})"><i class="ti ti-lock"></i> Salvar</button></td>
    </tr>`).join('')
    el('card-todas-lojas').style.display = 'block'
  } catch(_) {}
}

async function alterarSenhaLoja(id) {
  const s = el(`senha-loja-${id}`).value
  if (!s || s.length < 4) { alert('Minimo 4 caracteres.'); return }
  try {
    await api('PUT', `/lojas/${id}/senha`, { senha: s })
    el(`senha-loja-${id}`).value = ''
    alert('Senha alterada!')
    renderTodasLojas()
  } catch (e) { alert('Erro: ' + e.message) }
}

// --- Escala de trabalho ---
const DIAS_SEMANA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

function initEscala() {
  const anoSel = el('escala-ano')
  const anoAtual = new Date().getFullYear()
  anoSel.innerHTML = ''
  for (let a = anoAtual; a >= anoAtual - 2; a--) {
    const o = document.createElement('option'); o.value = a; o.textContent = a; anoSel.appendChild(o)
  }
  el('escala-mes').value = new Date().getMonth() + 1

  const ef = el('escala-func')
  ef.innerHTML = '<option value=""> Selecione o funcionario </option>'
  FUNCS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.nome; ef.appendChild(o) })
}

async function renderEscala() {
  const funcId = el('escala-func').value
  const mes = parseInt(el('escala-mes').value)
  const ano = parseInt(el('escala-ano').value)
  const cal = el('escala-cal')

  if (!funcId) { cal.innerHTML = '<div style="color:var(--muted);padding:20px;">Selecione um funcionario.</div>'; el('escala-total').textContent = ''; return }

  // Carregar escala salva
  const diasSalvos = await api('GET', `/escala?funcId=${funcId}&mes=${mes}&ano=${ano}`)
  const escalaMapa = {}
  diasSalvos.forEach(d => { escalaMapa[d.data] = { tipo: d.tipo, horas: d.horas } })

  // Montar calendario
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const diaSemanaInicio = primeiroDia.getDay() // 0=dom

  let totalHoras = 0
  let totalDias = 0

  // Cabecalhos
  let html = DIAS_SEMANA_LABEL.map(d => `<div style="text-align:center;font-size:11px;font-weight:600;color:var(--muted);padding:4px 0;">${d}</div>`).join('')

  // Celulas vazias antes do dia 1
  for (let i = 0; i < diaSemanaInicio; i++) {
    html += '<div></div>'
  }

  // Dias do mes
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const data = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    const diaSemana = new Date(ano, mes - 1, dia).getDay()
    const isDom = diaSemana === 0
    const salvo = escalaMapa[data]

    // Tipo padrao: domingo=dom, outros=trabalha
    let tipo = salvo ? salvo.tipo : (isDom ? 'dom' : 'trabalha')
    let horas = salvo ? salvo.horas : (isDom ? 6 : 8)
    if (tipo === 'folga') horas = 0

    if (tipo !== 'folga') { totalHoras += horas; totalDias++ }

    const cores = {
      trabalha: 'background:#EAF3DE;border:1.5px solid #3B6D11;color:#27500A;',
      dom: 'background:#E6F1FB;border:1.5px solid #185FA5;color:#0C447C;',
      feriado: 'background:#FCEBEB;border:1.5px solid #A32D2D;color:#791F1F;',
      folga: 'background:var(--bg2);border:1.5px solid var(--border2);color:var(--muted);'
    }
    const horasLabel = horas > 0 ? `${horas}h` : ''

    html += `<div onclick="toggleEscala('${funcId}','${data}','${tipo}',${horas},${isDom?1:0})"
      style="cursor:pointer;border-radius:8px;padding:6px 4px;text-align:center;user-select:none;${cores[tipo]}transition:opacity .15s;"
      onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
      <div style="font-size:13px;font-weight:600;">${dia}</div>
      <div style="font-size:10px;">${DIAS_SEMANA_LABEL[diaSemana]}</div>
      <div style="font-size:11px;font-weight:500;">${horasLabel}</div>
    </div>`
  }

  cal.innerHTML = html
  el('escala-total').textContent = `Total previsto: ${totalDias} dias  ${fmtH(totalHoras * 60)}`
}

async function toggleEscala(funcId, data, tipoAtual, horasAtual, isDom) {
  // Ciclo: trabalha  feriado  folga  trabalha (dom: dom  feriado  folga  dom)
  let novoTipo, novasHoras
  if (isDom) {
    if (tipoAtual === 'dom') { novoTipo = 'feriado'; novasHoras = 0 }
    else if (tipoAtual === 'feriado') { novoTipo = 'folga'; novasHoras = 0 }
    else { novoTipo = 'dom'; novasHoras = 6 }
  } else {
    if (tipoAtual === 'trabalha') { novoTipo = 'feriado'; novasHoras = 0 }
    else if (tipoAtual === 'feriado') { novoTipo = 'folga'; novasHoras = 0 }
    else { novoTipo = 'trabalha'; novasHoras = 8 }
  }
  await api('PUT', '/escala', { funcionarioId: funcId, data, tipo: novoTipo, horas: novasHoras })
  renderEscala()
}

// Iniciar
initLogin()

// --- Geracao de PDF ---
let apuracaoAtual = null
let detalheAtual = null

function gerarPDF() {
  if (!apuracaoAtual) { alert('Carregue a apuracao primeiro.'); return }
  const { rows, nomeMes, ano, diasUteis, lojaNome } = apuracaoAtual
  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W = 210, margem = 14
  let y = 14

  // Cabecalho
  doc.setFillColor(24, 95, 165)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont(undefined, 'bold')
  doc.text('Grupo Shalom', margem, 11)
  doc.setFontSize(10); doc.setFont(undefined, 'normal')
  doc.text('Folha de Ponto  ' + nomeMes + ' ' + ano, margem, 18)
  doc.text(lojaNome, margem, 24)
  doc.setTextColor(180, 210, 255)
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), W - margem, 18, { align: 'right' })
  y = 36

  // Info do mes
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(9)
  doc.text(`Dias uteis no mes: ${diasUteis}   |   Jornada diaria: ${CONFIG.horas_diarias}h   |   Tolerancia: ${CONFIG.tolerancia_min} min`, margem, y)
  y += 8

  // Tabela resumo com saldo de horas
  const tableData = rows.map(r => {
    const saldo = r.minsTrabalhados - r.minsEsperados
    const saldoTexto = saldo > 0 ? '+' + fmtH(saldo) : saldo < 0 ? '-' + fmtH(Math.abs(saldo)) : '0h'
    const status = r.faltas > 3 ? 'Muitas faltas' : saldo > CONFIG.tolerancia_min ? 'Hora extra' : saldo < -CONFIG.tolerancia_min ? 'A compensar' : r.diasTrabalhados > 0 ? 'Regular' : 'Sem reg.'
    return [
      r.func.nome,
      r.func.cargo || '',
      `${r.diasTrabalhados} / ${r.diasUteis}`,
      fmtH(r.minsTrabalhados),
      fmtH(r.minsEsperados),
      saldoTexto,
      r.faltas > 0 ? String(r.faltas) : '',
      status
    ]
  })

  doc.autoTable({
    startY: y,
    head: [['Funcionario', 'Cargo', 'Dias', 'Horas trab.', 'Esperado', 'Saldo', 'Faltas', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [24, 95, 165], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 42 }, 1: { cellWidth: 28 }, 2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.column.index === 5) {
          const v = data.cell.raw
          if (v && v.startsWith('+')) data.cell.styles.textColor = [163, 45, 45]
          else if (v && v.startsWith('-')) data.cell.styles.textColor = [133, 79, 11]
        }
        if (data.column.index === 7) {
          const v = data.cell.raw
          if (v === 'Regular') data.cell.styles.textColor = [59, 109, 17]
          else if (v === 'Hora extra' || v === 'Muitas faltas') data.cell.styles.textColor = [163, 45, 45]
          else if (v === 'A compensar') data.cell.styles.textColor = [133, 79, 11]
        }
      }
    }
  })

  // Totais no rodape da tabela
  const totalExtra = rows.reduce((s, r) => { const saldo = r.minsTrabalhados - r.minsEsperados; return s + (saldo > 0 ? saldo : 0) }, 0)
  const totalDeve = rows.reduce((s, r) => { const saldo = r.minsTrabalhados - r.minsEsperados; return s + (saldo < 0 ? Math.abs(saldo) : 0) }, 0)
  const fy = doc.lastAutoTable.finalY + 6
  doc.setFontSize(9); doc.setTextColor(80, 80, 80)
  doc.text(`Total horas extras: ${fmtH(totalExtra)}   |   Total a compensar: ${fmtH(totalDeve)}`, margem, fy)

  // Rodape
  const pageH = doc.internal.pageSize.height
  doc.setDrawColor(200, 200, 200); doc.line(margem, pageH - 14, W - margem, pageH - 14)
  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('Grupo Shalom  Sistema de Registro de Ponto', margem, pageH - 8)
  doc.text('Pagina 1', W - margem, pageH - 8, { align: 'right' })

  doc.save(`folha_ponto_${nomeMes}_${ano}_${lojaNome.replace(/ /g, '_')}.pdf`)
}

function gerarPDFDetalhe() {
  if (!detalheAtual) { alert('Selecione um funcionario primeiro.'); return }
  const { func, dias, porDia, periodo, lojaNome } = detalheAtual
  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, margem = 14

  // Cabecalho
  doc.setFillColor(24, 95, 165)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont(undefined, 'bold')
  doc.text('Grupo Shalom', margem, 11)
  doc.setFontSize(10); doc.setFont(undefined, 'normal')
  doc.text('Folha de Ponto Individual  ' + periodo, margem, 18)
  doc.text(lojaNome, margem, 24)
  doc.setTextColor(180, 210, 255)
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), W - margem, 18, { align: 'right' })

  // Info funcionario
  let y = 38
  doc.setFillColor(240, 245, 255)
  doc.roundedRect(margem, y, W - margem * 2, 14, 3, 3, 'F')
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont(undefined, 'bold')
  doc.text(func.nome, margem + 4, y + 6)
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
  doc.text(func.cargo || '', margem + 4, y + 11)
  y += 22

  const fmtHora = dt => dt ? new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

  const tableData = dias.map(dia => {
    const d = porDia[dia] || {}
    const [dd, mm, aa] = dia.split('/')
    const diaSemana = DIAS_SEMANA[new Date(aa, mm - 1, dd).getDay()]
    const temEntrada = !!d.entrada
    const temSaida = !!d.saida
    const mins = calcMins(d)
    const status = !temEntrada ? 'Falta' : !temSaida ? 'Sem saida' : 'Ok'
    return [dia, diaSemana, fmtHora(d.entrada), fmtHora(d.pausa), fmtHora(d.volta), fmtHora(d.saida), temEntrada && temSaida ? fmtH(mins) : '', status]
  })

  doc.autoTable({
    startY: y,
    head: [['Data', 'Dia', 'Entrada', 'Pausa', 'Volta', 'Saida', 'Horas', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [24, 95, 165], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' }, 3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' }, 7: { cellWidth: 24, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        if (data.cell.raw === 'Ok') data.cell.styles.textColor = [59, 109, 17]
        else if (data.cell.raw === 'Falta') data.cell.styles.textColor = [163, 45, 45]
        else data.cell.styles.textColor = [133, 79, 11]
      }
    }
  })

  // Totais
  const totalDias = dias.filter(d => porDia[d] && porDia[d].entrada && porDia[d].saida).length
  const totalMins = dias.reduce((s, d) => s + calcMins(porDia[d] || {}), 0)
  const fy = doc.lastAutoTable.finalY + 6
  doc.setFontSize(9); doc.setTextColor(80, 80, 80)
  doc.text(`Total de dias trabalhados: ${totalDias}   |   Total de horas: ${fmtH(Math.round(totalMins))}`, margem, fy)

  // Assinaturas
  const sigY = fy + 20
  doc.setDrawColor(150, 150, 150)
  doc.line(margem, sigY, margem + 70, sigY)
  doc.line(W - margem - 70, sigY, W - margem, sigY)
  doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  doc.text('Assinatura do Funcionario', margem + 35, sigY + 5, { align: 'center' })
  doc.text('Assinatura do Gerente', W - margem - 35, sigY + 5, { align: 'center' })

  // Rodape
  const pageH = doc.internal.pageSize.height
  doc.setDrawColor(200, 200, 200); doc.line(margem, pageH - 14, W - margem, pageH - 14)
  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('Grupo Shalom  Sistema de Registro de Ponto', margem, pageH - 8)
  doc.text('Documento gerado automaticamente', W - margem, pageH - 8, { align: 'right' })

  doc.save(`folha_${func.nome.replace(/ /g, '_')}_${periodo.replace(/ /g, '_')}.pdf`)
}
