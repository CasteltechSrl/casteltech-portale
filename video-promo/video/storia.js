/*
 * Sceneggiatura del video: ogni scena ha la sua battuta di voce (testi.json) e le riprese delle pagine (cartella riprese/).
 * Le coordinate delle telecamere sono in pixel della pagina del portale larga 1600 (come le riprese).
 * cam: [secondo nella scena, x, y, zoom]  (zoom 1 = pagina intera in larghezza; 1.6 = ingrandita)
 * evid: riquadro evidenziato [da, a, x, y, larghezza, altezza, 'rosso'?]
 * Per aggiungere una funzione nuova: una scena in più qui + la sua battuta in testi.json + la ripresa in riprese.json.
 */
window.STORIA = [
  { id: 'v1', capitolo: null, extra: 'caos' },
  { id: 'v2', capitolo: null, extra: 'reveal',
    riprese: [{ img: 'cruscotto', cam: [[0, 0, 0, 0.9], [5, 0, 0, 0.9]] }] },
  { id: 'v3', capitolo: [1, "Dalla richiesta d'offerta al preventivo"], extra: 'ia',
    riprese: [
      { img: 'documenti', da: 0, a: 3.6, cam: [[0, 0, 60, 1.15], [3.6, 0, 90, 1.15]], evid: [[0.8, 3.4, 22, 126, 1556, 215]] },
      { img: 'documenti', da: 3.6, a: 7.6, cam: [[0, 0, 1490, 1.15], [4, 305, 1610, 1.6]] },
      { img: 'documenti', da: 7.6, a: 10.6, cam: [[0, 300, 460, 1.0], [3, 560, 470, 1.45]], evid: [[0.6, 3, 700, 529, 862, 82, 'rosso'], [1.4, 3, 700, 618, 862, 82, 'rosso']] },
      { img: 'preventivo', da: 10.6, a: 99, cam: [[0, 0, 40, 1.0], [2.2, 640, 380, 1.75]], evid: [[1.6, 99, 690, 440, 835, 270]] },
    ] },
  { id: 'v4', capitolo: [2, 'Un cruscotto per tutta la giornata'],
    riprese: [
      { img: 'cruscotto', da: 0, a: 3.6, cam: [[0, 0, 60, 1.0], [3.6, 0, 300, 1.0]], evid: [[0.4, 3.4, 22, 318, 1556, 172]] },
      { img: 'flusso', da: 3.6, a: 99, cam: [[0, 0, 300, 1.0], [4, 180, 470, 1.3]] },
    ] },
  { id: 'v5', capitolo: [3, 'Componenti, ordini e commesse'],
    riprese: [
      { img: 'bom', da: 0, a: 4.8, cam: [[0, 0, 60, 1.0], [4.8, 700, 500, 1.55]], evid: [[1.2, 4.6, 1404, 532, 176, 760]] },
      { img: 'ordine', da: 4.8, a: 7.4, cam: [[0, 0, 60, 1.0], [2.6, 0, 120, 1.15]] },
      { img: 'commessa', da: 7.4, a: 99, cam: [[0, 0, 60, 1.0], [3, 700, 300, 1.4]] },
    ] },
  { id: 'v6', capitolo: [4, 'Produzione sotto controllo'], extra: 'telefono',
    riprese: [
      { img: 'schedastampa', da: 0, a: 3.6, cam: [[0, 300, 40, 1.0], [3.6, 700, 50, 1.9]] },
      { img: 'gantt', da: 3.6, a: 99, cam: [[0, 0, 160, 1.0], [3.6, 120, 250, 1.25]] },
    ] },
  { id: 'v7', capitolo: [5, 'Amministrazione in automatico'],
    riprese: [
      { img: 'fatture', da: 0, a: 3.4, cam: [[0, 0, 40, 1.0], [3.4, 500, 120, 1.4]], evid: [[0.8, 3.3, 1395, 345, 130, 330]] },
      { img: 'ricevuti', da: 3.4, a: 5.8, cam: [[0, 0, 40, 1.0], [2.4, 0, 90, 1.1]] },
      { img: 'banca', da: 5.8, a: 99, cam: [[0, 0, 640, 1.0], [3.6, 380, 690, 1.35]], evid: [[1, 99, 1060, 720, 520, 380]] },
    ] },
  { id: 'v8', capitolo: [6, 'I numeri che contano'],
    riprese: [
      { img: 'analisi', da: 0, a: 3.2, cam: [[0, 0, 300, 1.0], [3.2, 0, 640, 1.1]] },
      { img: 'cassa', da: 3.2, a: 99, cam: [[0, 0, 60, 1.0], [3, 0, 100, 1.15]] },
    ] },
  { id: 'v9', capitolo: null, extra: 'finale' },
];
