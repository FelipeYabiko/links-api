# Etapa 1: instala tudo e compila o TypeScript.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Etapa 2: imagem final só com o JavaScript compilado e as dependências de produção.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/links.db PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
