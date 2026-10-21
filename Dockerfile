# syntax=docker/dockerfile:1
# One recipe for the three long-running services. Build with: docker build --build-arg APP=api|worker|bot -t onyc-<app> .
FROM node:22-slim AS build
ARG APP
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@onyc/${APP}...
# A self-contained folder: the service's compiled code and only its production dependencies.
RUN pnpm --filter @onyc/${APP} deploy --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
