@echo off
set p message=Enter commit message 
git add -A
git commit -m %message%
git push
echo Done!
pause