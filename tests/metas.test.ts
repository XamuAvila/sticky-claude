import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIAS_PARADA_PADRAO, MetaEntradaParcialSchema, MetaEntradaSchema, MetaSchema, analisarMetas, formatarData, rotuloDias, rotuloPrazo,
  type Meta,
} from '../src/shared/metas';
import { aplicarOperacoes, descreverOperacoes, extrairPatch, validarPatch } from '../src/main/metas/patch';
import { Propostas } from '../src/main/metas/propostas';
import { MetasStore, mensagemDeErro } from '../src/main/metas/store';

const AGORA = new Date(2026, 9, 2, 12, 0); // 2 de outubro de 2026, meio-dia local
const dia = (offset: number) => new Date(2026, 9, 2 + offset).toLocaleDateString('sv-SE');
const criadaHa = (dias: number) => new Date(2026, 9, 2 - dias, 12, 0).toISOString();

function meta(p: Partial<Meta> = {}): Meta {
  return {
    id: 'm1', nome: 'Meta', status: 'ativa', porque: '', proximoPasso: '',
    criadaEm: criadaHa(1), atualizadaEm: criadaHa(1), ...p,
  };
}

describe('analisarMetas', () => {
  it('calcula dias restantes e o rótulo do prazo', () => {
    const [a, b, c, d, e] = analisarMetas([
      meta({ id: 'a', nome: 'a', prazo: dia(0) }),
      meta({ id: 'b', nome: 'b', prazo: dia(1) }),
      meta({ id: 'c', nome: 'c', prazo: dia(12) }),
      meta({ id: 'd', nome: 'd', prazo: dia(-3) }),
      meta({ id: 'e', nome: 'e' }),
    ], AGORA).sort((x, y) => x.nome.localeCompare(y.nome));
    expect([a, b, c, d, e].map((m) => m!.rotuloPrazo)).toEqual(['vence hoje', 'vence amanhã', 'faltam 12 dias', 'atrasada há 3 dias', 'sem prazo']);
    expect(d!.atrasada).toBe(true);
    expect(a!.atrasada).toBe(false);
    expect(e!.diasRestantes).toBeNull();
  });

  it('meta ativa fica parada a partir de 7 dias sem avanço (limite configurável)', () => {
    const base = { nome: 'x', ultimoAvancoEm: dia(-6) };
    expect(analisarMetas([meta(base)], AGORA)[0]!.parada).toBe(false);
    expect(analisarMetas([meta({ ...base, ultimoAvancoEm: dia(-7) })], AGORA)[0]!.parada).toBe(true);
    expect(analisarMetas([meta(base)], AGORA, 5)[0]!.parada).toBe(true);
    expect(DIAS_PARADA_PADRAO).toBe(7);
  });

  it('sem avanço registrado, conta a partir da criação', () => {
    const m = analisarMetas([meta({ criadaEm: criadaHa(10) })], AGORA)[0]!;
    expect(m.diasSemAvanco).toBe(10);
    expect(m.parada).toBe(true);
  });

  it('só meta ativa pode ser parada ou atrasada', () => {
    for (const status of ['pausada', 'concluida', 'abandonada'] as const) {
      const m = analisarMetas([meta({ status, prazo: dia(-5), criadaEm: criadaHa(30) })], AGORA)[0]!;
      expect([m.parada, m.atrasada]).toEqual([false, false]);
    }
  });

  it('ordena: ativas antes, atrasadas primeiro, depois por prazo; sem prazo por último', () => {
    const ordem = analisarMetas([
      meta({ id: '1', nome: 'concluída', status: 'concluida' }),
      meta({ id: '2', nome: 'sem prazo' }),
      meta({ id: '3', nome: 'longe', prazo: dia(30) }),
      meta({ id: '4', nome: 'perto', prazo: dia(2) }),
      meta({ id: '5', nome: 'atrasada', prazo: dia(-2) }),
      meta({ id: '6', nome: 'pausada', status: 'pausada' }),
    ], AGORA).map((m) => m.nome);
    expect(ordem).toEqual(['atrasada', 'perto', 'longe', 'sem prazo', 'pausada', 'concluída']);
  });

  it('formatadores', () => {
    expect(rotuloPrazo(-1)).toBe('atrasada há 1 dia');
    expect(formatarData('2026-10-02')).toBe('02/10/2026');
    expect(formatarData(undefined)).toBe('sem prazo');
    expect([rotuloDias(0), rotuloDias(1), rotuloDias(4)]).toEqual(['hoje', 'ontem', 'há 4 dias']);
  });
});

