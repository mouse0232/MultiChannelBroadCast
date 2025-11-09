FROM node:22-alpine AS base
WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm@9.9.0

# 安装所有依赖(包括开发依赖,用于构建)
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

# 生产运行 - 使用最小化的镜像
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# 只复制必要的文件
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
