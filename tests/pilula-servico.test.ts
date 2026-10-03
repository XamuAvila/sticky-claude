import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgendaDados } from '../src/shared/briefing';
import type { ConteudoPilula } from '../src/shared/pilula';
import { PilulaService } from '../src/main/pilula/servico';

afterEach(() => { vi.useRealTimers(); });

const T0 = new Date(2026, 9, 2, 9, 0).getTime();
const ev = (titulo: string, minDepois: number, dur = 30) => ({
  titulo, inicio: new Date(T0 + minDepois * 60_000).toISOString(), fim: new Date(T0 + (minDepois + dur) * 60_000).toISOString(), diaInteiro: false,
});

function montar(agenda: () => AgendaDados | undefined, relogio: { t: number }) {
  const emitidos: Array<ConteudoPilula | null> = [];
  const s = new PilulaService({ agenda, metas: () => [], agora: () => new Date(relogio.t), aoMudar: (c) => emitidos.push(c) });
  return { s, emitidos };
}

describe('PilulaService', () => {
  it('a primeira conta sempre avisa (mesmo sem nada para mostrar) e só avisa de novo quando muda', () => {
    const rel = { t: T0 };
    const { s, emitidos } = montar(() => undefined, rel);
    s.recalcular();
    expect(emitidos).toEqual([null]);
    s.recalcular();
    expect(emitidos).toHaveLength(1); // nada mudou
  });

  it('acompanha a agenda do briefing e o relógio: "Em 45 min" vira "Em 44 min" um minuto depois', () => {
    const rel = { t: T0 };
    const { s, emitidos } = montar(() => ({ eventos: [ev('Planejamento', 45)] }), rel);
    s.recalcular();
    expect(emitidos.at(-1)?.rotulo).toBe('Em 45 min');
    rel.t += 60_000;
    s.recalcular();
    expect(emitidos.at(-1)?.rotulo).toBe('Em 44 min');
    expect(emitidos).toHaveLength(2);
  });

  it('o intervalo recalcula sozinho (a cada 30 s) e parar() encerra', () => {
    vi.useFakeTimers();
    const rel = { t: T0 };
    const { s, emitidos } = montar(() => ({ eventos: [ev('Planejamento', 45)] }), rel);
    s.iniciar(30_000);
    expect(emitidos).toHaveLength(1);
    rel.t += 120_000;
    vi.advanceTimersByTime(30_000);
    expect(emitidos.at(-1)?.rotulo).toBe('Em 43 min');
    s.parar();
    rel.t += 600_000;
    vi.advanceTimersByTime(120_000);
    expect(emitidos).toHaveLength(2);
  });

  it('conteudo() devolve o último calculado (a tela pede ao abrir)', () => {
    const rel = { t: T0 };
    const { s } = montar(() => ({ eventos: [ev('Ligação', 5)] }), rel);
    expect(s.conteudo()).toBeNull();
    s.recalcular();
    expect(s.conteudo()).toMatchObject({ modo: 'urgente', titulo: 'Ligação' });
  });
});
