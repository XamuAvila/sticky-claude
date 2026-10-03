import type { ReactNode } from 'react';
import { haQuanto } from '@shared/agenda';

interface Props {
  titulo: string;
  status: 'vazio' | 'carregando' | 'ok' | 'erro';
  erro?: string | undefined;
  atualizadoEm?: string | undefined;
  temDados: boolean;
  agora: Date;
  vazioTexto: string;
  children?: ReactNode;
}

/** Cartão com estado próprio: carregando, erro ou dados (se uma fonte falha, as outras seguem). */
export function Secao({ titulo, status, erro, atualizadoEm, temDados, agora, vazioTexto, children }: Props) {
  const carregando = status === 'carregando';
  return (
    <section className={`cartao${carregando && temDados ? ' atualizando' : ''}`} aria-busy={carregando} aria-label={titulo}>
      <div className="cartao-topo">
        <h2>{titulo}</h2>
        {carregando ? (
          <span className="chip"><span className="giro" aria-hidden="true" />atualizando</span>
        ) : status === 'erro' ? (
          <span className="chip erro">falhou</span>
        ) : atualizadoEm ? (
          <span className="chip">{haQuanto(atualizadoEm, agora)}</span>
        ) : null}
      </div>

      {status === 'erro' && <p className="aviso-erro" role="alert">{erro ?? 'Algo deu errado.'}</p>}
      {status === 'erro' && temDados && <p className="velho">Mostrando os dados de {haQuanto(atualizadoEm, agora)}.</p>}

      {carregando && !temDados ? (
        <div className="esqueleto" aria-hidden="true"><i /><i /><i /></div>
      ) : temDados ? (
        <div className="corpo">{children}</div>
      ) : status !== 'erro' ? (
        <p className="vazio">{vazioTexto}</p>
      ) : null}
    </section>
  );
}
