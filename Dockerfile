#===========================
#LCARS47 Docker Image Config
#===========================
FROM node:24-alpine
ARG GIT_TAG=latest
LABEL authors="SkyeRangerDelta" \
      version="${GIT_TAG}" \
      description="LCARS47 Discord Bot" \
      vendor="Planetary Dynamics" \
      org.opencontainers.image.source="https://github.com/SkyeRangerDelta/LCARS47" \
      org.opencontainers.image.description="The Official PlDyn Discord Bot"

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD curl -f http://localhost:9121/status || exit 1

#===========================
#Setup environment
#===========================
WORKDIR /LCARS47
COPY package*.json ./
RUN apk --update add --no-cache ca-certificates python3 py3-pip make g++ ffmpeg curl
RUN npm ci
COPY yt-dlp.conf /etc/yt-dlp.conf
COPY . .

ENV NODE_OPTIONS="--dns-result-order=ipv4first"

#===========================
#Post & Run
#===========================
#Expose API
EXPOSE 9121

CMD ["npm", "run", "start"]
