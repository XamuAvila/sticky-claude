import { useEffect, useState } from 'react';
import { ROTULO_COR, type ResumoPostit } from '@shared/postits';

const COR_PONTO: Record<string, string> = {
  amarelo: '#f5c542', rosa: '#f08fb5', verde: '#7ccf73', azul: '#6aaeea', laranja: '#f0a15a', lilas: '#a98be8',
};

/** Lista dos post-its: mostrar/ocultar e criar. (A bandeja do sistema oferece o mesmo.) */
export function PostitsCard() {
  const [lista, setLista] = useState<ResumoPostit[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    void window.sticky.postits.listar().then((l) => { if (vivo) setLista(l); });
    const cancelar = window.sticky.postits.aoMudar(setLista);
    return () => { vivo = false; cancelar(); };
  }, []);

  async function novo() {
    const r = await window.sticky.postits.novo();
    setErro(r.ok ? '' : r.erro);
  }

  return (
    <section className="cartao" aria-label="Post-its">
      <div className="cartao-topo">
        <h2>Post-its</h2>
        <button type="button" className="link" data-testid="novo-postit" onClick={() => void novo()}>+ Novo post-it</button>
      </div>
      {erro && <p className="aviso-erro" role="alert">{erro}</p>}
      {!lista ? (
        <div className="esqueleto" aria-hidden="true"><i /><i /></div>
      ) : lista.length === 0 ? (
        <p className="vazio">Nenhum post-it. Cada um é uma conversa que não fecha, sempre à vista.</p>
      ) : (
        <ul className="lista-postits">
          {lista.map((p) => (
            <li key={p.id}>
              <span className="ponto-cor" style={{ background: COR_PONTO[p.cor] }} role="img" aria-label={ROTULO_COR[p.cor]} />
              <span className="nome-postit">{p.nome}</span>
              <button type="button" className="link" data-testid="alternar-postit" onClick={() => void window.sticky.postits.alternar(p.id)}>
                {p.visivel ? 'Ocultar' : 'Mostrar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
