import { describe, expect, it } from 'vitest';
import { ajustarNaArea, posicaoInicial, restaurarBounds, telaDoRetangulo, telaSalvaDe, type Tela } from '../src/main/postits/geometria';

// Esta máquina: 1 monitor de 1707x1067 lógicos (escala 150%). Os outros simulam um setup de 3 telas com DPIs diferentes.
const principal: Tela = { id: 1, primaria: true, scaleFactor: 1.5, bounds: { x: 0, y: 0, width: 1707, height: 1067 }, workArea: { x: 0, y: 0, width: 1707, height: 1027 } };
const direita: Tela = { id: 2, scaleFactor: 1, bounds: { x: 1707, y: 0, width: 1920, height: 1080 }, workArea: { x: 1707, y: 0, width: 1920, height: 1040 } };
const esquerda: Tela = { id: 3, scaleFactor: 1.25, bounds: { x: -1280, y: -100, width: 1280, height: 1024 }, workArea: { x: -1280, y: -100, width: 1280, height: 984 } };
const TRES = [principal, direita, esquerda];
const POSTIT = { width: 320, height: 380 };

describe('telaDoRetangulo', () => {
  it('escolhe a tela que mais contém o retângulo', () => {
    expect(telaDoRetangulo({ x: 100, y: 100, ...POSTIT }, TRES).id).toBe(1);
    expect(telaDoRetangulo({ x: 1800, y: 50, ...POSTIT }, TRES).id).toBe(2);
    expect(telaDoRetangulo({ x: -900, y: 0, ...POSTIT }, TRES).id).toBe(3); // coordenadas negativas
    // a cavalo entre duas telas: vence a que tem mais área
    expect(telaDoRetangulo({ x: 1600, y: 100, ...POSTIT }, TRES).id).toBe(2);
  });
  it('fora de todas as telas: a mais próxima do centro', () => {
    expect(telaDoRetangulo({ x: 5000, y: 100, ...POSTIT }, TRES).id).toBe(2);
    expect(telaDoRetangulo({ x: -5000, y: 100, ...POSTIT }, TRES).id).toBe(3);
  });
});

describe('ajustarNaArea', () => {
  const wa = principal.workArea;
  it('não mexe no que já cabe', () => {
    expect(ajustarNaArea({ x: 100, y: 100, ...POSTIT }, wa)).toEqual({ x: 100, y: 100, ...POSTIT });
  });
  it('puxa para dentro o que saiu pela direita ou por baixo (barra de tarefas)', () => {
    expect(ajustarNaArea({ x: 1600, y: 900, ...POSTIT }, wa)).toEqual({ x: 1707 - 320, y: 1027 - 380, ...POSTIT });
  });
  it('puxa para dentro o que saiu pela esquerda ou por cima', () => {
    expect(ajustarNaArea({ x: -200, y: -50, ...POSTIT }, wa)).toEqual({ x: 0, y: 0, ...POSTIT });
  });
  it('encolhe se a janela for maior que a área útil, sem passar do mínimo', () => {
    expect(ajustarNaArea({ x: 0, y: 0, width: 5000, height: 5000 }, wa)).toEqual({ x: 0, y: 0, width: 1707, height: 1027 });
    const minuscula = { x: 0, y: 0, width: 400, height: 300 };
    expect(ajustarNaArea({ x: 0, y: 0, width: 100, height: 100 }, minuscula)).toEqual({ x: 0, y: 0, width: 240, height: 220 });
  });
});

