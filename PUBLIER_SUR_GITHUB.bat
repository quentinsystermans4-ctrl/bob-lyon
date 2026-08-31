@echo off
title Publication du site BOB sur GitHub
color 0E
echo =======================================================
echo   PUBLICATION DU SITE BOB (BLONDE OU BRUNE) SUR GITHUB
echo =======================================================
echo.
echo Connexion a GitHub et envoi de tous les fichiers...
echo Si une fenetre apparait, cliquez sur "Sign in with your browser".
echo.
git branch -M main
git push -u origin main
echo.
echo =======================================================
echo   SITE ENVOYE AVEC SUCCES SUR GITHUB PAGES !
echo =======================================================
echo.
pause
