FROM node:18-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY node_modules ./node_modules

COPY server.js ./
COPY public ./public
COPY data ./data
COPY LICENSE NOTICE README.md ./

EXPOSE 3000

CMD ["npm", "start"]
