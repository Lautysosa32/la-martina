Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

' 1. Obtener la carpeta donde está este script
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 2. Si este script fue copiado directamente a la carpeta de Inicio de Windows,
' redirigir automáticamente a la carpeta original del proyecto
If Not fso.FileExists(fso.BuildPath(strPath, "iniciar.bat")) Then
    defaultPath = "C:\Users\lauty\Programacion\La Martina\whatsapp-worker"
    If fso.FileExists(fso.BuildPath(defaultPath, "iniciar.bat")) Then
        strPath = defaultPath
    End If
End If

objShell.CurrentDirectory = strPath

' 3. Ejecutar iniciar.bat con el flag --silent de forma invisible (0) y sin esperar (False)
objShell.Run "cmd /c iniciar.bat --silent", 0, False
