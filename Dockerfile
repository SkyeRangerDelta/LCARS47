#===========================
#LCARS47 Docker Image Config
#===========================
FROM node:20-alpine
LABEL   authors="SkyeRangerDelta" \
        version="47.4.7.0" \
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
RUN apk --update add --no-cache python3 make g++
RUN npm ci
COPY . .

#===========================
#Set environment variables
#===========================
#Required
ENV TOKEN=YOUR_DISCORD_BOT_TOKEN
ENV RDS=YOUR_MONGO_DB_CONNECTION_STRING
ENV OPENAIKEY=YOUR_OPENAI_API_KEY

#Optional
ENV API_HOST=localhost
ENV API_PORT=9121

ENV JWST=YOUR_JWST_API_KEY

ENV JELLYFIN_HOST=localhost
ENV JELLYFIN_PORT=8096
ENV JELLYFIN_KEY=YOUR_JELLYFIN_API_KEY
ENV JELLYFIN_USER=YOUR_JELLYFIN_USER
ENV JELLYFIN_PASS=YOUR_JELLYFIN_PASS

#===========================
#Post & Run
#===========================
#Expose API
EXPOSE 9121

CMD ["npm", "run", "start"]