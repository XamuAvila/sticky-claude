import { describe, expect, it } from 'vitest';
import { analisarAgenda, emHorasMin, haQuanto, lerData } from '../src/shared/agenda';
import type { Evento } from '../src/shared/briefing';

// Datas locais (o teste não depende do fuso da máquina).
const AGORA = new Date(2026, 9, 2, 9, 0);
const iso = (dia: number, h: number, m = 0) => new Date(2026, 9, dia, h, m).toISOString();
const ev = (titulo: string, ini: string, fim?: string, extra: Partial<Evento> = {}): Evento => ({
  titulo, inicio: ini, diaInteiro: false, ...(fim ? { fim } : {}), ...extra,
});

describe('lerData', () => {
  it('AAAA-MM-DD é meia-noite LOCAL, não UTC', () => {
    const d = lerData('2026-10-02')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 2, 0]);
  });
  it('data inválida vira null', () => {
    expect(lerData('amanhã')).toBeNull();
  });
  it('dia que não existe no calendário vira null (31/02 não "rola" para março)', () => {
    expect(lerData('2026-02-31')).toBeNull();
    expect(lerData('2026-13-01')).toBeNull();
    expect(lerData('2026-02-28')).not.toBeNull();
    expect(lerData('2028-02-29')).not.toBeNull(); // ano bissexto
    expect(lerData('2026-02-29')).toBeNull();
  });
});

describe('analisarAgenda', () => {
  it('separa hoje, amanhã e depois, com dia inteiro primeiro', () => {
    const a = analisarAgenda([
      ev('reunião', iso(2, 10), iso(2, 11)),
      { titulo: 'aniversário', inicio: '2026-10-02', diaInteiro: true },
      ev('amanhã cedo', iso(3, 8), iso(3, 9)),
      ev('segunda', iso(4, 8), iso(4, 9)),
    ], AGORA);
    expect(a.hoje.map((e) => e.titulo)).toEqual(['aniversário', 'reunião']);
    expect(a.amanha.map((e) => e.titulo)).toEqual(['amanhã cedo']);
    expect(a.depois.map((e) => e.titulo)).toEqual(['segunda']);
  });

  it('detecta conflito por sobreposição real', () => {
    const a = analisarAgenda([ev('A', iso(2, 10), iso(2, 11)), ev('B', iso(2, 10, 30), iso(2, 11, 30))], AGORA);
    expect(a.conflitos).toHaveLength(1);
    expect(a.conflitos[0]!.map((e) => e.titulo)).toEqual(['A', 'B']);
  });

  it('eventos colados (um termina quando o outro começa) não são conflito', () => {
    const a = analisarAgenda([ev('A', iso(2, 10), iso(2, 11)), ev('B', iso(2, 11), iso(2, 12))], AGORA);
    expect(a.conflitos).toHaveLength(0);
  });

  it('o limite de duração é 20 min: 15 min (pré-treino) ignora, 30 min conta', () => {
    const base = [ev('treino', iso(2, 10), iso(2, 12))];
    expect(analisarAgenda([...base, ev('pré-treino', iso(2, 10), iso(2, 10, 15))], AGORA).conflitos).toHaveLength(0);
    expect(analisarAgenda([...base, ev('alongar', iso(2, 10), iso(2, 10, 30))], AGORA).conflitos).toHaveLength(1);
  });

  it('cada conflito carrega o dia (hoje, amanhã…) para a tela mostrar no lugar certo', () => {
    const a = analisarAgenda([
      ev('A', iso(3, 10), iso(3, 11)), ev('B', iso(3, 10), iso(3, 11)),
    ], AGORA);
    expect(a.conflitos).toHaveLength(1);
    expect(a.conflitos[0]![0].dia).toBe(1);
  });

  it('ignora lembretes curtos, dia inteiro e eventos que já terminaram', () => {
    const a = analisarAgenda([
      ev('treino', iso(2, 5), iso(2, 7, 30)), // já terminou
      ev('lembrete', iso(2, 10), iso(2, 10, 5)), // 5 min
      ev('reunião', iso(2, 10), iso(2, 11)),
      { titulo: 'feriado', inicio: '2026-10-02', diaInteiro: true },
    ], AGORA);
    expect(a.conflitos).toHaveLength(0);
  });

  it('marca o que começa nas próximas 3 horas e quanto falta', () => {
    const a = analisarAgenda([ev('daqui a 30', iso(2, 9, 30), iso(2, 10)), ev('daqui a 5 h', iso(2, 14), iso(2, 15))], AGORA);
    expect(a.proximos.map((e) => e.titulo)).toEqual(['daqui a 30']);
    expect(a.proximos[0]!.comecaEmMin).toBe(30);
  });

  it('marca evento em andamento e evento que passou', () => {
    const a = analisarAgenda([ev('agora', iso(2, 8, 30), iso(2, 9, 30)), ev('passou', iso(2, 7), iso(2, 8))], AGORA);
    const por = Object.fromEntries(a.hoje.map((e) => [e.titulo, e]));
    expect(por['agora']!.emAndamento).toBe(true);
    expect(por['passou']!.passou).toBe(true);
  });

  it('evento que começou ontem e ainda está rolando aparece em HOJE (atravessa a meia-noite)', () => {
    const madrugada = new Date(2026, 9, 3, 0, 27);
    const a = analisarAgenda([ev('Plantão', new Date(2026, 9, 2, 23, 57).toISOString(), new Date(2026, 9, 3, 4, 0).toISOString())], madrugada);
    expect(a.hoje.map((e) => e.titulo)).toEqual(['Plantão']);
    expect(a.hoje[0]!.emAndamento).toBe(true);
    // e um que já terminou ontem continua de fora
    const velho = analisarAgenda([ev('Ontem', new Date(2026, 9, 2, 20, 0).toISOString(), new Date(2026, 9, 2, 21, 0).toISOString())], madrugada);
    expect(velho.hoje).toHaveLength(0);
  });

  it('ignora datas inválidas sem quebrar', () => {
    expect(analisarAgenda([ev('x', 'lixo')], AGORA).hoje).toHaveLength(0);
  });
});

describe('formatação', () => {
  it('haQuanto', () => {
    const t = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
    expect(haQuanto(t(0), AGORA)).toBe('agora');
    expect(haQuanto(t(5), AGORA)).toBe('há 5 min');
    expect(haQuanto(t(125), AGORA)).toBe('há 2 h');
    expect(haQuanto(t(60 * 72), AGORA)).toBe('há 3 d');
    expect(haQuanto(undefined, AGORA)).toBe('');
  });
  it('emHorasMin', () => {
    expect(emHorasMin(30)).toBe('em 30 min');
    expect(emHorasMin(120)).toBe('em 2 h');
    expect(emHorasMin(150)).toBe('em 2 h 30 min');
  });
});
