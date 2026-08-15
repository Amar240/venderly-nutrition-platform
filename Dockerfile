# Woodbridge Nutrition pilot — local test image (not production-hardened).
# Single stage for simplicity: install ALL deps (the entrypoint runs prisma
# migrate + the tsx seed at startup), build Next, then `next start`.
FROM node:20-bookworm-slim

# Prisma needs openssl at build (engine) and runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# App source.
COPY . .

# `prisma generate` reads DATABASE_URL's presence (it does not connect here).
# The real value is injected at runtime by docker-compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate

# Build the Next app.
RUN npm run build

EXPOSE 3001

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
