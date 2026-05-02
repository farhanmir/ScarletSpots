FROM python:3.13-slim

WORKDIR /app

# Git commit SHA injected at build time by the deploy script.
# Usage: docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Install system dependencies for Postgres and ARM architecture
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn uvicorn[standard]

# Copy the rest of your backend code
COPY . .

# Start the engine
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:8000"]
