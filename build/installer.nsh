!include "StrFunc.nsh"
${UnStrStr}

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\freeai\shell\open\command" ""
  ${UnStrStr} $1 $0 "$INSTDIR\Free AI.exe"
  StrCmp $1 "" +2
  DeleteRegKey HKCU "Software\Classes\freeai"
!macroend