describe('schemas', () => {
  it('o arquivo é tolerante: textos ausentes viram vazio', () => {
    const m = MetaSchema.parse({ id: 'x', nome: 'Ler', status: 'ativa', criadaEm: 'a', atualizadaEm: 'b' });
    expect([m.porque, m.proximoPasso]).toEqual(['', '']);
  });
  it('rejeita data inexistente e status desconhecido', () => {
    expect(() => MetaEntradaSchema.parse({ nome: 'x', status: 'ativa', prazo: '2026-02-31' })).toThrow();
    expect(() => MetaEntradaSchema.parse({ nome: 'x', status: 'feita' })).toThrow();
  });
  it('a entrada é estrita: não dá para definir ultimoAvanco, id ou datas por criar/atualizar', () => {
    expect(() => MetaEntradaSchema.parse({ nome: 'x', status: 'ativa', ultimoAvancoEm: dia(0) })).toThrow();
    expect(() => MetaEntradaParcialSchema.parse({ id: 'outro' })).toThrow();
    expect(() => MetaEntradaParcialSchema.parse({})).toThrow(); // sem campos
  });
  it('prazo null só existe na alteração parcial (remove o prazo)', () => {
    expect(MetaEntradaParcialSchema.parse({ prazo: null })).toEqual({ prazo: null });
    expect(() => MetaEntradaSchema.parse({ nome: 'x', status: 'ativa', prazo: null })).toThrow();
  });
});

describe('extrairPatch / validarPatch', () => {
  const cerca = (o: unknown) => 'Claro!\n```metas-patch\n' + JSON.stringify(o) + '\n```\nPronto.';
  const metas = [meta({ id: 'm1', nome: 'Inglês' })];

  it('acha o bloco, ignora conversa em volta e JSON quebrado', () => {
    expect(extrairPatch(cerca({ a: 1 }))).toEqual({ a: 1 });
    expect(extrairPatch('sem bloco')).toBeUndefined();
    expect(extrairPatch('```metas-patch\n{quebrado\n```')).toBeUndefined();
    expect(extrairPatch('```json\n{"a":1}\n```')).toBeUndefined(); // só o bloco metas-patch conta
  });

  it('aceita criar, atualizar e avanço válidos', () => {
    const r = validarPatch({
      operacoes: [
        { op: 'criar', meta: { nome: 'Correr', status: 'ativa', prazo: dia(30) } },
        { op: 'atualizar', id: 'm1', campos: { proximoPasso: 'Fazer 1 lição' } },
        { op: 'avanco', id: 'm1', nota: 'Estudei 20 min' },
      ],
    }, metas);
    expect(r.ok).toBe(true);
  });

  it('recusa meta que não existe, campo desconhecido, operação desconhecida e excesso de operações', () => {
    expect(validarPatch({ operacoes: [{ op: 'atualizar', id: 'nao-existe', campos: { nome: 'x' } }] }, metas).ok).toBe(false);
    expect(validarPatch({ operacoes: [{ op: 'atualizar', id: 'm1', campos: { ultimoAvancoEm: dia(0) } }] }, metas).ok).toBe(false);
    expect(validarPatch({ operacoes: [{ op: 'excluir', id: 'm1' }] }, metas).ok).toBe(false); // excluir só pela tela
    expect(validarPatch({ operacoes: Array.from({ length: 11 }, () => ({ op: 'avanco', id: 'm1' })) }, metas).ok).toBe(false);
    expect(validarPatch({ operacoes: [] }, metas).ok).toBe(false);
    expect(validarPatch({ operacoes: [{ op: 'avanco', id: 'm1' }], extra: 1 }, metas).ok).toBe(false);
    expect(validarPatch(undefined, metas)).toEqual({ ok: false, erro: 'Não encontrei um bloco metas-patch válido na resposta.' });
  });

  it('limpa os textos (controles, espaços)', () => {
    const r = validarPatch({ operacoes: [{ op: 'criar', meta: { nome: '  Ler\u0000   mais ', status: 'ativa', proximoPasso: 'a\n\nb' } }] }, metas);
    expect(r.ok && r.operacoes[0]).toMatchObject({ meta: { nome: 'Ler mais', proximoPasso: 'a b' } });
  });
});

