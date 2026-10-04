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

RUN apk --update add --no-cache ca-certificates ffmpeg curl python3

# Bake yt-dlp into the image. The binary is the thing YouTube changes break;
# the npm wrapper (`ytdlp-nodejs`) is stable. /ytdlp-update refreshes this
# file in-place at runtime, so it must be owned by the bot user.
RUN curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod 755 /usr/local/bin/yt-dlp

COPY --from=build /LCARS47/node_modules ./node_modules
COPY --from=build /LCARS47/Deploy ./Deploy
COPY yt-dlp.conf /etc/yt-dlp.conf
COPY package*.json ./

RUN addgroup -S lcars47 && adduser -S lcars47 -G lcars47 \
    && chown -R lcars47:lcars47 /LCARS47 \
    && chown lcars47:lcars47 /usr/local/bin/yt-dlp
USER lcars47

# --experimental-eventsource: pocketbase's realtime client needs a global
# EventSource, which Node 24 only exposes behind this flag. Without it the
# Beszel state-change monitor silently degrades to polling.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --experimental-eventsource"

# Probes /api, not /api/v1/stats. The stats route now requires the auth token,
# and `curl -f` treats its 401 as a failure, which would fail the container
# healthy check on every interval. /api is the liveness route and needs no
# credential, so the probe stays secret-free.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD curl -f http://localhost:9121/api || exit 1

#===========================
# Post & Run
#===========================
EXPOSE 9121

CMD ["npm", "run", "start"]
