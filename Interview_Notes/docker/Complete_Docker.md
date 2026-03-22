# Docker Complete Deep Dive
## Architecture + Images + Networking + Volumes + Compose + Security + CI/CD
### Theory → Interview Questions → Hands-on Steps

---

## README — How to Use This Document

**Total sections:** 8
**Your strongest sections (real experience):** Multi-stage (963MB→10.49MB), Compose (MERN), CI/CD (judicialsolutions.in pipeline)
**Prep time:** 3-4 days

### Priority questions for your interviews:
| Section | Must know |
|---|---|
| Architecture | How Docker daemon works, client-server model |
| Images | Layer caching — why order of instructions matters |
| Multi-stage | Your 963MB→10.49MB story — explain every decision |
| Networking | Bridge network internals, container DNS |
| Volumes | Volume vs bind mount vs tmpfs — when to use each |
| Compose | depends_on vs healthcheck, networking between services |
| Security | Non-root user, read-only filesystem, capability dropping |
| CI/CD | Docker layer caching in GitHub Actions |

### Power phrases for interviews:
- *"I reduced a Go image from 963MB to 10.49MB using multi-stage builds and distroless base"*
- *"Layer caching is why I always copy dependency files before source code"*
- *"I use non-root user and read-only filesystem as baseline security in every Dockerfile"*
- *"Docker networking uses a virtual ethernet bridge — containers get their own network namespace"*

---

## PART 1 — DOCKER ARCHITECTURE

### How Docker Works Internally

```
Docker uses a client-server architecture:

Your Machine
  Docker CLI (client)
  "docker build", "docker run"
        │
        │ REST API (unix socket: /var/run/docker.sock)
        ▼
  Docker Daemon (dockerd)
  - Manages images, containers, networks, volumes
  - Calls containerd
        │
        ▼
  containerd
  - Container lifecycle management
        │
        ▼
  runc
  - Actually creates the container
  - Uses Linux namespaces + cgroups
```

### Key Components

**Docker Daemon (dockerd):**
- Background service — listens for Docker API requests
- Manages all Docker objects: images, containers, networks, volumes
- Communicates with containerd for container execution

**Docker Client (docker CLI):**
- What you type: `docker build`, `docker run`, `docker ps`
- Sends REST API requests to Docker daemon
- Can connect to remote daemons (not just local)

**Docker Registry:**
- Storage for Docker images
- Docker Hub: public registry (default)
- ECR, GCR, ACR: cloud provider registries
- Self-hosted: Harbor, Nexus

**Linux Primitives Docker Uses:**
```
Namespaces — isolation:
  PID namespace    → container has its own process tree
  Network namespace → container has its own network stack
  Mount namespace  → container has its own filesystem view
  User namespace   → container has its own user IDs
  UTS namespace    → container has its own hostname
  IPC namespace    → container has its own IPC resources

cgroups — resource limits:
  CPU limits    → container can't starve host
  Memory limits → container killed if exceeds limit (OOMKilled)
  I/O limits    → disk read/write throttling
```

### Interview Questions

**Q: Docker is often called lightweight virtualisation — how is it different from a VM?**

```
Virtual Machine:
  Hypervisor runs on host
  Each VM has full OS kernel
  Complete hardware virtualisation
  Startup: minutes | Size: GBs
  Isolation: full hardware isolation

Docker Container:
  Shares host OS kernel
  Uses namespaces + cgroups for isolation
  No hypervisor overhead
  Startup: milliseconds | Size: MBs
  Isolation: process-level (weaker than VM)

Use VM when: strong security isolation needed, different OS kernels
Use Docker when: microservices, CI/CD, consistent environments
```

**Q: What is the Docker socket and why is mounting it a security risk?**

