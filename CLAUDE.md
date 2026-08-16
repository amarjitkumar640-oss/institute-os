# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Institute OS — an operations backbone for exam-prep coaching institutes (leads, admissions, batches, teacher scheduling, fees, notifications). Multi-tenant: each institute gets its own app build with branded colors/icon/bundle ID.

## Commands

### API (`apps/api`)
```bash
npm run dev          # tsx watch (hot-reload)
npm run build        # tsc → dist/
npm test             # jest --runInBand (must run from apps/api)
npm test -- --testPathPattern="notifications"  # run one test file
npm run prisma:seed  # seed dev data
npm run prisma:seed:qa  # seed QA data
npx tsc --noEmit     # type-check without emitting
```

### Mobile (`apps/mobile`)
```bash
npm start            # expo start (needs custom dev client, NOT Expo Go)
npm run ios          # expo run:ios
npm run android      # expo run:android
npx tsc --noEmit     # type-check
```

### Infrastructure
```bash
docker compose -f infra/docker-compose.yml up -d   # start Postgres, Valkey, MinIO
```

## Prisma migrations (non-interactive environment)

`prisma migrate dev` requires interactive TTY and is blocked here. The correct workflow:

```bash
# 1. Generate the migration SQL diff (add --from-empty for first migration)
npx prisma migrate diff \
  --from-schema-datasource apps/api/prisma/schema.prisma \
  --to-schema-datamodel    apps/api/prisma/schema.prisma \
  --script

# 2. Create a named migration folder manually and paste the SQL
mkdir apps/api/prisma/migrations/<timestamp>_<name>
# Edit migration.sql — exclude any pre-existing drift (e.g. partial indexes from earlier migrations)

# 3. Apply to dev DB and test DB
cd apps/api && npx prisma migrate deploy
DATABASE_URL="postgresql://institute:institute@localhost:5432/institute_os_test?schema=public" npx prisma migrate deploy

# 4. Regenerate the Prisma client
npx prisma generate
```

## Test isolation

Tests run against `institute_os_test`, never `institute_os` (dev). This is enforced by `apps/api/jest.setup-env.js`, which loads `.env.test` before any test file. Every test suite calls `resetDb()` from `src/__tests__/setup.ts` in `beforeEach` — which truncates all data tables in dependency order. Tests define their own seed helpers inline; there is no shared test-fixtures module.

Required `.env.test`:
```
DATABASE_URL="postgresql://institute:institute@localhost:5432/institute_os_test?schema=public"
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
PORT=4001
```

## Architecture

### Monorepo layout
```
apps/api       Express + Prisma backend (Node.js)
apps/mobile    React Native (Expo SDK 56, bare workflow — custom dev client required)
packages/shared  Zod schemas shared between API and mobile
infra/           docker-compose (Postgres, Valkey/Redis, MinIO)
```

### Multi-tenancy
Every DB row has `tenantId`. The mobile app bakes `EXPO_PUBLIC_TENANT_ID` at build time, so a single codebase produces per-institute builds. Per-org branding (`brandPrimary`, `brandSecondary`, `brandAccent`, `logoUrl`) is stored on `Tenant` and returned at login.

### Auth flow
1. Mobile sends `{ tenantId, identifier, password }` to `POST /api/auth/login`.
2. API resolves `Staff` by phone, email, or username within that tenant.
3. JWT payload: `{ staffId, role, centerId, tenantId, facultyId }`.
4. If staff belongs to multiple centers, `centerId` is null until `POST /api/auth/select-center`.
5. The mobile API client (`src/api/client.ts`) auto-refreshes the access token via `POST /api/auth/refresh` when it gets a 401, queuing concurrent requests while the refresh is in-flight.
6. Tokens are stored in `expo-secure-store`.

### Roles
`admin | teacher | frontdesk`. Role is per-center via `CenterStaff.role`, falling back to `Staff.role`. The `requireRole(...roles)` middleware reads `req.auth!.role`.

