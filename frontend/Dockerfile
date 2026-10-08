FROM node:22-alpine AS build
WORKDIR /build/frontend
RUN npm install --global pnpm@12.6.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
COPY shared/ /build/shared/
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
