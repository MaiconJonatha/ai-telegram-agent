FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm install typescript @types/pg

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc || true

CMD ["node", "dist/index.js"]
