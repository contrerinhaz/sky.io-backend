# SkyCare · Backend API

Servicio HTTP para autenticación, gestión de empresas y recomendaciones basadas en clima. Stack: Node.js, Express y MySQL. Licencia UNLICENSED.

> Versión del paquete: `1.0.0` · Entrada: `src/server.js` · Módulos ES

## Arquitectura
- **API REST** con Express.
- **Autenticación** con JWT y hashing con bcryptjs.
- **Persistencia** en MySQL usando `mysql2/promise`.
- **Validación** con Zod.
- **Clima** vía Tomorrow.io con caché y reintentos.
- **Recomendaciones** generadas con OpenAI a partir de actividad y pronóstico.
- **CORS** y cookies habilitadas.

## Estructura de carpetas
Árbol resumido del repositorio (hasta 3 niveles):
```
.gitignore
LICENSE
package-lock.json
package.json
migrations/
migrations/001_roles.sql
migrations/002_users.sql
migrations/003_companies.sql
migrations/004_history.sql
src/
src/migrate.js
src/server.js
src/lib/
src/lib/db.js
src/lib/openai.js
src/lib/recommendations.js
src/lib/weather.js
src/routes/
src/routes/auth.js
src/routes/companies.js
```

### Guía de carpetas y archivos
- `src/server.js`: punto de entrada HTTP. Registra middlewares, rutas y healthcheck.
- `src/lib/db.js`: cliente de base de datos y utilidades de conexión.
- `src/lib/weather.js`: cliente de Tomorrow.io, caché y normalización de datos.
- `src/lib/recommendations.js`: reglas y utilidades para generar recomendaciones.
- `src/lib/openai.js`: integración para extracción de horarios y soporte a recomendaciones.
- `src/routes/auth.js`: registro y login de usuarios.
- `src/routes/companies.js`: CRUD de empresas, historial, consultas avanzadas y clima.
- `src/migrate.js`: runner de migraciones SQL.
- `migrations/*.sql`: migraciones idempotentes aplicadas en orden.
- `.env.example`: plantilla de variables de entorno.
- `LICENSE`: licencia del proyecto.
- `package.json`: metadatos, dependencias y scripts.

## Variables de entorno
Defínelas en `.env`. Detectadas en el código:
```
CORS_ORIGIN
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USER
DEFAULT_USER_PASSWORD
JWT_SECRET
OPENAI_API_KEY
PORT
TOMORROW_API_KEY
TOMORROW_BASE
WEATHER_BACKOFF_MS
WEATHER_MAX_RETRIES
WEATHER_TTL_MS
```

## Inicio rápido
```bash
npm i
cp .env.example .env
npm run migrate
npm run dev
```

## Scripts NPM
```bash
npm run dev       # Desarrollo con recarga
npm start         # Producción
npm run migrate   # Ejecuta migraciones de /migrations
```

## Endpoints
### Salud
- `GET /api/health`

### Autenticación (`/api/auth`)
- `POST /api/auth/register`
- `POST /api/auth/login`

### Empresas (`/api/companies` · JWT requerido)
- `GET /api/companies/`
- `POST /api/companies/`
- `GET /api/companies/:id`
- `DELETE /api/companies/:id`
- `GET /api/companies/:id/weather`
- `GET /api/companies/:id/historial`
- `DELETE /api/companies/:id/historial`
- `POST /api/companies/:id/advanced-query`

## Base de datos
Migraciones incluidas y tablas principales:
- Ver archivos en `migrations/`

## Seguridad
- Tokens con expiración y firma `JWT_SECRET`.
- Middleware de autenticación para rutas bajo `/api/companies`.
- CORS restringible con `CORS_ORIGIN`.
- No exponer `OPENAI_API_KEY` ni credenciales de DB en logs.

## Despliegue
1. Configura variables de entorno.
2. Ejecuta migraciones.
3. Lanza con `npm start` y publica el puerto `PORT` (predeterminado 3001).

## Resolución de problemas
- `ECONNREFUSED` al conectar DB → verifica `DB_HOST`, `DB_PORT`, credenciales y firewall.
- 401/403 → revisa `Authorization: Bearer <token>` y `JWT_SECRET`.
- 500 en `/weather` o `advanced-query` → valida `TOMORROW_API_KEY` y `OPENAI_API_KEY`.
- CORS bloqueado → ajusta `CORS_ORIGIN` acorde al frontend.

## Licencia
UNLICENSED. Revisa `LICENSE`.

---
Documento generado el 2025-09-02.
