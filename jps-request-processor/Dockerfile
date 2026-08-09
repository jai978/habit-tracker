# Node 22 runs the TypeScript directly, so there is no build step and no
# compiled output to ship — the image is the source plus production deps.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

# Mount a volume here when STORE_DRIVER=sqlite, or the database is lost on
# every deploy. Not needed with STORE_DRIVER=supabase.
VOLUME ["/app/data"]

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
