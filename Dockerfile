FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ffmpeg imagemagick webp ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
