FROM node:22-alpine AS build
WORKDIR /build/frontend
RUN npm install --global pnpm@12.6.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# Motor y modelo del dictado (unos 330 MB) en su propia capa: solo se descargan de nuevo si cambia el script.
COPY frontend/scripts/preparar-dictado.mjs scripts/
RUN node scripts/preparar-dictado.mjs
COPY frontend/ ./
COPY shared/ /build/shared/
# Entorno que muestra el logo junto a la versión (development, test o production).
ARG OCCLUS_ENV=production
ENV NEXT_PUBLIC_OCCLUS_ENV=$OCCLUS_ENV
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /build/frontend/.next/standalone/ ./
COPY --from=build --chown=node:node /build/frontend/.next/static/ ./frontend/.next/static/
COPY --from=build --chown=node:node /build/frontend/public/ ./frontend/public/
USER node
EXPOSE 3000
CMD ["node","frontend/server.js"]
