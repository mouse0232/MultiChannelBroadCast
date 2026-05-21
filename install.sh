#!/bin/bash
# Multi-Channel Broadcast 一键安装脚本
# 适用于小白用户的极简安装

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 主函数
main() {
    echo "======================================"
    echo "🚀 Multi-Channel Broadcast 一键安装"
    echo "======================================"
    echo ""

    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        print_error "未检测到 Docker"
        echo ""
        echo "请先安装 Docker Desktop："
        echo "  • macOS:  https://docs.docker.com/desktop/install/mac-install/"
        echo "  • Windows: https://docs.docker.com/desktop/install/windows-install/"
        echo "  • Linux:   https://docs.docker.com/engine/install/"
        exit 1
    fi

    print_success "Docker 已安装"

    # 检查 docker-compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "未检测到 docker-compose"
        echo ""
        echo "请确保 Docker Desktop 已正确安装"
        exit 1
    fi

    print_success "docker-compose 已安装"

    # 创建工作目录
    WORK_DIR="$HOME/multi-channel-broadcast"
    print_info "工作目录：$WORK_DIR"
    
    if [ -d "$WORK_DIR" ]; then
        print_warning "目录已存在"
        read -p "是否覆盖？(y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "安装已取消"
            exit 0
        fi
        rm -rf "$WORK_DIR"
    fi

    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"

    # 下载配置文件
    print_info "下载配置文件..."
    curl -sLO "https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/docker-deployment/docker-compose.yml"
    curl -sLO "https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/docker-deployment/.env.example"

    if [ $? -ne 0 ]; then
        print_error "下载配置文件失败"
        exit 1
    fi

    print_success "配置文件下载完成"

    # 配置引导
    echo ""
    print_info "配置环境变量"
    cp .env.example .env
    
    echo ""
    echo "请编辑 .env 文件，至少设置以下配置："
    echo ""
    echo "  CHANNELS=miantiao_me,zaihuapd  # 你的 Telegram 频道"
    echo "  API_SECRET_KEY=your_secret_key # 你的 API 密钥"
    echo ""
    
    # 尝试使用文本编辑器
    EDITORS=(nano vim vi code)
    EDITOR_FOUND=""
    
    for editor in "${EDITORS[@]}"; do
        if command -v $editor &> /dev/null; then
            EDITOR_FOUND=$editor
            break
        fi
    done

    if [ -n "$EDITOR_FOUND" ]; then
        print_info "使用 $EDITOR_FOUND 编辑 .env 文件"
        $EDITOR .env
    else
        print_warning "未找到文本编辑器"
        echo "请手动编辑 $WORK_DIR/.env 文件"
        echo "完成后按回车继续..."
        read
    fi

    # 验证配置
    if ! grep -q "^CHANNELS=" .env; then
        print_error ".env 文件中未找到 CHANNELS 配置"
        exit 1
    fi

    if ! grep -q "^API_SECRET_KEY=" .env; then
        print_error ".env 文件中未找到 API_SECRET_KEY 配置"
        exit 1
    fi

    # 拉取 Docker 镜像
    echo ""
    print_info "拉取 Docker 镜像..."
    docker pull ghcr.io/mouse0232/MultiChannelBroadCast:latest

    if [ $? -ne 0 ]; then
        print_warning "从 GHCR 拉取失败，尝试 Docker Hub..."
        # 这里可以从 Docker Hub 拉取（如果你也推送过去了）
        # docker pull mouse0232/multi-channel-broadcast:latest
        print_error "无法拉取 Docker 镜像，请检查网络连接"
        exit 1
    fi

    print_success "Docker 镜像拉取完成"

    # 启动服务
    echo ""
    print_info "启动服务..."
    docker-compose up -d

    # 等待启动
    echo ""
    print_info "等待服务启动..."
    sleep 10

    # 检查状态
    if docker-compose ps 2>/dev/null | grep -q "Up"; then
        echo ""
        print_success "安装成功！"
        echo ""
        echo "======================================"
        echo "📱 访问地址：http://localhost:4321"
        echo "📋 查看日志：docker-compose logs -f"
        echo "⏹️  停止服务：docker-compose down"
        echo "📂 数据目录：$WORK_DIR/data"
        echo "======================================"
        echo ""
        print_info "初始化数据..."
        echo "访问 http://localhost:4321/api/init 开始抓取"
    else
        print_error "启动失败，请查看日志"
        docker-compose logs
        exit 1
    fi
}

# 运行主函数
main "$@"
