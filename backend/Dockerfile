FROM node:22-alpine

WORKDIR /app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 3001

# Comando para iniciar la aplicación
CMD ["npm", "start"]
