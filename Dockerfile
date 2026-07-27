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

ENV VITE_CLERK_PUBLISHABLE_KEY=pk_test_c3VwcmVtZS1ob3JzZS0yMC5jbGVyay5hY2NvdW50cy5kZXYk

RUN pnpm turbo build

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health/live').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "services/api/dist/index.js"]
