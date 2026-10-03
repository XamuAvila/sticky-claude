import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Meta } from '@shared/metas';
import { ROTULO_STATUS, STATUS_META, type StatusMeta } from '@shared/metas-analise';

interface Props {
  /** null = nova meta. */
  meta: Meta | null;
  aoFechar: () => void;
}

/** Diálogo (modal nativo) para criar ou editar uma meta. */
export function EditorMeta({ meta, aoFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [nome, setNome] = useState(meta?.nome ?? '');
  const [status, setStatus] = useState<StatusMeta>(meta?.status ?? 'ativa');
  const [prazo, setPrazo] = useState(meta?.prazo ?? '');
  const [porque, setPorque] = useState(meta?.porque ?? '');
  const [proximo, setProximo] = useState(meta?.proximoPasso ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const r = meta
      ? await window.sticky.metas.atualizar(meta.id, { nome, status, prazo: prazo || null, porque, proximoPasso: proximo })
      : await window.sticky.metas.criar({ nome, status, ...(prazo ? { prazo } : {}), porque, proximoPasso: proximo });
    setSalvando(false);
    if (r.ok) aoFechar();
    else setErro(r.erro);
  }

  async function excluir() {
    if (!meta) return;
    if (!confirmaExcluir) { setConfirmaExcluir(true); return; }
    const r = await window.sticky.metas.excluir(meta.id);
    if (r.ok) aoFechar();
    else setErro(r.erro);
  }

  return (
    <dialog ref={ref} className="dialogo" onClose={aoFechar} aria-labelledby="titulo-editor">
      <form onSubmit={(e) => void salvar(e)}>
        <h2 id="titulo-editor">{meta ? 'Editar meta' : 'Nova meta'}</h2>

        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required autoFocus />
        </label>

        <div className="duas-colunas">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusMeta)}>
              {STATUS_META.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
            </select>
          </label>
          <label>
            Prazo
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </label>
        </div>

        <label>
          Por quê
          <textarea value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={500} rows={2} placeholder="O que isso muda para você?" />
        </label>

        <label>
          Próximo passo (até 15 minutos)
          <input value={proximo} onChange={(e) => setProximo(e.target.value)} maxLength={300} placeholder="A próxima ação pequena e concreta" />
        </label>

        {erro && <p className="aviso-erro" role="alert">{erro}</p>}

        <div className="dialogo-acoes">
          {meta && (
            <button type="button" className={`perigo${confirmaExcluir ? ' confirmando' : ''}`} onClick={() => void excluir()}>
              {confirmaExcluir ? 'Confirmar exclusão' : 'Excluir'}
            </button>
          )}
          <span className="espaco" />
          <button type="button" className="secundario" onClick={() => ref.current?.close()}>Cancelar</button>
          <button type="submit" className="primario" disabled={salvando || !nome.trim()}>Salvar</button>
        </div>
      </form>
    </dialog>
  );
}
