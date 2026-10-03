import type { Evento } from './briefing';

export interface EventoAn {
  titulo: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  local?: string;
  /** 0 = hoje, 1 = amanhã, 2 = depois de amanhã. */
  dia: number;
  passou: boolean;
  emAndamento: boolean;
  /** Minutos até começar (só para eventos de hoje que ainda não começaram). */
  comecaEmMin?: number;
}

export interface AgendaAnalise {
  hoje: EventoAn[];
  amanha: EventoAn[];
  depois: EventoAn[];
  /** Começam nas próximas horas (padrão 3 h), fora os de dia inteiro. */
  proximos: EventoAn[];
  conflitos: Array<[EventoAn, EventoAn]>;
}

const DIA_MS = 86_400_000;
/** Eventos mais curtos que isso (lembretes de água, pré-treino…) não geram conflito. */
const MIN_CONFLITO_MIN = 20;

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "AAAA-MM-DD" vira meia-noite LOCAL (new Date('2026-10-02') seria UTC e erraria o dia). */
export function lerData(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function analisarAgenda(eventos: Evento[], agora: Date, horasProximas = 3): AgendaAnalise {
  const hoje0 = inicioDoDia(agora).getTime();
  const lista: EventoAn[] = [];

  for (const e of eventos) {
    const inicio = lerData(e.inicio);
    if (!inicio) continue;
    let fim = e.fim ? lerData(e.fim) : null;
    if (e.diaInteiro) fim = new Date(inicioDoDia(inicio).getTime() + DIA_MS);
    if (!fim || fim.getTime() < inicio.getTime()) fim = inicio;
    const dia = Math.round((inicioDoDia(inicio).getTime() - hoje0) / DIA_MS);
    const passou = !e.diaInteiro && fim.getTime() <= agora.getTime() && fim.getTime() > inicio.getTime();
    const emAndamento = !e.diaInteiro && inicio.getTime() <= agora.getTime() && fim.getTime() > agora.getTime();
    const an: EventoAn = { titulo: e.titulo, inicio, fim, diaInteiro: e.diaInteiro, dia, passou, emAndamento };
    if (e.local) an.local = e.local;
    if (dia === 0 && !e.diaInteiro && inicio.getTime() > agora.getTime()) {
      an.comecaEmMin = Math.round((inicio.getTime() - agora.getTime()) / 60_000);
    }
    lista.push(an);
  }

  lista.sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.inicio.getTime() - b.inicio.getTime() || a.titulo.localeCompare(b.titulo));

  const limite = agora.getTime() + horasProximas * 3_600_000;
  const proximos = lista.filter((e) => !e.diaInteiro && e.inicio.getTime() > agora.getTime() && e.inicio.getTime() <= limite);

  // Conflito: sobreposição real entre eventos com duração mínima, ainda não encerrados.
  const candidatos = lista.filter(
    (e) => !e.diaInteiro && e.fim.getTime() > agora.getTime() && (e.fim.getTime() - e.inicio.getTime()) / 60_000 >= MIN_CONFLITO_MIN,
  );
  const conflitos: Array<[EventoAn, EventoAn]> = [];
  for (let i = 0; i < candidatos.length; i++) {
    for (let j = i + 1; j < candidatos.length; j++) {
      const a = candidatos[i]!;
      const b = candidatos[j]!;
      if (a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime()) conflitos.push([a, b]);
    }
  }

  return {
    hoje: lista.filter((e) => e.dia === 0),
    amanha: lista.filter((e) => e.dia === 1),
    depois: lista.filter((e) => e.dia >= 2),
    proximos,
    conflitos,
  };
}

export function formatarHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "agora", "há 5 min", "há 2 h", "há 3 d". */
export function haQuanto(iso: string | undefined, agora: Date): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor((agora.getTime() - t) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function emHorasMin(min: number): string {
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `em ${h} h ${m} min` : `em ${h} h`;
}