```
/var/run/docker.sock = Unix socket for Docker daemon API

Mounting it in a container:
  docker run -v /var/run/docker.sock:/var/run/docker.sock myapp

Risk:
  Container can talk to Docker daemon on HOST
  Container can create new containers, mount host filesystem
  = full host compromise from inside container (container escape)

Never mount Docker socket unless absolutely necessary
```

---

## PART 2 — IMAGES: LAYERS, CACHING, OPTIMISATION

### How Docker Images Work

```
Docker image = stack of read-only layers
Container = image layers + thin read-write layer on top

Image layers:
  Layer 1: FROM python:3.12-slim     (base OS)
  Layer 2: RUN apt-get install ...   (system packages)
  Layer 3: COPY requirements.txt .   (dependency file)
  Layer 4: RUN pip install ...       (dependencies)
  Layer 5: COPY . .                  (application code)

Each RUN, COPY, ADD creates a new layer
Each layer is identified by a SHA256 hash
Layers are shared between images (deduplication)
```

### Layer Caching — The Most Important Concept

```
Docker caches each layer by its content hash
If a layer's content hasn't changed → use cache → skip rebuild

Rule: once a layer is invalidated, ALL subsequent layers rebuild

BAD ORDER (cache busted on every code change):
  COPY . .                              ← copies ALL files including code
  RUN pip install -r requirements.txt  ← always runs (code changed above)

GOOD ORDER (cache preserved):
  COPY requirements.txt .              ← only requirements file
  RUN pip install -r requirements.txt  ← cached unless requirements change
  COPY . .                             ← code changes don't affect pip install
```

### Dockerfile Best Practices

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Copy ONLY dependency files first
COPY requirements.txt .

# Install dependencies (cached unless requirements.txt changes)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code last (changes frequently)
COPY src/ .

RUN useradd --create-home appuser
USER appuser

EXPOSE 8080
CMD ["python", "app.py"]
```

### Reducing Image Size

```dockerfile
# Use slim/alpine base
FROM python:3.12           # 900MB
FROM python:3.12-slim      # 130MB
FROM python:3.12-alpine    # 50MB

# Combine RUN commands (fewer layers)
# BAD — 3 layers
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# GOOD — 1 layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# --no-cache-dir (pip) — don't store pip cache in image
RUN pip install --no-cache-dir -r requirements.txt
```

**.dockerignore:**
```
.git
.github
__pycache__
*.pyc
.env
node_modules
*.md
tests/
```

### Interview Questions

**Q: Why does the order of instructions in a Dockerfile matter?**

Layer caching — if you change a layer, all layers below it are invalidated and rebuilt. Instructions that change frequently (COPY source code) should go LAST. Instructions that change rarely (install dependencies) should go first to maximise cache hits.

**Q: What is a .dockerignore file and why is it important?**

Works like .gitignore — excludes files from build context. Without it, node_modules (200MB), .git, test files all sent to daemon. Benefits: faster builds, smaller images, security (don't accidentally copy .env).

---

## PART 3 — MULTI-STAGE BUILDS + DISTROLESS

### What is a Multi-Stage Build?

```
Single-stage problem:
  All build tools (gcc, pip, npm, go) stay in final image
  Image is huge + large attack surface

Multi-stage solution:
  Stage 1 (builder): has all build tools, compiles code
  Stage 2 (final): copies only the compiled output
  Build tools never reach production
```

### Your Real Example — 963MB to 10.49MB

```dockerfile
# Stage 1: Builder — has Go compiler, build tools
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY . /app

RUN go mod init chat_server

# CGO_ENABLED=0: static binary (no C library dependencies)
# GOOS=linux: target Linux
# -ldflags="-w -s": strip debug symbols and symbol table
# Result: small statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o chat_server .

# Stage 2: Final — distroless, no shell, no package manager
FROM gcr.io/distroless/static-debian12:nonroot

# Copy ONLY the compiled binary from builder stage
COPY --from=builder /app/chat_server /chat_server

EXPOSE 8080

