FROM node:20-alpine AS builder
WORKDIR /app
# openssl is required so Prisma picks the correct query engine (OpenSSL 3.x)
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install --prefer-offline --no-audit --no-fund
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
# openssl provides libssl.so.3 needed by the Prisma musl-openssl-3.0.x engine
RUN apk add --no-cache openssl
COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma      ./prisma
COPY --from=builder /app/tsconfig*.json ./
COPY package*.json ./
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "dist/main"]
