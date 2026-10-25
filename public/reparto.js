// Pagine del reparto: filtro delle fasi mentre si scrive.
(() => {
  const filtro = document.getElementById('filtro-fasi');
  if (filtro) filtro.addEventListener('input', () => {
    const t = filtro.value.trim().toLowerCase();
    document.querySelectorAll('ul.fasi li').forEach(li => { li.hidden = !!t && !li.dataset.cerca.includes(t); });
    // cercando, si mostrano anche le fasi non previste
    const altre = document.querySelector('details');
    if (altre && t) altre.open = true;
  });
})();
