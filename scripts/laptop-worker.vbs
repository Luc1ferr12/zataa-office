' Jalankan laptop-worker.mjs tanpa jendela (dipanggil Task Scheduler tiap 10 menit)
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir & "\.."
sh.Run "node """ & dir & "\laptop-worker.mjs""", 0, True