### Faculty ↔ Staff link
`Faculty` is the professional record (payroll, subjects, schedule). `Staff` is the login identity. They are separate and optionally linked via `Faculty.staffId String? @unique`. `onDelete: SetNull` so deleting a Staff account unlinks but never deletes the Faculty record. Teachers log in as Staff with `role: "teacher"` and get `facultyId` in their JWT when linked.

### API module structure
Each module under `src/modules/<name>/` follows:
- `<name>.routes.ts` — Express Router, mounted in `src/app.ts`
- `<name>.service.ts` — business logic, Prisma calls
- Shared Zod schemas live in `packages/shared/src/index.ts` and are imported by both sides

All routes use `requireAuth` (JWT validation) and optionally `requireRole(...)`. Validation uses `validateBody(schema)` middleware wrapping Zod. Unhandled throws bubble to `src/middleware/errorHandler.ts`.

### Notification system
Two delivery mechanisms:

**Event-driven** — called fire-and-forget (`.catch(console.error)`) immediately after the triggering operation succeeds, never inside a DB transaction:
- `notify(db, recipientId, ...)` — direct to one person (session cancelled/rescheduled, class reminder)
- `notifyByRole(db, tenantId, type, ...)` — fans out to staff matching `NotificationRoutingRule` for that `(tenantId, type)`, falling back to `DEFAULT_ROUTING` in `notification.service.ts`

**Scheduled sweep** — `setInterval` in `server.ts` fires `runNotificationSweeps(db)` every 60 seconds:
- Class reminders: sessions starting within `Tenant.classReminderMinutes`, guarded by `ClassSession.reminderSentAt`
- Overdue installments: `dueDate < now - overdueGraceDays` on pending/partial installments, guarded by `ScheduleInstallment.overdueNotifiedAt`

The stored `ScheduleInstallment.status` column goes stale (only updated when a payment is recorded). Never use `status: "overdue"` as a sweep filter — always compute live from `dueDate`.

Routing is configurable: `NotificationRoutingRule(tenantId, type) → roles[]`, admin-editable via `PATCH /api/notifications/routing/:type`.

### Mobile theming
**Two-layer color system:**
- `C` from `src/theme.ts` — structural colors only (`bg`, `card`, `text`, `muted`, `border`, etc.). These never vary by tenant. Import and use freely.
- `useThemeColors()` from `ThemeContext.tsx` — brand-configurable colors (`primary`, `secondary`, `accent`, `safeArea`) plus its own fixed tokens (`card`, `text`, `muted`, `border`, `inputBg`, semantic `green`/`red`/`orange`/`blue`/`purple` + `Bg` tints).
- `useThemedStyles(factory)` — memoized version of `useThemeColors` for StyleSheet factories.

Never use `C.primary`, `C.secondary`, or `C.accent` — those keys don't exist on `C`.

**Known drift, not a design choice**: `C`'s fixed tokens and `useThemeColors()`'s fixed tokens are two separately-maintained objects (`theme.ts`'s `C` vs `ThemeContext.tsx`'s `DEFAULT_COLORS`) and do **not** currently hold identical values for the same key names (e.g. `C.border` is `#E5E5EA`, `colors.border` is `#EDE8E3`). New or edited popup/screen code should prefer `colors.x` exclusively over mixing in `C.x`, to avoid adding to this drift — see `apps/mobile/DESIGN_SYSTEM.md` for the full ruleset (color tokens, bottom-sheet height tiers, header/close/search conventions) that every modal, dialog, and action sheet must follow.

### Mobile app config
`apps/mobile/app.config.js` is dynamic: reads `TENANT_SLUG`, `TENANT_NAME`, `TENANT_IOS_BUNDLE_ID`, `TENANT_ANDROID_PACKAGE` env vars at build time to produce per-org branded builds. `EXPO_PUBLIC_API_URL` sets the API base URL.

The app uses `expo-build-properties` (a native config plugin), so it requires a custom dev client build — Expo Go will not work.

## Key env vars (API)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` | Signs access tokens (default TTL: 15m) |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (default TTL: 7d) |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | Object storage (student photos) |
| `PORT` | API listen port (default 4000) |
