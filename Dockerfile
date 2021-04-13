FROM node:14.16.0-alpine as install

ADD ./package.json /app/package.json
ADD ./yarn.lock /app/yarn.lock
WORKDIR /app
RUN yarn

FROM node:14.16.0-alpine as builder
COPY --from=install /app/node_modules /app/node_modules
ADD . /app
WORKDIR /app
RUN yarn build

EXPOSE 5000
CMD yarn start