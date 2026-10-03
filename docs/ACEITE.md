# Roteiro de aceite

O que foi verificado, como e o que **não** foi. Os itens abaixo foram executados no app **instalado**, com os dados e o Claude **reais** de quem desenvolveu o projeto (`node scripts/aceite-instalado.mjs`). Nenhum conteúdo pessoal está neste repositório: as imagens do README usam dados fictícios.

## Resultado

| # | Item | Resultado |
|---|---|---|
| 1 | Reiniciar o Windows e o app abrir sozinho | **Parcial.** Não foi feito um reinício de verdade. Provado: a entrada `com.samuc.stickyclaude` existe em `HKCU\...\Run` com `"<exe instalado>" --autostart`; executando **exatamente esse comando** (como o Explorer faz no login) o app abre com `autostart=true`, mostra o painel, reabre os post-its e roda o briefing do início. Não foi provado: o Windows disparar a entrada no boot real e a espera da rede com o PC acabando de ligar (a espera tem teste automatizado, com a rede "subindo" aos poucos). |
| 2 | O briefing aparece com agenda e e-mails reais | **Sim.** Agenda, e-mails e foco em 43 s, sem erro, no app instalado. |
| 3 | O post-it retoma a mesma conversa depois de reiniciar | **Sim, reiniciando o app** (fechar e abrir de novo, mesma posição, mesmo tamanho, mesmo session id; o Claude lembrou a palavra-teste). **Não** com um reinício físico do Windows, mas a sessão fica em arquivo no disco (`~\.claude\projects`) e nada disso depende do boot. Foi usado um post-it de teste, apagado depois. |
| 4 | Fechar um post-it não encerra a sessão | **Sim.** O X ocultou, a sessão e o histórico no Claude permaneceram, e ao mostrar de novo a mesma conversa continuou. |
| 5 | Desligar a inicialização automática remove a entrada de verdade | **Sim.** Ligar pelo interruptor (com a confirmação) criou a entrada; desligar a removeu (`reg query` não a encontrou); religar a recriou sem perguntar de novo. As outras entradas de inicialização do Windows não foram tocadas em nenhum momento. |

## Outras verificações

| Verificação | Como | Situação |
|---|---|---|
| Testes unitários | `npm test` | 230 passam (+2 de integração real, que só rodam com `STICKY_LIVE=1`) |
| Testes E2E no app real | `npm run test:e2e` | 30 passam, sem gastar assinatura |
| Política de somente leitura | `tests/seguranca.test.ts` e testes da guarda do stream | passam |
| Integração real com o Claude | `tests/*.live.test.ts` | executados manualmente: briefing completo e post-its (mesma sessão, instruções, streaming, proposta de metas) |
| Instalador | `scripts/verificar-instalador.mjs` | atualizar por cima preserva a inicialização; desinstalar remove entrada, arquivos e atalho e preserva os dados; reinstalar funciona |
| Versão portátil | `scripts/verificar-portatil.ps1` | abre, loga e cria o post-it (abre em ~20 s) |
| Vários monitores e DPIs | `tests/postits-geometria.test.ts` | **só com telas simuladas** (a máquina de desenvolvimento tem 1 monitor) |

## Limites conhecidos

- **Reinício físico do Windows não testado** (itens 1 e 3 acima). Quem quiser a prova: reinicie e rode `node scripts/aceite-instalado.mjs depois` (precisa de um estado salvo antes por `... antes`).
- **Vários monitores e DPI misto** não foram testados ao vivo.
- **Pacotes sem assinatura**: o SmartScreen pode avisar.
- **Conectores do claude.ai** podem ter escopos de escrita já concedidos ao Google, que o app não consegue reduzir (veja [SEGURANCA.md](SEGURANCA.md)).
- **Limites de uso da assinatura** do Claude valem para o app como valem para o Claude Code: o briefing faz 3 chamadas (Agenda, E-mails e Foco) e só roda ao iniciar o app ou ao clicar em **Atualizar**.
