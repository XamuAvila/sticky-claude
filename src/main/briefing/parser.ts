import { z } from 'zod';
import {
  AgendaWire, EmailsWire, FocoWire, EventoWire, EmailItemWire, SuspeitoWire, PrioridadeWire,
  type AgendaDados, type EmailsDados, type FocoDados,
} from '@shared/briefing';
import { lerData } from '@shared/agenda';
import { limpar } from '@shared/texto';

export type Resultado<T> = { ok: true; dados: T; descartados: number } | { ok: false; erro: string };

const MAX_EVENTOS = 60;
const MAX_EMAILS = 8;
const MAX_SUSPEITOS = 5;

export { limpar };

/** Extrai o 1º objeto JSON de um texto: aceita cerca ```json e prosa em volta. */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?/gi, '');
  const ini = semCerca.indexOf('{');
  if (ini < 0) return undefined;
  let prof = 0;
  let dentro = false;
  let escape = false;
  for (let i = ini; i < semCerca.length; i++) {
    const c = semCerca[i]!;
    if (dentro) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') dentro = false;
      continue;
    }
    if (c === '"') dentro = true;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) {
      try {
        return JSON.parse(semCerca.slice(ini, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Prefere o structured_output do CLI; cai para o JSON dentro do texto. */
export function brutoDaSaida(r: { estruturada?: unknown; texto?: string }): unknown {
  if (r.estruturada !== undefined && r.estruturada !== null) return r.estruturada;
  return r.texto ? extrairJson(r.texto) : undefined;
}

function parseLista<T>(lista: unknown, schema: z.ZodType<T>): { itens: T[]; descartados: number } {
  if (!Array.isArray(lista)) return { itens: [], descartados: 0 };
  const itens: T[] = [];
  let descartados = 0;
  for (const x of lista) {
    const r = schema.safeParse(x);
    if (r.success) itens.push(r.data);
    else descartados++;
  }
  return { itens, descartados };
}

const objeto = (b: unknown): Record<string, unknown> | null => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null);

const FORA_DO_FORMATO = 'A resposta do Claude veio fora do formato esperado.';

export function parseAgenda(bruto: unknown): Resultado<AgendaDados> {
  const o = objeto(bruto);
  if (!o || !Array.isArray(o.eventos)) return { ok: false, erro: FORA_DO_FORMATO };
  const { itens, descartados } = parseLista(o.eventos, EventoWire);
  const falhou = typeof o.falhou === 'string' ? limpar(o.falhou, 160) : '';
  if (falhou && itens.length === 0) return { ok: false, erro: `Não consegui ler o calendário: ${falhou}` };

  const vistos = new Set<string>();
  const eventos: AgendaDados['eventos'] = [];
  let invalidos = descartados;
  for (const e of itens) {
    const inicio = lerData(e.inicio);
    const fim = e.fim ? lerData(e.fim) : null;
    if (!inicio || (e.fim && !fim)) { invalidos++; continue; }
    const chave = `${e.titulo}|${e.inicio}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const ev: AgendaDados['eventos'][number] = {
      titulo: limpar(e.titulo, 200) || '(sem título)',
      inicio: e.inicio.trim(),
      diaInteiro: e.diaInteiro,
    };
    if (e.fim && !e.diaInteiro) ev.fim = e.fim.trim();
    if (e.local && limpar(e.local, 120)) ev.local = limpar(e.local, 120);
    eventos.push(ev);
  }
  eventos.sort((a, b) => (lerData(a.inicio)?.getTime() ?? 0) - (lerData(b.inicio)?.getTime() ?? 0));
  return { ok: true, dados: { eventos: eventos.slice(0, MAX_EVENTOS) }, descartados: invalidos };
}

const ORDEM_URGENCIA = { alta: 0, media: 1, baixa: 2 } as const;

export function parseEmails(bruto: unknown): Resultado<EmailsDados> {
  const o = objeto(bruto);
  if (!o || !Array.isArray(o.itens)) return { ok: false, erro: FORA_DO_FORMATO };
  const a = parseLista(o.itens, EmailItemWire);
  const s = parseLista(o.suspeitos, SuspeitoWire);
  const falhou = typeof o.falhou === 'string' ? limpar(o.falhou, 160) : '';
  if (falhou && a.itens.length === 0 && s.itens.length === 0) return { ok: false, erro: `Não consegui ler o Gmail: ${falhou}` };

  const itens = a.itens
    .map((e) => ({
      remetente: limpar(e.remetente, 80) || '(remetente desconhecido)',
      assunto: limpar(e.assunto, 160) || '(sem assunto)',
      data: e.data.trim(),
      acao: limpar(e.acao, 160) || 'Verificar',
      urgencia: e.urgencia,
    }))
    .sort((x, y) => ORDEM_URGENCIA[x.urgencia] - ORDEM_URGENCIA[y.urgencia] || (lerData(y.data)?.getTime() ?? 0) - (lerData(x.data)?.getTime() ?? 0))
    .slice(0, MAX_EMAILS);

  const suspeitos = s.itens
    .map((x) => ({ remetente: limpar(x.remetente, 80), assunto: limpar(x.assunto, 160), trecho: limpar(x.trecho, 200), motivo: limpar(x.motivo, 160) }))
    .slice(0, MAX_SUSPEITOS);

  return { ok: true, dados: { itens, suspeitos }, descartados: a.descartados + s.descartados };
}

export function parseFoco(bruto: unknown): Resultado<FocoDados> {
  const o = objeto(bruto);
  if (!o || !Array.isArray(o.prioridades)) return { ok: false, erro: FORA_DO_FORMATO };
  const { itens, descartados } = parseLista(o.prioridades, PrioridadeWire);
  const prioridades = itens.slice(0, 3).map((p) => ({ titulo: limpar(p.titulo, 120), porque: limpar(p.porque, 200), origem: p.origem }));
  return { ok: true, dados: { prioridades }, descartados };
}

export { AgendaWire, EmailsWire, FocoWire };
