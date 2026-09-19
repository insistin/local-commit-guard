#Requires -Version 5.1
Set-Location $PSScriptRoot\..
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run compile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node .\scripts\test-matcher.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx --yes @vscode/vsce package --allow-missing-repository --out ..\local-commit-guard-0.1.1.vsix
