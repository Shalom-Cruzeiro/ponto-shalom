/* ============================================================
   Escala automática — Grupo Shalom
   Lógica pura (sem tela). Usada pelo navegador E pelo servidor,
   para os dois calcularem a mesma escala.

   Regra de rodízio cadastrada no funcionário (func.regra):
   {
     modelo:   'alt'  -> 5x2 numa semana / 6x1 na outra (folga fixa toda semana
                         + domingo de folga semana sim, semana não)
               '5x2'  -> 2 folgas TODA semana (folga fixa + domingo numa semana,
                         folga fixa + 2ª folga na outra)
     folgaFixa: 1..6   (1=Seg ... 6=Sáb)
     folga2:    1..6   (só no modelo 5x2: 2ª folga da semana em que trabalha domingo)
     grupoDom: 'A'|'B' (A e B folgam em domingos alternados)
     sem: { ini, fim, interv }   horário de segunda a sábado
     dom: { ini, fim, interv }   horário de domingo
   }
   Semanas contam de segunda a domingo, a partir de 05/01/2026 (semana A),
   então a alternância continua certa de um mês para o outro.
============================================================ */
(function (root) {
  const REF_MONDAY = Date.UTC(2026, 0, 5); // segunda-feira, semana "A"
  const DAY = 86400000;
  const DOW_NOME = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DEF_SEM = { ini: '10:00', fim: '18:00', interv: 60 };
  const DEF_DOM = { ini: '14:00', fim: '20:00', interv: 15 };
  const MODELOS = {
    alt: '5x2 / 6x1 alternada (atual)',
    '5x2': '5x2 todas as semanas (2 folgas)',
  };

  const toMin = t => { if (!t) return 0; const [a, b] = String(t).split(':').map(Number); return a * 60 + (b || 0); };
  const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const partes = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const dowDe = s => { const { y, m, d } = partes(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

  /* 0 = semana A, 1 = semana B (domingo pertence à semana que começou na segunda anterior) */
  function paridadeSemana(dateStr) {
    const { y, m, d } = partes(dateStr);
    const t = Date.UTC(y, m - 1, d);
    const dow = new Date(t).getUTCDay();
    const segunda = t - ((dow + 6) % 7) * DAY;
    const semanas = Math.round((segunda - REF_MONDAY) / (7 * DAY));
    return ((semanas % 2) + 2) % 2;
  }
  const semanaLetra = dateStr => (paridadeSemana(dateStr) === 0 ? 'A' : 'B');

  function regraValida(r) { return !!(r && (r.modelo === 'alt' || r.modelo === '5x2') && r.folgaFixa >= 1 && r.folgaFixa <= 6); }

  /* domingo de folga nesta semana? */
  function folgaDomingoNaSemana(regra, dateStr) { return semanaLetra(dateStr) === (regra.grupoDom || 'A'); }

  /* plano do dia gerado pela regra (ou null se o funcionário não usa rodízio) */
  function regraDia(func, dateStr) {
    const r = func && func.regra;
    if (!regraValida(r)) return null;
    const dow = dowDe(dateStr);
    const domFolga = folgaDomingoNaSemana(r, dateStr);
    let folga = false;
    if (dow === 0) folga = domFolga;
    else if (dow === r.folgaFixa) folga = true;
    else if (r.modelo === '5x2' && !domFolga && dow === r.folga2) folga = true;
    if (folga) return { on: false, auto: true };
    const h = dow === 0 ? { ...DEF_DOM, ...(r.dom || {}) } : { ...DEF_SEM, ...(r.sem || {}) };
    return { on: true, ini: h.ini, fim: h.fim, interv: +h.interv || 0, auto: true };
  }

  /* plano final: ajuste manual do mês > rodízio > padrão semanal antigo */
  function planoDia(func, escMes, dateStr) {
    const man = escMes && escMes[func.id] && escMes[func.id][dateStr];
    if (man) return man;
    const auto = regraDia(func, dateStr);
    if (auto) return auto;
    const dow = dowDe(dateStr);
    return (func.padrao && func.padrao[dow]) ? func.padrao[dow] : { on: false };
  }

  /* --------------------------------------------------------------
     ALMOÇO ESCALONADO
  -------------------------------------------------------------- */
  function almocos(funcs, escMes, dateStr, opts) {
    const minLoja = (opts && opts.minLoja) || 1;
    const turnos = [];
    for (const f of funcs) {
      const p = planoDia(f, escMes, dateStr);
      if (!p || !p.on || !p.ini || !p.fim) continue;
      const ini = toMin(p.ini); let fim = toMin(p.fim); if (fim <= ini) fim += 1440;
      turnos.push({ id: f.id, nome: f.nome, ini, fim, interv: +p.interv || 0, almFixo: p.alm ? toMin(p.alm) : null });
    }
    const out = {};
    const marcados = []; // {id, a, b}
    const presentes = (t, ignorar) => turnos.filter(x => x.ini <= t && t < x.fim && !ignorar.has(x.id)
      && !marcados.some(l => l.id === x.id && l.a <= t && t < l.b)).length;

    // fixados à mão primeiro
    for (const x of turnos) if (x.interv > 0 && x.almFixo != null) {
      marcados.push({ id: x.id, a: x.almFixo, b: x.almFixo + x.interv }); out[x.id] = toHHMM(x.almFixo % 1440);
    }
    const fila = turnos.filter(x => x.interv > 0 && x.almFixo == null)
      .sort((a, b) => a.ini - b.ini || a.fim - b.fim || String(a.id).localeCompare(String(b.id)));
    for (const x of fila) {
      const trab = x.fim - x.ini - x.interv;
      const ideal = x.ini + Math.round(trab / 2 / 15) * 15;
      let cedo = x.ini + 120, tarde = Math.min(x.ini + 360, x.fim - x.interv - 60);
      if (cedo > tarde) { cedo = tarde = Math.max(x.ini, Math.min(ideal, x.fim - x.interv)); }
      let melhor = null, melhorNota = Infinity;
      for (let c = cedo; c <= tarde; c += 15) {
        let sobrepoe = 0, deficit = 0;
        for (const l of marcados) sobrepoe += Math.max(0, Math.min(l.b, c + x.interv) - Math.max(l.a, c));
        for (let t = c; t < c + x.interv; t += 15) {
          const n = presentes(t, new Set([x.id]));
          if (n < minLoja) deficit += (minLoja - n);
        }
        const nota = deficit * 100000 + sobrepoe * 10 + Math.abs(c - ideal);
        if (nota < melhorNota) { melhorNota = nota; melhor = c; }
      }
      marcados.push({ id: x.id, a: melhor, b: melhor + x.interv });
      out[x.id] = toHHMM(melhor % 1440);
    }
    return out;
  }

  /* --------------------------------------------------------------
     COBERTURA DO DIA
  -------------------------------------------------------------- */
  function cobertura(funcs, escMes, dateStr, opts) {
    const minLoja = (opts && opts.minLoja) || 1;
    const alm = almocos(funcs, escMes, dateStr, opts);
    const pessoas = [];
    for (const f of funcs) {
      const p = planoDia(f, escMes, dateStr);
      if (!p || !p.on || !p.ini || !p.fim) continue;
      const ini = toMin(p.ini); let fim = toMin(p.fim); if (fim <= ini) fim += 1440;
      const a = alm[f.id] != null ? toMin(alm[f.id]) : null;
      pessoas.push({ id: f.id, nome: f.nome, ini, fim, alm: a, almFim: a != null ? a + (+p.interv || 0) : null, p });
    }
    const h = opts && opts.horario;
    let abre, fecha;
    if (h && h.ini && h.fim) { abre = toMin(h.ini); fecha = toMin(h.fim); if (fecha <= abre) fecha += 1440; }
    else if (pessoas.length) { abre = Math.min(...pessoas.map(p => p.ini)); fecha = Math.max(...pessoas.map(p => p.fim)); }
    const slots = [];
    const faltas = [];
    if (abre != null) {
      for (let t = abre; t < fecha; t += 15) {
        const n = pessoas.filter(p => p.ini <= t && t < p.fim && !(p.alm != null && p.alm <= t && t < p.almFim)).length;
        slots.push({ t, n });
        if (n < minLoja) {
          const ult = faltas[faltas.length - 1];
          if (ult && ult.b === t && ult.n === n) ult.b = t + 15; else faltas.push({ a: t, b: t + 15, n });
        }
      }
    }
    return { pessoas, almocos: alm, slots, abre, fecha, minLoja,
      faltas: faltas.map(f => ({ ini: toHHMM(f.a % 1440), fim: toHHMM(f.b % 1440), n: f.n })) };
  }

  /* --------------------------------------------------------------
     SUGESTÃO PARA A LOJA
  -------------------------------------------------------------- */
  const ORDEM_FOLGA = [2, 3, 4, 1, 5, 6]; // Ter, Qua, Qui, Seg, Sex, Sáb
  function sugerirLoja(funcs, modelo, horarios) {
    const lista = [...funcs];
    const res = {};
    const contaFolga2 = { A: {}, B: {} };
    lista.forEach((f, i) => {
      const ant = regraValida(f.regra) ? f.regra : null;
      const folgaFixa = ORDEM_FOLGA[i % ORDEM_FOLGA.length];
      const grupoDom = i % 2 === 0 ? 'A' : 'B';
      const r = {
        modelo,
        folgaFixa,
        grupoDom,
        sem: { ...DEF_SEM, ...((horarios && horarios.sem) || (ant && ant.sem) || {}) },
        dom: { ...DEF_DOM, ...((horarios && horarios.dom) || (ant && ant.dom) || {}) },
      };
      if (modelo === '5x2') {
        // 2ª folga (seg-sáb): o dia com menos gente de folga naquela semana.
        const ja = contaFolga2[grupoDom];
        const fixas = {};
        lista.forEach((g, j) => { const fx = ORDEM_FOLGA[j % 6]; fixas[fx] = (fixas[fx] || 0) + 1; });
        let melhor = null, nota = Infinity;
        [1, 5, 4, 3, 2, 6].forEach((d, ordem) => {
          if (d === folgaFixa) return;
          const n = ((ja[d] || 0) + (fixas[d] || 0)) * 10 + ordem;
          if (n < nota) { nota = n; melhor = d; }
        });
        r.folga2 = melhor; ja[melhor] = (ja[melhor] || 0) + 1;
      }
      res[f.id] = r;
    });
    return res;
  }

  /* próximas folgas (para mostrar ao funcionário) */
  function proximasFolgas(func, escMes, deStr, qtd) {
    const out = [];
    const { y, m, d } = partes(deStr);
    let t = Date.UTC(y, m - 1, d);
    for (let i = 0; i < 70 && out.length < qtd; i++, t += DAY) {
      const dt = new Date(t);
      const s = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      const em = escMes && escMes[s.slice(0, 7)];
      const p = planoDia(func, em || {}, s);
      if (!p.on) out.push(s);
    }
    return out;
  }

  function descreverRegra(r) {
    if (!regraValida(r)) return '';
    const base = `Folga fixa ${DOW_NOME[r.folgaFixa]} · Domingo ${r.grupoDom === 'B' ? 'B' : 'A'}`;
    return r.modelo === '5x2' ? `5x2 · ${base} · 2ª folga ${DOW_NOME[r.folga2]}` : `5x2/6x1 · ${base}`;
  }

  const API = { REF_MONDAY, DEF_SEM, DEF_DOM, MODELOS, DOW_NOME, paridadeSemana, semanaLetra, regraValida,
    regraDia, planoDia, almocos, cobertura, sugerirLoja, proximasFolgas, descreverRegra, toMin, toHHMM };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EscalaAuto = API;
})(typeof window !== 'undefined' ? window : globalThis);
