# Desenvolvimento

Guia para quem quer rodar, testar, empacotar ou mexer no código do Sticky Claude. Para usar o app, veja o [README](../README.md).

## Requisitos

- Windows 11 e Node.js 20 ou mais novo.
- Para os testes que falam com o Claude de verdade (opcionais): Claude Code logado e os conectores Gmail e Google Calendar ligados em claude.ai.

## Rodar a partir do código

```powershell
git clone https://github.com/XamuAvila/sticky-claude.git
cd sticky-claude
npm install
node node_modules\electron\install.js   # baixa o binário do Electron (o Electron 44 não faz isso sozinho)
npm run build
npx electron .                           # ou: npm run dev
```

Rodando a partir do código, o interruptor **Iniciar com o Windows** fica desabilitado (a entrada do registro apontaria para o Electron de desenvolvimento).

## Estrutura

```
src/main/        processo principal: bandeja, atalho, janelas, briefing (parser, serviço, executor), metas (armazenamento, propostas),
                 post-its (estado, geometria, janelas, conversa, executor), pílula (janela e serviço), inicialização automática, política do Claude
src/preload/     ponte segura entre o processo principal e as telas
src/renderer/    telas (React): painel, post-it e pílula
src/shared/      tipos e a lógica da agenda, usados pelos dois lados
tests/           testes unitários, E2E e integração real opcional
scripts/         ícones, verificações no app real e geração das imagens do README
build/           script do instalador (NSIS)
spike/           experimentos do M0 (o que o Claude headless consegue fazer) e seus resultados
```

Pontos de entrada úteis:

| Arquivo | O que tem |
|---|---|
| `src/main/index.ts` | ligação de tudo: instância única, bandeja, atalho global, serviços |
| `src/main/claude/policy.ts` | a política de somente leitura (ferramentas liberadas e negadas, guarda do stream) |
| `src/main/claude/runner.ts` | como o `claude.exe` é chamado (argumentos, ambiente, streaming, encerramento) |
| `src/main/briefing/` | prompts, parser, serviço e cache do briefing |
| `src/main/metas/` | armazenamento, `metas-patch` e fila de propostas |
| `src/main/postits/` | estado, geometria de monitores, janelas e conversas |
| `src/main/autoinicio.ts` | **o único** arquivo que mexe na entrada de inicialização |

## Testes

```powershell
npm test                          # 230 testes unitários (parser, agenda, metas, post-its, geometria, inicialização, pílula, política de ferramentas, serviços, rede, armazenamento)
npm run typecheck
npm run build; npm run test:e2e   # 30 testes E2E no app real (cliques, digitação, reinício do app, pílula), com dados temporários e sem gastar assinatura
```

Os testes E2E usam o Electron de verdade (via `playwright-core`), um executor falso no lugar do Claude e uma pasta de dados temporária. Nada toca nos seus dados.

### Testes de integração reais (gastam assinatura)

Imprimem só contagens e resultados, nunca o conteúdo dos seus e-mails.

```powershell
$env:STICKY_LIVE = '1'
npx vitest run tests/integracao.live.test.ts   # briefing completo: Agenda, E-mails e Foco (3 chamadas)
npx vitest run tests/postit.live.test.ts       # post-its: mesma sessão após "reiniciar", instruções, streaming e proposta de metas (4 chamadas)
Remove-Item Env:STICKY_LIVE
```

### Verificações no app real, sem gastar assinatura

Executor falso, dados sintéticos, pasta temporária:

```powershell
.\scripts\verificar-interacao.ps1   # bandeja, atalho Ctrl+Alt+B (painel, post-its e pílula), "X só oculta", instância única
.\scripts\capturar-estados.ps1      # capturas do painel: tema claro/escuro, sem internet, aguardando rede, metas, editor e proposta
node scripts/capturar-postits.mjs   # capturas das janelas dos post-its: conversa, menu, instruções, cores
node scripts/capturar-pilula.mjs    # capturas da pílula: compacta e expandida (em breve, urgente, agora, meta atrasada)
```

### Verificação dos pacotes

Precisam de `npm run dist`. Nenhuma instala nada nem liga a inicialização automática.

```powershell
node scripts/verificar-pacote.mjs      # app empacotado (release\win-unpacked) com o Claude REAL: briefing, post-it, interruptor e registro intacto
.\scripts\verificar-portatil.ps1       # versão portátil, com briefing em cache (não gasta assinatura): abre, loga, cria o post-it
```

### Verificação do instalador e roteiro de aceite

Estes **mexem na instalação e na entrada de inicialização do seu usuário**. Use só se quiser mesmo rodar o roteiro (veja [ACEITE.md](ACEITE.md)).

```powershell
node scripts/verificar-instalador.mjs                # atualizar por cima preserva a inicialização; desinstalar remove entrada, arquivos e atalho e preserva seus dados; reinstalar
node scripts/aceite-instalado.mjs antes              # app instalado + dados reais + Claude real: briefing, interruptor (reg query), "X só oculta", mesma sessão
node scripts/aceite-instalado.mjs depois             # depois de REINICIAR o Windows: abriu sozinho no login? mesmo post-it, mesma conversa?
node scripts/aceite-instalado.mjs depois --sem-reinicio   # simula o login executando o comando exato da entrada do registro
node scripts/aceite-instalado.mjs limpar             # apaga o post-it de teste e a sessão dele (não mexe na inicialização)
```

