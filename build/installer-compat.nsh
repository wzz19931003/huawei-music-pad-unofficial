; Normalize only ordinary absolute drive and UNC paths for equality, without
; looking up filesystem aliases or changing the actual installation directory.
!macro WmusicCompatCanonicalize path reg
  StrCpy $2 ${path} 2
  StrCmpS $2 "\\" 0 drive_${reg}
  StrCpy $2 ${path} 1 2
  StrCmpS $2 "?" stock
  StrCmpS $2 "." stock canonical_${reg}
  drive_${reg}:
  StrCpy $2 ${path} 2 1
  StrCmpS $2 ":\" canonical_${reg}
  StrCmpS $2 ":/" 0 stock
  canonical_${reg}:
  ; The terminal dot removes a trailing separator without trimming a root.
  StrLen $2 ${path}
  IntCmp $2 ${WMUSIC_COMPAT_PATH_LIMIT} stock 0 stock
  StrCpy ${path} "${path}\."
  System::Call 'kernel32::GetFullPathNameW(w ${reg}, i ${NSIS_MAX_STRLEN}, w .${reg}, p 0) i .r2'
  IntCmp $2 0 stock stock
  IntCmp $2 ${NSIS_MAX_STRLEN} stock 0 stock
!macroend

; app-builder-lib 26.15.3 sets the stock callback just before this hook.
!macro customPageAfterChangeDir
  !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !define MUI_PAGE_CUSTOMFUNCTION_PRE WmusicCompatInstFilesPre

Function WmusicCompatInstFilesPre
  Push $0
  Push $1
  Push $2
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrLen $2 $0
  IntCmp $2 0 stock
  StrCpy $1 $INSTDIR
  ; Ordinal comparison ignores case, not ignorable punctuation or other spelling.
  System::Call 'kernel32::CompareStringOrdinal(w r0, i -1, w r1, i -1, i 1) i .r2'
  IntCmp $2 2 keep
  !define /math WMUSIC_COMPAT_PATH_LIMIT ${NSIS_MAX_STRLEN} - 2
  !insertmacro WmusicCompatCanonicalize $0 r0
  !insertmacro WmusicCompatCanonicalize $1 r1
  !undef WMUSIC_COMPAT_PATH_LIMIT
  System::Call 'kernel32::CompareStringOrdinal(w r0, i -1, w r1, i -1, i 1) i .r2'
  IntCmp $2 2 keep
  stock:
  Pop $2
  Pop $1
  Pop $0
  ClearErrors
  Call instFilesPre
  Return
  keep:
  Pop $2
  Pop $1
  Pop $0
  ClearErrors
FunctionEnd
!macroend
