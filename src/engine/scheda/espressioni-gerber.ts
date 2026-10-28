/**
 * Calcolo delle espressioni nelle macro Gerber ("$1x0.5+$2", "$3=$1/2"): solo numeri, + − × ÷ e parentesi.
 * Il file arriva dal cliente: niente eval, un piccolo calcolatore a mano.
 */
export function calcolaEspressione(testo: string, variabili: Record<number, number>): number {
  const s = testo.replace(/\s+/g, '').replace(/[xX]/g, '*').replace(/\$(\d+)/g, (_m, n) => `(${variabili[Number(n)] ?? 0})`);
  let i = 0;
  const numero = (): number => {
    const m = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error(`Espressione non valida: ${testo}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const fattore = (): number => {
    if (s[i] === '-') { i++; return -fattore(); }
    if (s[i] === '+') { i++; return fattore(); }
    if (s[i] === '(') { i++; const v = somma(); if (s[i] !== ')') throw new Error(`Parentesi non chiusa: ${testo}`); i++; return v; }
    return numero();
  };
  const prodotto = (): number => {
    let v = fattore();
    while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const w = fattore(); v = op === '*' ? v * w : (w === 0 ? 0 : v / w); }
    return v;
  };
  const somma = (): number => {
    let v = prodotto();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const w = prodotto(); v = op === '+' ? v + w : v - w; }
    return v;
  };
  if (!s) return 0;
  const v = somma();
  if (i !== s.length) throw new Error(`Espressione non valida: ${testo}`);
  return v;
}
