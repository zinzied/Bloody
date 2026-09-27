Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\zinzi\Desktop\Bloody"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\zinzi\Desktop\Bloody\scripts\watchdog.mjs""", 0, False
