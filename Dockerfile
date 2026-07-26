FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/writing-core/package.json ./packages/writing-core/
COPY services/api/package.json ./services/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo build

EXPOSE 8080

CMD ["node", "services/api/dist/index.js"]
