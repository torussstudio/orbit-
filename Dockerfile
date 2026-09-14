FROM node:22-alpine AS frontend-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build


FROM node:22-alpine

RUN apk add --no-cache nginx supervisor

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=frontend-build /app/client/build /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/start-backend.js /app/docker/start-backend.js

EXPOSE 3000 4000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
