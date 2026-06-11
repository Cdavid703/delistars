# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Build con Vite
# Allow passing Vite build-time API URL
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build con Vite
RUN npm run build

# Production stage - Nginx
FROM nginx:alpine

# Copiar configuración de nginx para admin
COPY nginx-admin.conf /etc/nginx/nginx.conf

# Copiar archivos buildados desde builder al directorio de nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer puerto
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80 || exit 1

# Comando para iniciar nginx
CMD ["nginx", "-g", "daemon off;"]
