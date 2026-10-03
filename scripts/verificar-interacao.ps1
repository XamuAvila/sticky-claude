# Verifica no app REAL (Electron): bandeja e atalho registrados, atalho global Ctrl+Alt+B, "X so oculta"
# e instancia unica. Usa o executor falso e uma pasta de dados temporaria: nao gasta assinatura e nao
# toca no seu briefing real. Uso (PowerShell):  .\scripts\verificar-interacao.ps1
# (arquivo mantido em ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $raiz 'node_modules\electron\dist\electron.exe'
$dados = Join-Path $env:TEMP 'sticky-verificacao'
if (Test-Path $dados) { Remove-Item $dados -Recurse -Force }
$logArq = Join-Path $dados 'logs\app.log'
Add-Type -AssemblyName System.Windows.Forms

$falhas = 0
function Linhas { if (Test-Path $logArq) { Get-Content $logArq -Encoding UTF8 } else { @() } }
function Contar($padrao) { @(Linhas | Where-Object { $_ -match $padrao }).Count }
function Esperar($padrao, $minimo, $seg = 15) {
    $fim = (Get-Date).AddSeconds($seg)
    while ((Get-Date) -lt $fim) { if ((Contar $padrao) -ge $minimo) { return $true }; Start-Sleep -Milliseconds 250 }
    return $false
}
function Checar($nome, $ok) {
    if ($ok) { Write-Host ("[ OK ] " + $nome) -ForegroundColor Green } else { Write-Host ("[FALHA] " + $nome) -ForegroundColor Red; $script:falhas++ }
}

$env:STICKY_DATA_DIR = $dados
$env:STICKY_FAKE_CLAUDE = '1'
$p1 = Start-Process -FilePath $exe -ArgumentList ('"' + $raiz + '"') -PassThru
try {
    Checar 'app iniciou e a interface ficou pronta' (Esperar 'interface pronta' 1 30)
    $pronta = Linhas | Where-Object { $_ -match 'interface pronta' } | Select-Object -First 1
    Checar 'icone da bandeja criado' ($pronta -match '"bandeja":true')
    Checar 'atalho global Ctrl+Alt+B registrado' ($pronta -match '"atalhoRegistrado":true')
    Checar 'painel apareceu na tela' (Esperar 'painel vis' 1 15)
    Start-Sleep -Seconds 2

    $vis0 = Contar 'painel vis'; $ocu0 = Contar 'painel oculto'
    [System.Windows.Forms.SendKeys]::SendWait('^%b')
    Checar 'Ctrl+Alt+B (1a vez) oculta o painel' ((Esperar 'atalho global acionado' 1 8) -and (Esperar 'painel oculto' ($ocu0 + 1) 8))
    Start-Sleep -Milliseconds 800
    [System.Windows.Forms.SendKeys]::SendWait('^%b')
    Checar 'Ctrl+Alt+B (2a vez) mostra o painel de novo' ((Esperar 'atalho global acionado' 2 8) -and (Esperar 'painel vis' ($vis0 + 1) 8))
    Start-Sleep -Seconds 1

    # "X so oculta": pede ao Windows para fechar a janela principal (WM_CLOSE), como o botao X faria
    $p1.Refresh()
    $temJanela = $p1.MainWindowHandle -ne [IntPtr]::Zero
    Checar 'o Windows enxerga a janela do painel' $temJanela
    $ocu1 = Contar 'painel oculto'
    [void]$p1.CloseMainWindow()
    Checar 'fechar a janela (X) apenas oculta o painel' (Esperar 'painel ocultado' 1 8)
    Start-Sleep -Seconds 2
    $p1.Refresh()
    Checar 'o processo continua vivo depois do X (fica na bandeja)' (-not $p1.HasExited)

    # instancia unica: abrir de novo traz o painel de volta e nao deixa um 2o processo
    $vis1 = Contar 'painel vis'
    $p2 = Start-Process -FilePath $exe -ArgumentList ('"' + $raiz + '"') -PassThru
    [void]$p2.WaitForExit(20000)
    Checar 'a 2a instancia encerra sozinha' $p2.HasExited
    Checar 'a 1a instancia mostra o painel de novo' ((Esperar 'segunda inst' 1 8) -and (Esperar 'painel vis' ($vis1 + 1) 8))
}
finally {
    if ($p1 -and -not $p1.HasExited) { Stop-Process -Id $p1.Id -Force }
    foreach ($v in 'STICKY_DATA_DIR', 'STICKY_FAKE_CLAUDE') { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
}
Write-Host ''
if ($falhas -eq 0) { Write-Host 'Tudo certo.' -ForegroundColor Green } else { Write-Host ("$falhas verificacao(oes) falharam.") -ForegroundColor Red }
exit $falhas
