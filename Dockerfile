FROM node:22-alpine AS base
WORKDIR /app

# 安装 pnpm 和构建依赖
RUN npm install -g pnpm@9.9.0 && \
    apk add --no-cache python3 make g++

# 安装所有依赖
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# 构建应用
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER=true
RUN pnpm run build

# 仅安装生产依赖
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# 生产运行
FROM node:22-alpine AS runtime
WORKDIR /app

# 安装 SQLite 运行时依赖
RUN apk add --no-cache sqlite-libs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# 创建数据目录和缓存目录
RUN mkdir -p /app/data /app/cache/images && \
    chown -R node:node /app

# 清理不必要的工具
RUN rm -rf /usr/local/lib/node_modules/npm && \
    rm -rf /tmp/* /var/cache/apk/*

# 复制文件
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/worker-mock ./src/worker-mock
COPY src/lib ./src/lib
COPY filter-rules.json ./

USER node

EXPOSE 4321

# 启动命令
CMD ["node", "--experimental-vm-modules", "src/worker-mock/index.js"]
