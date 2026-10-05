FROM node:22-alpine AS frontend-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM node:22-alpine

RUN apk add --no-cache nginx supervisor

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=frontend-build /app/client/dist /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/start-backend.js /app/docker/start-backend.js

EXPOSE 3000 4000

# Same check the deploy workflow runs; marks the container unhealthy if the
# API stops answering. Does not restart anything on its own.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
