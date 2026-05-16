# 墨渊灵笔 - 服务器启动脚本
# 编码：UTF-8 with BOM

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   墨渊灵笔 - 开发服务器" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
Write-Host "[1/4] 检查 Node.js 环境..." -ForegroundColor Yellow
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "  ✓ Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 未找到 Node.js！" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先安装 Node.js:" -ForegroundColor Yellow
    Write-Host "  1. 访问 https://nodejs.org/" -ForegroundColor White
    Write-Host "  2. 下载 LTS 版本并安装" -ForegroundColor White
    Write-Host "  3. 重启此脚本" -ForegroundColor White
    Write-Host ""
    Read-Host "按 Enter 键退出"
    exit 1
}

# 检查 npm
Write-Host "[2/4] 检查 npm..." -ForegroundColor Yellow
try {
    $npmVersion = & npm --version 2>&1
    Write-Host "  ✓ npm 版本: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 未找到 npm！" -ForegroundColor Red
    Read-Host "按 Enter 键退出"
    exit 1
}

# 切换到项目目录
Set-Location "d:\Users\qq274\Desktop\开发文件\ai小说项目开发\墨渊灵笔"
Write-Host "[3/4] 切换到项目目录..." -ForegroundColor Yellow
Write-Host "  ✓ 目录: $(Get-Location)" -ForegroundColor Green

# 检查依赖
Write-Host "[4/4] 检查项目依赖..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "  ! node_modules 不存在，正在安装依赖..." -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ 依赖安装失败！" -ForegroundColor Red
        Read-Host "按 Enter 键退出"
        exit 1
    }
    Write-Host "  ✓ 依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "  ✓ 依赖已安装" -ForegroundColor Green
}

# 启动服务器
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   启动开发服务器" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "服务器地址: http://localhost:3000" -ForegroundColor Green
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Yellow
Write-Host ""
Write-Host "开始启动..." -ForegroundColor Cyan
Write-Host ""

# 启动 Vite
& npm run dev

# 如果 Vite 退出，显示错误
Write-Host ""
Write-Host "服务器已停止" -ForegroundColor Red
Read-Host "按 Enter 键退出"
