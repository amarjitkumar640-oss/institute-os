FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/exam-portal/package.json apps/exam-portal/package.json
RUN npm ci

COPY apps/exam-portal apps/exam-portal

ARG VITE_API_URL
ARG BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV BASE_PATH=$BASE_PATH

RUN npm run build -w apps/exam-portal

FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/exam-portal/dist /usr/share/nginx/html
COPY apps/exam-portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
