FROM node:24-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends postfix ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY transport-service/lab/package*.json ./
RUN npm ci --omit=dev
COPY transport-service/*.mjs ./transport-service/
COPY transport-service/lab/start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
