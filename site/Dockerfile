FROM node:22-alpine AS build
WORKDIR /build/site
COPY site/package.json site/package-lock.json ./
RUN npm ci
COPY site/ ./
COPY shared/ /build/shared/
ARG SITE_URL=https://occlus.lat
ARG PUBLIC_APP_URL=https://occlus.lat
ENV SITE_URL=${SITE_URL}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build --chown=node:node /build/site/dist ./dist
COPY --from=build --chown=node:node /build/site/node_modules ./node_modules
COPY --from=build --chown=node:node /build/site/package.json ./package.json
USER node
EXPOSE 4321
CMD ["node","dist/server/entry.mjs"]
