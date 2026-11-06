FROM node:22-alpine

WORKDIR /app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar el código fuente
COPY . .

# Exponer el puerto de Vite
EXPOSE 5173

# Comando para iniciar la aplicación en modo desarrollo
CMD ["npm", "run", "dev", "--", "--host"]
