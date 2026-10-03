// Varredura estática: garante que não existe caminho no código para escrever no Gmail/Calendar,
// nem para usar chave de API ou o Agent SDK. Só policy.ts pode citar ferramentas de escrita (na lista de negação).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx|html|css)$/.test(n) ? [p] : [];
  });
}

const fonte = arquivos(join(RAIZ, 'src')).map((p) => ({ rel: relative(RAIZ, p).replace(/\\/g, '/'), txt: readFileSync(p, 'utf8') }));

const ESCRITA = /\b(send_message|create_draft|update_draft|delete_draft|create_event|update_event|delete_event|respond_to_event|trash_message|trash_thread|untrash_\w+|mark_\w+_spam|unmark_\w+_spam|label_message|label_thread|unlabel_\w+|update_message_labels|create_label|update_label|delete_label|apply_sensitive_\w+)\b/;
const MCP_ESCRITA = /mcp__claude_ai_\w+__(send|create|delete|update|trash|reply|forward|respond|label|unlabel|mark|apply|untrash|unmark|share|copy)_/;

describe('segurança (leitura somente)', () => {
  it('há arquivos para varrer', () => expect(fonte.length).toBeGreaterThan(5));

  it('nenhum arquivo além de policy.ts cita ferramentas de escrita', () => {
    const ofensores = fonte.filter((f) => f.rel !== 'src/main/claude/policy.ts' && (ESCRITA.test(f.txt) || MCP_ESCRITA.test(f.txt))).map((f) => f.rel);
    expect(ofensores).toEqual([]);
  });

  it('policy.ts só cita escrita dentro das listas de negação', () => {
    const policy = fonte.find((f) => f.rel === 'src/main/claude/policy.ts')!.txt;
    const permitidas = /export const FERRAMENTAS_LEITURA = \[([\s\S]*?)\] as const;/.exec(policy)![1]!;
    expect(ESCRITA.test(permitidas)).toBe(false);
  });

  it('o app nunca pula permissões do Claude', () => {
    const ofensores = fonte.filter((f) => /dangerously-skip-permissions|bypassPermissions|allow-dangerously/.test(f.txt)).map((f) => f.rel);
    expect(ofensores).toEqual([]);
  });

  it('não usa o Agent SDK, chave de API nem lê credenciais do Claude', () => {
    const pkg = readFileSync(join(RAIZ, 'package.json'), 'utf8');
    expect(pkg).not.toMatch(/claude-agent-sdk|@anthropic-ai\/sdk/);
    const usos = fonte.filter((f) => /claude-agent-sdk|@anthropic-ai\/sdk|\.credentials\.json|\.claude\.json/.test(f.txt)).map((f) => f.rel);
    expect(usos).toEqual([]);
    // ANTHROPIC_API_KEY só aparece em policy.ts, para ser REMOVIDA do ambiente do filho
    const chave = fonte.filter((f) => /ANTHROPIC_(API_KEY|AUTH_TOKEN)/.test(f.txt)).map((f) => f.rel);
    expect(chave).toEqual(['src/main/claude/policy.ts']);
  });

  it('só autoinicio.ts mexe na inicialização do Windows, e ninguém edita o registro por conta própria', () => {
    const login = fonte.filter((f) => /setLoginItemSettings/.test(f.txt)).map((f) => f.rel);
    expect(login).toEqual(['src/main/autoinicio.ts']);
    const registro = fonte.filter((f) => /reg\.exe|\breg (add|delete)|winreg|spawn\(\s*['"]reg['"]/i.test(f.txt)).map((f) => f.rel);
    expect(registro).toEqual([]);
  });

  it('o desinstalador só apaga a entrada de inicialização numa desinstalação de verdade, não numa atualização', () => {
    // regressão: o instalador roda o desinstalador antigo (--updated) antes de atualizar; sem esta guarda, TODA atualização
    // desligava a inicialização automática do usuário em silêncio.
    const nsh = readFileSync(join(RAIZ, 'build', 'installer.nsh'), 'utf8');
    const macro = /!macro customUnInstall([\s\S]*?)!macroend/.exec(nsh)?.[1] ?? '';
    expect(macro).toMatch(/\$\{ifNot\} \$\{isUpdated\}[\s\S]*DeleteRegValue[\s\S]*\$\{endIf\}/);
    // e só apaga a entrada do próprio app, nunca outras da chave Run
    const nomes = [...macro.matchAll(/DeleteRegValue HKCU "[^"]+" "([^"]+)"/g)].map((m) => m[1]);
    expect(nomes).toEqual(['com.samuc.stickyclaude', 'com.samuc.stickyclaude']);
  });

  it('sem telemetria própria: nenhuma chamada de rede além do DNS de checagem', () => {
    const rede = fonte.filter((f) => /\bfetch\(|XMLHttpRequest|net\.request|axios|https?\.request/.test(f.txt)).map((f) => f.rel);
    expect(rede).toEqual([]);
  });
});
