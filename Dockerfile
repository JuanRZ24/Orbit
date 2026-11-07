# El servidor de Orbit. Dos etapas: la de construir se queda con todas las
# herramientas y la final no lleva nada más que el bundle.
#
# El bundle no tiene ni una dependencia de npm (solo módulos de Node), así que
# la imagen final no necesita node_modules.

FROM node:24-alpine AS build
WORKDIR /app

# --ignore-scripts es importante: sin él, instalar las devDependencies se
# pondría a descargar el binario de Electron, que aquí no hace ninguna falta.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.json tsconfig.node.json tsconfig.web.json vite.server.config.ts ./
COPY src ./src
RUN npm run build:server


FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    ORBIT_DATA=/datos \
    ORBIT_PORT=8787

# La base la escribe el proceso, que no corre como root.
RUN mkdir -p /datos && chown node:node /datos

COPY --from=build /app/out/server ./

USER node
EXPOSE 8787
CMD ["node", "index.js"]
