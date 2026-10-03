import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EstadoSchema, atualizarGeometria, criar, definirAcessoGoogle, definirInstrucoes, definirOculto, definirTopo, estadoVazio, excluir,
  limparInstrucoes, limparNome, marcarIniciada, novaSessao, renomear, trocarCor, type Contexto, type EstadoPostits,
} from '../src/main/postits/estado';
import { CORES, LIMITE_INSTRUCOES, LIMITE_NOME, type Postit } from '../src/shared/postits';

const AGORA = new Date(2026, 9, 2, 12, 0);
const ctx = (): Contexto => ({ agora: () => AGORA, novoId: () => randomUUID() });
const B = { x: 100, y: 100, width: 320, height: 380 };

function comUm(nome?: string): { estado: EstadoPostits; p: Postit } {
  const r = criar(estadoVazio(), { ...(nome ? { nome } : {}), bounds: B }, ctx());
  if (!r.ok) throw new Error(r.erro);
  return { estado: r.estado, p: r.postit };
}

describe('criar', () => {
  it('nasce com sessão própria, ainda não iniciada, e nome/cor padrão', () => {
    const { p } = comUm();
    expect(p.nome).toBe('Post-it 1');
    expect(p.cor).toBe(CORES[0]);
    expect(p.iniciada).toBe(false);
    expect(p.sessionId).not.toBe(p.id);
    expect(p).toMatchObject({ sempreNoTopo: false, oculto: false, acessoGoogle: false, instrucoes: '' });
  });

  it('cada post-it tem sessão diferente; as cores se revezam e o nome padrão pula os usados', () => {
    let e = estadoVazio();
    const nomes: string[] = [];
    const sessoes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = criar(e, { bounds: B }, ctx());
      if (!r.ok) throw new Error(r.erro);
      e = r.estado;
      nomes.push(r.postit.nome);
      sessoes.add(r.postit.sessionId);
    }
    expect(nomes).toEqual(['Post-it 1', 'Post-it 2', 'Post-it 3', 'Post-it 4']);
    expect(sessoes.size).toBe(4);
    expect(new Set(e.postits.map((p) => p.cor)).size).toBe(4);

    const semUm = excluir(e, e.postits[0]!.id);
    if (!semUm.ok) throw new Error();
    // sobraram "Post-it 2/3/4": o próximo tem 3 existentes (n começa em 4), mas "Post-it 4" já está em uso, então vai para 5
    const r = criar(semUm.estado, { bounds: B }, ctx());
    expect(r.ok && r.postit.nome).toBe('Post-it 5');
  });

  it('limpa o nome e recusa nome vazio', () => {
    expect(comUm('  Projeto\u0000  X \n').p.nome).toBe('Projeto X');
    expect(comUm('x'.repeat(100)).p.nome).toHaveLength(LIMITE_NOME);
    expect(criar(estadoVazio(), { nome: '   ', bounds: B }, ctx())).toEqual({ ok: false, erro: 'Dê um nome ao post-it.' });
  });

  it('aceita instruções, cor e acesso ao Google já na criação', () => {
    const r = criar(estadoVazio(), { nome: 'Metas', cor: 'azul', instrucoes: 'Seja breve', acessoGoogle: true, bounds: B }, ctx());
    expect(r.ok && r.postit).toMatchObject({ cor: 'azul', instrucoes: 'Seja breve', acessoGoogle: true });
  });
});

