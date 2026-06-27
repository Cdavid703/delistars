# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package.json desde la raíz del proyecto domicilios
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Variables de Firebase para el build
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

# Build con Vite — las tres apps del repo de domicilios (mismo código base)
RUN npm run build
RUN npm run build:turnos
RUN npm run build:vacantes

# Production stage - Nginx
FROM nginx:alpine

# Copiar configuración de nginx
COPY domicilios-nginx.conf /etc/nginx/nginx.conf

# Cada app a su ruta: /domicilios/, /turnos/, /vacantes/
COPY --from=builder /app/dist          /usr/share/nginx/html/domicilios
COPY --from=builder /app/dist-turnos   /usr/share/nginx/html/turnos
COPY --from=builder /app/dist-vacantes /usr/share/nginx/html/vacantes

# Exponer puerto
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
