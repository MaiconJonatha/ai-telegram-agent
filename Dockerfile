FROM node:20-slim

WORKDIR /app

# better-sqlite3 precisa de build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

CMD ["node", "dist/index.js"]
