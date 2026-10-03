import type { EmailsDados } from '@shared/briefing';

const ROTULO = { alta: 'urgência alta', media: 'urgência média', baixa: 'urgência baixa' } as const;

export function Emails({ dados }: { dados: EmailsDados }) {
  return (
    <>
      {dados.itens.length === 0 ? (
        <p className="vazio">Nenhum e-mail pedindo ação. 🎉</p>
      ) : (
        <ul className="emails">
          {dados.itens.map((e, i) => (
            <li className="email" key={`${e.remetente}-${e.assunto}-${i}`}>
              <span className={`ponto ${e.urgencia}`} role="img" aria-label={ROTULO[e.urgencia]} title={ROTULO[e.urgencia]} />
              <div>
                <div className="quem">{e.remetente}</div>
                <div className="assunto">{e.assunto}</div>
                <div className="acao">{e.acao}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dados.suspeitos.length > 0 && (
        <div className="suspeitos" role="alert">
          <strong>⚠ Conteúdo suspeito: tentou dar ordens ao Claude</strong>
          <small>O app tratou como dado e não fez nada do que pedia. Confira antes de confiar nesses e-mails.</small>
          {dados.suspeitos.map((s, i) => (
            <div className="suspeito" key={`${s.remetente}-${i}`}>
              <div><strong>{s.remetente}</strong>: {s.assunto}</div>
              <q>{s.trecho}</q>
              <small>{s.motivo}</small>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
