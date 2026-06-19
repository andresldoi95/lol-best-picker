; ============================================================================
;  LoL Best Picker - custom NSIS include (spec 005)
;
;  electron-builder OWNS the top-level .nsi; this file is auto-detected from the
;  buildResources directory (build/) and hooks into electron-builder's documented
;  extension macros. It adds three things the generated installer can't do alone:
;
;    1. customPageAfterChangeDir -> an "Environment Configuration" wizard page
;       (FR-002 / FR-003) capturing optional overrides.
;    2. customInstall            -> writes those values (or silent-mode /KEY=value
;       arguments, FR-012) to %LOCALAPPDATA%\LolBestPicker\.env.local (FR-004) and
;       appends an install log line (FR-010).
;    3. customUnInstall          -> prompts to keep or remove user data (FR-009),
;       defaulting to KEEP so a champion pool is never lost by accident (FR-007).
;
;  Validation: NSIS compiles only as part of `npm run package`; this file cannot
;  be unit-tested. Run `npm run package` on Windows and exercise the manual QA
;  checklist in docs/installer-testing-guide.md to verify behavior.
; ============================================================================

; Suppress NSIS warning about unused functions in case the customPageAfterChangeDir
; macro is not invoked by electron-builder's template. The function will be used
; if/when the macro is invoked.
!pragma warning error all
!pragma warning disable 6010

; These headers are include-guarded, so re-including is a no-op even though
; electron-builder's template already pulls them in. Guarantees ${NSD_*},
; ${If}/${EndIf} and ${GetOptions} are defined regardless of include order.
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; Captured override values (default empty -> "use system env / defaults").
Var LbpLcuApiKey
Var LbpHttpsProxy
Var LbpLolalyticsBaseUrl

; nsDialogs handles for the custom page.
Var LbpDialog
Var LbpLcuApiKeyField
Var LbpHttpsProxyField
Var LbpLolalyticsBaseUrlField

; ----------------------------------------------------------------------------
;  Custom wizard page: Environment Configuration (shown after the install-dir
;  page in the assisted installer; automatically skipped during /S silent runs).
; ----------------------------------------------------------------------------
!macro customPageAfterChangeDir
  Page custom LbpEnvConfigPageCreate LbpEnvConfigPageLeave
!macroend

Function LbpEnvConfigPageCreate
  !ifmacrodef MUI_HEADER_TEXT
    !insertmacro MUI_HEADER_TEXT "Environment Configuration" "Optional. Values you enter here override system environment variables for this user. Leave blank to use system defaults."
  !endif

  nsDialogs::Create 1018
  Pop $LbpDialog
  ${If} $LbpDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "LCU API key (optional):"
  Pop $0
  ${NSD_CreateText} 0 13u 100% 12u "$LbpLcuApiKey"
  Pop $LbpLcuApiKeyField

  ${NSD_CreateLabel} 0 32u 100% 12u "HTTPS proxy URL (optional, e.g. http://host:port):"
  Pop $0
  ${NSD_CreateText} 0 45u 100% 12u "$LbpHttpsProxy"
  Pop $LbpHttpsProxyField

  ${NSD_CreateLabel} 0 64u 100% 12u "Lolalytics base URL override (optional):"
  Pop $0
  ${NSD_CreateText} 0 77u 100% 12u "$LbpLolalyticsBaseUrl"
  Pop $LbpLolalyticsBaseUrlField

  nsDialogs::Show
FunctionEnd

Function LbpEnvConfigPageLeave
  ${NSD_GetText} $LbpLcuApiKeyField $LbpLcuApiKey
  ${NSD_GetText} $LbpHttpsProxyField $LbpHttpsProxy
  ${NSD_GetText} $LbpLolalyticsBaseUrlField $LbpLolalyticsBaseUrl
FunctionEnd

; ----------------------------------------------------------------------------
;  customInstall: persist overrides to .env.local + write the install log.
; ----------------------------------------------------------------------------
!macro customInstall
  ; Silent/scripted mode (FR-012): pull values from the command line, e.g.
  ;   Setup.exe /S /LCU_API_KEY=abc /HTTPS_PROXY=http://host:port
  ${GetParameters} $R9
  ${GetOptions} $R9 "/LCU_API_KEY=" $LbpLcuApiKey
  ${GetOptions} $R9 "/HTTPS_PROXY=" $LbpHttpsProxy
  ${GetOptions} $R9 "/LOLALYTICS_BASE_URL=" $LbpLolalyticsBaseUrl

  StrCpy $R0 "$LOCALAPPDATA\LolBestPicker"
  CreateDirectory "$R0"

  ; Only (re)write .env.local when at least one override was supplied, so a blank
  ; re-install or upgrade never clobbers a previously-saved configuration (FR-007).
  StrCpy $R3 "0"
  ${If} $LbpLcuApiKey != ""
    StrCpy $R3 "1"
  ${ElseIf} $LbpHttpsProxy != ""
    StrCpy $R3 "1"
  ${ElseIf} $LbpLolalyticsBaseUrl != ""
    StrCpy $R3 "1"
  ${EndIf}

  ${If} $R3 == "1"
    FileOpen $R1 "$R0\.env.local" w
    ${If} $R1 != ""
      FileWrite $R1 "# LoL Best Picker - application-level environment overrides.$\r$\n"
      FileWrite $R1 "# Managed by the installer; values here take precedence over system env vars.$\r$\n"
      ${If} $LbpLcuApiKey != ""
        FileWrite $R1 "LCU_API_KEY=$LbpLcuApiKey$\r$\n"
      ${EndIf}
      ${If} $LbpHttpsProxy != ""
        FileWrite $R1 "HTTPS_PROXY=$LbpHttpsProxy$\r$\n"
      ${EndIf}
      ${If} $LbpLolalyticsBaseUrl != ""
        FileWrite $R1 "LOLALYTICS_BASE_URL=$LbpLolalyticsBaseUrl$\r$\n"
      ${EndIf}
      FileClose $R1
    ${EndIf}
  ${EndIf}

  ; Install log (FR-010) - append, never overwrite.
  FileOpen $R2 "$R0\install.log" a
  ${If} $R2 != ""
    FileSeek $R2 0 END
    FileWrite $R2 "[installer] LoL Best Picker installed to $INSTDIR$\r$\n"
    FileClose $R2
  ${EndIf}
!macroend

; ----------------------------------------------------------------------------
;  customUnInstall: ask whether to keep or remove user data (FR-009).
;  /SD IDNO => silent uninstall KEEPS data by default (safe, FR-007).
; ----------------------------------------------------------------------------
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove your LoL Best Picker configuration and champion-pool data?$\r$\n$\r$\nChoose No to keep your data (champion pool, history, settings) for a future reinstall." /SD IDNO IDYES lbp_remove_data IDNO lbp_keep_data
  lbp_remove_data:
    RMDir /r "$LOCALAPPDATA\LolBestPicker"
    Goto lbp_done_uninstall
  lbp_keep_data:
  lbp_done_uninstall:
!macroend
