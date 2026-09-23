!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\freeai\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\Free AI.exe" "%1"' 0 +2
  DeleteRegKey HKCU "Software\Classes\freeai"
!macroend
