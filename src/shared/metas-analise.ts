// Parte das metas que a TELA também usa (sem zod, para o bundle da janela ficar pequeno).
import { lerData } from './agenda';
import type { Meta } from './metas';

export const STATUS_META = ['ativa', 'pausada', 'concluida', 'abandonada'] as const;
export type StatusMeta = (typeof STATUS_META)[number];

export const ROTULO_STATUS: Record<StatusMeta, string> = {
  ativa: 'ativa',
  pausada: 'pausada',
  concluida: 'concluída',
  abandonada: 'abandonada',
};

/** Proposta do Claude esperando confirmação (o que a tela mostra; as operações ficam só no processo principal). */
export interface PropostaMetas {
  id: string;
  /** Quem propôs (nome do post-it). */
  origem: string;
  descricoes: string[];
  criadaEm: string;
}

export interface SnapshotMetas {
  metas: Meta[];
  /** Mensagem para a tela quando algo exigiu atenção (ex.: arquivo corrompido preservado). */
  aviso?: string;
  /** Dias sem avanço para uma meta ativa contar como parada (config do usuário). */
  diasParada?: number;
}

/** Resposta padrão das ações da tela: erros viram mensagem, sem exceção atravessando o IPC. */
export type Retorno<T = void> = { ok: true; valor: T } | { ok: false; erro: string };

// ---- Análise (pura): prazo, parada e ordem ----

/** Meta ativa sem avanço há esse número de dias (ou mais) é avisada como parada. */
export const DIAS_PARADA_PADRAO = 7;

export interface MetaAn extends Meta {
  /** Dias até o prazo (negativo = já passou). null = sem prazo. */
  diasRestantes: number | null;
  atrasada: boolean;
  /** Dias desde o último avanço (ou desde a criação, se nunca houve avanço). */
  diasSemAvanco: number;
  parada: boolean;
  rotuloPrazo: string;
}

const DIA_MS = 86_400_000;
const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function rotuloPrazo(dias: number | null): string {
  if (dias === null) return 'sem prazo';
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias > 1) return `faltam ${dias} dias`;
  return dias === -1 ? 'atrasada há 1 dia' : `atrasada há ${-dias} dias`;
}

export function analisarMetas(metas: Meta[], agora: Date, diasParada = DIAS_PARADA_PADRAO): MetaAn[] {
  const hoje = meiaNoite(agora);
  const lista = metas.map((m): MetaAn => {
    const prazo = m.prazo ? lerData(m.prazo) : null;
    const diasRestantes = prazo ? Math.round((meiaNoite(prazo) - hoje) / DIA_MS) : null;
    const criada = new Date(m.criadaEm); // instante UTC: meiaNoite() o converte para o dia local
    const ref = m.ultimoAvancoEm ? lerData(m.ultimoAvancoEm) : Number.isNaN(criada.getTime()) ? null : criada;
    const diasSemAvanco = ref ? Math.max(0, Math.round((hoje - meiaNoite(ref)) / DIA_MS)) : 0;
    const ativa = m.status === 'ativa';
    return {
      ...m,
      diasRestantes,
      atrasada: ativa && diasRestantes !== null && diasRestantes < 0,
      diasSemAvanco,
      parada: ativa && diasSemAvanco >= diasParada,
      rotuloPrazo: rotuloPrazo(diasRestantes),
    };
  });

  const ordemStatus: Record<StatusMeta, number> = { ativa: 0, pausada: 1, concluida: 2, abandonada: 3 };
  return lista.sort(
    (a, b) =>
      ordemStatus[a.status] - ordemStatus[b.status] ||
      Number(b.atrasada) - Number(a.atrasada) ||
      (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity) ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** "AAAA-MM-DD" -> "DD/MM/AAAA". */
export function formatarData(s: string | undefined): string {
  if (!s) return 'sem prazo';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Hoje como AAAA-MM-DD no fuso local. */
export function hojeISO(agora: Date): string {
  return agora.toLocaleDateString('sv-SE');
}

/** "hoje", "ontem", "há N dias" a partir de dias inteiros. */
export function rotuloDias(dias: number): string {
  if (dias <= 0) return 'hoje';
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}
