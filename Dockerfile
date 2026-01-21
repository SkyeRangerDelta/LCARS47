#===========================
#LCARS47 Docker Image Config
#===========================
FROM node:24-alpine
LABEL   authors="SkyeRangerDelta" \
        version="${GIT_TAG:-latest}" \
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

# CRITICAL - Bot cannot start without these
ENV TOKEN=YOUR_DISCORD_BOT_TOKEN
ENV RDS=YOUR_MONGO_DB_CONNECTION_STRING
ENV PLDYNID=YOUR_DISCORD_GUILD_ID
ENV LCARSID=YOUR_BOT_USER_ID

# REQUIRED - Core features need these
ENV OPENAIKEY=YOUR_OPENAI_API_KEY
ENV MEDIALOG=YOUR_MEDIALOG_CHANNEL_ID
ENV ENGINEERING=YOUR_ENGINEERING_CHANNEL_ID
ENV SIMLAB=YOUR_SIMLAB_CHANNEL_ID
ENV DEVLAB=YOUR_DEVLAB_CHANNEL_ID

# OPTIONAL - API server configuration (has defaults)
ENV API_HOST=localhost
ENV API_PORT=9121

# OPTIONAL - JWST integration
ENV JWST=YOUR_JWST_API_KEY

# OPTIONAL - Beszel server monitoring (all required if any set)
ENV BESZEL_URL=YOUR_BESZEL_URL
ENV BESZEL_EMAIL=YOUR_BESZEL_EMAIL
ENV BESZEL_PASSWORD=YOUR_BESZEL_PASSWORD

# OPTIONAL - Jellyfin media server (all required if any set)
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
