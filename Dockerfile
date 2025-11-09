FROM node:22-alpine AS base
WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm@9.9.0

# 复制依赖文件
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# 构建应用
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER=true
RUN pnpm run build

# 生产运行
FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
