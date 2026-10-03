import { useEffect, useMemo, useState } from 'react';
import type { Meta } from '@shared/metas';
import { ROTULO_STATUS, analisarMetas, formatarData, rotuloDias, type MetaAn, type SnapshotMetas } from '@shared/metas-analise';
import { EditorMeta } from './EditorMeta';

function RegistrarAvanco({ meta, aoFechar }: { meta: Meta; aoFechar: () => void }) {
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  async function salvar() {
    const r = await window.sticky.metas.registrarAvanco(meta.id, nota);
    if (r.ok) aoFechar();
    else setErro(r.erro);
  }
  return (
    <form className="avanco-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="O que avançou? (opcional)" aria-label="O que avançou" autoFocus />
      <button type="submit" className="primario pequeno">Registrar</button>
      <button type="button" className="secundario pequeno" onClick={aoFechar}>Cancelar</button>
      {erro && <span className="aviso-erro" role="alert">{erro}</span>}
    </form>
  );
}

function Linha({ m, aoEditar }: { m: MetaAn; aoEditar: (m: Meta) => void }) {
  const [avancando, setAvancando] = useState(false);
  const ativa = m.status === 'ativa';
  return (
    <li className={`meta ${m.status}`}>
      <div className="meta-topo">
        <strong className="meta-nome">{m.nome}</strong>
        <span className={`status ${m.status}`}>{ROTULO_STATUS[m.status]}</span>
      </div>
      <div className="meta-info">
        <span className={m.atrasada ? 'atrasada' : m.diasRestantes !== null && m.diasRestantes <= 3 && ativa ? 'urgente' : ''}>
          {m.rotuloPrazo}{m.prazo ? ` (${formatarData(m.prazo)})` : ''}
        </span>
        {m.parada && <span className="parada" title="Sem avanço registrado há dias">⏸ parada há {m.diasSemAvanco} dias</span>}
      </div>
      {m.proximoPasso ? (
        <div className="proximo"><span className="rotulo">Próximo passo</span> {m.proximoPasso}</div>
      ) : ativa ? (
        <div className="proximo vazio-passo"><button type="button" className="link" onClick={() => aoEditar(m)}>Definir o próximo passo</button></div>
      ) : null}
      {m.porque && <div className="porque">Por quê: {m.porque}</div>}
      <div className="avanco">
        {m.ultimoAvancoEm
          ? <>Último avanço: {rotuloDias(m.diasSemAvanco)}{m.ultimoAvancoNota ? ` — ${m.ultimoAvancoNota}` : ''}</>
          : 'Nenhum avanço registrado ainda.'}
      </div>
      {avancando ? (
        <RegistrarAvanco meta={m} aoFechar={() => setAvancando(false)} />
      ) : (
        <div className="meta-acoes">
          {ativa && <button type="button" className="link" onClick={() => setAvancando(true)}>Registrar avanço</button>}
          <button type="button" className="link" data-testid="editar-meta" onClick={() => aoEditar(m)}>Editar</button>
        </div>
      )}
    </li>
  );
}

export function MetasCard({ agora }: { agora: Date }) {
  const [snap, setSnap] = useState<SnapshotMetas | null>(null);
  const [editando, setEditando] = useState<Meta | 'nova' | null>(null);

  useEffect(() => {
    let vivo = true;
    void window.sticky.metas.obter().then((s) => { if (vivo) setSnap(s); });
    const cancelar = window.sticky.metas.aoMudar(setSnap);
    return () => { vivo = false; cancelar(); };
  }, []);

  const lista = useMemo(() => analisarMetas(snap?.metas ?? [], agora, snap?.diasParada), [snap, agora]);
  const ativas = lista.filter((m) => m.status === 'ativa');
  const outras = lista.filter((m) => m.status !== 'ativa');
  const paradas = ativas.filter((m) => m.parada || m.atrasada).length;

  return (
    <section className="cartao" aria-label="Metas">
      <div className="cartao-topo">
        <h2>Metas</h2>
        <button type="button" className="link" data-testid="nova-meta" onClick={() => setEditando('nova')}>+ Nova meta</button>
      </div>

      {snap?.aviso && <p className="aviso-erro" role="alert">{snap.aviso}</p>}

      {!snap ? (
        <div className="esqueleto" aria-hidden="true"><i /><i /></div>
      ) : lista.length === 0 ? (
        <p className="vazio">Nenhuma meta ainda. Cadastre a primeira em “Nova meta”. O briefing passa a avisar quando uma ficar parada.</p>
      ) : (
        <>
          {paradas > 0 && (
            <p className="resumo-metas">⚠ {paradas} {paradas === 1 ? 'meta pede' : 'metas pedem'} atenção (parada ou atrasada).</p>
          )}
          {ativas.length > 0
            ? <ul className="metas">{ativas.map((m) => <Linha key={m.id} m={m} aoEditar={setEditando} />)}</ul>
            : <p className="vazio">Nenhuma meta ativa no momento.</p>}
          {outras.length > 0 && (
            <details className="outros">
              <summary>Pausadas, concluídas e abandonadas ({outras.length})</summary>
              <ul className="metas">{outras.map((m) => <Linha key={m.id} m={m} aoEditar={setEditando} />)}</ul>
            </details>
          )}
        </>
      )}

      {editando && <EditorMeta meta={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
    </section>
  );
}
