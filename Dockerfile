FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV BACKUP_DIR=/backup
RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /backup && chown -R app:app /backup /app
COPY --from=build /app/dist ./dist
COPY package.json ./
USER app
VOLUME ["/backup"]
ENTRYPOINT ["node", "dist/index.js"]
