import { useEffect, useRef, useState } from 'react';
import type { EstadoAutoInicio } from '@shared/autoinicio';

/** Configurações: por enquanto, só o interruptor "Iniciar com o Windows" (com confirmação na primeira vez). */
export function Configuracoes() {
  const [estado, setEstado] = useState<EstadoAutoInicio | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let vivo = true;
    void window.sticky.autoinicio.estado().then((e) => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (confirmando && !d.open) d.showModal();
    if (!confirmando && d.open) d.close();
  }, [confirmando]);

  async function definir(ligar: boolean, confirmado: boolean) {
    setOcupado(true);
    setErro('');
    const r = await window.sticky.autoinicio.definir(ligar, confirmado);
    setOcupado(false);
    setConfirmando(false);
    if (r.ok) setEstado(r.estado);
    else setErro(r.erro);
  }

  function aoMarcar(ligar: boolean) {
    // Primeira vez: pede a confirmação antes de criar qualquer coisa no Windows. Depois, liga direto.
    if (ligar && estado && !estado.jaConfirmou) setConfirmando(true);
    else void definir(ligar, false);
  }

  return (
    <section className="cartao" aria-label="Configurações">
      <div className="cartao-topo"><h2>Configurações</h2></div>

      {!estado ? (
        <div className="esqueleto" aria-hidden="true"><i /><i /></div>
      ) : (
        <>
          <label className={`interruptor${!estado.disponivel ? ' desabilitado' : ''}`}>
            <input type="checkbox" role="switch" checked={estado.ativo} disabled={!estado.disponivel || ocupado}
              onChange={(e) => aoMarcar(e.target.checked)} aria-describedby="ajuda-autoinicio" />
            <span className="trilho" aria-hidden="true"><span className="bolinha" /></span>
            <span className="texto-interruptor"><strong>Iniciar com o Windows</strong></span>
          </label>
          <p id="ajuda-autoinicio" className="ajuda">
            {estado.disponivel
              ? 'Ao ligar o PC, o Sticky Claude abre sozinho, mostra o briefing e reabre seus post-its. Cria uma entrada só para o seu usuário (sem administrador); desligar aqui a remove de verdade.'
              : estado.motivo}
          </p>
          {estado.ativo && estado.bloqueadoPeloWindows && (
            <p className="aviso-erro" role="alert">
              O Windows está bloqueando essa entrada (ela foi desativada em Configurações &gt; Aplicativos &gt; Inicialização). Reative por lá para valer no próximo login.
            </p>
          )}
        </>
      )}
      {erro && <p className="aviso-erro" role="alert">{erro}</p>}

      <dialog ref={dialogo} className="dialogo" aria-labelledby="titulo-confirma-auto" onClose={() => setConfirmando(false)}>
        <h2 id="titulo-confirma-auto">Iniciar com o Windows?</h2>
        <p className="subtitulo">
          Vou criar <strong>uma entrada de inicialização só para o seu usuário</strong> (em <code>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</code>), sem precisar de administrador.
          Nada mais no sistema é alterado. Você pode desligar aqui quando quiser, e isso remove a entrada.
        </p>
        {estado && <p className="subtitulo"><small>Programa: <code>{estado.caminho}</code></small></p>}
        <div className="dialogo-acoes">
          <span className="espaco" />
          <button type="button" className="secundario" onClick={() => setConfirmando(false)} autoFocus>Agora não</button>
          <button type="button" className="primario" disabled={ocupado} onClick={() => void definir(true, true)}>Ativar</button>
        </div>
      </dialog>
    </section>
  );
}
