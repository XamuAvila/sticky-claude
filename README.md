# Sticky Claude

App de Windows 11 que fica na bandeja do sistema e mostra, ao ligar o PC, um **briefing** com a sua agenda e os e-mails que pedem ação. A ideia seguinte (M3) são os **post-its**: janelas pequenas, sempre à vista, em que cada uma é uma conversa persistente com o Claude.

O app **usa a sua assinatura do Claude** por meio do `claude.exe` (Claude Code) que já está instalado e logado neste PC. Ele não usa chave de API, não usa o Agent SDK e não lê as suas credenciais.

> **Uso pessoal.** Não é feito para ser distribuído a outras pessoas.

## Estado atual

| Marco | Situação |
|---|---|
| M0 Spike do Claude | Concluído (`spike/RESULTADOS.md`) |
| M1 Bandeja + briefing | **Pronto** |
| M2 Metas | Pendente |
| M3 Post-its persistentes | Pendente |
| M4 Inicialização automática + instalador | Pendente |
| M5 Pílula no topo da tela | Pendente |

## O que o M1 faz

- Ícone na bandeja (clique alterna o painel; botão direito abre o menu) e atalho global **Ctrl+Alt+B** para mostrar/ocultar.
- O **X só oculta** o painel; o app continua na bandeja. Só **Sair** (menu da bandeja) encerra.
- Uma instância por vez: abrir o app de novo traz o painel de volta.
- Painel com quatro cartões, cada um com estado próprio (carregando, ok ou erro). Se o Gmail falhar, o resto aparece:
  - **Hoje**: agenda de hoje, com conflitos, o que começa nas próximas horas, e Amanhã e Depois de amanhã recolhidos.
  - **E-mails que pedem ação**: remetente, assunto e o que fazer (sem newsletters). Conteúdo que tenta dar ordens ao Claude aparece num aviso, e o app não obedece.
  - **Metas**: chega no M2.
  - **Foco sugerido**: no máximo 3 prioridades.
- O último briefing fica em cache. O app abre na hora e mostra "atualizado há X min".
- O briefing automático roda **só ao iniciar o app** e quando você clica em **Atualizar**, nunca em loop. Se o cache tem menos de 20 minutos e está completo, o início só mostra o cache.
- No início, espera a rede subir por até ~2 minutos. Sem internet, mostra um estado claro e mantém o último briefing.
- Tema claro e escuro seguem o Windows.

## Requisitos

- Windows 11.
- Claude Code instalado e logado com a sua conta (`claude auth status` deve mostrar `authMethod: claude.ai`). O app procura `C:\Users\<você>\.local\bin\claude.exe` e depois o PATH. Para usar outro caminho, crie `%APPDATA%\StickyClaude\config.json` com `{ "claudePath": "C:\\caminho\\claude.exe" }`.
- Conectores **Gmail** e **Google Calendar** conectados em claude.ai (`claude mcp list`).
- Node.js 20 ou mais novo (para rodar a partir do código).

## Como rodar (a partir do código)

```powershell
cd sticky-claude
npm install
node node_modules\electron\install.js   # baixa o binário do Electron (o Electron 44 não faz isso sozinho)
npm run build
npx electron .                           # ou: npm run dev
```

## Testes

```powershell
npm test                  # 96 testes unitários (parser, agenda, política de ferramentas, serviço, rede, armazenamento)
npm run typecheck
```

Teste de integração **real**, que consome a assinatura (3 chamadas ao Claude, imprime só contagens):

```powershell
$env:STICKY_LIVE = '1'; npx vitest run tests/integracao.live.test.ts; Remove-Item Env:STICKY_LIVE
```

Verificações no app real **sem gastar assinatura** (executor falso, dados sintéticos, pasta temporária):

```powershell
.\scripts\verificar-interacao.ps1   # bandeja, atalho Ctrl+Alt+B, "X só oculta", instância única
.\scripts\capturar-estados.ps1      # capturas: tema claro/escuro, sem internet, aguardando rede
```

## Segurança e privacidade

- **Gmail e Calendar são somente leitura.** Não existe caminho no código para enviar, responder, arquivar, apagar ou alterar eventos. São 4 camadas (`src/main/claude/policy.ts`):
  1. só 7 ferramentas de leitura liberadas (`--allowedTools`), nenhuma ferramenta nativa (`--tools ""`), e o que não está na lista é negado (`--permission-mode dontAsk`);
  2. lista de negação com as escritas dos conectores e curinga por servidor para os outros conectores;
  3. uma guarda no stream que derruba a execução se o Claude pedir uma ferramenta `mcp__…` fora da lista;
  4. um teste que falha se qualquer arquivo, além de `policy.ts`, citar ferramentas de escrita (`tests/seguranca.test.ts`).
- **Limite honesto:** os conectores no claude.ai podem ter escopos de escrita já concedidos ao Google. O app não consegue reduzi-los. A proteção é a política acima.
- **E-mails e convites são dados, não instruções.** O Claude é instruído a ignorar ordens dentro deles, e qualquer tentativa vai para o aviso "Conteúdo suspeito".
- **Sem chave de API.** O app remove `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do ambiente do `claude.exe`.
- **Sem transcrição.** O briefing usa `--no-session-persistence`, então o conteúdo dos e-mails não é gravado em `~/.claude/projects`.
- **Sem telemetria do app.** A única atividade de rede do app é uma consulta de DNS para saber se a internet voltou. Os dados ficam em `%APPDATA%\StickyClaude\`. O log (`logs\app.log`) tem só metadados (fonte, tempo, tokens) e descarta texto longo.
- **Sem admin** e nenhuma alteração de configuração do sistema.

## Onde ficam os dados

`%APPDATA%\StickyClaude\`: `briefing.json` (cache), `servidores.json` (conectores já vistos), `config.json` (opcional), `logs\`, `workspace\` (pasta de trabalho do Claude).

## Desinstalar

No M1 não há instalação: basta fechar o app (menu da bandeja → **Sair**) e apagar a pasta do projeto e `%APPDATA%\StickyClaude\`. O instalador e a remoção da inicialização automática chegam no M4.

## Estrutura

```
src/main/        processo principal: bandeja, atalho, janelas, briefing (parser, serviço, executor), política do Claude
src/preload/     ponte segura entre o processo principal e a tela
src/renderer/    tela do painel (React)
src/shared/      tipos e a lógica da agenda, usados pelos dois lados
tests/           testes unitários + integração real opcional
scripts/         ícones e verificações no app real
spike/           experimentos do M0 e seus resultados
```
