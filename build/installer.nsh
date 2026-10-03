; Ao DESINSTALAR, remove a entrada de inicialização que o app criou (só a do usuário atual).
; O Electron grava o valor com o AppUserModelId do app como nome (com.samuc.stickyclaude).
;
; Atenção: ao instalar uma versão nova POR CIMA, o instalador roda antes o desinstalador da versão antiga (com --updated).
; Nesse caso a entrada NÃO pode ser apagada: senão toda atualização desligaria, em silêncio, a inicialização automática.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.samuc.stickyclaude"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.samuc.stickyclaude"
  ${endIf}
!macroend
