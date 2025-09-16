FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY package.json ./

RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]


