@echo off
set PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs;%PATH%
cd /d E:\E-DRUCZEK\apps\web
node node_modules\next\dist\bin\next dev
