# Institute OS

Operations backbone for an SSC/Banking/Railway exam-prep institute: leads & admissions,
batches, teacher/class allocation, attendance, and fees. Self-hosted, fully open-source.

See `institute-management-plan.md` for the full architecture and roadmap.

## Stack
- API: Express + Prisma (TypeScript) — `apps/api`
- Mobile client: React Native (Expo) — `apps/mobile`
- DB: PostgreSQL · Cache/jobs: Valkey (Redis-compatible) · Object storage: MinIO

## Local development
```
docker compose -f infra/docker-compose.yml up -d
cd apps/api
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Repo layout
```
/apps
  /api      Express + Prisma backend
  /mobile   React Native (Expo) client
/packages
  /shared   Shared TS types / zod DTOs
/infra      docker-compose.yml, Caddyfile
```
