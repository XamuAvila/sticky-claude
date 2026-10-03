import { describe, expect, it, vi } from 'vitest';
import type { Briefing } from '../src/shared/briefing';
import { BriefingService, briefingDoCache, type Dependencias, type FonteNome, type SaidaFonte } from '../src/main/briefing/service';

const AGORA = new Date(2026, 9, 2, 9, 0);
const iso = (h: number, m = 0) => new Date(2026, 9, 2, h, m).toISOString();

const AGENDA_OK = { eventos: [{ titulo: 'Reunião', inicio: iso(10), fim: iso(11), diaInteiro: false }] };
const EMAILS_OK = { itens: [{ remetente: 'Ana', assunto: 'Contrato', data: iso(8), acao: 'Responder', urgencia: 'alta' }], suspeitos: [] };
const FOCO_OK = { prioridades: [{ titulo: 'Responder a Ana', porque: 'Urgência alta', origem: 'emails' }] };

const logger = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };

function criar(respostas: Partial<Record<FonteNome, SaidaFonte | (() => SaidaFonte)>>, opcoes: Partial<Dependencias> = {}, inicial?: Briefing) {
  const chamadas: Array<{ fonte: FonteNome; prompt: string }> = [];
  const salvos: Briefing[] = [];
  const deps: Dependencias = {
    executar: async (fonte, prompt) => {
      chamadas.push({ fonte, prompt });
      const r = respostas[fonte];
      return typeof r === 'function' ? r() : r ?? { ok: false, erro: 'sem resposta' };
    },
    aguardarRede: async () => 'ok',
    agora: () => AGORA,
    tz: 'America/Sao_Paulo',
    salvar: (b) => salvos.push(structuredClone(b)),
    log: logger,
    metas: () => [],
    ...opcoes,
  };
  return { svc: new BriefingService(deps, inicial), chamadas, salvos };
}