describe('restaurarBounds (reabrir no mesmo lugar)', () => {
  it('mesma tela, mesma posição e tamanho', () => {
    const salvo = { bounds: { x: 1800, y: 60, width: 400, height: 500 }, tela: telaSalvaDe(direita) };
    expect(restaurarBounds(salvo, TRES)).toEqual({ bounds: salvo.bounds, origem: 'mesma-tela' });
  });

  it('funciona em monitor com coordenadas negativas (à esquerda do principal)', () => {
    const salvo = { bounds: { x: -1000, y: -50, ...POSTIT }, tela: telaSalvaDe(esquerda) };
    expect(restaurarBounds(salvo, TRES)).toEqual({ bounds: salvo.bounds, origem: 'mesma-tela' });
  });

  it('monitor reposicionado nas configurações do Windows: mantém a posição RELATIVA à tela', () => {
    const salvo = { bounds: { x: 1800, y: 60, width: 400, height: 500 }, tela: telaSalvaDe(direita) };
    const movida: Tela = { ...direita, bounds: { ...direita.bounds, x: 2000 }, workArea: { ...direita.workArea, x: 2000 } };
    const r = restaurarBounds(salvo, [principal, movida, esquerda]);
    expect(r.origem).toBe('mesma-tela');
    expect(r.bounds).toEqual({ x: 2093, y: 60, width: 400, height: 500 }); // 1800-1707 = 93 de distância da borda esquerda
  });

  it('o Windows trocou a id da tela ao reiniciar: acha por tamanho e escala', () => {
    const salvo = { bounds: { x: 1800, y: 60, width: 400, height: 500 }, tela: telaSalvaDe(direita) };
    const renumeradas = TRES.map((t) => ({ ...t, id: t.id + 100 }));
    const r = restaurarBounds(salvo, renumeradas);
    expect(r).toEqual({ bounds: salvo.bounds, origem: 'mesma-assinatura' });
  });

  it('monitor desconectado: vai para a tela principal e cabe na área útil', () => {
    const salvo = { bounds: { x: 1800, y: 900, width: 400, height: 500 }, tela: telaSalvaDe(direita) };
    const r = restaurarBounds(salvo, [principal]);
    expect(r.origem).toBe('primaria');
    expect(r.bounds.x).toBeGreaterThanOrEqual(0);
    expect(r.bounds.x + r.bounds.width).toBeLessThanOrEqual(1707);
    expect(r.bounds.y + r.bounds.height).toBeLessThanOrEqual(1027);
  });

  it('escala diferente e tamanho diferente: não confunde com a tela antiga', () => {
    const salvo = { bounds: { x: 1800, y: 60, width: 400, height: 500 }, tela: { id: 9, bounds: direita.bounds, scaleFactor: 2 } };
    expect(restaurarBounds(salvo, TRES).origem).toBe('primaria');
  });

  it('resolução da tela diminuiu: a janela é puxada para dentro', () => {
    const salvo = { bounds: { x: 1500, y: 700, width: 400, height: 500 }, tela: telaSalvaDe(principal) };
    const menor: Tela = { ...principal, bounds: { x: 0, y: 0, width: 1280, height: 720 }, workArea: { x: 0, y: 0, width: 1280, height: 680 } };
    const r = restaurarBounds(salvo, [menor]);
    expect(r.bounds).toEqual({ x: 1280 - 400, y: 680 - 500, width: 400, height: 500 });
  });

  it('sem tela registrada: usa a tela que contém o retângulo', () => {
    const r = restaurarBounds({ bounds: { x: 1800, y: 60, width: 400, height: 500 } }, TRES);
    expect(r.bounds).toEqual({ x: 1800, y: 60, width: 400, height: 500 });
  });

  it('nenhuma tela informada: devolve o salvo sem mexer', () => {
    const b = { x: 10, y: 10, ...POSTIT };
    expect(restaurarBounds({ bounds: b }, [])).toEqual({ bounds: b, origem: 'sem-telas' });
  });

  it('a janela fica DENTRO da área útil em todos os casos (nunca embaixo da barra de tarefas)', () => {
    const casos = [
      { bounds: { x: -3000, y: -3000, ...POSTIT } },
      { bounds: { x: 9000, y: 9000, ...POSTIT } },
      { bounds: { x: 1700, y: 1000, ...POSTIT }, tela: telaSalvaDe(principal) },
    ];
    for (const c of casos) {
      const { bounds: b } = restaurarBounds(c, TRES);
      const t = telaDoRetangulo(b, TRES).workArea;
      expect(b.x).toBeGreaterThanOrEqual(t.x);
      expect(b.y).toBeGreaterThanOrEqual(t.y);
      expect(b.x + b.width).toBeLessThanOrEqual(t.x + t.width);
      expect(b.y + b.height).toBeLessThanOrEqual(t.y + t.height);
    }
  });
});

describe('posicaoInicial (post-it novo)', () => {
  it('começa no canto superior direito da área útil', () => {
    expect(posicaoInicial(POSTIT, [], principal)).toEqual({ x: 1707 - 320 - 24, y: 24, ...POSTIT });
  });
  it('faz cascata para não empilhar sobre os que já existem', () => {
    const a = posicaoInicial(POSTIT, [], principal);
    const b = posicaoInicial(POSTIT, [a], principal);
    const c = posicaoInicial(POSTIT, [a, b], principal);
    expect(b).not.toEqual(a);
    expect(c).not.toEqual(b);
    expect(b.x).toBeLessThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
  it('nunca sai da área útil, mesmo com muitos post-its', () => {
    const ocupados: Array<ReturnType<typeof posicaoInicial>> = [];
    for (let i = 0; i < 30; i++) {
      const p = posicaoInicial(POSTIT, ocupados, principal);
      ocupados.push(p);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y + p.height).toBeLessThanOrEqual(1027);
    }
  });
  it('funciona em tela secundária com coordenadas negativas', () => {
    const p = posicaoInicial(POSTIT, [], esquerda);
    expect(telaDoRetangulo(p, TRES).id).toBe(3);
  });
});
