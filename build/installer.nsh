; Ao desinstalar, remove a entrada de inicialização que o app criou (só a do usuário atual).
; O Electron grava o valor com o AppUserModelId do app como nome (com.samuc.stickyclaude).
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.samuc.stickyclaude"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.samuc.stickyclaude"
!macroend
