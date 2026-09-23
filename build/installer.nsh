!include "StrFunc.nsh"
${StrStr}

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\freeai\shell\open\command" ""
  ${StrStr} $1 $0 "$INSTDIR\Free AI.exe"
  StrCmp $1 "" +2
  DeleteRegKey HKCU "Software\Classes\freeai"
!macroend
