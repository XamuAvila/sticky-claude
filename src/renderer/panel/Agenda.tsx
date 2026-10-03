import { useMemo } from 'react';
import { analisarAgenda, emHorasMin, formatarHora, type EventoAn } from '@shared/agenda';
import type { Evento } from '@shared/briefing';

type Conflito = [EventoAn, EventoAn];

function Linha({ e }: { e: EventoAn }) {
  const classe = ['evento', e.passou ? 'passou' : '', e.emAndamento ? 'agora' : ''].filter(Boolean).join(' ');
  return (
    <li className={classe}>
      <span className="hora">{e.diaInteiro ? 'dia todo' : formatarHora(e.inicio)}</span>
      <span className="titulo">
        {e.titulo}
        {e.local && <span className="local">{e.local}</span>}
      </span>
      {e.emAndamento ? (
        <span className="etiqueta agora">agora</span>
      ) : e.comecaEmMin !== undefined && e.comecaEmMin <= 180 ? (
        <span className="etiqueta">{emHorasMin(e.comecaEmMin)}</span>
      ) : null}
    </li>
  );
}

function Lista({ eventos }: { eventos: EventoAn[] }) {
  return <ul className="eventos">{eventos.map((e, i) => <Linha key={`${e.titulo}-${e.inicio.getTime()}-${i}`} e={e} />)}</ul>;
}

function Conflitos({ lista }: { lista: Conflito[] }) {
  return (
    <>
      {lista.map(([x, y]) => (
        <div className="conflito" key={`${x.titulo}${x.inicio.getTime()}${y.titulo}${y.inicio.getTime()}`} role="note">
          <span aria-hidden="true">⚠</span>
          <span>
            Conflito: <strong>{x.titulo}</strong> ({formatarHora(x.inicio)}–{formatarHora(x.fim)}) e <strong>{y.titulo}</strong> ({formatarHora(y.inicio)}–{formatarHora(y.fim)})
          </span>
        </div>
      ))}
    </>
  );
}

function Dia({ rotulo, eventos, conflitos }: { rotulo: string; eventos: EventoAn[]; conflitos: Conflito[] }) {
  if (!eventos.length) return null;
  const nConf = conflitos.length;
  return (
    <details className="outros">
      <summary>
        {rotulo} ({eventos.length}){nConf > 0 && <span className="conflito-n"> · ⚠ {nConf} {nConf === 1 ? 'conflito' : 'conflitos'}</span>}
      </summary>
      <Conflitos lista={conflitos} />
      <Lista eventos={eventos} />
    </details>
  );
}

export function Agenda({ eventos, agora }: { eventos: Evento[]; agora: Date }) {
  const a = useMemo(() => analisarAgenda(eventos, agora), [eventos, agora]);
  const doDia = (n: number) => a.conflitos.filter(([x]) => x.dia === n);
  const futuros = a.hoje.filter((e) => !e.passou);
  const passados = a.hoje.filter((e) => e.passou);
  return (
    <>
      <Conflitos lista={doDia(0)} />
      {futuros.length ? <Lista eventos={futuros} /> : <p className="vazio">Nada mais na agenda de hoje.</p>}
      {passados.length > 0 && (
        <details className="outros">
          <summary>Já passaram ({passados.length})</summary>
          <Lista eventos={passados} />
        </details>
      )}
      <Dia rotulo="Amanhã" eventos={a.amanha} conflitos={doDia(1)} />
      <Dia rotulo="Depois de amanhã" eventos={a.depois} conflitos={a.conflitos.filter(([x]) => x.dia >= 2)} />
    </>
  );
}
