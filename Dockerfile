# syntax=docker/dockerfile:1

# --- build: compila TS -> dist (com tsc-alias reescrevendo os @/ ) ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# youtube-dl-exec (dep de produção do pipeline de import) tem preinstall que
# exige `python` no PATH e postinstall que baixa o binário yt-dlp. A API não
# baixa vídeo (isso é o import-worker), então pulamos ambos — sem Python aqui.
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
ENV YOUTUBE_DL_SKIP_DOWNLOAD=true
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime: só deps de produção + dist ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
# Mesmo motivo do build stage: sem Python na base slim e a API não baixa vídeo.
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
ENV YOUTUBE_DL_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
