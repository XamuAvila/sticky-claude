# Captura o painel em varios estados (tema claro/escuro, sem internet, aguardando rede, com dados) usando o
# executor falso e dados sinteticos: nao gasta assinatura e nao toca no briefing real.
# Saida: <TEMP>\sticky-estados\<caso>\*.png     Uso:  .\scripts\capturar-estados.ps1
# (arquivo mantido em ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $raiz 'node_modules\electron\dist\electron.exe'
$saida = Join-Path $env:TEMP 'sticky-estados'
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory -Path $saida | Out-Null

function Rodar([string]$caso, [hashtable]$vars, [string]$dadosDe = '') {
    $pasta = Join-Path $saida $caso
    $dados = Join-Path $pasta 'dados'
    New-Item -ItemType Directory -Path $dados -Force | Out-Null
    if ($dadosDe) { Copy-Item (Join-Path $saida "$dadosDe\dados\*") $dados -Recurse -Force }
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
Write-Host "Capturas em: $saida"
