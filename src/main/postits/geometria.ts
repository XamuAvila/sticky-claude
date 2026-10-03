// Posição e tamanho dos post-its com vários monitores e DPIs diferentes (lógica pura, testada com telas de mentira).
// Tudo em DIPs (pixels independentes de DPI), que é como o Electron expressa bounds e displays.
import { TAMANHO_MINIMO, type Retangulo, type TelaSalva } from '@shared/postits';

export interface Tela {
  id: number;
  bounds: Retangulo;
  /** Área útil: sem a barra de tarefas. */
  workArea: Retangulo;
  scaleFactor: number;
  primaria?: boolean;
}

const area = (r: Retangulo) => Math.max(0, r.width) * Math.max(0, r.height);

function intersecao(a: Retangulo, b: Retangulo): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const centro = (r: Retangulo) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Tela que mais contém o retângulo; se nenhuma o toca, a mais próxima do centro dele. */
export function telaDoRetangulo(r: Retangulo, telas: readonly Tela[]): Tela {
  let melhor = telas[0]!;
  let maior = -1;
  for (const t of telas) {
    const i = intersecao(r, t.bounds);
    if (i > maior) { maior = i; melhor = t; }
  }
  if (maior > 0) return melhor;
  const c = centro(r);
  let menor = Infinity;
  for (const t of telas) {
    const tc = centro(t.bounds);
    const d = (tc.x - c.x) ** 2 + (tc.y - c.y) ** 2;
    if (d < menor) { menor = d; melhor = t; }
  }
  return melhor;
}

export function telaSalvaDe(t: Tela): TelaSalva {
  return { id: t.id, bounds: { ...t.bounds }, scaleFactor: t.scaleFactor };
}

/** Garante que o retângulo cabe inteiro na área útil da tela (encolhe se for maior, empurra se sair). */
export function ajustarNaArea(r: Retangulo, workArea: Retangulo): Retangulo {
  const width = Math.max(TAMANHO_MINIMO.width, Math.min(r.width, workArea.width));
  const height = Math.max(TAMANHO_MINIMO.height, Math.min(r.height, workArea.height));
  const x = Math.min(Math.max(r.x, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(r.y, workArea.y), workArea.y + workArea.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export interface Salvo {
  bounds: Retangulo;
  tela?: TelaSalva | undefined;
}

export interface Restaurado {
  bounds: Retangulo;
  /** Como a tela foi encontrada (útil para o log e para os testes). */
  origem: 'mesma-tela' | 'mesma-assinatura' | 'primaria' | 'sem-telas';
}

const mesmaForma = (a: Retangulo, b: Retangulo) => a.width === b.width && a.height === b.height;

/**
 * Onde reabrir o post-it. Ordem de busca da tela:
 *  1. mesma id (mantém a posição relativa à origem da tela, caso o monitor tenha sido reposicionado);
 *  2. outra tela com o mesmo tamanho e a mesma escala (o Windows às vezes troca as ids ao reiniciar);
 *  3. a tela principal (monitor desligado/removido).
 * Em todos os casos o resultado é ajustado para caber na área útil.
 */
export function restaurarBounds(salvo: Salvo, telas: readonly Tela[]): Restaurado {
  if (telas.length === 0) return { bounds: salvo.bounds, origem: 'sem-telas' };
  const primaria = telas.find((t) => t.primaria) ?? telas[0]!;

  const origemDaTela = salvo.tela;
  if (!origemDaTela) {
    // posto sem tela registrada: usa a tela que contém o retângulo
    const t = telaDoRetangulo(salvo.bounds, telas);
    return { bounds: ajustarNaArea(salvo.bounds, t.workArea), origem: 'mesma-tela' };
  }

  const dx = salvo.bounds.x - origemDaTela.bounds.x;
  const dy = salvo.bounds.y - origemDaTela.bounds.y;
  const relativo = (t: Tela): Retangulo => ({ ...salvo.bounds, x: t.bounds.x + dx, y: t.bounds.y + dy });

  const igual = telas.find((t) => t.id === origemDaTela.id);
  if (igual) return { bounds: ajustarNaArea(relativo(igual), igual.workArea), origem: 'mesma-tela' };

  const parecida = telas.find((t) => t.scaleFactor === origemDaTela.scaleFactor && mesmaForma(t.bounds, origemDaTela.bounds));
  if (parecida) return { bounds: ajustarNaArea(relativo(parecida), parecida.workArea), origem: 'mesma-assinatura' };

  return { bounds: ajustarNaArea(relativo(primaria), primaria.workArea), origem: 'primaria' };
}

/** Posição inicial de um post-it novo: canto superior direito da tela, em cascata para não empilhar. */
export function posicaoInicial(tamanho: { width: number; height: number }, ocupados: readonly Retangulo[], tela: Tela): Retangulo {
  const MARGEM = 24;
  const PASSO = 32;
  const wa = tela.workArea;
  const base = { x: wa.x + wa.width - tamanho.width - MARGEM, y: wa.y + MARGEM };
  for (let i = 0; i < 12; i++) {
    const c = ajustarNaArea({ x: base.x - i * PASSO, y: base.y + i * PASSO, ...tamanho }, wa);
    if (!ocupados.some((o) => Math.abs(o.x - c.x) < PASSO / 2 && Math.abs(o.y - c.y) < PASSO / 2)) return c;
  }
  return ajustarNaArea({ ...base, ...tamanho }, wa);
}
