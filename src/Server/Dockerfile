FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app/ ./

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=3 \
  CMD node -e "require('net').connect({port:3000,host:'127.0.0.1'}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "Server.js"]
