#!/bin/bash
# 妙生安装脚本 - 自动复制到应用程序并解除安全限制

# 切换到脚本所在目录
cd "$(dirname "$0")"

APP_NAME="miaos.app"
APP_SRC="$(pwd)/$APP_NAME"
APP_DEST="/Applications/$APP_NAME"

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       妙生 (miaos) 安装程序          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# 检查源文件是否存在
if [ ! -d "$APP_SRC" ]; then
    echo "  ❌ 错误：未找到 $APP_NAME"
    echo "     请确保此脚本在 DMG 镜像中运行。"
    echo ""
    read -p "  按回车键关闭..."
    exit 1
fi

echo "  📦 正在安装妙生到应用程序文件夹..."

# 如果已存在旧版本，先关闭正在运行的进程
if [ -d "$APP_DEST" ]; then
    echo "     发现旧版本，正在关闭运行中的进程..."
    pkill -f "miaos.app/Contents/MacOS/miaos" 2>/dev/null || true
    sleep 1
    echo "     正在替换旧版本..."
    rm -rf "$APP_DEST"
fi

# 复制 app 到 Applications
cp -R "$APP_SRC" "$APP_DEST"
if [ $? -ne 0 ]; then
    echo "  ❌ 复制失败，请手动将 miaos.app 拖到应用程序文件夹。"
    echo ""
    read -p "  按回车键关闭..."
    exit 1
fi
echo "     ✅ 文件复制完成"

# 移除 quarantine 属性（关键步骤！解除 macOS 安全限制）
echo "  🔓 正在解除 macOS 安全限制..."
xattr -cr "$APP_DEST"
echo "     ✅ 安全限制已解除"

echo ""
echo "  ──────────────────────────────────────"
echo "  🎉 安装完成！"
echo ""
echo "  妙生已成功安装到应用程序文件夹。"
echo ""

# 询问是否立即启动
echo -n "  是否立即启动妙生？[Y/n] "
read -r reply
if [[ ! "$reply" =~ ^[Nn]$ ]]; then
    echo "  🚀 正在启动妙生..."
    sleep 1
    open "$APP_DEST"
fi

echo ""
echo "  感谢使用妙生！"
echo ""
sleep 1

# 自动关闭终端窗口（可选）
osascript -e 'tell application "Terminal" to close (first window whose frontmost is true)' &>/dev/null &