describe('aplicarOperacoes / descreverOperacoes', () => {
  const metas = [meta({ id: 'm1', nome: 'Inglês', prazo: dia(10), proximoPasso: 'Revisar' })];
  const ctx = { agora: AGORA, novoId: () => 'novo-id' };

  it('cria, atualiza, remove prazo e registra avanço, sem mexer na lista original', () => {
    const copia = JSON.stringify(metas);
    const nova = aplicarOperacoes(metas, [
      { op: 'criar', meta: { nome: 'Correr', status: 'ativa', proximoPasso: 'Caminhar 15 min' } },
      { op: 'atualizar', id: 'm1', campos: { prazo: null, status: 'pausada' } },
      { op: 'avanco', id: 'm1', nota: 'ok' },
    ], ctx);
    expect(JSON.stringify(metas)).toBe(copia);
    expect(nova).toHaveLength(2);
    const m1 = nova.find((m) => m.id === 'm1')!;
    expect(m1.prazo).toBeUndefined();
    expect(m1.status).toBe('pausada');
    expect(m1.ultimoAvancoEm).toBe(dia(0));
    expect(m1.ultimoAvancoNota).toBe('ok');
    expect(nova.find((m) => m.id === 'novo-id')).toMatchObject({ nome: 'Correr', proximoPasso: 'Caminhar 15 min', porque: '' });
  });

  it('avanço sem nota apaga a nota anterior', () => {
    const base = [meta({ id: 'm1', ultimoAvancoNota: 'velha', ultimoAvancoEm: dia(-3) })];
    const nova = aplicarOperacoes(base, [{ op: 'avanco', id: 'm1' }], ctx);
    expect(nova[0]!.ultimoAvancoNota).toBeUndefined();
    expect(nova[0]!.ultimoAvancoEm).toBe(dia(0));
  });

  it('descreve cada mudança em português e ignora o que não muda', () => {
    const linhas = descreverOperacoes(metas, [
      { op: 'criar', meta: { nome: 'Correr', status: 'ativa', prazo: '2026-11-30' } },
      { op: 'atualizar', id: 'm1', campos: { prazo: '2026-12-15', proximoPasso: 'Revisar', status: 'pausada' } },
      { op: 'atualizar', id: 'm1', campos: { prazo: null } },
      { op: 'avanco', id: 'm1', nota: 'Estudei' },
    ]);
    expect(linhas[0]).toBe('Criar a meta “Correr” (ativa, prazo 30/11/2026)');
    expect(linhas[1]).toBe(`Meta “Inglês”: status ativa → pausada`);
    expect(linhas[2]).toBe(`Meta “Inglês”: prazo ${formatarData(dia(10))} → 15/12/2026`);
    expect(linhas.some((l) => l.includes('próximo passo'))).toBe(false); // "Revisar" já era o valor
    expect(linhas).toContain(`Meta “Inglês”: prazo ${formatarData(dia(10))} → sem prazo`);
    expect(linhas.at(-1)).toBe('Meta “Inglês”: registrar avanço de hoje — “Estudei”');
  });
});

// ---- Armazenamento e propostas (arquivo de verdade em pasta temporária) ----

const pastas: string[] = [];
function criarStore() {
  const dir = mkdtempSync(join(tmpdir(), 'sticky-metas-'));
  pastas.push(dir);
  let n = 0;
  let relogio = AGORA.getTime();
  const log = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };
  const opcoes = {
    arquivo: join(dir, 'metas.json'), backupsDir: join(dir, 'backups'),
    agora: () => new Date((relogio += 1000)), novoId: () => `id-${++n}`, log,
  };
  return { dir, log, opcoes, store: new MetasStore(opcoes) };
}
afterEach(() => { while (pastas.length) rmSync(pastas.pop()!, { recursive: true, force: true }); });

