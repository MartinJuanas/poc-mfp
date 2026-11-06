## Frontend (React + Vite)

Este frontend consume el backend vía `VITE_API_URL`.

### Variables de entorno

Crear `frontend/.env` (o copiar `frontend/.env.example`) con:

```env
VITE_API_URL=http://localhost:3001/api
```

### Levantar con Docker Compose (recomendado)

Desde la raíz del repo:

```bash
docker compose up --build
```

Frontend: `http://localhost:5173`

### Levantar sin Docker (alternativo)

```bash
npm install
npm run dev
```
