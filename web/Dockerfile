# syntax=docker/dockerfile:1

# --- build: Next em modo standalone ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
# NEXT_PUBLIC_* é embutido no bundle em build-time → precisa estar aqui.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build

# --- runtime: server.js standalone + estáticos ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
WORKDIR /app
# public/ não é incluída no standalone — copiar explicitamente
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3001
USER node
# CLERK_SECRET_KEY e API_BASE_URL entram como env de runtime (não build-time).
CMD ["node", "server.js"]
