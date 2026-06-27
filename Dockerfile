FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm", "run", "start", "-w", "@voice-agent/api"]