describe('alterações', () => {
  it('renomear', () => {
    const { estado, p } = comUm();
    const r = renomear(estado, p.id, '  Projeto X ', ctx());
    expect(r.ok && r.estado.postits[0]!.nome).toBe('Projeto X');
    expect(renomear(estado, p.id, '   ', ctx())).toEqual({ ok: false, erro: 'Dê um nome ao post-it.' });
    expect(renomear(estado, 'nao-existe', 'x', ctx())).toEqual({ ok: false, erro: 'Esse post-it não existe mais.' });
  });

  it('trocar cor só aceita as cores da paleta', () => {
    const { estado, p } = comUm();
    const r = trocarCor(estado, p.id, 'rosa', ctx());
    expect(r.ok && r.estado.postits[0]!.cor).toBe('rosa');
    expect(trocarCor(estado, p.id, 'preto', ctx()).ok).toBe(false);
  });

  it('instruções mantêm as quebras de linha, perdem controles e respeitam o limite', () => {
    const { estado, p } = comUm();
    const r = definirInstrucoes(estado, p.id, 'Linha 1\r\nLinha 2\u0000\u0007\n\nLinha 3  ', ctx());
    expect(r.ok && r.estado.postits[0]!.instrucoes).toBe('Linha 1\nLinha 2\n\nLinha 3');
    const longa = definirInstrucoes(estado, p.id, 'a'.repeat(LIMITE_INSTRUCOES + 10), ctx());
    expect(longa.ok && longa.estado.postits[0]!.instrucoes).toHaveLength(LIMITE_INSTRUCOES);
    expect(definirInstrucoes(estado, p.id, 'a'.repeat(LIMITE_INSTRUCOES * 2 + 1), ctx()).ok).toBe(false);
    expect(limparInstrucoes('a\tb')).toBe('a\tb'); // tab é permitido
    expect(limparNome('a\tb')).toBe('a b');
  });

  it('sempre no topo, acesso ao Google e oculto', () => {
    const { estado, p } = comUm();
    const a = definirTopo(estado, p.id, true, ctx());
    const b = a.ok ? definirAcessoGoogle(a.estado, p.id, true, ctx()) : a;
    const c = b.ok ? definirOculto(b.estado, p.id, true, ctx()) : b;
    expect(c.ok && c.estado.postits[0]).toMatchObject({ sempreNoTopo: true, acessoGoogle: true, oculto: true });
  });

  it('geometria: guarda posição, tamanho e tela; ignora tamanho abaixo do mínimo', () => {
    const { estado, p } = comUm();
    const tela = { id: 2, bounds: { x: 1707, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    const r = atualizarGeometria(estado, p.id, { x: 1800, y: 40, width: 400, height: 500 }, tela, ctx());
    expect(r.ok && r.estado.postits[0]).toMatchObject({ bounds: { x: 1800, y: 40, width: 400, height: 500 }, tela });
    const pequeno = atualizarGeometria(estado, p.id, { x: 0, y: 0, width: 10, height: 10 }, tela, ctx());
    expect(pequeno.ok && pequeno.estado.postits[0]!.bounds).toEqual(B);
  });

  it('o X só oculta: a sessão e a conversa não mudam ao ocultar e mostrar', () => {
    const { estado, p } = comUm();
    const a = definirOculto(estado, p.id, true, ctx());
    const b = a.ok ? definirOculto(a.estado, p.id, false, ctx()) : a;
    expect(b.ok && b.estado.postits[0]).toMatchObject({ sessionId: p.sessionId, iniciada: false, nome: p.nome });
  });
});

describe('sessão do Claude', () => {
  it('marcarIniciada: a partir daí a conversa é retomada, com o mesmo session id', () => {
    const { estado, p } = comUm();
    const r = marcarIniciada(estado, p.id, ctx());
    expect(r.ok && r.estado.postits[0]).toMatchObject({ iniciada: true, sessionId: p.sessionId });
  });

  it('novaSessao (histórico do Claude perdido): troca o session id e volta a "não iniciada"', () => {
    const { estado, p } = comUm();
    const a = marcarIniciada(estado, p.id, ctx());
    const novo = randomUUID();
    const b = a.ok ? novaSessao(a.estado, p.id, novo, ctx()) : a;
    expect(b.ok && b.estado.postits[0]).toMatchObject({ iniciada: false, sessionId: novo });
  });
});

describe('excluir e imutabilidade', () => {
  it('excluir remove só o post-it indicado e recusa id inexistente', () => {
    let e = estadoVazio();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = criar(e, { bounds: B }, ctx());
      if (!r.ok) throw new Error();
      e = r.estado;
      ids.push(r.postit.id);
    }
    const r = excluir(e, ids[1]!);
    expect(r.ok && r.estado.postits.map((p) => p.id)).toEqual([ids[0], ids[2]]);
    expect(excluir(e, 'x')).toEqual({ ok: false, erro: 'Esse post-it não existe mais.' });
  });

  it('nenhuma transição altera o estado anterior', () => {
    const { estado, p } = comUm();
    const antes = JSON.stringify(estado);
    renomear(estado, p.id, 'Outro', ctx());
    definirOculto(estado, p.id, true, ctx());
    marcarIniciada(estado, p.id, ctx());
    excluir(estado, p.id);
    expect(JSON.stringify(estado)).toBe(antes);
  });
});

describe('arquivo (EstadoSchema)', () => {
  const base = { id: 'a', sessionId: randomUUID(), nome: 'X', bounds: B, criadoEm: 'c', atualizadoEm: 'd' };
  it('tolera edição manual: campos opcionais ausentes ganham padrão', () => {
    const e = EstadoSchema.parse({ versao: 1, postits: [base] });
    expect(e.postits[0]).toMatchObject({ iniciada: false, cor: 'amarelo', instrucoes: '', acessoGoogle: false, sempreNoTopo: false, oculto: false });
  });
  it('recusa session id que não é UUID (o CLI exige UUID)', () => {
    expect(() => EstadoSchema.parse({ versao: 1, postits: [{ ...base, sessionId: 'abc' }] })).toThrow();
  });
  it('recusa cor desconhecida e nome vazio', () => {
    expect(() => EstadoSchema.parse({ versao: 1, postits: [{ ...base, cor: 'preto' }] })).toThrow();
    expect(() => EstadoSchema.parse({ versao: 1, postits: [{ ...base, nome: '' }] })).toThrow();
  });
});
