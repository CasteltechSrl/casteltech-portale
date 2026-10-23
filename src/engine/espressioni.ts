/**
 * Mini-valutatore di formule, senza dipendenze e senza eval().
 *
 * Serve per scrivere le formule delle fasi dal pannello di amministrazione,
 * per esempio:  "qtFeeder * tempoContMateriale + qtFeederB * tempoContMaterialeB"
 *
 * Supporta: numeri, nomi di parametri, + - * / ^, parentesi, confronti (> < >= <= == !=)
 * e le funzioni: min, max, round, ceil, floor, abs, se(condizione, seVero, seFalso).
 * Un parametro mancante o vuoto vale 0 (come faceva il vecchio portale nei casi gestiti).
 */

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'par'; v: '(' | ')' }
  | { t: 'virgola' };

function tokenizza(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) j++;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (/[A-Za-z_À-ÿ]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_À-ÿ]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    const due = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(due)) { out.push({ t: 'op', v: due }); i += 2; continue; }
    if ('+-*/^<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: 'par', v: c }); i++; continue; }
    if (c === ',' || c === ';') { out.push({ t: 'virgola' }); i++; continue; }
    throw new Error(`Carattere non valido "${c}" nella formula: ${src}`);
  }
  return out;
}

export type Nodo =
  | { k: 'num'; v: number }
  | { k: 'var'; nome: string }
  | { k: 'neg'; x: Nodo }
  | { k: 'bin'; op: string; a: Nodo; b: Nodo }
  | { k: 'fn'; nome: string; args: Nodo[] };

const FUNZIONI: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  ceil: Math.ceil,
  floor: Math.floor,
  abs: Math.abs,
  se: (c, a, b) => (c ? a : b),
};

export function analizza(src: string): Nodo {
  const tk = tokenizza(src);
  let p = 0;
  const guarda = () => tk[p];
  const prendi = () => tk[p++];

  function primario(): Nodo {
    const x = prendi();
    if (!x) throw new Error(`Formula incompleta: ${src}`);
    if (x.t === 'num') return { k: 'num', v: x.v };
    if (x.t === 'op' && x.v === '-') return { k: 'neg', x: potenza() };
    if (x.t === 'op' && x.v === '+') return potenza();
    if (x.t === 'par' && x.v === '(') {
      const e = confronto();
      const c = prendi();
      if (!c || c.t !== 'par' || c.v !== ')') throw new Error(`Manca ")" nella formula: ${src}`);
      return e;
    }
    if (x.t === 'id') {
      const n = guarda();
      if (n && n.t === 'par' && n.v === '(') {
        prendi();
        const nome = x.v.toLowerCase();
        if (!FUNZIONI[nome]) throw new Error(`Funzione sconosciuta "${x.v}" nella formula: ${src}`);
        const args: Nodo[] = [];
        if (!(guarda()?.t === 'par' && (guarda() as any).v === ')')) {
          args.push(confronto());
          while (guarda()?.t === 'virgola') { prendi(); args.push(confronto()); }
        }
        const c = prendi();
        if (!c || c.t !== 'par' || c.v !== ')') throw new Error(`Manca ")" nella formula: ${src}`);
        return { k: 'fn', nome, args };
      }
      return { k: 'var', nome: x.v };
    }
    throw new Error(`Simbolo inatteso nella formula: ${src}`);
  }
  function potenza(): Nodo {
    let a = primario();
    while (guarda()?.t === 'op' && (guarda() as any).v === '^') { prendi(); a = { k: 'bin', op: '^', a, b: primario() }; }
    return a;
  }
  function prodotto(): Nodo {
    let a = potenza();
    while (guarda()?.t === 'op' && '*/'.includes((guarda() as any).v)) {
      const op = (prendi() as any).v; a = { k: 'bin', op, a, b: potenza() };
    }
    return a;
  }
  function somma(): Nodo {
    let a = prodotto();
    while (guarda()?.t === 'op' && '+-'.includes((guarda() as any).v)) {
      const op = (prendi() as any).v; a = { k: 'bin', op, a, b: prodotto() };
    }
    return a;
  }
  function confronto(): Nodo {
    let a = somma();
    while (guarda()?.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes((guarda() as any).v)) {
      const op = (prendi() as any).v; a = { k: 'bin', op, a, b: somma() };
    }
    return a;
  }
  const albero = confronto();
  if (p < tk.length) throw new Error(`Testo in eccesso nella formula: ${src}`);
  return albero;
}

/** Nomi dei parametri usati in una formula (per validarla dal pannello). */
export function variabiliUsate(src: string): string[] {
  const s = new Set<string>();
  const visita = (n: Nodo) => {
    if (n.k === 'var') s.add(n.nome);
    else if (n.k === 'neg') visita(n.x);
    else if (n.k === 'bin') { visita(n.a); visita(n.b); }
    else if (n.k === 'fn') n.args.forEach(visita);
  };
  visita(analizza(src));
  return [...s];
}

export function valuta(n: Nodo, vars: Record<string, number | null | undefined>): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': {
      const v = vars[n.nome];
      return v == null || Number.isNaN(Number(v)) ? 0 : Number(v);
    }
    case 'neg': return -valuta(n.x, vars);
    case 'fn': return FUNZIONI[n.nome](...n.args.map(a => valuta(a, vars)));
    case 'bin': {
      const a = valuta(n.a, vars), b = valuta(n.b, vars);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        // divisione per zero = 0 (es. chip/h non compilato): niente "Infinity" nei preventivi
        case '/': return b === 0 ? 0 : a / b;
        case '^': return a ** b;
        case '>': return +(a > b);
        case '<': return +(a < b);
        case '>=': return +(a >= b);
        case '<=': return +(a <= b);
        case '==': return +(a === b);
        case '!=': return +(a !== b);
      }
    }
  }
  throw new Error('Nodo non valido');
}

const cache = new Map<string, Nodo>();
export function calcolaFormula(src: string, vars: Record<string, number | null | undefined>): number {
  let n = cache.get(src);
  if (!n) { n = analizza(src); cache.set(src, n); }
  return valuta(n, vars);
}
