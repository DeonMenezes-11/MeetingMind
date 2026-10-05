# MeetingMind - single container: FastAPI API + built React front end.
#   docker build -t meetingmind .
#   docker run -p 8531:8531 -e OPENAI_API_KEY=sk-... meetingmind      ->  http://localhost:8531

# 1) build the web front end
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2) Python runtime (ffmpeg is needed to normalise / split audio)
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY meetingmind/ meetingmind/
COPY server.py cli.py ./
COPY samples/ samples/
COPY runs/sample/ runs/sample/
COPY runs/sample_noisy/ runs/sample_noisy/
COPY results/scorecard.json results/scorecard.json
COPY --from=web /web/dist web/dist
ENV PYTHONUNBUFFERED=1
EXPOSE 8531
# the key comes from the environment (-e OPENAI_API_KEY=...), never from the image
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8531"]
