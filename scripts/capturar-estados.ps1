# Captura o painel em varios estados (tema claro/escuro, sem internet, aguardando rede, metas, editor e
# proposta do Claude) usando o executor falso e dados sinteticos: nao gasta assinatura e nao toca nos seus
# dados reais.  Saida: <TEMP>\sticky-estados\<caso>\fotos\*.png     Uso:  .\scripts\capturar-estados.ps1
# (arquivo mantido em ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $raiz 'node_modules\electron\dist\electron.exe'
$saida = Join-Path $env:TEMP 'sticky-estados'
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory -Path $saida | Out-Null

function Dia([int]$n) { (Get-Date).AddDays($n).ToString('yyyy-MM-dd') }

# Metas sinteticas: uma parada, uma atrasada sem proximo passo, uma urgente, uma concluida e uma pausada.
function Semear-Metas([string]$dados) {
    $agora = (Get-Date).ToUniversalTime().ToString('o')
    $metas = @(
        @{ id = 'm-ingles'; nome = 'Ficar fluente em ingles'; status = 'ativa'; prazo = (Dia 40); porque = 'Viajar sem depender de traducao'; proximoPasso = 'Fazer 1 licao de 15 minutos'; ultimoAvancoEm = (Dia -9); ultimoAvancoNota = 'Terminei a unidade 3'; criadaEm = $agora; atualizadaEm = $agora },
        @{ id = 'm-relatorio'; nome = 'Entregar o relatorio trimestral'; status = 'ativa'; prazo = (Dia -2); porque = ''; proximoPasso = ''; ultimoAvancoEm = (Dia -1); ultimoAvancoNota = 'Fechei a secao de resultados'; criadaEm = $agora; atualizadaEm = $agora },
        @{ id = 'm-corrida'; nome = 'Correr 5 km sem parar'; status = 'ativa'; prazo = (Dia 5); porque = 'Voltar a ter condicionamento'; proximoPasso = 'Caminhar rapido 15 minutos amanha cedo'; criadaEm = $agora; atualizadaEm = $agora },
        @{ id = 'm-livro'; nome = 'Ler o livro de estrategia'; status = 'concluida'; prazo = (Dia -20); porque = ''; proximoPasso = ''; criadaEm = $agora; atualizadaEm = $agora },
        @{ id = 'm-curso'; nome = 'Fazer o curso de dados'; status = 'pausada'; porque = 'Depois do lancamento'; proximoPasso = ''; criadaEm = $agora; atualizadaEm = $agora }
    )
    $json = (@{ versao = 1; metas = $metas } | ConvertTo-Json -Depth 6)
    [IO.File]::WriteAllText((Join-Path $dados 'metas.json'), $json, (New-Object Text.UTF8Encoding($false)))
}

function Rodar([string]$caso, [hashtable]$vars, [string]$dadosDe = '') {
    $pasta = Join-Path $saida $caso
    $dados = Join-Path $pasta 'dados'
    New-Item -ItemType Directory -Path $dados -Force | Out-Null
    if ($dadosDe) { Copy-Item (Join-Path $saida "$dadosDe\dados\*") $dados -Recurse -Force }
    Semear-Metas $dados
    $todas = @{ STICKY_DATA_DIR = $dados; STICKY_FAKE_CLAUDE = '1'; STICKY_SHOT_DIR = (Join-Path $pasta 'fotos'); STICKY_SHOT_QUIT = '1' }
    foreach ($k in $vars.Keys) { $todas[$k] = $vars[$k] }
    foreach ($k in $todas.Keys) { Set-Item -Path "Env:$k" -Value $todas[$k] }
    try {
        $p = Start-Process -FilePath $exe -ArgumentList ('"' + $raiz + '"') -PassThru
        if (-not $p.WaitForExit(90000)) { Stop-Process -Id $p.Id -Force; Write-Host "$caso : TIMEOUT" -ForegroundColor Red; return }
        $fotos = @(Get-ChildItem (Join-Path $pasta 'fotos') -Filter *.png -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
        Write-Host ("{0} : codigo {1} : {2}" -f $caso, $p.ExitCode, $fotos)
    }
    finally { foreach ($k in $todas.Keys) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue } }
}

# A: tema claro, sem cache, sem internet no inicio (mostra "aguardando" e depois desiste)
Rodar 'A-claro-aguardando' @{ STICKY_THEME = 'light'; STICKY_FAKE_OFFLINE = '1' }
# C: tema claro com dados (online)
Rodar 'C-claro-dados' @{ STICKY_THEME = 'light' }
# B: tema escuro, abre com o cache de C e clica em Atualizar sem internet
Rodar 'B-escuro-sem-internet' @{ STICKY_THEME = 'dark'; STICKY_FAKE_OFFLINE = '1'; STICKY_SHOT_REFRESH = '1' } 'C-claro-dados'
# D: tema escuro, abre o editor da primeira meta
Rodar 'D-escuro-editor' @{ STICKY_THEME = 'dark'; STICKY_SHOT_CLICK = '[data-testid=editar-meta]' } 'C-claro-dados'
# E: tema escuro, o Claude propoe alterar as metas (dialogo de confirmacao)
Rodar 'E-escuro-proposta' @{ STICKY_THEME = 'dark'; STICKY_SHOT_PROPOSTA = '1' } 'C-claro-dados'
# F: tema claro, nova meta
Rodar 'F-claro-nova-meta' @{ STICKY_THEME = 'light'; STICKY_SHOT_CLICK = '[data-testid=nova-meta]' } 'C-claro-dados'
Write-Host "Capturas em: $saida"
