// O que a pílula do topo da tela mostra: o próximo evento ou a meta do dia. Lógica pura (testada); sem custo de assinatura:
// usa o briefing em cache e as metas locais, recalculados a cada 30 s só para atualizar "em 12 min".
import { analisarAgenda, emHorasMin, formatarHora, type EventoAn } from './agenda';
import type { AgendaDados } from './briefing';
import type { Meta } from './metas';
import { analisarMetas, DIAS_PARADA_PADRAO, type MetaAn } from './metas-analise';

export type ModoPilula = 'urgente' | 'agora' | 'em-breve' | 'meta' | 'depois';

export interface ConteudoPilula {
  modo: ModoPilula;
  /** Palavra curta que abre a pílula: "Agora", "Em 8 min", "Meta do dia", "Hoje". */
  rotulo: string;
  titulo: string;
  detalhe: string;
  /** Pede atenção (evento começando em até 10 min, meta atrasada). */
  urgente: boolean;
  /** Até 4 eventos de hoje que ainda não terminaram (visão expandida). */
  eventos: Array<{ titulo: string; hora: string; agora: boolean }>;
  /** A meta mais pressionante (visão expandida e modo "meta"). */
  meta?: { nome: string; passo: string; situacao: string; alerta?: 'atrasada' | 'parada' };
}

export const MIN_URGENTE = 10;
export const MIN_EM_BREVE = 120;

function tituloCurto(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** A meta mais pressionante: atrasada, depois parada, depois prazo mais próximo, depois a mais antiga sem avanço. */
export function metaDoDia(metas: readonly Meta[], agora: Date, diasParada = DIAS_PARADA_PADRAO): MetaAn | undefined {
  const ativas = analisarMetas([...metas], agora, diasParada).filter((m) => m.status === 'ativa');
  if (ativas.length === 0) return undefined;
  return [...ativas].sort(
    (a, b) =>
      Number(b.atrasada) - Number(a.atrasada) ||
      Number(b.parada) - Number(a.parada) ||
      (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity) ||
      b.diasSemAvanco - a.diasSemAvanco ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  )[0];
}

/**
 * Escolhe o conteúdo. Ordem de importância:
 *  1. evento começando em até 10 min (urgente); 2. evento em andamento; 3. próximo evento em até 2 h;
 *  4. meta do dia; 5. próximo evento mais tarde hoje. Sem nada disso: null (a pílula some).
 */
export function montarPilula(agenda: AgendaDados | undefined, metas: readonly Meta[], agora: Date, diasParada = DIAS_PARADA_PADRAO): ConteudoPilula | null {
  const an = agenda ? analisarAgenda(agenda.eventos, agora) : undefined;
  const t = agora.getTime();
  // Eventos com hora marcada, de QUALQUER dia: em andamento agora ou ainda por vir (um evento às 00:15 visto às 23:50 conta).
  const todos: EventoAn[] = [...(an?.hoje ?? []), ...(an?.amanha ?? []), ...(an?.depois ?? [])].filter((e) => !e.diaInteiro);
  const andamento = todos.find((e) => e.emAndamento);
  const futuros = todos.filter((e) => !e.emAndamento && e.inicio.getTime() >= t).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const proximo = futuros[0];
  const minutosAte = (e: EventoAn) => Math.max(0, Math.round((e.inicio.getTime() - t) / 60_000));
  const m = metaDoDia(metas, agora, diasParada);

  // visão expandida: o que está rolando e o que vem nas próximas 12 h
  const horizonte = t + 12 * 3_600_000;
  const restantes = todos.filter((e) => e.emAndamento || (e.inicio.getTime() >= t && e.inicio.getTime() <= horizonte)).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const eventos = restantes.slice(0, 4).map((e) => ({ titulo: tituloCurto(e.titulo), hora: formatarHora(e.inicio), agora: e.emAndamento }));
  const meta = m
    ? {
        nome: tituloCurto(m.nome), passo: tituloCurto(m.proximoPasso || 'Defina o próximo passo', 80), situacao: m.rotuloPrazo,
        ...(m.atrasada ? { alerta: 'atrasada' as const } : m.parada ? { alerta: 'parada' as const } : {}),
      }
    : undefined;
  const base = { eventos, ...(meta ? { meta } : {}) };

  const min = proximo ? minutosAte(proximo) : undefined;
  if (proximo && min !== undefined && min <= MIN_URGENTE) {
    return { ...base, modo: 'urgente', rotulo: min <= 0 ? 'Agora' : emHorasMin(min).replace(/^em /, 'Em '), titulo: tituloCurto(proximo.titulo), detalhe: `às ${formatarHora(proximo.inicio)}`, urgente: true };
  }
  if (andamento) {
    return { ...base, modo: 'agora', rotulo: 'Agora', titulo: tituloCurto(andamento.titulo), detalhe: `até ${formatarHora(andamento.fim)}`, urgente: false };
  }
  if (proximo && min !== undefined && min <= MIN_EM_BREVE) {
    return { ...base, modo: 'em-breve', rotulo: emHorasMin(min).replace(/^em /, 'Em '), titulo: tituloCurto(proximo.titulo), detalhe: `às ${formatarHora(proximo.inicio)}`, urgente: false };
  }
  if (m && meta) {
    return { ...base, modo: 'meta', rotulo: 'Meta do dia', titulo: meta.nome, detalhe: meta.passo, urgente: m.atrasada };
  }
  // mais tarde, mas ainda HOJE (o evento de amanhã de manhã não fica na pílula à noite)
  if (proximo && proximo.dia === 0) {
    return { ...base, modo: 'depois', rotulo: 'Hoje', titulo: tituloCurto(proximo.titulo), detalhe: `às ${formatarHora(proximo.inicio)}`, urgente: false };
  }
  return null;
}
