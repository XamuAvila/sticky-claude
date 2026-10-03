import { describe, expect, it } from 'vitest';
import type { AgendaDados } from '../src/shared/briefing';
import type { Meta } from '../src/shared/metas';
import { metaDoDia, montarPilula } from '../src/shared/pilula';

const AGORA = new Date(2026, 9, 2, 9, 0); // 09:00
const em = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString();
const ev = (titulo: string, ini: number, dur = 30, extra: object = {}) => ({ titulo, inicio: em(ini), fim: em(ini + dur), diaInteiro: false, ...extra });
const agenda = (...eventos: ReturnType<typeof ev>[]): AgendaDados => ({ eventos });
const dia = (n: number) => new Date(2026, 9, 2 + n).toLocaleDateString('sv-SE');
const meta = (p: Partial<Meta>): Meta => ({ id: 'm', nome: 'Meta', status: 'ativa', porque: '', proximoPasso: '', criadaEm: new Date(2026, 9, 1, 12).toISOString(), atualizadaEm: '', ...p });

describe('montarPilula: o que aparece', () => {
  it('evento em até 10 min é urgente e vence tudo, até um evento em andamento', () => {
    const c = montarPilula(agenda(ev('Reunião em curso', -20, 60), ev('Ligação', 8)), [], AGORA)!;
    expect(c).toMatchObject({ modo: 'urgente', rotulo: 'Em 8 min', titulo: 'Ligação', detalhe: 'às 09:08', urgente: true });
  });

  it('evento em andamento aparece com a hora de término', () => {
    const c = montarPilula(agenda(ev('Deep Work', -30, 90), ev('Almoço', 180)), [], AGORA)!;
    expect(c).toMatchObject({ modo: 'agora', rotulo: 'Agora', titulo: 'Deep Work', detalhe: 'até 10:00', urgente: false });
  });

  it('próximo evento em até 2 h mostra "Em X min" / "Em X h Y min"', () => {
    expect(montarPilula(agenda(ev('Planejamento', 45)), [], AGORA)).toMatchObject({ modo: 'em-breve', rotulo: 'Em 45 min', titulo: 'Planejamento' });
    expect(montarPilula(agenda(ev('Planejamento', 90)), [], AGORA)).toMatchObject({ rotulo: 'Em 1 h 30 min' });
  });

  it('evento só daqui a mais de 2 h: a meta do dia vem primeiro; sem meta, mostra o evento de hoje', () => {
    const longe = agenda(ev('Jantar', 300));
    expect(montarPilula(longe, [meta({ nome: 'Correr 5 km', proximoPasso: 'Caminhar 15 min' })], AGORA)).toMatchObject({ modo: 'meta', rotulo: 'Meta do dia', titulo: 'Correr 5 km', detalhe: 'Caminhar 15 min' });
    expect(montarPilula(longe, [], AGORA)).toMatchObject({ modo: 'depois', rotulo: 'Hoje', titulo: 'Jantar', detalhe: 'às 14:00' });
  });

  it('sem agenda e com metas: mostra a meta; sem nada: null (a pílula some)', () => {
    expect(montarPilula(undefined, [meta({ nome: 'Ler' })], AGORA)?.modo).toBe('meta');
    expect(montarPilula(undefined, [], AGORA)).toBeNull();
    expect(montarPilula(agenda(), [], AGORA)).toBeNull();
  });

  it('ignora o que já acabou, eventos de dia inteiro e outros dias', () => {
    const a: AgendaDados = {
      eventos: [
        ev('Já passou', -120, 30),
        { titulo: 'Feriado', inicio: dia(0), diaInteiro: true },
        { titulo: 'Amanhã cedo', inicio: new Date(2026, 9, 3, 8, 0).toISOString(), fim: new Date(2026, 9, 3, 9, 0).toISOString(), diaInteiro: false },
      ],
    };
    expect(montarPilula(a, [], AGORA)).toBeNull();
  });

  it('evento que atravessa a meia-noite continua aparecendo como "Agora" (começou ontem, termina hoje)', () => {
    const quase = new Date(2026, 9, 3, 0, 27); // 00:27
    const a: AgendaDados = { eventos: [{ titulo: 'Plantão', inicio: new Date(2026, 9, 2, 23, 57).toISOString(), fim: new Date(2026, 9, 3, 4, 0).toISOString(), diaInteiro: false }] };
    expect(montarPilula(a, [], quase)).toMatchObject({ modo: 'agora', titulo: 'Plantão', detalhe: 'até 04:00' });
  });

  it('às 23:50, um evento às 00:15 já é "Em 25 min" (o dia seguinte não esconde o que está perto)', () => {
    const noite = new Date(2026, 9, 2, 23, 50);
    const a: AgendaDados = { eventos: [{ titulo: 'Virada', inicio: new Date(2026, 9, 3, 0, 15).toISOString(), fim: new Date(2026, 9, 3, 1, 0).toISOString(), diaInteiro: false }] };
    expect(montarPilula(a, [], noite)).toMatchObject({ modo: 'em-breve', rotulo: 'Em 25 min', titulo: 'Virada' });
  });

  it('à noite, o evento de amanhã de manhã não vira "Hoje" na pílula', () => {
    const noite = new Date(2026, 9, 2, 22, 0);
    const a: AgendaDados = { eventos: [{ titulo: 'Reunião cedo', inicio: new Date(2026, 9, 3, 8, 0).toISOString(), fim: new Date(2026, 9, 3, 9, 0).toISOString(), diaInteiro: false }] };
    expect(montarPilula(a, [], noite)).toBeNull();
  });

  it('metas não-ativas não viram "meta do dia"', () => {
    expect(montarPilula(undefined, [meta({ status: 'concluida' }), meta({ id: 'x', status: 'pausada' })], AGORA)).toBeNull();
  });

  it('meta atrasada pede atenção (urgente)', () => {
    const c = montarPilula(undefined, [meta({ nome: 'Relatório', prazo: dia(-2), ultimoAvancoEm: dia(-1) })], AGORA)!;
    expect(c).toMatchObject({ modo: 'meta', urgente: true, meta: { alerta: 'atrasada', situacao: 'atrasada há 2 dias' } });
    expect(c.detalhe).toBe('Defina o próximo passo');
  });

  it('a visão expandida traz até 4 eventos que ainda importam, marcando o que está em andamento', () => {
    const c = montarPilula(agenda(ev('Passou', -200, 30), ev('Em curso', -10, 40), ev('A', 30), ev('B', 60), ev('C', 90), ev('D', 120), ev('E', 150)), [meta({})], AGORA)!;
    expect(c.eventos.map((e) => e.titulo)).toEqual(['Em curso', 'A', 'B', 'C']);
    expect(c.eventos[0]!.agora).toBe(true);
    expect(c.meta).toBeDefined();
  });

  it('títulos longos são cortados com reticências', () => {
    const c = montarPilula(agenda(ev('x'.repeat(200), 45)), [], AGORA)!;
    expect(c.titulo).toHaveLength(60);
    expect(c.titulo.endsWith('…')).toBe(true);
  });
});

describe('metaDoDia: prioridade', () => {
  it('atrasada > parada > prazo mais próximo > mais tempo sem avanço', () => {
    const recente = new Date(2026, 9, 1, 12).toISOString();
    const lista = [
      meta({ id: 'a', nome: 'Longe', prazo: dia(60), ultimoAvancoEm: dia(0) }),
      meta({ id: 'b', nome: 'Perto', prazo: dia(3), ultimoAvancoEm: dia(0) }),
      meta({ id: 'c', nome: 'Parada', prazo: dia(30), criadaEm: new Date(2026, 8, 1).toISOString() }),
      meta({ id: 'd', nome: 'Atrasada', prazo: dia(-1), ultimoAvancoEm: dia(0), criadaEm: recente }),
    ];
    expect(metaDoDia(lista, AGORA)!.nome).toBe('Atrasada');
    expect(metaDoDia(lista.filter((m) => m.id !== 'd'), AGORA)!.nome).toBe('Parada');
    expect(metaDoDia(lista.filter((m) => m.id === 'a' || m.id === 'b'), AGORA)!.nome).toBe('Perto');
    expect(metaDoDia([], AGORA)).toBeUndefined();
  });
});
