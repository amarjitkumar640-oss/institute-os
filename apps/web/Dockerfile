# Build from the repo root: docker build -f apps/web/Dockerfile .
# (needs the whole workspace, not just apps/web, to resolve packages/shared)
#
# Only VITE_API_URL and BASE_PATH are build-time — unlike the mobile app,
# there is no per-tenant build. The tenant is resolved at runtime (see
# apps/web/src/context/TenantContext.tsx), so ONE image serves every tenant.

FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL
ARG BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV BASE_PATH=$BASE_PATH

RUN npm run build -w packages/shared
RUN npm run build -w apps/web

FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
