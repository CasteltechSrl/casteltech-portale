// Caselle dei tempi (data-tempo="minuti" o "secondi"): 1.30 = 1,30 = 1:30 = 1h 30', numero intero = minuti (o secondi).
// Mentre si scrive, sotto la casella (elemento .lettura-tempo) si legge come è stato capito; uscendo, il tempo si riscrive
// leggibile. Stessa regola di src/engine/tempi-scritti.ts (il test controlla che diano gli stessi risultati).
(() => {
  function secondiDaTempo(x, base) {
    const t = String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    if (/^\d+$/.test(t)) return Number(t) * (base === 'secondi' ? 1 : 60);
    let m = /^(\d*)[.,:](\d{1,2})(?:[.,:](\d{1,2}))?$/.exec(t);
    if (m) {
      if (m[2].length < 2 || (m[3] != null && m[3].length < 2)) return null;
      const a = Number(m[1] || 0), b = Number(m[2]), c = m[3] != null ? Number(m[3]) : null;
      if (b > 59 || (c != null && c > 59)) return null;
      if (c != null) return a * 3600 + b * 60 + c;
      return base === 'secondi' ? a * 60 + b : a * 3600 + b * 60;
    }
    m = /^(\d+) ?h ?(\d{1,2})$/.exec(t);
    if (m) return Number(m[2]) > 59 ? null : Number(m[1]) * 3600 + Number(m[2]) * 60;
    m = /^(?:(\d+) ?(?:h|ore|ora))? ?(?:(\d+) ?(?:min|m|'(?!')))? ?(?:(\d+) ?(?:''|"|sec|s))?$/.exec(t);
    if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    return null;
  }
  function scriviTempo(sec, base) {
    const due = n => String(n).padStart(2, '0');
    if (base === 'secondi') {
      const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60), ss = s % 60;
      if (h) return `${h}h ${due(min)}' ${due(ss)}''`;
      return min ? `${min}' ${due(ss)}''` : `${ss}''`;
    }
    const t = Math.max(0, Math.round(sec / 60)), h = Math.floor(t / 60), min = t % 60;
    return h ? `${h}h ${due(min)}'` : `${min}'`;
  }
  if (typeof window !== 'undefined') window.CasteltechTempi = { secondiDaTempo, scriviTempo };
  if (typeof document === 'undefined') return;

  const ERRORE = 'Non capito: scrivi 1.30 (1h 30\') oppure i minuti, es. 90';
  const casella = el => el && el.matches && el.matches('input[data-tempo]');
  const lettura = el => { const n = el.nextElementSibling; return n && n.classList.contains('lettura-tempo') ? n : null; };
  // mentre si scrive ("1." o "1.3" non sono ancora finiti) l'errore non si mostra: solo uscendo dalla casella
  const controlla = (el, mentreScrive) => {
    const base = el.dataset.tempo, v = el.value.trim(), sec = secondiDaTempo(v, base);
    const sbagliato = v !== '' && sec == null, mostra = sbagliato && !mentreScrive;
    el.classList.toggle('tempo-errato', mostra);
    el.setCustomValidity(sbagliato ? ERRORE : '');
    const l = lettura(el);
    if (l) { l.textContent = v === '' || (sbagliato && !mostra) ? '' : mostra ? ERRORE : `= ${scriviTempo(sec, base)}`; l.classList.toggle('errata', mostra); }
    return sec;
  };
  document.addEventListener('input', e => { if (casella(e.target)) controlla(e.target, true); });
  document.addEventListener('focusout', e => {
    if (!casella(e.target)) return;
    const sec = controlla(e.target);
    if (sec != null) { e.target.value = scriviTempo(sec, e.target.dataset.tempo); const l = lettura(e.target); if (l) l.textContent = ''; }
  });
  // valori già scritti (es. pagina ricaricata dopo un errore)
  document.querySelectorAll('input[data-tempo]').forEach(el => { if (el.value.trim()) { const sec = controlla(el); if (sec != null) el.value = scriviTempo(sec, el.dataset.tempo); } });
})();
