# Build from the repo root: docker build -f apps/site/Dockerfile .
#
# Plain static HTML/CSS/JS (no framework, no build step) — this is a
# standalone marketing site for one specific institute (thesuccess.in), not
# part of the multi-tenant app, so it intentionally has no build/bundle
# stage the way apps/web does.

FROM nginx:alpine AS runtime
COPY apps/site/public /usr/share/nginx/html
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
