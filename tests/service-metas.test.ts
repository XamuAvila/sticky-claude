import { describe, expect, it, vi } from 'vitest';
import type { Meta } from '../src/shared/metas';
import { BriefingService, type Dependencias, type FonteNome, type SaidaFonte } from '../src/main/briefing/service';

const AGORA = new Date(2026, 9, 2, 12, 0);
const dia = (n: number) => new Date(2026, 9, 2 + n).toLocaleDateString('sv-SE');
const m = (p: Partial<Meta>): Meta => ({ id: 'x', nome: 'Meta', status: 'ativa', porque: '', proximoPasso: '', criadaEm: new Date(2026, 9, 1, 12).toISOString(), atualizadaEm: '', ...p });
const FOCO_OK = { prioridades: [{ titulo: 'Retomar Inglês', porque: 'Parada há 9 dias. Passo: 1 lição de 15 min', origem: 'metas' }] };

function criar(respostas: Partial<Record<FonteNome, SaidaFonte>>, metas: Meta[], diasParada?: number) {
  const prompts: Record<string, string> = {};
  const deps: Dependencias = {
    executar: async (fonte, prompt) => { prompts[fonte] = prompt; return respostas[fonte] ?? { ok: false, erro: 'x' }; },
    aguardarRede: async () => 'ok',
    agora: () => AGORA,
    tz: 'America/Sao_Paulo',
    salvar: () => undefined,
    log: { info: vi.fn(), warn: vi.fn(), erro: vi.fn() },
    metas: () => metas,
    ...(diasParada ? { diasParada: () => diasParada } : {}),
  };
  return { svc: new BriefingService(deps), prompts };
}

describe('briefing com metas', () => {
  it('o foco recebe só as metas ativas, com prazo, parada e atraso', async () => {
    const { svc, prompts } = criar({ foco: { ok: true, bruto: FOCO_OK } }, [
      m({ id: '1', nome: 'Inglês', ultimoAvancoEm: dia(-9), proximoPasso: 'Fazer 1 lição' }),
      m({ id: '2', nome: 'Relatório', prazo: dia(-2), ultimoAvancoEm: dia(-1) }),
      m({ id: '3', nome: 'Livro antigo', status: 'abandonada' }),
      m({ id: '4', nome: 'Pausada', status: 'pausada' }),
    ]);
    await svc.atualizar('manual');
    const p = prompts.foco!;
    expect(p).toContain('Inglês');
    expect(p).toContain('"paradaHaDias":9');
    expect(p).toContain('Fazer 1 lição');
    expect(p).toContain('"atrasada":true');
    expect(p).toContain('(não definido)'); // Relatório não tem próximo passo
    expect(p).not.toContain('Livro antigo');
    expect(p).not.toContain('Pausada');
    expect(p).toContain('até 15 minutos');
  });

  it('o limite de "parada" vem da configuração', async () => {
    const meta = m({ nome: 'Inglês', ultimoAvancoEm: dia(-4) });
    const a = criar({ foco: { ok: true, bruto: FOCO_OK } }, [meta]);
    await a.svc.atualizar('manual');
    expect(a.prompts.foco).not.toContain('paradaHaDias');
    const b = criar({ foco: { ok: true, bruto: FOCO_OK } }, [meta], 3);
    await b.svc.atualizar('manual');
    expect(b.prompts.foco).toContain('"paradaHaDias":4');
  });

  it('com Agenda e E-mails falhando, as metas ainda geram um foco', async () => {
    const { svc } = criar({ foco: { ok: true, bruto: FOCO_OK } }, [m({ nome: 'Inglês' })]);
    await svc.atualizar('manual');
    const b = svc.snapshot().briefing;
    expect([b.agenda.status, b.emails.status, b.foco.status]).toEqual(['erro', 'erro', 'ok']);
    expect(b.foco.dados?.prioridades[0]!.origem).toBe('metas');
  });

  it('sem agenda, e-mails nem metas ativas, não há o que sugerir', async () => {
    const { svc, prompts } = criar({}, [m({ status: 'concluida' })]);
    await svc.atualizar('manual');
    expect(prompts.foco).toBeUndefined();
    expect(svc.snapshot().briefing.foco.erro).toMatch(/Sem dados/);
  });
});
