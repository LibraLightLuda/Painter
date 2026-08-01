@echo off
call "%~dp0server.bat" start
if not defined FINGERTIP_CHECK_ONLY pause
