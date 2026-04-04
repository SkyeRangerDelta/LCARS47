#===========================
#LCARS47 Docker Image Config
#===========================

#===========================
# Build stage
#===========================
FROM node:24-alpine AS build

WORKDIR /LCARS47
COPY package*.json ./
RUN apk --update add --no-cache python3 py3-pip make g++
RUN npm ci

COPY tsconfig.json ./
COPY Src/ ./Src/
RUN npx tsc

RUN rm -rf node_modules && npm ci --omit=dev

#===========================
# Runtime
#===========================
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/SkyeRangerDelta/LCARS47" \
      org.opencontainers.image.description="The Official PlDyn Discord Bot" \
      org.opencontainers.image.title="LCARS47" \
      org.opencontainers.image.vendor="Planetary Dynamics" \
      org.opencontainers.image.authors="SkyeRangerDelta" \
      org.opencontainers.image.licenses="ISC"

WORKDIR /LCARS47

RUN apk --update add --no-cache ca-certificates ffmpeg curl

COPY --from=build /LCARS47/node_modules ./node_modules
COPY --from=build /LCARS47/Deploy ./Deploy
COPY yt-dlp.conf /etc/yt-dlp.conf
COPY package*.json ./

RUN addgroup -S lcars47 && adduser -S lcars47 -G lcars47 \
    && chown -R lcars47:lcars47 /LCARS47
USER lcars47

ENV NODE_OPTIONS="--dns-result-order=ipv4first"

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD curl -f http://localhost:9121/status || exit 1

#===========================
# Post & Run
#===========================
EXPOSE 9121

CMD ["npm", "run", "start"]