describe('MetasStore', () => {
  it('cria, atualiza, registra avanço e persiste no disco', () => {
    const { store, opcoes } = criarStore();
    const m = store.criar({ nome: 'Ler 12 livros', status: 'ativa', prazo: '2026-12-31', porque: 'Crescer', proximoPasso: 'Ler 10 páginas' });
    store.atualizar(m.id, { proximoPasso: 'Ler 5 páginas' });
    store.registrarAvanco(m.id, 'Li 30 páginas');

    const noDisco = JSON.parse(readFileSync(opcoes.arquivo, 'utf8'));
    expect(noDisco.versao).toBe(1);
    expect(noDisco.metas[0]).toMatchObject({ nome: 'Ler 12 livros', proximoPasso: 'Ler 5 páginas', ultimoAvancoNota: 'Li 30 páginas' });

    // um store novo lê o mesmo arquivo
    expect(new MetasStore(opcoes).snapshot().metas[0]!.nome).toBe('Ler 12 livros');
  });

  it('valida a entrada e devolve mensagens em português', () => {
    const { store } = criarStore();
    expect(() => store.criar({ nome: '   ', status: 'ativa' })).toThrow(ZodError);
    try { store.criar({ nome: '', status: 'ativa' }); } catch (e) { expect(mensagemDeErro(e)).toBe('Nome: dê um nome à meta'); }
    try { store.criar({ nome: 'x', status: 'ativa', prazo: 'amanhã' }); } catch (e) { expect(mensagemDeErro(e)).toBe('Prazo: use o formato AAAA-MM-DD'); }
    expect(() => store.atualizar('nao-existe', { nome: 'x' })).toThrow('Essa meta não existe mais.');
  });

  it('excluir faz backup antes', () => {
    const { store, opcoes } = criarStore();
    const m = store.criar({ nome: 'A', status: 'ativa' });
    store.excluir(m.id);
    expect(store.snapshot().metas).toHaveLength(0);
    const bks = readdirSync(opcoes.backupsDir);
    expect(bks).toHaveLength(1);
    expect(bks[0]).toContain('antes-de-excluir');
    expect(JSON.parse(readFileSync(join(opcoes.backupsDir, bks[0]!), 'utf8')).metas).toHaveLength(1);
  });

  it('mantém só os 10 backups mais recentes', () => {
    const { store, opcoes } = criarStore();
    for (let i = 0; i < 13; i++) {
      const m = store.criar({ nome: `m${i}`, status: 'ativa' });
      store.excluir(m.id);
    }
    expect(readdirSync(opcoes.backupsDir)).toHaveLength(10);
  });

  it('arquivo corrompido: guarda uma cópia, avisa e recomeça vazio (nunca perde o original)', () => {
    const { dir, opcoes, log } = criarStore();
    writeFileSync(opcoes.arquivo, '{"versao":1,"metas":[{"id":');
    const s = new MetasStore(opcoes);
    expect(s.snapshot().metas).toEqual([]);
    expect(s.snapshot().aviso).toMatch(/ilegível.*corrompido/);
    expect(readdirSync(dir).some((f) => f.startsWith('metas.json.corrompido-'))).toBe(true);
    expect(existsSync(opcoes.arquivo)).toBe(false);
    expect(log.erro).toHaveBeenCalled();
    // ao criar a primeira meta o aviso some
    s.criar({ nome: 'Nova', status: 'ativa' });
    expect(s.snapshot().aviso).toBeUndefined();
  });

  it('aceita arquivo com BOM e campos faltando (edição manual)', () => {
    const { opcoes } = criarStore();
    writeFileSync(opcoes.arquivo, '﻿' + JSON.stringify({ versao: 1, metas: [{ id: 'a', nome: 'X', status: 'ativa', criadaEm: 'c', atualizadaEm: 'd' }] }));
    const m = new MetasStore(opcoes).snapshot().metas[0]!;
    expect([m.nome, m.porque, m.proximoPasso]).toEqual(['X', '', '']);
  });

  it('recarregar só avisa a tela quando algo mudou de verdade', () => {
    const { store, opcoes } = criarStore();
    store.criar({ nome: 'A', status: 'ativa' });
    const cb = vi.fn();
    store.aoMudar(cb);
    store.recarregar();
    expect(cb).not.toHaveBeenCalled();
    const atual = JSON.parse(readFileSync(opcoes.arquivo, 'utf8'));
    atual.metas[0].nome = 'Editada à mão';
    writeFileSync(opcoes.arquivo, JSON.stringify(atual));
    store.recarregar();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(store.snapshot().metas[0]!.nome).toBe('Editada à mão');
  });
});

