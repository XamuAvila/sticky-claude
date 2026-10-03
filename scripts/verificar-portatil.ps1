# Verifica a versao PORTATIL (release\Sticky-Claude-Portatil-<versao>.exe): abre o .exe de verdade numa pasta de dados
# isolada, com um briefing em cache ja "fresco" (nao chama o Claude, nao gasta assinatura) e confere o log do app.
# NAO instala nada e NAO mexe na inicializacao automatica nem no registro.   Uso:  .\scripts\verificar-portatil.ps1
# (arquivo mantido em ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$exe = Get-ChildItem (Join-Path $raiz 'release') -Filter 'Sticky-Claude-Portatil-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { Write-Host 'Portatil nao encontrado: rode "npm run dist" antes.' -ForegroundColor Red; exit 2 }
$dados = Join-Path $env:TEMP 'sticky-portatil'
if (Test-Path $dados) { Remove-Item $dados -Recurse -Force }
New-Item -ItemType Directory -Path $dados | Out-Null
$logArq = Join-Path $dados 'logs\app.log'
$falhas = 0
function Checar($nome, $ok) { if ($ok) { Write-Host "[ OK ] $nome" -ForegroundColor Green } else { Write-Host "[FALHA] $nome" -ForegroundColor Red; $script:falhas++ } }
function Linhas { if (Test-Path $logArq) { Get-Content $logArq -Encoding UTF8 } else { @() } }
function Esperar($padrao, $seg) { $fim = (Get-Date).AddSeconds($seg); while ((Get-Date) -lt $fim) { if (@(Linhas | Where-Object { $_ -match $padrao }).Count -gt 0) { return $true }; Start-Sleep -Milliseconds 300 }; return $false }

# briefing em cache, completo e de agora: o app so mostra o cache (nao executa o Claude)
$agora = (Get-Date).ToUniversalTime().ToString('o')
$cache = @{ versao = 1; geradoEm = $agora; agenda = @{ status = 'ok'; atualizadoEm = $agora; dados = @{ eventos = @() } }; emails = @{ status = 'ok'; atualizadoEm = $agora; dados = @{ itens = @(); suspeitos = @() } }; foco = @{ status = 'ok'; atualizadoEm = $agora; dados = @{ prioridades = @() } } }
[IO.File]::WriteAllText((Join-Path $dados 'briefing.json'), ($cache | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))

$runAntes = (reg query 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' 2>$null) -join "`n"
$env:STICKY_DATA_DIR = $dados
$env:STICKY_PILULA = '0' # sem a janela da pilula piscando no topo da sua tela durante o teste
Write-Host "Portatil: $($exe.FullName)  ($([math]::Round($exe.Length / 1MB, 1)) MB)"
$inicio = Get-Date
$p = Start-Process -FilePath $exe.FullName -PassThru
try {
    Checar 'o portatil abriu e o app iniciou (log "app iniciado")' (Esperar 'app iniciado' 90)
    Write-Host ("  tempo ate iniciar: {0:N1} s (o portatil se extrai numa pasta temporaria a cada abertura)" -f ((Get-Date) - $inicio).TotalSeconds)
    $linha = Linhas | Where-Object { $_ -match 'app iniciado' } | Select-Object -First 1
    Checar 'esta empacotado' ($linha -match '"empacotado":true')
    Checar 'o app sabe que e o portatil (PORTABLE_EXECUTABLE_FILE)' ($linha -match '"portatil":true')
    Checar 'a interface ficou pronta (bandeja e atalho)' ((Esperar 'interface pronta' 30) -and ((Linhas | Where-Object { $_ -match 'interface pronta' } | Select-Object -First 1) -match '"bandeja":true'))
    Checar 'o cache fresco foi usado: o briefing NAO chamou o Claude' (Esperar 'cache fresco' 15)
    Checar 'o post-it "Metas" foi criado na primeira execucao' (Esperar 'post-it vis' 20)
    Start-Sleep -Seconds 2
}
finally {
    # encerra o app e o envelope portatil (so os processos deste exe)
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '*Sticky-Claude-Portatil*' -or $_.Path -like "$env:TEMP\*Sticky Claude*" -or $_.Path -like "$env:LOCALAPPDATA\Temp\*Sticky Claude*") } | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item Env:STICKY_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:STICKY_PILULA -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
$runDepois = (reg query 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' 2>$null) -join "`n"
Checar 'o registro (HKCU\...\Run) ficou identico' ($runAntes -eq $runDepois)
Write-Host ''
if ($falhas -eq 0) { Write-Host 'Tudo certo.' -ForegroundColor Green } else { Write-Host "$falhas verificacao(oes) falharam." -ForegroundColor Red }
exit $falhas
