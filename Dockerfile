FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY packages/writing-core/package.json ./packages/writing-core/
COPY services/api/package.json ./services/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/

RUN echo 'enable-pre-post-scripts=true' > .npmrc && pnpm install --frozen-lockfile

COPY . .

ENV VITE_CLERK_PUBLISHABLE_KEY=pk_test_c3VwcmVtZS1ob3JzZS0yMC5jbGVyay5hY2NvdW50cy5kZXYk
ENV PORT=8080

RUN pnpm turbo build

EXPOSE 8080

CMD ["node", "services/api/dist/index.js"]