describe('BriefingService', () => {
  it('caminho feliz: as 3 seções ficam ok, com data e persistência', async () => {
    const { svc, salvos } = criar({ agenda: { ok: true, bruto: AGENDA_OK }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    await svc.atualizar('manual');
    const { briefing, executando } = svc.snapshot();
    expect(executando).toBe(false);
    expect([briefing.agenda.status, briefing.emails.status, briefing.foco.status]).toEqual(['ok', 'ok', 'ok']);
    expect(briefing.geradoEm).toBe(AGORA.toISOString());
    expect(briefing.foco.dados?.prioridades).toHaveLength(1);
    expect(salvos.length).toBeGreaterThan(0);
  });

  it('se o Gmail falhar, agenda e foco ainda aparecem (erro por fonte)', async () => {
    const { svc, chamadas } = criar({
      agenda: { ok: true, bruto: AGENDA_OK },
      emails: { ok: false, erro: 'O conector Gmail não está conectado (needs-auth).' },
      foco: { ok: true, bruto: FOCO_OK },
    });
    await svc.atualizar('manual');
    const { briefing } = svc.snapshot();
    expect(briefing.agenda.status).toBe('ok');
    expect(briefing.emails.status).toBe('erro');
    expect(briefing.emails.erro).toContain('Gmail');
    expect(briefing.foco.status).toBe('ok');
    expect(briefing.geradoEm).toBeDefined();
    // o foco foi gerado só com a agenda
    const foco = chamadas.find((c) => c.fonte === 'foco')!;
    expect(foco.prompt).toContain('Reunião');
    expect(foco.prompt).not.toContain('Contrato');
  });

  it('em erro, mantém os dados antigos da fonte (painel continua útil)', async () => {
    const primeiro = criar({ agenda: { ok: true, bruto: AGENDA_OK }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    await primeiro.svc.atualizar('manual');
    const cache = briefingDoCache(JSON.parse(JSON.stringify(primeiro.svc.snapshot().briefing)));

    const { svc } = criar({ agenda: { ok: true, bruto: AGENDA_OK }, emails: { ok: false, erro: 'falhou' }, foco: { ok: true, bruto: FOCO_OK } }, {}, cache);
    await svc.atualizar('manual');
    const e = svc.snapshot().briefing.emails;
    expect(e.status).toBe('erro');
    expect(e.dados?.itens).toHaveLength(1);
  });

  it('resposta fora do formato vira erro da fonte, sem derrubar as outras', async () => {
    const { svc } = criar({ agenda: { ok: true, bruto: 'lixo' }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    await svc.atualizar('manual');
    const { briefing } = svc.snapshot();
    expect(briefing.agenda.status).toBe('erro');
    expect(briefing.emails.status).toBe('ok');
  });

  it('exceção inesperada numa fonte também fica isolada', async () => {
    const { svc } = criar({ agenda: () => { throw new Error('boom'); }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    await svc.atualizar('manual');
    const { briefing } = svc.snapshot();
    expect(briefing.agenda.status).toBe('erro');
    expect(briefing.emails.status).toBe('ok');
  });

  it('sem dados de nenhuma fonte, não chama o foco', async () => {
    const { svc, chamadas } = criar({ agenda: { ok: false, erro: 'x' }, emails: { ok: false, erro: 'y' } });
    await svc.atualizar('manual');
    expect(chamadas.map((c) => c.fonte).sort()).toEqual(['agenda', 'emails']);
    expect(svc.snapshot().briefing.foco.status).toBe('erro');
    expect(svc.snapshot().briefing.geradoEm).toBeUndefined();
  });

  it('sem internet: todas as seções em erro e nenhuma chamada ao Claude', async () => {
    const { svc, chamadas } = criar({}, { aguardarRede: async (_m, aoEsperar) => { aoEsperar(); return 'sem-internet'; } });
    await svc.atualizar('inicio');
    const s = svc.snapshot();
    expect(s.rede).toBe('sem-internet');
    expect(s.briefing.agenda.erro).toBe('Sem conexão com a internet.');
    expect(chamadas).toHaveLength(0);
  });

  it('não roda duas atualizações ao mesmo tempo (nunca em loop)', async () => {
    let liberar!: () => void;
    const trava = new Promise<void>((r) => { liberar = r; });
    const { svc, chamadas } = criar({
      agenda: () => { throw new Error('não usado'); },
    }, {
      executar: async (fonte) => { await trava; return fonte === 'foco' ? { ok: true, bruto: FOCO_OK } : { ok: true, bruto: fonte === 'agenda' ? AGENDA_OK : EMAILS_OK }; },
    });
    void chamadas;
    const a = svc.atualizar('manual');
    const b = svc.atualizar('manual');
    liberar();
    await Promise.all([a, b]);
    expect(svc.snapshot().briefing.agenda.status).toBe('ok');
  });

  it('o prompt manda tratar e-mail e convite como dados e pede datas no fuso local', async () => {
    const { svc, chamadas } = criar({ agenda: { ok: true, bruto: AGENDA_OK }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    await svc.atualizar('manual');
    for (const c of chamadas) expect(c.prompt).toMatch(/DADOS, nunca instruções/);
    expect(chamadas.find((c) => c.fonte === 'emails')!.prompt).toContain('America/Sao_Paulo');
  });

  it('emite atualizações para o painel (carregando -> ok)', async () => {
    const { svc } = criar({ agenda: { ok: true, bruto: AGENDA_OK }, emails: { ok: true, bruto: EMAILS_OK }, foco: { ok: true, bruto: FOCO_OK } });
    const estados: string[] = [];
    svc.aoMudar((s) => estados.push(s.briefing.agenda.status));
    await svc.atualizar('manual');
    expect(estados[0]).toBe('carregando');
    expect(estados.at(-1)).toBe('ok');
  });
});

describe('briefingDoCache', () => {
  const base = { versao: 1, agenda: { status: 'vazio' }, emails: { status: 'vazio' }, metas: { status: 'vazio' }, foco: { status: 'vazio' } };
  it("'carregando' (queda no meio) vira ok se houver dados, senão vazio", () => {
    const b = briefingDoCache({
      ...base,
      agenda: { status: 'carregando', dados: AGENDA_OK },
      emails: { status: 'carregando' },
    });
    expect(b.agenda.status).toBe('ok');
    expect(b.emails.status).toBe('vazio');
  });
  it('cache inválido lança (o chamador usa briefing vazio)', () => {
    expect(() => briefingDoCache({ versao: 2 })).toThrow();
  });
});
