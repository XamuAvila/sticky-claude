# Spike M0 — resultados (2026-10-02)

Ambiente: Claude Code 2.1.288, `claude.exe` do usuário, assinatura **Max** (`authMethod: claude.ai`). Modelo `claude-sonnet-5-5`, esforço `low`. Sem Agent SDK e sem chave de API. Scripts: `lib.mjs` (executor) e `m0.mjs` (cenários). Reproduzir: `node spike/m0.mjs <cenario>`.

## O que funcionou

| Item | Resultado | Evidência |
|---|---|---|
| Assinatura, não API | **OK** | `claude auth status`: `authMethod: claude.ai`, `subscriptionType: max`. `ANTHROPIC_API_KEY` ausente no ambiente do filho |
| (a) Eventos de hoje | **OK** | `list_events` do Calendar chamado uma vez, 15 eventos retornados, 9,6 s |
| (b) E-mails recentes | **OK** | `search_threads` do Gmail chamado uma vez, 5 conversas, 10,2 s |
| (c) Mesma sessão em 2 execuções | **OK** | `--session-id <uuid>` e depois `--resume <uuid>`, em processos separados. O `session_id` foi idêntico e a palavra-chave foi recuperada |
| (d) Streaming | **OK** | `--include-partial-messages`: 51 eventos `text_delta`. Primeiro evento em ~3 s (inicialização) e primeiro texto em ~9 s (depois da ferramenta) |
| Só 7 ferramentas | **OK** | `init` lista exatamente as 7 de leitura. `Bash` e outras nativas não existem (`--tools ""`) |
| Camada `dontAsk` | **OK** | Com a leitura extra presente mas fora da allowlist, as 2 chamadas foram negadas (`permission_denials`) e nada executou |
| Escrita removida | **OK** | A denylist retira as ferramentas de escrita do `init`. O modelo não as vê |
| Instruções por post-it | **OK com ressalva** | `--system-prompt-snapshot on` (padrão) **mantém** a instrução antiga na retomada. Com `off`, a nova vale. Post-its usam `off` |
| Sem diálogo de confiança | **OK** | Nenhuma execução pediu confiança de pasta. Tudo vai pela linha de comando; o cwd é `%APPDATA%\StickyClaude\workspace` |
| `cleanupPeriodDays` | **Existe** | A configuração existe no CLI (não confirmei o padrão de 30 dias nem o efeito sobre `--resume`). Fica para o M3 |

## O que não funcionou ou exigiu ajuste

1. **Contexto inflado por padrão.** Uma execução trivial carregava 113 a 191 ferramentas e 19 skills: **64 mil a 127 mil tokens**. O número varia porque conectores `pending` aparecem aos poucos.
2. **Negar por curinga global falha.** `--disallowedTools mcp__*` com `--allowedTools` das 7 deixou **0 ferramentas**, porque a negação vence a permissão.
3. **Correção adotada (variante V2).** Negação por servidor (`mcp__claude_ai_<Servidor>__*`), mais as 4 leituras extras do Gmail e do Calendar, mais as escritas por nome, mais `--disable-slash-commands`. Resultado: **7 ferramentas e ~13,9 mil tokens** (9 vezes menos).
4. **Fragilidade restante.** Um conector novo que você adicione no claude.ai aparece na lista e gasta contexto, mas continua negado na chamada pelo `dontAsk`. O app vai guardar os nomes de servidor vistos no `init` e negá-los na execução seguinte.
5. **Datas em UTC.** Um e-mail de 02/10 apareceu como 03/10. O prompt do briefing precisa pedir conversão para `America/Sao_Paulo`.
6. **Não verificado.** (i) Se o `windowsHide` evita qualquer janela de console: o spike rodou sem terminal visível, mas não capturei a tela. Confirmo no M1 com captura. (ii) O vazamento do `effort: xhigh` do seu settings: passamos `--effort` explicitamente e `--setting-sources ""`, então não importa na prática.

## Custo e tempo (uma execução de briefing)

| Estratégia | Tempo | Tokens (cache gravado + lido) | Custo estimado pelo CLI* |
|---|---|---|---|
| 2 paralelas (Agenda, E-mails) | **9,3 s** | 18,6 mil + 42,7 mil | US$ 0,093 |
| 1 única | 11,0 s | 15,0 mil + 21,9 mil | US$ 0,074 |

\*O CLI mostra o equivalente em API. Na assinatura isso consome o limite do plano, não gera cobrança.

**Decisão:** 2 execuções paralelas, por causa do isolamento de falha por fonte. Custa ~25% mais e ainda termina antes. O briefing completo (+ a execução curta do foco) deve ficar em ~US$ 0,10 equivalente e ~12 s.

## Receita final validada

```
claude.exe -p  (prompt por stdin)  --output-format stream-json --verbose [--include-partial-messages]
  --model sonnet --effort low --tools ""
  --allowedTools <7 leituras>
  --disallowedTools <escritas do Gmail/Calendar + 4 leituras extras + curinga dos outros servidores>
  --permission-mode dontAsk --setting-sources "" --disable-slash-commands
  [--session-id <uuid> | --resume <uuid>]   [--system-prompt "<instruções>" --system-prompt-snapshot off]
cwd = %APPDATA%\StickyClaude\workspace ; env sem ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN ; windowsHide
```

## Descobertas do M1 (valem para o M3)

- **`--json-schema` funciona em `-p`** e a resposta vem em `structured_output` do evento `result` (o `result` em texto traz o mesmo JSON). Custa 1 turno a mais.
- **O CLI adiciona a ferramenta interna `StructuredOutput`** quando se usa `--json-schema`. A guarda do stream precisa conhecê-la (`permitidasDoPerfil`), senão derruba toda execução.
- **O modelo às vezes tenta chamar `Bash`**, que não existe com `--tools ""`. O CLI responde "ferramenta inexistente" e nada executa. A guarda só ignora e registra esse caso. Qualquer `mcp__…` fora da lista, ou ferramenta que exista no `init` sem estar liberada, derruba a execução.
- **`--no-session-persistence`** funciona com `--json-schema` e impede a gravação da transcrição (que teria o conteúdo dos e-mails). Os post-its **não** devem usá-lo.
- **Tempo de um briefing completo** (Agenda e E-mails em paralelo + Foco): ~30 s, e ~14 mil tokens de contexto por fonte depois do enxugamento. O gargalo é o modelo lendo e-mails (6 a 7 turnos).
- **Datas:** com o fuso no prompt, as datas vieram corretas no horário local.

## Arquitetura confirmada

**Electron + TypeScript (electron-vite), chamando `claude.exe` como processo filho.** O Agent SDK fica de fora, como você pediu. O CLI já cobre agenda, e-mails, retomada de sessão e streaming.
