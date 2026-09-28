' Starts the watchdog hidden (no console window).
' The repository root and the node binary are discovered at run time, so the
' script works in any folder on any machine instead of a hard-coded path.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root

node = sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
If Not fso.FileExists(node) Then
  node = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe")
End If
If Not fso.FileExists(node) Then
  node = sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\nodejs\node.exe")
End If
If Not fso.FileExists(node) Then
  node = "node.exe"
End If

q = Chr(34)
sh.Run q & node & q & " " & q & root & "\scripts\watchdog.mjs" & q, 0, False