## Variáveis de ambiente (desenvolvimento e testes)

Nenhuma é necessária no uso normal.

| Variável | Para que serve |
|---|---|
| `STICKY_DATA_DIR` | usa esta pasta no lugar de `%APPDATA%\StickyClaude` e isola também a pasta interna do Electron (`<dados>\electron`), então nunca esbarra no seu Sticky Claude de verdade |
| `STICKY_FAKE_CLAUDE` | troca o `claude.exe` por um executor falso (respostas fixas) |
| `STICKY_FAKE_OFFLINE` | simula a falta de internet (só fora do app empacotado) |
| `STICKY_FAKE_AUTOINICIO` | `1` troca a entrada de inicialização do registro por uma falsa em memória (só fora do app empacotado) |
| `STICKY_APP_USER_MODEL_ID` | muda o nome da entrada de inicialização (usado nos testes do instalador) |
| `STICKY_THEME` | força `light` ou `dark` |
| `STICKY_PILULA` | `0` desliga a pílula (padrão nos testes E2E), `1` liga |
| `STICKY_LIVE` | `1` habilita os testes que usam o Claude de verdade |
| `STICKY_SHOT_DIR` | grava PNGs do painel nesta pasta (só desenvolvimento) |
| `STICKY_SHOT_QUIT`, `STICKY_SHOT_REFRESH`, `STICKY_SHOT_PROPOSTA`, `STICKY_SHOT_PROPOSTA_JSON`, `STICKY_SHOT_CLICK`, `STICKY_SHOT_TRACE` | controlam o que as capturas fazem (veja o cabeçalho de `src/main/dev-capturas.ts`) |

## Gerar os pacotes

```powershell
npm run dist    # release\Sticky-Claude-Instalador-<versão>.exe e release\Sticky-Claude-Portatil-<versão>.exe
npm run pack    # só release\win-unpacked, para testar sem instalar
```

| Arquivo | O que é |
|---|---|
| `Sticky-Claude-Instalador-<versão>.exe` | Instalador **por usuário, sem administrador** (instala em `%LOCALAPPDATA%\Programs\Sticky Claude`, atalho no Menu Iniciar) |
| `Sticky-Claude-Portatil-<versão>.exe` | Um arquivo só, sem instalar. Abre mais devagar (de ~20 s a cerca de 1 minuto), porque se extrai numa pasta temporária a cada abertura |

Os pacotes **não são assinados** (`signExecutable: false` em `electron-builder.yml`): não há certificado de assinatura de código. O ícone e os metadados do `.exe` são mantidos e o build roda sem privilégios.

O desinstalador (`build/installer.nsh`) remove a entrada de inicialização, mas **só quando é uma desinstalação de verdade** (`${ifNot} ${isUpdated}`), para que atualizar por cima não desligue a inicialização. Há um teste de regressão em `tests/seguranca.test.ts`. Ao atualizar, quem roda é o desinstalador da versão já instalada: se ela for anterior a esse conserto, a primeira atualização ainda desliga a inicialização (basta religar o interruptor).

## Imagens do README

As imagens de `docs/imagens/` são geradas com **dados fictícios** (`scripts/dados-ficticios.mjs`), nunca com a sua conta:

```powershell
npm run build
node scripts/gerar-imagens-readme.mjs
```

O script abre o app construído (`out/`) com o executor falso, em tema claro e escuro, e monta as imagens (`hero`, post-its, pílula) numa janela oculta do Electron.

## Onde ficam os dados do app

`%APPDATA%\StickyClaude\`:

| Item | O que é |
|---|---|
| `briefing.json` | cache do último briefing |
| `metas.json`, `backups\` | as suas metas e as cópias datadas (as 10 mais recentes) |
| `postits.json` | post-its: sessão, cor, instruções, posição e monitor |
| `conversas\` | cópia local do texto de cada conversa (até 300 mensagens) |
| `preferencias.json` | escolhas do app (confirmação da inicialização, pílula) |
| `servidores.json` | conectores já vistos |
| `config.json` | opcional, veja o README |
| `logs\` | só metadados (fonte, tempo, tokens); nunca texto de conversa |
| `workspace\` | pasta de trabalho do Claude (as sessões dos post-its são indexadas por ela) |

## Formato do bloco `metas-patch`

É o que o Claude devolve para **propor** mudanças nas metas. O app valida (`src/main/metas/patch.ts`), mostra o que vai mudar e só aplica depois do **Aplicar** do usuário. Só existem 3 operações; excluir meta só pela tela.

````
```metas-patch
{ "operacoes": [
  { "op": "atualizar", "id": "<id da meta>", "campos": { "prazo": "2026-12-15", "proximoPasso": "Ler 10 páginas" } },
  { "op": "avanco", "id": "<id da meta>", "nota": "Terminei o capítulo 2" },
  { "op": "criar", "meta": { "nome": "Correr 5 km", "status": "ativa", "prazo": "2026-11-30" } }
] }
```
````
