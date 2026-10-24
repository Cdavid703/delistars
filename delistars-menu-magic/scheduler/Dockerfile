FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.js verificarDomicilio.js audiencia.js mercadeoAviso.js correoCampana.js horarios.mjs indicadores.js solicitudAviso.js avisos.js promos.js ./

CMD ["node", "index.js"]
