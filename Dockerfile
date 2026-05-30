# Debian-Builder (nicht alpine): rehype-mermaid rendert die Case-Study-Diagramme
# build-time via headless Chromium — der muss im Builder vorhanden sein.
FROM node:22 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Chromium + OS-Deps für rehype-mermaid; eigene Layer -> wird gecacht, solange package*.json gleich bleibt
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