describe('Propostas', () => {
  const texto = (o: unknown) => 'Sugiro:\n```metas-patch\n' + JSON.stringify(o) + '\n```';

  function montar() {
    const c = criarStore();
    const m = c.store.criar({ nome: 'Inglês', status: 'ativa', prazo: dia(20), proximoPasso: 'Revisar' });
    let n = 0;
    const propostas = new Propostas(c.store, () => `p-${++n}`, () => AGORA);
    return { ...c, m, propostas };
  }

  it('resposta sem bloco metas-patch não é proposta (conversa normal)', () => {
    const { propostas } = montar();
    expect(propostas.propor('Bom dia! Tudo certo com suas metas.', 'Metas')).toEqual({ ok: 'nenhuma' });
    expect(propostas.listar()).toHaveLength(0);
  });

  it('proposta válida fica pendente e NÃO altera nada até o Aplicar', () => {
    const { propostas, store, m } = montar();
    const r = propostas.propor(texto({ operacoes: [{ op: 'atualizar', id: m.id, campos: { proximoPasso: 'Fazer 1 lição' } }] }), 'Metas');
    expect(r.ok).toBe(true);
    expect(propostas.listar()[0]!.descricoes[0]).toContain('próximo passo');
    expect(store.snapshot().metas[0]!.proximoPasso).toBe('Revisar'); // intacto
  });

  it('aplicar altera as metas, faz backup e tira a proposta da fila', () => {
    const { propostas, store, m, opcoes } = montar();
    propostas.propor(texto({ operacoes: [{ op: 'atualizar', id: m.id, campos: { status: 'pausada' } }] }), 'Metas');
    expect(propostas.aplicar('p-1')).toEqual({ ok: true });
    expect(store.snapshot().metas[0]!.status).toBe('pausada');
    expect(propostas.listar()).toHaveLength(0);
    expect(readdirSync(opcoes.backupsDir).some((f) => f.includes('antes-da-proposta'))).toBe(true);
  });

  it('descartar não altera nada', () => {
    const { propostas, store, m } = montar();
    propostas.propor(texto({ operacoes: [{ op: 'atualizar', id: m.id, campos: { status: 'abandonada' } }] }), 'Metas');
    propostas.descartar('p-1');
    expect(propostas.listar()).toHaveLength(0);
    expect(store.snapshot().metas[0]!.status).toBe('ativa');
  });

  it('se a meta foi excluída enquanto a proposta esperava, o Aplicar falha sem alterar nada', () => {
    const { propostas, store, m } = montar();
    propostas.propor(texto({ operacoes: [{ op: 'avanco', id: m.id }, { op: 'criar', meta: { nome: 'Outra', status: 'ativa' } }] }), 'Metas');
    store.excluir(m.id);
    const r = propostas.aplicar('p-1');
    expect(r.ok).toBe(false);
    expect(store.snapshot().metas).toHaveLength(0); // nem a meta "Outra" foi criada: tudo ou nada
  });

  it('proposta inválida, vazia ou sem efeito vira erro legível', () => {
    const { propostas, m } = montar();
    expect(propostas.propor('```metas-patch\n{quebrado\n```', 'Metas')).toMatchObject({ ok: false });
    expect(propostas.propor(texto({ operacoes: [{ op: 'atualizar', id: 'x', campos: { nome: 'a' } }] }), 'Metas')).toMatchObject({ ok: false });
    expect(propostas.propor(texto({ operacoes: [{ op: 'atualizar', id: m.id, campos: { proximoPasso: 'Revisar' } }] }), 'Metas'))
      .toEqual({ ok: false, erro: 'A proposta não muda nada nas metas.' });
  });

  it('guarda no máximo 5 propostas pendentes (as mais antigas saem)', () => {
    const { propostas, m } = montar();
    for (let i = 0; i < 7; i++) propostas.propor(texto({ operacoes: [{ op: 'avanco', id: m.id, nota: `n${i}` }] }), 'Metas');
    expect(propostas.listar()).toHaveLength(5);
    expect(propostas.listar()[0]!.id).toBe('p-3');
  });

  it('avisa quem está ouvindo (a tela) quando a fila muda', () => {
    const { propostas, m } = montar();
    const cb = vi.fn();
    propostas.aoMudar(cb);
    propostas.propor(texto({ operacoes: [{ op: 'avanco', id: m.id }] }), 'Metas');
    propostas.descartar('p-1');
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
