import { useEffect, useRef, useState } from 'react';
import type { PropostaMetas } from '@shared/metas-analise';

/** Mostra a proposta do Claude (uma por vez) e só altera as metas depois do "Aplicar". */
export function PropostaDialog() {
  const [lista, setLista] = useState<PropostaMetas[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const atual = lista[0];

  useEffect(() => {
    let vivo = true;
    void window.sticky.metas.propostas().then((p) => { if (vivo) setLista(p); });
    const cancelar = window.sticky.metas.aoMudarPropostas((p) => { setLista(p); setErro(''); });
    return () => { vivo = false; cancelar(); };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (atual && !d.open) d.showModal();
    if (!atual && d.open) d.close();
  }, [atual]);

  if (!atual) return null;

  async function aplicar() {
    setOcupado(true);
    const r = await window.sticky.metas.aplicarProposta(atual!.id);
    setOcupado(false);
    if (!r.ok) setErro(r.erro);
  }

  return (
    <dialog ref={ref} className="dialogo" aria-labelledby="titulo-proposta" onCancel={(e) => e.preventDefault()}>
      <h2 id="titulo-proposta">Alterar suas metas?</h2>
      <p className="subtitulo">
        O Claude (post-it “{atual.origem}”) propõe {lista.length > 1 ? `esta alteração (1 de ${lista.length})` : 'esta alteração'}. <strong>Nada foi alterado ainda.</strong>
      </p>
      <ul className="mudancas">
        {atual.descricoes.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
      {erro && <p className="aviso-erro" role="alert">{erro}</p>}
      <div className="dialogo-acoes">
        <span className="espaco" />
        {/* O foco inicial fica em "Descartar" de propósito: apertar Enter sem ler não altera as suas metas. */}
        <button type="button" className="secundario" onClick={() => void window.sticky.metas.descartarProposta(atual.id)} autoFocus>Descartar</button>
        <button type="button" className="primario" disabled={ocupado} onClick={() => void aplicar()}>Aplicar</button>
      </div>
    </dialog>
  );
}