# nonroot variant enforces non-root user automatically
USER nonroot:nonroot

ENTRYPOINT ["/chat_server"]
```

**Why each decision:**

| Decision | Why |
|---|---|
| `golang:alpine` as builder | Alpine is small — fast build |
| `CGO_ENABLED=0` | Creates static binary — no glibc needed at runtime |
| `-ldflags="-w -s"` | Strips debug info and symbol table — smaller binary |
| `distroless/static-debian12` | No shell, no package manager, minimal attack surface |
| `:nonroot` variant | Runs as non-root by default |
| `COPY --from=builder` | Only binary — no Go compiler, no source code |

**Size breakdown:**
```
Without multi-stage (ubuntu + Go):  963 MB
With multi-stage distroless:        10.49 MB
Reduction: 98.9%
```

### Distroless Images

```
Normal image contains:
  /bin/bash          ← shell (attacker's dream)
  apt, yum           ← package manager
  curl, wget         ← network tools
  = large attack surface

Distroless contains:
  Only your application binary
  Only the runtime it needs
  No shell, no package manager, no network tools

Available distroless images:
  distroless/static   → statically linked binaries (Go, Rust)
  distroless/base     → glibc dynamic binaries
  distroless/python3  → Python apps
  distroless/java17   → Java apps
  distroless/nodejs   → Node.js apps
  :nonroot = non-root variant (use this)
  :debug   = has busybox shell (debugging only)
```

### Multi-Stage for Python/Node

```dockerfile
# Python multi-stage
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY src/ .
RUN useradd --no-create-home appuser
USER appuser
CMD ["python", "app.py"]
```

```dockerfile
# Node.js multi-stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# No Node.js in final image — just nginx serving static files
```

### Hands-on: Compare sizes

```bash
# Build without multi-stage
docker build -f Dockerfile.single -t myapp:single .

# Build with multi-stage
docker build -f Dockerfile.multi -t myapp:multi .

# Compare
docker images | grep myapp

# Inspect layers
docker history myapp:single
docker history myapp:multi
```

---

## PART 4 — DOCKER NETWORKING

### Network Drivers

```
1. bridge  — default, for standalone containers
2. host    — shares host network stack
3. overlay — multi-host (Swarm/K8s)
4. none    — no networking
5. macvlan — container gets MAC address on host network
```

### Bridge Network — Most Important

```
Docker creates virtual bridge: docker0 (172.17.0.1)
Each container gets:
  - Virtual ethernet interface (veth pair)
  - IP in bridge subnet (172.17.0.x)
  - Access to other containers on same bridge

Host ─── docker0 bridge (172.17.0.1)
              ├── container1 (172.17.0.2)
              ├── container2 (172.17.0.3)
              └── container3 (172.17.0.4)

Default bridge: containers talk by IP (not name)
User-defined bridge: containers talk by NAME (DNS built-in)
```

```bash
# Default bridge — no DNS between containers
docker run -d --name web nginx
docker run -d --name api myapi
# api CANNOT reach web by name — only by IP

# User-defined bridge — DNS works
docker network create myapp-network
docker run -d --name web --network myapp-network nginx
docker run -d --name api --network myapp-network myapi
docker exec api curl http://web  # works by name!
```

### Host Network

```
Container shares host's network stack
Port 8080 in container = port 8080 on host (no -p mapping needed)
No network isolation
Linux only

docker run --network host nginx
```

### None Network

```
No network access — only loopback (127.0.0.1)
Use for: batch jobs, security isolation

docker run --network none myapp
```

### Port Mapping

```bash
-p 8080:80          # host:8080 → container:80
-p 127.0.0.1:8080:80 # localhost only
-p 80               # random host port → container:80
-P                  # all EXPOSE ports → random host ports

docker port container_name   # check mappings
```

### Interview Questions

**Q: What is the difference between Docker bridge and host networking?**

```
Bridge:
  Container has own network namespace
  Gets private IP (172.17.0.x)
  Port mapping required (-p 8080:80)
  Network isolation between containers
  DNS works on user-defined bridges

Host:
  Shares host's network namespace
  Uses host's IP directly
  No port mapping needed
  No network isolation
  Better performance (no NAT)
  Linux only
```

**Q: Two containers on the same bridge network can't communicate. What do you check?**

```
1. Are they on the SAME network?
   docker inspect container1 | grep NetworkMode

2. Default bridge or user-defined?
   Default: use IP not name
   User-defined: use service name

3. Is the target port listening?
   docker exec container2 netstat -tlnp

4. Security group blocking (if on EC2)?
```

---

## PART 5 — VOLUMES + BIND MOUNTS + TMPFS

### Three Ways to Persist Data

| | Volume | Bind Mount | tmpfs |
|---|---|---|---|
| Managed by | Docker | You | Docker (memory) |
| Location | /var/lib/docker/volumes/ | Anywhere on host | Memory only |
| Persists after container removed | Yes | Yes (host files) | No |
| Use case | Production data | Development, config | Secrets, temp files |

### Docker Volumes

```bash
# Create and use volume
docker volume create postgres-data

docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15

# Data persists even after container deleted
docker rm -f postgres
docker run -d -v postgres-data:/var/lib/postgresql/data postgres:15
# Data still there!

# Volume commands
docker volume ls
docker volume inspect postgres-data
docker volume rm postgres-data
docker volume prune    # remove all unused volumes
```

### Bind Mounts

```bash
# Host directory mounted into container
docker run -v /host/path:/container/path image
docker run -v $(pwd):/app image  # current directory

# Development workflow — live reload
docker run -d \
  -v $(pwd)/src:/app/src \    # edit on host, runs in container
  -p 8080:8080 \
  myapp:dev
```

### tmpfs

```bash
# In-memory only — not written to disk
# Data lost when container stops
docker run --tmpfs /tmp:rw,size=100m myimage

# Use for: sensitive data, high-performance temp files
```

### Interview Questions

**Q: What happens to data in a Docker container when it is deleted?**

```
Container writable layer: DELETED
Named volumes: PERSIST (must explicitly delete)
Bind mounts: host files PERSIST
tmpfs: DELETED (memory freed)

docker rm mycontainer     → layer deleted, volumes kept
docker rm -v mycontainer  → layer + anonymous volumes deleted
docker volume rm myvolume → explicitly delete named volume
```

**Q: How do you share data between two containers?**

```
Option 1: Named volume (recommended)
  docker run -v shared-data:/data container1
  docker run -v shared-data:/data container2

Option 2: Network
  Container 1 runs a server, Container 2 connects via network
```

---

## PART 6 — DOCKER COMPOSE

### Complete MERN Stack Compose

```yaml
version: '3.9'

services:

  mongodb:
    image: mongo:6
    container_name: mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongodb-data:/data/db
    networks:
      - backend
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - MONGO_URI=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/app
    ports:
      - "5000:5000"
    depends_on:
      mongodb:
        condition: service_healthy   # wait for MongoDB to be ready
    networks:
      - backend
      - frontend

  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - api
    networks:
      - frontend

volumes:
  mongodb-data:

networks:
  backend:
  frontend:
```

### Key Commands

```bash
docker compose up -d          # start all (detached)
docker compose up -d --build  # rebuild and start
docker compose down           # stop all
docker compose down -v        # stop + remove volumes
docker compose logs -f api    # follow logs for one service
docker compose exec api sh    # shell in running container
docker compose ps             # status of all services
docker compose scale api=3    # run 3 instances of api
```

### depends_on vs healthcheck

```yaml
# depends_on alone — waits for container to START only (not ready)
depends_on:
  - mongodb
# Problem: MongoDB container started but not accepting connections yet

# depends_on with condition — waits for healthcheck to pass
depends_on:
  mongodb:
    condition: service_healthy
# Waits until MongoDB passes healthcheck before starting api

healthcheck:
  test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
  interval: 10s     # run every 10s
  timeout: 5s       # fail if takes > 5s
  retries: 5        # unhealthy after 5 failures
  start_period: 30s # grace period before counting failures
```

### Environment Variables

```bash
# .env file (auto-loaded)
MONGO_PASSWORD=supersecret
NODE_ENV=production

# Override per environment
docker compose --env-file .env.staging up -d
docker compose --env-file .env.prod up -d
```

### Interview Questions

**Q: What is the difference between depends_on and healthcheck?**

```
depends_on controls ORDER — waits for container to exist
  With condition: service_healthy → waits for healthcheck

healthcheck defines HOW to check if service is actually ready

Together = proper startup ordering
Without healthcheck condition, depends_on is often not enough
(container started ≠ container ready to accept connections)
```

**Q: How do services in Docker Compose communicate?**

```
Compose creates default network for the project
All services on that network
Services communicate using SERVICE NAME as hostname

api connects to mongodb at: mongodb:27017
No need to know IP addresses
Docker provides internal DNS on user-defined networks
```

---

## PART 7 — DOCKER SECURITY

### Security Checklist

```
1. Run as non-root user
2. Use read-only filesystem
3. Drop unnecessary capabilities
4. Use minimal base images (distroless, alpine)
5. Scan images for vulnerabilities
6. Never store secrets in images
7. Set resource limits (memory, CPU)
```

### Non-Root User

```dockerfile
# BAD — runs as root
FROM python:3.12-slim
COPY app.py .
CMD ["python", "app.py"]

# GOOD — explicit non-root
FROM python:3.12-slim

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=appuser:appgroup . .

USER appuser  # switch to non-root
CMD ["python", "app.py"]
```

### Read-Only Filesystem

```bash
docker run --read-only \
  --tmpfs /tmp \        # allow writes to /tmp (memory)
  --tmpfs /var/run \    # allow writes to /var/run
  myimage

# In Compose
services:
  api:
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
```

### Drop Capabilities

```bash
# Drop all capabilities, add only what's needed
docker run \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \   # only if binding port < 1024
  myimage

# In Compose
services:
  api:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### Never Store Secrets in Images

```dockerfile
# BAD — secret in image layer history
ENV DB_PASSWORD=supersecret
ARG API_KEY=secret123

# GOOD — pass at runtime
docker run -e DB_PASSWORD=$DB_PASSWORD myimage

# BETTER — Docker secrets (Swarm)
echo "mysecretpassword" | docker secret create db_password -
```

### Image Scanning

```bash
# Trivy scan
trivy image myimage:latest

# In GitHub Actions
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myimage:latest
    exit-code: 1
    severity: HIGH,CRITICAL
```

### Complete Secure Dockerfile

```dockerfile
FROM python:3.12-slim AS builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup \
            --no-create-home --shell /bin/false appuser

WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=appuser:appgroup src/ .

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

USER 1001

EXPOSE 8080
CMD ["python", "app.py"]
```

### Interview Questions

**Q: What does running a container as root mean and why is it a risk?**

```
By default processes in containers run as root (UID 0)
If container is compromised (RCE vulnerability):
  - Attacker has root in container
  - If volume is mounted from host: can write to host files
  - If Docker socket is mounted: can escape to host

Mitigation:
  Run as non-root user (USER instruction)
  Use :nonroot distroless variant
  Set --security-opt=no-new-privileges
  Drop all capabilities, add only required ones
```

**Q: How do you prevent privilege escalation inside a container?**

```bash
docker run \
  --security-opt no-new-privileges:true \
  myimage

# Prevents:
#   setuid/setgid binaries gaining elevated privileges
#   sudo inside container from working
```

---

## PART 8 — DOCKER IN CI/CD PIPELINES

### GitHub Actions — Build, Scan, Push

```yaml
name: Docker CI/CD

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,prefix={{branch}}-
            type=ref,event=branch

      - name: Build and push (with layer cache)
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha          # use GitHub Actions cache
          cache-to: type=gha,mode=max   # save cache after build

      - name: Scan for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:main
          exit-code: 1
          severity: CRITICAL
```

### Layer Caching in CI

```
Without cache:
  Every run downloads base image + reinstalls all dependencies
  Build time: 5-10 minutes

With GitHub Actions cache:
  First run: slow (builds everything, saves layers)
  Subsequent runs: fast (cache hits on unchanged layers)
  Build time: 30-60 seconds for code-only changes

Key insight:
  Good Dockerfile layer order = more cache hits in CI
  requirements.txt rarely changes → pip install cached
  Source code changes every commit → only last layer rebuilt
```

### Jenkins Docker Pipeline

```groovy
pipeline {
    agent any

    environment {
        REGISTRY = 'your-registry'
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {
        stage('Build') {
            steps {
                sh "docker build -t ${REGISTRY}/myapp:${IMAGE_TAG} ."
            }
        }

        stage('Test') {
            steps {
                sh """
                    docker run --rm \
                      -v \$(pwd)/results:/app/results \
                      ${REGISTRY}/myapp:${IMAGE_TAG} \
                      pytest tests/ --junitxml=results/results.xml
                """
            }
            post {
                always { junit 'results/results.xml' }
            }
        }

        stage('Scan') {
            steps {
                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${REGISTRY}/myapp:${IMAGE_TAG}"
            }
        }

        stage('Push') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'registry-creds',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh "docker login -u $USER -p $PASS ${REGISTRY}"
                    sh "docker push ${REGISTRY}/myapp:${IMAGE_TAG}"
                    sh "docker tag ${REGISTRY}/myapp:${IMAGE_TAG} ${REGISTRY}/myapp:latest"
                    sh "docker push ${REGISTRY}/myapp:latest"
                }
            }
        }

        stage('Deploy') {
            steps {
                sh """
                    docker stop myapp || true
                    docker rm myapp || true
                    docker run -d \
                      --name myapp \
                      --restart unless-stopped \
                      -p 8080:8080 \
                      ${REGISTRY}/myapp:${IMAGE_TAG}
                """
            }
        }
    }

    post {
        always {
            sh "docker image prune -f"
        }
    }
}
```

### Interview Questions

**Q: How do you speed up Docker builds in CI/CD?**

```
1. Layer caching — most impactful
   Order Dockerfile: rarely changing layers first
   Use cache-from in CI to reuse previous layers

2. BuildKit (default in modern Docker)
   Parallel layer building, better cache, secret mounting

3. .dockerignore — don't send unnecessary files to daemon

4. Multi-stage builds — builder stage cached separately

5. GitHub Actions cache
   cache-from: type=gha
   cache-to: type=gha,mode=max

Result: 10min builds → 1min for code-only changes
```

**Q: How do you handle Docker image versioning?**

```
Bad: only :latest tag
  Mutable — "latest" today ≠ "latest" tomorrow
  Can't rollback — which code was in "latest" last week?

Good strategy:
  1. Git SHA tag: myimage:abc1234 (immutable, traceable)
  2. Branch+SHA: myimage:main-abc1234
  3. Also tag as latest for convenience

Pipeline:
  Build → tag with git SHA → push → test
  Tests pass → tag SHA as latest → push latest
  Deploy using SHA tag (not latest) → deterministic

Rollback:
  docker run myimage:previous-sha
```

---

## HANDS-ON EXERCISES

### Exercise 1: Compare image sizes

```bash
# Build 3 versions of the same Python app

# Version 1: Ubuntu base
cat > Dockerfile.v1 << 'EOF'
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y python3 python3-pip
COPY requirements.txt .
RUN pip3 install -r requirements.txt
COPY app.py .
CMD ["python3", "app.py"]
EOF

# Version 2: Python slim
cat > Dockerfile.v2 << 'EOF'
FROM python:3.12-slim
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
CMD ["python", "app.py"]
EOF

# Version 3: Multi-stage + non-root
cat > Dockerfile.v3 << 'EOF'
FROM python:3.12-slim AS builder
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
COPY --from=builder /install /usr/local
COPY app.py .
RUN useradd appuser && chown appuser:appuser app.py
USER appuser
CMD ["python", "app.py"]
EOF

docker build -f Dockerfile.v1 -t app:v1 .
docker build -f Dockerfile.v2 -t app:v2 .
docker build -f Dockerfile.v3 -t app:v3 .
docker images | grep "^app"
# v1: ~500MB, v2: ~150MB, v3: ~130MB
```

### Exercise 2: Networking isolation

```bash
# Create separate networks
docker network create frontend-net
docker network create backend-net

# DB on backend only
docker run -d --name db --network backend-net postgres:15

# API on both networks
docker run -d --name api --network backend-net myapi
docker network connect frontend-net api

# Frontend on frontend only
docker run -d --name web --network frontend-net nginx

# Test isolation
docker exec web curl http://api:5000   # works (same network)
docker exec web curl http://db:5432    # FAILS (different network)
docker exec api curl http://db:5432    # works (same backend network)
```

### Exercise 3: Security hardening

```bash
# Insecure
docker run -d --name insecure myapp
docker exec insecure whoami        # root
docker exec insecure id            # uid=0

# Secure
docker run -d --name secure \
  --user 1001:1001 \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 256m \
  --cpus 0.5 \
  myapp

docker exec secure whoami          # appuser
docker exec secure touch /hack     # Read-only file system ✓
docker stats secure                # check memory/cpu limits
```

---

## QUICK REFERENCE

### Dockerfile instructions:
| Instruction | Purpose |
|---|---|
| FROM | Base image |
| RUN | Execute command (creates layer) |
| COPY | Copy files from build context |
| ADD | Like COPY + extracts archives (prefer COPY) |
| WORKDIR | Set working directory |
| ENV | Set environment variable |
| ARG | Build-time variable only |
| EXPOSE | Document port (doesn't publish) |
| USER | Switch user |
| CMD | Default command (overridable) |
| ENTRYPOINT | Main command (CMD args appended) |
| HEALTHCHECK | Health check command |

### CMD vs ENTRYPOINT:
```dockerfile
# CMD only — entire command replaceable
CMD ["python", "app.py"]
docker run myimage python other.py  # replaces CMD

# ENTRYPOINT + CMD — entrypoint fixed, CMD provides default args
ENTRYPOINT ["python"]
CMD ["app.py"]
docker run myimage           # runs: python app.py
docker run myimage other.py  # runs: python other.py
```

### Common commands:
```bash
docker build -t name:tag .
docker run -d -p 8080:80 --name c1 image
docker exec -it c1 bash
docker logs -f c1
docker inspect c1
docker stats
docker system prune -a      # remove all unused objects
docker image prune          # remove unused images only
docker ps -a                # all containers including stopped
docker network ls           # list networks
docker volume ls            # list volumes
```

### Exam traps:
```
1. Layer cache busted = all subsequent layers rebuild
2. Default bridge = no DNS; user-defined bridge = DNS works
3. Volume persists after container deleted; tmpfs does not
4. depends_on alone does NOT wait for service to be ready
5. Host networking = Linux only (not Mac/Windows Docker Desktop)
6. EXPOSE does NOT publish ports — only documents them
7. ARG values visible in docker history — never use for secrets
8. --read-only + --tmpfs needed together for most apps
9. docker rm -v removes anonymous volumes, NOT named volumes
10. Distroless has no shell — use :debug variant for troubleshooting only
```
