import { useEffect, useState } from 'react';
import { haQuanto } from '@shared/agenda';
import type { BriefingSnapshot } from '@shared/briefing';
import { Agenda } from './Agenda';
import { Emails } from './Emails';
import { Secao } from './Secao';

function useAgora(ms: number): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return agora;
}

function saudacao(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function App() {
  const [snap, setSnap] = useState<BriefingSnapshot | null>(null);
  const agora = useAgora(30_000);

  useEffect(() => {
    let vivo = true;
    void window.sticky.briefing.obter().then((s) => { if (vivo) setSnap(s); });
    const cancelar = window.sticky.briefing.aoMudar(setSnap);
    return () => { vivo = false; cancelar(); };
  }, []);

  if (!snap) return <div className="abrindo">Abrindo…</div>;
  const { briefing: b, executando, rede } = snap;
  const dataLonga = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <main className="app">
      <header className="topo">
        <div>
          <h1 className="saudacao">{saudacao(agora)}</h1>
          <div className="data">{dataLonga}</div>
        </div>
        <div className="acoes">
          <button className="primario" type="button" disabled={executando} onClick={() => void window.sticky.briefing.atualizar()}>
            {executando && <span className="giro" aria-hidden="true" />}
            {executando ? 'Atualizando…' : 'Atualizar'}
          </button>
          <span className="atualizado" aria-live="polite">
            {b.geradoEm ? `Briefing de ${haQuanto(b.geradoEm, agora)}` : 'Sem briefing ainda'}
          </span>
        </div>
      </header>

      {rede === 'aguardando' && <div className="faixa" role="status">Aguardando a conexão com a internet… (espero até 2 minutos)</div>}
      {rede === 'sem-internet' && <div className="faixa erro" role="alert">Sem internet. Conecte-se e clique em Atualizar. Mostro o último briefing salvo, se houver.</div>}

      <Secao titulo="Hoje" status={b.agenda.status} erro={b.agenda.erro} atualizadoEm={b.agenda.atualizadoEm}
        temDados={!!b.agenda.dados} agora={agora} vazioTexto="A agenda aparece aqui depois da primeira atualização.">
        {b.agenda.dados && <Agenda eventos={b.agenda.dados.eventos} agora={agora} />}
      </Secao>

      <Secao titulo="E-mails que pedem ação" status={b.emails.status} erro={b.emails.erro} atualizadoEm={b.emails.atualizadoEm}
        temDados={!!b.emails.dados} agora={agora} vazioTexto="Os e-mails aparecem aqui depois da primeira atualização.">
        {b.emails.dados && <Emails dados={b.emails.dados} />}
      </Secao>

      <Secao titulo="Metas" status="vazio" temDados={false} agora={agora} vazioTexto="As metas ainda não estão disponíveis nesta versão." />

      <Secao titulo="Foco sugerido" status={b.foco.status} erro={b.foco.erro} atualizadoEm={b.foco.atualizadoEm}
        temDados={!!b.foco.dados} agora={agora} vazioTexto="O foco aparece aqui depois da primeira atualização.">
        {b.foco.dados && (
          b.foco.dados.prioridades.length ? (
            <ol className="foco">
              {b.foco.dados.prioridades.map((p, i) => (
                <li key={`${p.titulo}-${i}`}>
                  <div><div className="t">{p.titulo}</div><div className="p">{p.porque}</div></div>
                </li>
              ))}
            </ol>
          ) : <p className="vazio">Nenhuma prioridade urgente agora.</p>
        )}
      </Secao>
    </main>
  );
}
