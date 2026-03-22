# Docker Scenario-Based Interview Questions
## Basic → Intermediate → Advanced → Expert
### Every question has: Scenario → What they're testing → Answer

---

## README

**Total questions:** 55
**Format:** Real-world scenario → diagnosis → solution → prevention
**Your strongest scenarios:** Q8 (image size), Q19 (Compose ordering), Q35 (CI/CD pipeline)

### How to answer scenario questions:
1. **Diagnose first** — don't jump to solution
2. **Name the root cause** — show you understand WHY
3. **Give the fix** — specific commands, not vague answers
4. **Add prevention** — shows senior-level thinking

### Questions mapped to your experience:
| Question | Your real project |
|---|---|
| Q8 | 963MB → 10.49MB (chatbot_distrolessimage) |
| Q19 | MERN Compose (depends_on issue) |
| Q22 | Django/Flask containerisation |
| Q35 | judicialsolutions.in deploy.yaml |
| Q41 | Jenkins pipeline |

---

## SECTION 1 — BASIC (Q1–Q15)

---

**Q1. You ran `docker run nginx` but can't access nginx from your browser at localhost. What's wrong?**

What they're testing: port mapping basics

```
Root cause:
  docker run nginx → container running but port not published to host
  nginx listens on port 80 INSIDE the container
  host has no route to container port

Fix:
  docker run -p 80:80 nginx
  #          host:container

Verify:
  docker ps → should show 0.0.0.0:80->80/tcp
  curl http://localhost → nginx welcome page

Explanation:
  -p 80:80 tells Docker to set up iptables rules:
  host:80 → NAT → container:80
  Without -p, port is only accessible inside Docker network
```

---

**Q2. You pulled a Docker image but `docker run myimage` fails with "no such image". Why?**

What they're testing: image tagging and naming

```
Possible causes:

1. Wrong tag — image pulled as nginx:1.25 but running nginx
   docker images → check exact image name and tag
   Fix: docker run nginx:1.25

2. Wrong architecture — pulled amd64 image on arm64 Mac
   docker pull --platform linux/amd64 nginx

3. Image in different namespace
   Pulled as library/nginx but running as nginx
   These are the same — check docker images output

4. Typo in image name
   docker images | grep nginx  # search for actual name

Debug:
  docker images  # list all local images
  docker images --all  # include intermediate layers
```

---

**Q3. Your container starts and immediately exits. How do you find out why?**

What they're testing: basic container debugging

```
Step 1: Check exit code
  docker ps -a
  Look at STATUS column: Exited (1) = error, Exited (0) = normal completion

Step 2: Check logs
  docker logs container-name
  docker logs --tail 100 container-name  # last 100 lines

Step 3: Run interactively to debug
  docker run -it --entrypoint /bin/sh myimage:latest
  # manually run the startup command and see what happens

Step 4: Check Dockerfile CMD/ENTRYPOINT
  docker inspect myimage --format '{{.Config.Cmd}}'
  docker inspect myimage --format '{{.Config.Entrypoint}}'

Common causes:
  Exit 0:  App completed (batch job, not a daemon)
  Exit 1:  App crashed — check logs for stack trace
  Exit 127: Command not found in image
  Exit 126: Permission denied — executable not runnable
```

---

**Q4. You ran `docker stop container-name` but the container takes 30 seconds to stop. Why?**

What they're testing: signal handling and CMD vs ENTRYPOINT

```
Root cause:
  docker stop sends SIGTERM first
  waits 10 seconds (default)
  then sends SIGKILL (force kill)

Why 30 seconds?
  Grace period was increased: docker stop --time 30 container
  OR app is ignoring SIGTERM

Common cause — shell form in Dockerfile:
  CMD python app.py
  → runs as: /bin/sh -c python app.py
  → SIGTERM goes to /bin/sh, NOT to python process
  → python never receives the signal → timeout → SIGKILL

Fix — use exec form:
  CMD ["python", "app.py"]
  → runs python directly as PID 1
  → SIGTERM goes directly to python
  → python shuts down gracefully

Verify:
  docker exec container ps aux
  PID 1 should be your app, not /bin/sh
```

---

**Q5. You're trying to copy a file into a running container but `docker cp` isn't working. What else can you try?**

What they're testing: container interaction methods

```
docker cp methods:
  # Copy from host to container
  docker cp ./config.json container-name:/app/config.json

  # Copy from container to host
  docker cp container-name:/app/logs/app.log ./app.log

If docker cp fails:
  1. Container might be using read-only filesystem
     → Use volume mount instead

  2. Path doesn't exist in container
     docker exec container-name ls /app  # verify path

  3. Permissions issue
     docker exec container-name ls -la /app

Alternative approaches:
  # Mount config via volume (better practice)
  docker run -v $(pwd)/config.json:/app/config.json:ro myapp

  # Use docker exec to create file
  docker exec container-name sh -c 'echo "content" > /app/file.txt'

  # Rebuild image with file included (best practice)
  COPY config.json /app/
```

---

**Q6. You want to see the real-time resource usage of all running containers. How do you do it?**

What they're testing: monitoring basics

```bash
# Real-time stats for all containers
docker stats

# Single container
docker stats container-name

# No-stream (snapshot, good for scripting)
docker stats --no-stream

# Custom format
docker stats --format \
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Output shows:
# CPU %     → current CPU usage
# MEM USAGE → current RAM / limit
# NET I/O   → network traffic
# BLOCK I/O → disk read/write

# If container is using too much CPU:
docker update --cpus 1.5 container-name

# If container is using too much RAM:
docker update --memory 512m container-name
```

---

**Q7. You ran a container and made changes inside it. The container was deleted. How do you recover the changes?**

What they're testing: understanding of container ephemeral nature

```
Short answer: you can't — if no volume was mounted, changes are gone

Why:
  Container filesystem = image layers (read-only) + thin writable layer
  When container is deleted → writable layer is deleted
  Changes that weren't in volumes → lost forever

If container is still running (not deleted yet):
  # Option 1: Copy files out
  docker cp container-name:/app/important-file.txt ./

  # Option 2: Commit container as new image
  docker commit container-name myapp:with-changes
  # Creates a new image with the changes as a layer
  # Avoid in production — use Dockerfiles for reproducibility

Prevention:
  Mount volumes for anything important:
  docker run -v $(pwd)/data:/app/data myapp
  
  Never make critical changes inside running containers
  Always update Dockerfile and rebuild
```

---

**Q8. You have a Docker image that's 963MB. How do you reduce its size?**

What they're testing: image optimisation — your actual experience

```
Analysis — find what's large:
  docker history myimage:latest
  # Shows each layer and its size

  # Or use dive tool
  docker run --rm -it \
    -v /var/run/docker.sock:/var/run/docker.sock \
    wagoodman/dive:latest myimage:latest

Step 1: Switch to smaller base image
  FROM ubuntu        → FROM ubuntu:22.04-minimal  saves ~40MB
  FROM python:3.12   → FROM python:3.12-slim      saves ~800MB
  FROM golang:1.22   → FROM golang:1.22-alpine    saves ~500MB

Step 2: Multi-stage build (biggest win for compiled languages)
  Stage 1: compile binary (large image with all build tools)
  Stage 2: copy ONLY the binary into tiny distroless image
  
  Result: 963MB → 10.49MB (98.9% reduction — real example)

Step 3: Clean up in same RUN layer
  RUN apt-get update && \
      apt-get install -y curl && \
      rm -rf /var/lib/apt/lists/*  # clean apt cache SAME layer

Step 4: Use .dockerignore
  node_modules, .git, tests — exclude unnecessary files

Step 5: Strip debug symbols (for compiled binaries)
  go build -ldflags="-w -s"  # removes debug info and symbol table

Personal example:
  Go chatbot — single-stage ubuntu: 963MB
  Multi-stage with distroless/nonroot: 10.49MB
  Techniques: static binary, stripped symbols, distroless base
```

---

**Q9. Two containers need to communicate. Container A gets "connection refused" when trying to reach container B. What do you check?**

What they're testing: Docker networking

```
Checklist:

1. Are they on the same network?
   docker inspect container-a \
     --format '{{json .NetworkSettings.Networks}}'
   docker inspect container-b \
     --format '{{json .NetworkSettings.Networks}}'
   → Must be on same network name

2. Is container B actually listening on that port?
   docker exec container-b netstat -tlnp
   # or
   docker exec container-b ss -tlnp

3. Are they using the right address?
   # Default bridge network → must use IP address
   docker inspect container-b \
     --format '{{.NetworkSettings.IPAddress}}'
   
   # User-defined bridge → can use container name (DNS)
   docker exec container-a curl http://container-b:8080

4. Is container B's app binding to correct interface?
   App binding to 127.0.0.1:8080 → only accessible inside container
   App binding to 0.0.0.0:8080 → accessible from other containers

Fix:
  Create user-defined network:
  docker network create mynet
  docker run --network mynet --name backend mybackend
  docker run --network mynet --name frontend myfrontend
  # frontend can now reach: http://backend:8080
```

---

**Q10. You pushed a Docker image to Docker Hub but your colleague can't pull it. What are the possible issues?**

What they're testing: registry and image naming

```
1. Image is private — colleague not logged in or not a collaborator
   Fix: docker login (colleague needs to authenticate)
   Or: make repo public on Docker Hub

2. Wrong image name format
   Correct: username/imagename:tag
   docker push adityagaurav/myapp:latest
   Incorrect: docker push myapp:latest → goes to library (reserved)

3. Wrong tag
   Pushed: myapp:v1.0
   Pulling: myapp:latest → not found (latest doesn't exist)
   Fix: always tag and push both specific version AND latest

4. Platform mismatch
   You built on M1 Mac (arm64), colleague is on x86 Linux
   Fix: multi-platform build
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     --push \
     -t username/myapp:latest .

5. Rate limiting (Docker Hub free tier)
   100 pulls/6hrs for anonymous, 200 for free accounts
   Fix: docker login or use ECR/GitHub Container Registry
```

---

**Q11. You need to run the same Docker command on 50 containers. How do you do it efficiently?**

What they're testing: batch operations

```bash
# Run command on all running containers
docker ps -q | xargs -I {} docker exec {} command

# Example: check disk usage in all containers
docker ps -q | xargs -I {} docker exec {} df -h

# Example: restart all containers with specific label
docker ps -q --filter label=app=judicial | \
  xargs docker restart

# Example: stop all containers
docker stop $(docker ps -q)

# Example: remove all stopped containers
docker container prune

# More powerful: Docker Compose
# Scale and manage multiple containers together
docker compose up -d --scale backend=10

# Or use: Docker Swarm / Kubernetes for production scale
```

---

**Q12. Your Docker build fails with "no space left on device". How do you fix it?**

What they're testing: Docker maintenance

```bash
# Step 1: Check disk usage
docker system df
# Shows: images, containers, volumes, build cache

# Step 2: Clean up everything unused
docker system prune -a
# Removes: stopped containers, unused images, unused networks, build cache

# Step 3: More targeted cleanup
# Remove only stopped containers
docker container prune

# Remove dangling images (untagged)
docker image prune

# Remove all unused images (not just dangling)
docker image prune -a

# Remove unused volumes (CAREFUL — data loss!)
docker volume prune

# Remove build cache
docker builder prune

# Step 4: Identify large images
docker images --format "{{.Size}}\t{{.Repository}}:{{.Tag}}" | sort -h

# Prevention:
# Set up regular cleanup cron job
# 0 2 * * * docker system prune -f >> /var/log/docker-cleanup.log 2>&1
# Use multi-stage builds to keep images small
# Tag and push images, then remove local copies
```

---

**Q13. You want to run a container but ensure it automatically restarts if it crashes. How do you configure this?**

What they're testing: restart policies

```bash
# Restart policies:
--restart no          # never restart (default)
--restart on-failure  # restart only on non-zero exit code
--restart on-failure:3 # restart max 3 times
--restart always      # always restart (even docker daemon restart)
--restart unless-stopped # restart unless manually stopped

# Production recommendation:
docker run -d \
  --restart unless-stopped \
  --name judicial-api \
  myapp:latest

# In Compose:
services:
  api:
    image: myapp:latest
    restart: unless-stopped

# Check restart count:
docker inspect container-name \
  --format '{{.RestartCount}}'

# Note: on-failure is better than always for debugging
# always restarts even buggy containers in a loop
# on-failure:3 gives up after 3 failed attempts
```

---

**Q14. How do you run a container that cleans itself up immediately after completing a task?**

What they're testing: ephemeral containers

```bash
# --rm flag: auto-remove container when it exits
docker run --rm \
  -v $(pwd):/data \
  python:3.12-slim \
  python /data/script.py

# Container runs script, exits, and is automatically deleted
# No need to: docker rm container-name

# Common use cases:
# Run a script
docker run --rm python:3.12-slim python -c "print('hello')"

# Run database migration
docker run --rm \
  --network mynet \
  -e DB_URL=postgresql://user:pass@db:5432/myapp \
  myapp:latest python manage.py migrate

# Run one-off command
docker run --rm \
  -v $(pwd):/workspace \
  node:20-alpine \
  npm run build

# Important: --rm doesn't delete volumes
# Named volumes persist even with --rm
```

---

**Q15. You need to share environment variables between multiple `docker run` commands. How do you manage this?**

What they're testing: env var management

```bash
# Method 1: --env-file
cat > .env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
API_KEY=secret123
EOF

docker run --env-file .env myapp:latest

# Method 2: -e flag (individual vars)
docker run \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  myapp:latest

# Method 3: Pass from shell environment
export DB_HOST=localhost
docker run -e DB_HOST myapp:latest  # no = means take from shell

# Method 4: Docker Compose (best for multi-container)
# .env file auto-loaded by Compose
# Variables available via ${VAR_NAME} in compose file

# Security note:
# --env-file: file contents not visible in docker inspect
# -e flag: VALUE visible in docker inspect and ps output
# Use secrets for sensitive values in production
```

---

## SECTION 2 — INTERMEDIATE (Q16–Q35)

---

**Q16. Your Dockerfile builds successfully locally but fails in CI/CD. The error is about a missing package. Why?**

What they're testing: build reproducibility

```
Root causes:

1. Not pinning package versions
   RUN apt-get install -y curl  → might get different version in CI
   Fix: apt-get install -y curl=7.88.1-10 (pin version)

2. Base image not pinned
   FROM ubuntu:latest → different base image each build
   Fix: FROM ubuntu:22.04 (specific version)
         Or: FROM ubuntu@sha256:abc123... (digest — most reproducible)

3. pip/npm not locked
   RUN pip install flask → latest version, might break
   Fix: requirements.txt with pinned versions
        pip install flask==3.0.0

4. Network issue in CI
   Package registry unreachable from CI
   Fix: check CI network settings, use private mirror

5. Platform difference
   Local: M1 Mac (arm64), CI: Linux (amd64)
   Some packages not available for all platforms
   Fix: DOCKER_DEFAULT_PLATFORM=linux/amd64 or multi-platform build

Best practice — fully reproducible Dockerfile:
  FROM python:3.12.3-slim  # exact version
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt  # pinned versions
```

---

**Q17. You need to build Docker images for both ARM and x86 architectures. How do you do it?**

What they're testing: multi-platform builds

```bash
# Set up Docker Buildx (multi-platform builder)
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# Build and push for multiple platforms simultaneously
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t adityagaurav/myapp:latest .

# Why this matters:
# Local Mac M1/M2/M3 = arm64
# AWS Graviton instances = arm64 (cheaper, faster for some workloads)
# Standard x86 servers = amd64
# If you build only amd64 on arm64 Mac → works on x86 CI but may be slow locally

# GitHub Actions matrix for multi-platform:
jobs:
  build:
    strategy:
      matrix:
        platform: [linux/amd64, linux/arm64]
    steps:
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          platforms: ${{ matrix.platform }}
          push: true
```

---

**Q18. Your application is containerised and you need to inject different configuration for dev, staging, and prod. What's the best approach?**

What they're testing: configuration management for containers

```
Wrong approach:
  Different Dockerfiles per environment — code duplication
  Baking config into image — image not portable

Right approach — 12-factor app principle:
  Same image across all environments
  Config injected via environment variables at runtime

# Development
docker run \
  --env-file .env.dev \
  -p 3000:3000 \
  myapp:latest

# Staging
docker run \
  --env-file .env.staging \
  myapp:latest

# Production
docker run \
  -e DB_HOST=$PROD_DB_HOST \
  -e DB_PASS=$PROD_DB_PASS \
  myapp:latest

# Or with Docker Compose:
# docker-compose.yml (common config)
# docker-compose.dev.yml (dev overrides)
# docker-compose.prod.yml (prod overrides)

docker compose -f docker-compose.yml \
               -f docker-compose.prod.yml up -d

# For secrets in production:
# AWS: Secrets Manager / SSM Parameter Store
# Kubernetes: K8s Secrets
# Docker Swarm: Docker Secrets
# Never: env files with plaintext secrets in git
```

---

**Q19. Your Docker Compose application fails on startup because the backend tries to connect to the database before it's ready. How do you fix it?**

What they're testing: Compose service ordering — your MERN experience

```
The problem:
  depends_on: database → only waits for container START
  PostgreSQL/MongoDB take 2-5 seconds to be ready after starting
  Backend starts immediately → connection refused → crash

Wrong fix:
  sleep 5 in entrypoint — fragile, environment-dependent

Right fix 1: healthcheck + depends_on condition

  database:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s  # grace period before checks start

  backend:
    depends_on:
      database:
        condition: service_healthy  # wait for healthcheck

Right fix 2: retry logic in application code
  import time
  import psycopg2
  
  for attempt in range(10):
      try:
          conn = psycopg2.connect(...)
          break
      except Exception:
          time.sleep(2 ** attempt)  # exponential backoff

Best practice: BOTH — healthcheck AND app-level retry
  healthcheck handles startup ordering
  app retry handles transient failures during normal operation
```

---

**Q20. You need to update a running container's configuration without rebuilding the image. What are your options?**

What they're testing: runtime configuration management

```
Option 1: Environment variables (restart required)
  docker stop container
  docker rm container
  docker run -e NEW_CONFIG=value myimage:latest
  # Can't change env vars of running container

Option 2: Config file via volume (no restart for some apps)
  docker run -v ./config:/app/config myapp
  # Edit ./config/settings.json on host
  # App hot-reloads if it watches config file

Option 3: Docker update (resource limits only)
  docker update --memory 1g --cpus 2 container-name
  # Only works for resource constraints

Option 4: docker exec to modify inside container
  docker exec container-name \
    sed -i 's/old_value/new_value/' /app/config.json
  # Changes lost on container restart

Best practice:
  Rebuild image with new config → redeploy
  Config should be in version control
  Use ConfigMaps in Kubernetes for proper config management
```

---

**Q21. You're getting "permission denied" errors when mounting a volume. How do you debug and fix this?**

What they're testing: volume permissions

```
Scenario:
  docker run -v $(pwd)/data:/app/data myapp
  Error: Permission denied: '/app/data/output.txt'

Diagnosis:
  # Check directory permissions on host
  ls -la $(pwd)/data

  # Check what user the container runs as
  docker run --rm myapp whoami
  docker run --rm myapp id

  # Check file ownership in container
  docker exec container-name ls -la /app/data

Root causes:

1. Container runs as UID 1001, directory owned by UID 1000
   Fix option A: chmod 777 ./data (insecure)
   Fix option B: chown 1001:1001 ./data (match container UID)
   Fix option C: run container with host user UID:
     docker run --user $(id -u):$(id -g) myapp

2. SELinux on RHEL/Fedora blocks container access
   Fix: add :z or :Z flag
   docker run -v $(pwd)/data:/app/data:z myapp
   # :z = shared between containers
   # :Z = private to this container

3. macOS/Windows — Docker Desktop uses VM
   Only directories under /Users (Mac) or C:\Users (Windows) mounted by default
   Fix: add directory to Docker Desktop file sharing settings
```

---

**Q22. Your Django application runs fine locally but when containerised, it can't connect to the database. The DB is on localhost. What's wrong?**

What they're testing: networking fundamentals — your real experience

```
Root cause:
  Inside a container, localhost = the container itself
  NOT the host machine
  
  settings.py: DATABASES = {'HOST': 'localhost'}
  → Django looks for PostgreSQL inside its own container
  → Not found → connection refused

Solutions:

Solution 1: Docker Compose (recommended)
  services:
    web:
      build: .
      environment:
        - DB_HOST=database  # use service name, not localhost
    database:
      image: postgres:16
  
  settings.py: DATABASES = {'HOST': os.environ.get('DB_HOST', 'localhost')}

Solution 2: Host networking (development only)
  docker run --network host mydjango
  # Now localhost = host machine
  # But: no container isolation, bad practice

Solution 3: host-gateway (Docker 20.10+)
  docker run \
    --add-host=host.docker.internal:host-gateway \
    -e DB_HOST=host.docker.internal \
    mydjango
  # Special DNS name that resolves to host machine IP

Rule to remember:
  localhost inside container = container itself
  Use service names in Compose for inter-container communication
  Use host.docker.internal to reach host machine
```

---

**Q23. Your container is using too much memory and getting OOM killed. How do you diagnose and fix this?**

What they're testing: resource management

```
Diagnosis:

1. Check if OOM killed
  docker inspect container-name \
    --format '{{.State.OOMKilled}}'
  # true = OOM killed

2. Check exit code
  docker ps -a → Exit code 137 = SIGKILL (often OOM)

3. Check current memory usage
  docker stats container-name --no-stream

4. Check system logs
  dmesg | grep -i "killed process"

Fix options:

1. Increase memory limit
  docker run --memory 1g myapp
  # Adjust based on actual usage + buffer

2. Find memory leak in application
  docker exec container-name \
    python -c "import tracemalloc; tracemalloc.start()"
  # Profile your app

3. Set memory + swap
  docker run \
    --memory 512m \
    --memory-swap 1g \  # 512m RAM + 512m swap
    myapp

4. Alert before OOM
  docker run \
    --memory 512m \
    --memory-reservation 256m \  # soft limit — warning threshold
    myapp

In Compose:
  services:
    api:
      deploy:
        resources:
          limits:
            memory: 512M
          reservations:
            memory: 256M
```

---

**Q24. You need to run a quick one-off database backup from inside a Docker container. How do you do this?**

What they're testing: practical container operations

```bash
# PostgreSQL backup
docker exec postgres-container \
  pg_dump -U postgres mydb > backup_$(date +%Y%m%d).sql

# MySQL backup
docker exec mysql-container \
  mysqldump -u root -p$MYSQL_ROOT_PASSWORD mydb > backup.sql

# MongoDB backup
docker exec mongodb-container \
  mongodump --db mydb --out /tmp/backup
docker cp mongodb-container:/tmp/backup ./backup

# Backup entire volume
docker run --rm \
  -v myapp-data:/source:ro \
  -v $(pwd)/backup:/backup \
  alpine \
  tar czf /backup/data-$(date +%Y%m%d).tar.gz -C /source .

# Restore from backup
docker exec -i postgres-container \
  psql -U postgres mydb < backup.sql

# Schedule automatic backup (host cron):
# 0 2 * * * docker exec postgres pg_dump -U postgres mydb > /backups/db-$(date +\%Y\%m\%d).sql
```

---

**Q25. Your Docker Hub rate limit is causing CI/CD failures. How do you fix this?**

What they're testing: registry management

```
Problem:
  Docker Hub free: 100 pulls/6hr (anonymous) / 200 (authenticated)
  CI/CD runs many builds, each pulling base images
  Error: "toomanyrequests: Too Many Requests"

Solutions:

Solution 1: Log in to Docker Hub in CI (increases to 200 pulls/6hr)
  - name: Login to Docker Hub
    uses: docker/login-action@v3
    with:
      username: ${{ secrets.DOCKERHUB_USERNAME }}
      password: ${{ secrets.DOCKERHUB_TOKEN }}

Solution 2: Use a pull-through cache registry
  # Set up ECR as pull-through cache for Docker Hub
  aws ecr create-pull-through-cache-rule \
    --ecr-repository-prefix dockerhub \
    --upstream-registry-url registry-1.docker.io

  # In Dockerfile: use ECR mirror instead of Docker Hub
  FROM 123456789.dkr.ecr.ap-south-1.amazonaws.com/dockerhub/python:3.12-slim

Solution 3: Mirror base images to private registry
  docker pull python:3.12-slim
  docker tag python:3.12-slim 123456789.ecr.../python:3.12-slim
  docker push 123456789.ecr.../python:3.12-slim
  # Update Dockerfile to use private registry

Solution 4: Cache base images in CI
  - name: Cache Docker layers
    uses: actions/cache@v3
    with:
      path: /tmp/.buildx-cache
      key: ${{ runner.os }}-buildx-${{ github.sha }}
      restore-keys: ${{ runner.os }}-buildx-
```

---

**Q26. You have a Dockerfile that works but your colleague says it has security vulnerabilities. How do you find and fix them?**

What they're testing: security awareness

```bash
# Step 1: Scan with Trivy
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  myapp:latest

# Step 2: Scan Dockerfile for misconfigurations
docker run --rm \
  -v $(pwd)/Dockerfile:/Dockerfile \
  aquasec/trivy:latest config /Dockerfile

# Common vulnerabilities found:

1. Outdated base image
   Fix: update FROM python:3.12.3-slim (latest patched)

2. Running as root
   Fix: add USER nonroot before CMD

3. Secrets in image layers
   Fix: use BuildKit secrets, never ARG/ENV for secrets

4. Unnecessary packages
   Fix: apt-get install only what's needed
        rm -rf /var/lib/apt/lists/* after install

5. No healthcheck
   Fix: add HEALTHCHECK instruction

6. Using latest tag
   Fix: pin to specific version

7. Writable root filesystem
   Fix in runtime: --read-only --tmpfs /tmp

# Add scanning to CI pipeline:
- name: Scan image
  run: |
    trivy image --exit-code 1 \
      --severity CRITICAL \
      myapp:latest
  # exit-code 1 fails the build if critical CVEs found
```

---

**Q27. You're building an image in CI and want to use a private Python package. How do you do this securely without leaking credentials?**

What they're testing: BuildKit secrets

```dockerfile
# WRONG — credentials in image layer (visible in docker history)
RUN pip install \
  --extra-index-url https://user:password@pypi.company.com/ \
  my-private-pkg

# WRONG — ARG (visible in docker history)
ARG PYPI_TOKEN
RUN pip install \
  --extra-index-url https://${PYPI_TOKEN}@pypi.company.com/ \
  my-private-pkg

# RIGHT — BuildKit secret mount (never in layers)
# syntax=docker/dockerfile:1
FROM python:3.12-slim

RUN --mount=type=secret,id=pypi_token \
    pip install \
    --extra-index-url \
    https://$(cat /run/secrets/pypi_token)@pypi.company.com/ \
    my-private-pkg

# Build:
echo "mytoken123" > ./pypi_token.txt
docker build \
  --secret id=pypi_token,src=./pypi_token.txt \
  .

# In GitHub Actions:
- name: Build
  run: |
    echo "${{ secrets.PYPI_TOKEN }}" > /tmp/pypi_token
    docker build \
      --secret id=pypi_token,src=/tmp/pypi_token \
      .
    rm /tmp/pypi_token

# Verify secret is NOT in image:
docker history myapp:latest  # no token visible
docker run myapp cat /run/secrets/pypi_token  # file doesn't exist in final image
```

---

**Q28. Your Compose application works locally but fails in staging with "network not found". Why?**

What they're testing: Compose networking in different environments

```
Root cause:
  Compose creates a network named: <project-name>_default
  Project name = directory name by default
  
  Local: directory is 'myapp' → network is 'myapp_default'
  Staging: directory is 'app' → network is 'app_default'
  
  If one service references the network explicitly:
  networks:
    - myapp_default  ← hardcoded, breaks in staging

Fixes:

Fix 1: Use relative network references (not hardcoded names)
  services:
    frontend:
      networks:
        - backend_net  # refers to network defined in this compose file
  networks:
    backend_net:      # defined here — name resolves correctly anywhere

Fix 2: Set project name explicitly
  docker compose -p judicial up -d
  # OR set in compose file:
  # docker-compose.yml top level:
  name: judicial
  # Network will always be judicial_default regardless of directory

Fix 3: Use external networks (connect to pre-existing network)
  networks:
    shared_net:
      external: true
      name: judicial_shared  # exact name, must exist

Prevention:
  Never hardcode network names
  Always define networks in the compose file
  Set explicit project names in CI/CD
```

---

**Q29. You need to run database migrations before your application starts in Docker Compose. How do you implement this?**

What they're testing: init containers pattern

```yaml
services:
  database:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  # Migration service — runs and exits
  migrate:
    build: .
    command: python manage.py migrate
    environment:
      - DB_HOST=database
    depends_on:
      database:
        condition: service_healthy
    restart: on-failure:3  # retry up to 3 times if migration fails

  # App service — waits for migration
  web:
    build: .
    command: python manage.py runserver 0.0.0.0:8000
    depends_on:
      migrate:
        condition: service_completed_successfully  # migration must finish
      database:
        condition: service_healthy
    ports:
      - "8000:8000"
```

```bash
# Run migrations then app
docker compose run --rm migrate  # run migration, remove container
docker compose up -d web         # start app

# Or all at once (Compose handles ordering):
docker compose up -d
```

---

**Q30. Your Docker image build takes 15 minutes. How do you optimise it to under 2 minutes?**

What they're testing: build performance optimisation

```
Step 1: Measure where time is spent
  docker build . 2>&1 | grep -E "Step|CACHED|---"
  # Identify which steps are NOT cached

Step 2: Fix layer ordering (usually biggest win)
  BEFORE (10 min):                AFTER (30 sec warm):
  COPY . /app                     COPY requirements.txt .
  RUN pip install -r req.txt      RUN pip install -r requirements.txt
                                  COPY . /app
  # Code change busts pip cache   # Code change doesn't bust pip cache

Step 3: Enable BuildKit
  export DOCKER_BUILDKIT=1
  # Parallel build steps, better caching

Step 4: Use registry cache in CI
  docker buildx build \
    --cache-from type=registry,ref=myapp:cache \
    --cache-to type=registry,ref=myapp:cache,mode=max \
    .
  # CI pulls cached layers from last successful build

Step 5: Use smaller base image
  python:3.12 → python:3.12-slim
  Less to download + fewer packages to update

Step 6: .dockerignore
  Exclude: node_modules, .git, tests, docs
  Smaller build context = faster transfer to daemon

Step 7: Multi-stage with targeted COPY
  COPY --from=builder /app/dist /app/dist  # copy only built assets
  # Not entire builder image
  
Result:
  Cold build: 15 min → 3 min (better base image + layer ordering)
  Warm build (cached layers): 3 min → 20 seconds
```

---

**Q31. How do you handle container logs at scale? All containers are writing to stdout/stderr.**

What they're testing: logging architecture

```
Docker logging drivers:

Default: json-file
  Stored at: /var/lib/docker/containers/<id>/<id>-json.log
  Problem: fills disk, no central search, lost when container deleted

Production solutions:

Option 1: Fluentd/Fluentbit sidecar → Elasticsearch
  docker run \
    --log-driver fluentd \
    --log-opt fluentd-address=localhost:24224 \
    myapp:latest

Option 2: AWS CloudWatch Logs driver
  docker run \
    --log-driver=awslogs \
    --log-opt awslogs-group=/judicial/production \
    --log-opt awslogs-region=ap-south-1 \
    --log-opt awslogs-stream=api-container \
    myapp:latest

Option 3: Splunk driver
  docker run \
    --log-driver=splunk \
    --log-opt splunk-token=<token> \
    --log-opt splunk-url=https://splunk.company.com \
    myapp:latest

Option 4: ELK Stack with Filebeat
  # Filebeat reads Docker log files and ships to Elasticsearch
  # /var/lib/docker/containers/*/*-json.log

In Compose:
  services:
    api:
      image: myapp:latest
      logging:
        driver: awslogs
        options:
          awslogs-group: /judicial/prod
          awslogs-region: ap-south-1

Best practices:
  Structured logging (JSON): easier to parse and search
  Include: timestamp, level, service name, request ID, user ID
  Never log secrets
  Set log rotation to prevent disk fill:
    --log-opt max-size=100m --log-opt max-file=5
```

---

**Q32. You need to run a privileged operation inside a container (e.g., mount a filesystem). How do you approach this safely?**

What they're testing: security + capabilities

```
Never use: docker run --privileged (gives ALL capabilities + access to host devices)
  → Container can modify host kernel, access host devices
  → Essentially root access to host machine
  → Security disaster

Instead: add only the specific capability needed

# Mount a filesystem (needs SYS_ADMIN)
docker run \
  --cap-add SYS_ADMIN \
  --security-opt apparmor:unconfined \
  myapp:latest

# Bind to port 80 (needs NET_BIND_SERVICE)
docker run \
  --cap-add NET_BIND_SERVICE \
  myapp:latest

# Available capabilities:
# NET_BIND_SERVICE  - bind to ports < 1024
# SYS_ADMIN        - wide admin (avoid if possible)
# SYS_PTRACE       - debugging (never in production)
# NET_RAW          - raw sockets
# CHOWN            - change ownership
# SETUID/SETGID    - change uid/gid

# Best practice:
docker run \
  --cap-drop ALL \          # drop everything first
  --cap-add NET_BIND_SERVICE \  # add only what's needed
  myapp:latest

# Check what capabilities your container actually uses:
docker run --rm myapp capsh --print
```

---

**Q33. Your application team reports that sometimes containers in the same Compose project can't reach each other. It works 80% of the time. How do you debug this intermittent issue?**

What they're testing: advanced networking debugging

```
Intermittent = timing or DNS issue

Step 1: Check DNS resolution
  docker exec frontend nslookup backend
  docker exec frontend ping backend
  # If intermittent DNS failure → known Docker DNS bug
  # Fix: use IP addresses OR restart Docker daemon

Step 2: Check if containers are on same network consistently
  docker network inspect <project>_default
  # Check Containers section — are both always listed?

Step 3: Check for container restarts
  docker ps → look at CREATED and STATUS
  docker inspect backend --format '{{.RestartCount}}'
  # If backend restarts, IP might change
  # Compose DNS handles this, but there's a brief window

Step 4: Add retry logic to frontend
  # Transient connection failures are normal in distributed systems
  # Frontend should retry with backoff

Step 5: Check Docker daemon logs
  journalctl -u docker.service -n 100

Common fixes:
  1. Set --dns-search option on containers
  2. Add --dns 8.8.8.8 if custom DNS issues
  3. Rebuild the network: docker compose down && docker compose up
  4. Update Docker (DNS bugs fixed in newer versions)
  5. Add depends_on with healthcheck to ensure ordering
```

---

**Q34. You need to implement health checking for a container that doesn't have curl or wget installed. How?**

What they're testing: healthcheck alternatives

```dockerfile
# Option 1: Use the process itself
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Option 2: TCP check (no HTTP needed)
HEALTHCHECK --interval=30s --timeout=3s \
  CMD python -c "import socket; s=socket.socket(); s.connect(('localhost', 8080)); s.close()"

# Option 3: File-based check (app writes heartbeat file)
HEALTHCHECK --interval=30s --timeout=3s \
  CMD test -f /tmp/healthy && test $(( $(date +%s) - $(stat -c %Y /tmp/healthy) )) -lt 60

# In app code:
import time
import threading
def write_heartbeat():
    while True:
        with open('/tmp/healthy', 'w') as f:
            f.write('ok')
        time.sleep(30)
threading.Thread(target=write_heartbeat, daemon=True).start()

# Option 4: Add minimal tool via multi-stage
FROM gcr.io/distroless/python3:nonroot AS final
COPY --from=alpine /usr/bin/wget /usr/bin/wget  # borrow wget from alpine

# Option 5: Shell script in image
COPY healthcheck.sh /healthcheck.sh
HEALTHCHECK CMD ["/healthcheck.sh"]
```

---

**Q35. Your GitHub Actions Docker build is very slow — each run takes 12 minutes even for a small code change. Optimise it.**

What they're testing: CI/CD Docker optimisation — your real experience

```yaml
# BEFORE: no caching, full rebuild every time
- name: Build
  run: docker build -t myapp:latest .
# Time: 12 minutes (downloads base image, installs deps every run)

# AFTER: GitHub Actions cache + BuildKit

- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    context: .
    push: false
    tags: myapp:${{ github.sha }}
    cache-from: type=gha        # read from GitHub cache
    cache-to: type=gha,mode=max # write to GitHub cache
    load: true

# First run: 12 min (builds everything, writes cache)
# Subsequent runs with same deps: 45 seconds (only code layer rebuilds)
# Code-only change: 15 seconds

# Additional optimisations:
# 1. Fix Dockerfile layer ordering
#    COPY requirements.txt before COPY . .
#
# 2. Use smaller base image
#    python:3.12 (1GB) → python:3.12-slim (130MB)
#
# 3. Parallelise test and build
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: pytest tests/          # tests in parallel with build

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5
        # ... build steps

  deploy:
    needs: [test, build]            # wait for both
    steps:
      - run: deploy...
```

---

## SECTION 3 — ADVANCED (Q36–Q50)

---

**Q36. You discover that containers in your environment can communicate with each other even though they should be isolated. How do you fix this?**

What they're testing: network isolation

```
Root cause:
  All containers on default bridge network can communicate
  Default bridge: no isolation between unrelated containers

Fix 1: Custom networks per application
  docker network create judicial-network
  docker run --network judicial-network judicial-api
  docker run --network judicial-network judicial-frontend

  # Other containers NOT on judicial-network → cannot communicate
  # Even on same host

Fix 2: Internal networks (no internet access)
  docker network create \
    --internal \          # no external connectivity
    secure-db-network

  # Only containers on secure-db-network can reach DB
  # DB cannot access internet

Fix 3: Compose network isolation
  services:
    frontend:
      networks: [public]    # only public network
    backend:
      networks: [public, private]  # both networks
    database:
      networks: [private]   # only private network

  networks:
    public:     # frontend ↔ backend
    private:    # backend ↔ database (frontend can't reach DB)

Fix 4: Disable inter-container communication
  # Docker daemon setting (affects ALL containers)
  dockerd --icc=false
  # Now containers on default bridge cannot communicate
```

---

**Q37. How do you do a zero-downtime deployment using Docker without Kubernetes?**

What they're testing: deployment strategies

```
Option 1: Docker Compose rolling update (manual)
  # Build new image
  docker build -t myapp:v2 .
  
  # Scale up new version
  docker compose up -d --scale web=4  # 2 old + 2 new
  
  # Health check new containers
  docker compose ps
  
  # Scale down old version
  docker compose up -d --scale web=2  # remove 2 oldest

Option 2: Blue-Green with nginx proxy
  # Run two versions simultaneously
  docker run -d --name blue --network app-net myapp:v1
  docker run -d --name green --network app-net myapp:v2
  
  # nginx config points to blue
  # Test green thoroughly
  # Switch nginx to point to green
  docker exec nginx nginx -s reload
  
  # Keep blue running for quick rollback
  # Stop blue after confidence period
  docker stop blue

Option 3: Watchtower (automatic update)
  docker run -d \
    --name watchtower \
    -v /var/run/docker.sock:/var/run/docker.sock \
    containrrr/watchtower \
    --interval 30 \        # check every 30 seconds
    --cleanup \            # remove old images
    judicial-api           # specific container to watch

  # Watchtower polls registry, pulls new image, restarts container
  # Brief downtime during restart (~2-3 seconds)
  # Not truly zero-downtime without multiple replicas

Option 4: Traefik reverse proxy (zero-downtime)
  # Traefik detects new container, waits for health check
  # Routes traffic to new container, drains old one
  # Truly zero-downtime
```

---

**Q38. You need to run Docker inside a Docker container (Docker-in-Docker). When is this appropriate and how do you implement it safely?**

What they're testing: DinD patterns

```
Use case: CI/CD agents that need to build Docker images

Option 1: Docker-in-Docker (DinD) — separate daemon inside container
  docker run \
    --privileged \          # REQUIRED for DinD — security risk
    docker:dind
  # Starts full Docker daemon inside container
  # Risk: --privileged gives nearly root access to host

Option 2: Docker socket mount (recommended)
  docker run \
    -v /var/run/docker.sock:/var/run/docker.sock \
    docker:latest \
    docker ps
  # Container uses HOST's Docker daemon
  # No --privileged needed
  # Security risk: container can control all containers on host

Option 3: Rootless Docker (most secure)
  # Run Docker daemon as non-root
  # More complex setup but no privilege escalation

Option 4: Kaniko (best for CI — no Docker daemon)
  # Builds Docker images without Docker daemon
  # Runs as non-privileged container
  # Used in Kubernetes CI pipelines

  docker run \
    -v $(pwd):/workspace \
    gcr.io/kaniko-project/executor:latest \
    --context dir:///workspace \
    --destination myregistry/myapp:latest \
    --dockerfile /workspace/Dockerfile

In GitHub Actions: use docker buildx directly
  # GitHub Actions runners have Docker pre-installed
  # No DinD needed — just use docker build commands
```

---

**Q39. Your multi-stage build is not using cache effectively in CI. Each CI run rebuilds from scratch. How do you fix it?**

What they're testing: advanced build caching

```
Problem:
  Multi-stage builds have multiple FROM instructions
  Cache invalidated at each stage independently
  CI has no cache from previous run

Fix 1: Registry cache (most reliable)
  docker buildx build \
    --cache-from type=registry,ref=myregistry/myapp:cache \
    --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
    --target production \
    .

  # mode=max: caches ALL intermediate stages, not just final
  # Works across different CI runners

Fix 2: GitHub Actions cache
  - uses: docker/build-push-action@v5
    with:
      cache-from: type=gha
      cache-to: type=gha,mode=max

Fix 3: Explicitly cache intermediate stages
  # Build and push builder stage as separate image
  docker build \
    --target builder \
    --cache-from myapp:builder-cache \
    -t myapp:builder-cache .
  docker push myapp:builder-cache

  # Use cached builder in final build
  docker build \
    --cache-from myapp:builder-cache \
    --cache-from myapp:final-cache \
    -t myapp:final-cache .

Fix 4: Separate Dockerfile for dependencies
  # Dockerfile.deps (rarely changes)
  FROM python:3.12-slim
  COPY requirements.txt .
  RUN pip install -r requirements.txt

  # Build and cache deps image
  docker build -f Dockerfile.deps -t myapp:deps .
  
  # Main Dockerfile uses cached deps image
  FROM myapp:deps
  COPY . /app
  CMD [...]
```

---

**Q40. Implement a Docker healthcheck that verifies not just HTTP 200 but also checks that the database connection is working.**

What they're testing: advanced healthcheck implementation

```dockerfile
# healthcheck.sh
#!/bin/sh
set -e

# Check HTTP endpoint
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
  http://localhost:8080/health || echo "000")

if [ "$HTTP_STATUS" != "200" ]; then
  echo "HTTP check failed: $HTTP_STATUS"
  exit 1
fi

# Check database connectivity
python3 -c "
import psycopg2
import os
import sys

try:
    conn = psycopg2.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        database=os.environ.get('DB_NAME', 'myapp'),
        user=os.environ.get('DB_USER', 'postgres'),
        password=os.environ.get('DB_PASS', ''),
        connect_timeout=3
    )
    conn.close()
    print('DB connection OK')
except Exception as e:
    print(f'DB check failed: {e}', file=sys.stderr)
    sys.exit(1)
"

echo "All health checks passed"
exit 0
```

```dockerfile
FROM python:3.12-slim

# Install health check dependencies
RUN pip install psycopg2-binary requests

COPY healthcheck.sh /healthcheck.sh
RUN chmod +x /healthcheck.sh

HEALTHCHECK \
  --interval=30s \
  --timeout=10s \
  --start-period=60s \
  --retries=3 \
  CMD ["/healthcheck.sh"]

COPY . /app
WORKDIR /app
USER nobody
CMD ["python", "app.py"]
```

---

**Q41. Your Jenkins pipeline builds a Docker image and pushes to ECR. Sometimes the push fails with authentication errors mid-pipeline. How do you fix this?**

What they're testing: ECR authentication — your real experience

```groovy
// Problem: ECR token expires after 12 hours
// If pipeline runs for > 12 hours, token expires mid-push
// Or: multiple parallel pipelines all need fresh tokens

// Fix 1: Refresh token before each push
pipeline {
    stages {
        stage('Build') {
            steps {
                sh 'docker build -t $IMAGE .'
            }
        }
        
        stage('Push') {
            steps {
                // Always get fresh token before push
                sh '''
                    aws ecr get-login-password \
                      --region ap-south-1 | \
                    docker login \
                      --username AWS \
                      --password-stdin \
                      $REGISTRY
                    
                    docker push $IMAGE
                '''
            }
        }
    }
}

// Fix 2: Use aws-credentials Jenkins plugin
// Handles credential refresh automatically

// Fix 3: ECR credential helper (auto-refreshes)
// Install on Jenkins agent:
// apt-get install amazon-ecr-credential-helper

// ~/.docker/config.json on Jenkins agent:
{
  "credHelpers": {
    "123456789.dkr.ecr.ap-south-1.amazonaws.com": "ecr-login"
  }
}
// Now docker push handles auth automatically — no manual login needed

// Fix 4: GitHub Actions — use AWS action
- name: Login to ECR
  uses: aws-actions/amazon-ecr-login@v2
  # Handles token refresh automatically
```

---

**Q42. You need to implement secret rotation for a containerised application without restarting the container. How?**

What they're testing: secrets management patterns

```
Challenge:
  Container reads secret at startup from env var
  Secret rotated in Secrets Manager
  Container still uses old secret until restarted
  → downtime if restart required

Solution 1: Application reads secret dynamically (no restart)
  # Don't read secret at startup — read per request or per interval
  
  import boto3
  import time
  
  _secret_cache = {'value': None, 'expires': 0}
  
  def get_secret():
      if time.time() > _secret_cache['expires']:
          client = boto3.client('secretsmanager')
          _secret_cache['value'] = client.get_secret_value(
              SecretId='prod/db/password'
          )['SecretString']
          _secret_cache['expires'] = time.time() + 300  # cache 5 min
      return _secret_cache['value']

Solution 2: Volume-mounted secrets (Kubernetes/Docker Swarm)
  # Secret written to file in container
  # Application reads file on each use
  # File updated by secret manager without restart

Solution 3: AWS Secrets Manager + Lambda rotation
  # Rotation Lambda updates secret
  # App checks secret version on each DB connection
  # Uses dual credentials during rotation window

Solution 4: Sidecar container refreshes secret
  # Sidecar polls Secrets Manager
  # Writes to shared volume
  # Main container reads from shared volume
```

---

**Q43. How do you debug a container that's consuming 100% CPU but you can't reproduce it locally?**

What they're testing: production debugging

```bash
# Step 1: Identify which container and process
docker stats --no-stream
top -b -n 1 | head -20

# Step 2: Get PID inside the container
docker exec high-cpu-container top -b -n 1

# Step 3: CPU profiling without stopping
# Python:
docker exec container-id \
  python -m cProfile -o /tmp/profile.out app.py
docker cp container-id:/tmp/profile.out .
python -m pstats profile.out

# Step 4: Attach strace to container process
PID=$(docker inspect container-id --format '{{.State.Pid}}')
strace -p $PID -c  # summary of syscalls

# Step 5: perf for deep profiling
docker run \
  --cap-add SYS_ADMIN \
  --pid=host \
  --privileged \
  brendangregg/perf-tools \
  perf top -p $PID

# Step 6: Thread dump (for Java)
docker exec container-id kill -3 1
docker logs container-id | tail -100  # thread dump in logs

# Step 7: Add verbose logging temporarily
docker exec container-id \
  kill -USR1 1  # if app handles SIGUSR1 for debug mode toggle

# Prevention:
# Set CPU limits: docker run --cpus 1.0
# Monitor with CloudWatch/Prometheus
# Add CPU alerts
```

---

**Q44. Your containerised microservices need to communicate securely with mutual TLS. How do you implement this?**

What they're testing: service-to-service security

```
mTLS: both client and server verify each other's certificates

Option 1: Sidecar proxy (Envoy/Istio) — production approach
  Each service gets a sidecar proxy
  Proxy handles TLS — app code doesn't change
  Used in service mesh architectures

Option 2: Manual mTLS in Docker Compose
  # Generate certificates
  openssl genrsa -out ca.key 4096
  openssl req -new -x509 -key ca.key -out ca.crt -days 365

  # Service certificate
  openssl genrsa -out service.key 2048
  openssl req -new -key service.key -out service.csr
  openssl x509 -req -in service.csr \
    -CA ca.crt -CAkey ca.key \
    -out service.crt -days 365

  # Mount certs into containers
  services:
    api:
      volumes:
        - ./certs/api.crt:/app/certs/server.crt:ro
        - ./certs/api.key:/app/certs/server.key:ro
        - ./certs/ca.crt:/app/certs/ca.crt:ro
      environment:
        - TLS_CERT=/app/certs/server.crt
        - TLS_KEY=/app/certs/server.key
        - TLS_CA=/app/certs/ca.crt

Option 3: AWS service mesh (App Mesh)
  Manages certificates via AWS Certificate Manager
  Auto-rotation
  Works with ECS/EKS containers
```

---

**Q45. How do you implement a Docker-based development environment that exactly matches production?**

What they're testing: dev/prod parity

```yaml
# docker-compose.dev.yml — development
version: '3.8'
services:
  api:
    build:
      context: .
      target: development    # multi-stage target
    volumes:
      - .:/app               # live code reload
      - /app/node_modules    # anonymous volume (don't override node_modules)
    environment:
      - DEBUG=true
      - LOG_LEVEL=debug
    command: python -m debugpy --listen 0.0.0.0:5678 -m uvicorn app:app --reload
    ports:
      - "8080:8080"
      - "5678:5678"          # debugger port

# Dockerfile — multi-stage with development target
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM base AS development
RUN pip install debugpy pytest watchdog  # dev-only tools
COPY . .
CMD ["python", "-m", "uvicorn", "app:app", "--reload"]

FROM base AS production           # no dev tools
COPY --chown=nobody . .
USER nobody
CMD ["python", "-m", "uvicorn", "app:app"]

# Benefits:
# Same base image in dev and prod
# Same OS, same Python version, same dependencies
# No "works on my machine" issues
# Dev has extra tools (debugger, hot reload)
# Prod is minimal (no dev tools = smaller, more secure)
```

---

## SECTION 4 — EXPERT SCENARIOS (Q46–Q55)

---

**Q46. You suspect a container was compromised. What steps do you take?**

What they're testing: incident response

```
IMMEDIATE ACTIONS (do not stop container yet):

Step 1: Isolate the container (block network, keep running)
  docker network disconnect all-networks compromised-container
  # Prevents lateral movement while preserving evidence

Step 2: Capture state for forensics
  # Container filesystem snapshot
  docker export compromised-container > container-snapshot.tar
  
  # Running processes
  docker exec compromised-container ps auxf > processes.txt
  
  # Network connections
  docker exec compromised-container netstat -anp > connections.txt
  
  # Environment variables (may reveal exfiltrated secrets)
  docker inspect compromised-container \
    --format '{{json .Config.Env}}' > env-vars.txt
  
  # Recent file changes
  docker exec compromised-container \
    find / -newer /proc/1 -type f 2>/dev/null > changed-files.txt

Step 3: Preserve logs
  docker logs compromised-container > container-logs.txt
  
  # Also check CloudTrail, VPC Flow Logs, CloudWatch

Step 4: Stop and quarantine
  docker stop compromised-container
  docker rename compromised-container compromised-container-quarantine
  # Don't delete yet — evidence

Step 5: Assess blast radius
  What data could have been accessed?
  What other containers/services could be reached?
  Were secrets exposed?

Step 6: Clean up
  Rebuild image from scratch (don't reuse)
  Rotate all secrets the container had access to
  Review and harden Dockerfile (non-root, read-only fs, dropped caps)
```

---

**Q47. Your Docker Compose file has grown to 500 lines and is unmanageable. How do you refactor it?**

What they're testing: Compose at scale

```yaml
# Instead of one huge file, use extends and multiple files

# services/api.yml
version: '3.8'
services:
  api:
    image: judicial-api:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
    restart: unless-stopped

# services/database.yml
version: '3.8'
services:
  database:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]

# environments/prod.yml
version: '3.8'
services:
  api:
    environment:
      - ENV=production
      - LOG_LEVEL=warn
    deploy:
      resources:
        limits:
          memory: 1g

# Run with multiple files:
docker compose \
  -f services/api.yml \
  -f services/database.yml \
  -f environments/prod.yml \
  up -d

# Or use COMPOSE_FILE environment variable:
export COMPOSE_FILE=services/api.yml:services/database.yml:environments/prod.yml
docker compose up -d

# Better long-term: move to Kubernetes
# Compose is designed for single-host, single-developer
# 500 lines = you've outgrown Compose → use Helm charts
```

---

**Q48. How do you implement distributed tracing across multiple Docker containers?**

What they're testing: observability

```yaml
# Add OpenTelemetry collector as a sidecar
services:
  api:
    image: judicial-api:latest
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
      - OTEL_SERVICE_NAME=judicial-api
      - OTEL_TRACES_EXPORTER=otlp

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-config.yml:/etc/otel/config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
```

```python
# In your application code
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
exporter = OTLPSpanExporter()
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)

def lambda_handler(event, context):
    with tracer.start_as_current_span("process-request") as span:
        span.set_attribute("user.id", event.get("userId"))
        result = process(event)
        return result
# Trace propagates across all containers automatically
```

---

**Q49. Design a Docker setup for a Python application that needs GPU access for machine learning inference.**

What they're testing: specialised Docker configurations

```dockerfile
# Use NVIDIA CUDA base image
FROM nvidia/cuda:12.3.0-runtime-ubuntu22.04

# Install Python and ML dependencies
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip install torch torchvision \
    --index-url https://download.pytorch.org/whl/cu121

COPY model/ /app/model/
COPY app.py /app/

WORKDIR /app
USER nobody
CMD ["python", "app.py"]
```

```bash
# Run with GPU access (requires nvidia-container-toolkit on host)
docker run \
  --gpus all \              # expose all GPUs
  --gpus '"device=0"' \     # specific GPU
  --runtime nvidia \         # use NVIDIA runtime
  -p 8080:8080 \
  ml-inference:latest

# In Compose:
services:
  inference:
    image: ml-inference:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

# Verify GPU is visible:
docker run --gpus all nvidia/cuda:12.3.0-runtime-ubuntu22.04 \
  nvidia-smi

# Check GPU utilisation:
docker exec container-id nvidia-smi
docker stats container-id  # shows GPU usage too
```

---

**Q50. Your company requires all Docker images to be signed before deployment. How do you implement image signing?**

What they're testing: supply chain security

```bash
# Docker Content Trust (DCT) — built-in signing
export DOCKER_CONTENT_TRUST=1

# Sign and push (generates signing keys automatically)
docker push judicial/api:v1.0
# → prompts for passphrase
# → signs image with your private key
# → pushes signature to Notary server

# Verify on pull
docker pull judicial/api:v1.0
# → fails if signature not found or invalid

# Cosign (modern approach — used by Sigstore)
# Install cosign
brew install cosign

# Generate keypair
cosign generate-key-pair

# Sign image after push
cosign sign \
  --key cosign.key \
  123456789.dkr.ecr.ap-south-1.amazonaws.com/judicial-api:v1.0

# Verify
cosign verify \
  --key cosign.pub \
  123456789.dkr.ecr.ap-south-1.amazonaws.com/judicial-api:v1.0

# In CI/CD pipeline:
- name: Sign image
  run: |
    cosign sign \
      --key env://COSIGN_PRIVATE_KEY \
      ${{ env.IMAGE }}:${{ github.sha }}
  env:
    COSIGN_PRIVATE_KEY: ${{ secrets.COSIGN_PRIVATE_KEY }}
    COSIGN_PASSWORD: ${{ secrets.COSIGN_PASSWORD }}

# In deployment pipeline — verify before deploying:
- name: Verify image signature
  run: |
    cosign verify \
      --key cosign.pub \
      ${{ env.IMAGE }}:${{ github.sha }}
    # Fails if not signed → blocks deployment
```

---

**Q51. How do you handle a situation where a Docker container needs access to host GPU, audio, or display?**

What they're testing: device access

```bash
# GPU access (covered in Q49)
docker run --gpus all myapp

# Display (run GUI apps in container)
# X11 forwarding:
docker run \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -u $(id -u):$(id -g) \
  ubuntu:22.04 xclock

# Audio:
docker run \
  --device /dev/snd \
  -e PULSE_SERVER=unix:/run/user/1000/pulse/native \
  -v /run/user/1000/pulse:/run/user/1000/pulse \
  ubuntu:22.04 aplay sound.wav

# USB device:
docker run \
  --device /dev/ttyUSB0:/dev/ttyUSB0 \
  myapp

# All block devices (dangerous — avoid):
docker run --device /dev/sda myapp

# Specific device with permissions:
docker run \
  --device-cgroup-rule "c 189:* rmw" \  # USB devices
  myapp
```

---

**Q52. Your Docker daemon itself is consuming too much disk space. How do you diagnose and manage this?**

What they're testing: Docker storage management

```bash
# Step 1: Analyze Docker disk usage
docker system df
# Output:
# TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
# Images          47        12        15.2GB    8.3GB
# Containers      23        8         1.2GB     1.1GB
# Local Volumes   15        8         5.4GB     2.1GB
# Build Cache     -         -         3.2GB     3.2GB

# Step 2: Detailed image analysis
docker image ls --format "{{.Size}}\t{{.Repository}}:{{.Tag}}" | sort -h -r

# Step 3: Find dangling images (untagged intermediates)
docker image ls --filter dangling=true

# Step 4: Graduated cleanup

# Safe: remove only stopped containers and dangling images
docker system prune

# More aggressive: remove all unused images
docker system prune -a

# Nuclear: remove everything including volumes (DATA LOSS!)
docker system prune -a --volumes

# Step 5: Configure log rotation (prevent log files filling disk)
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  }
}

# Step 6: Move Docker data directory to larger disk
# /etc/docker/daemon.json
{
  "data-root": "/mnt/large-disk/docker"
}

# Step 7: Automate cleanup
# Cron job (2am daily):
0 2 * * * docker system prune -f --filter "until=24h" >> /var/log/docker-prune.log 2>&1
```

---

**Q53. How do you implement rolling updates for a stateful service (like a database) in Docker?**

What they're testing: stateful container management

```
Challenge:
  Stateful services (DB, cache, message queue) can't just be killed and replaced
  Data must be preserved, connections must be drained

Strategy 1: Primary-Replica pattern
  # Current: primary running
  # Step 1: Add replica
  docker run -d \
    --name postgres-replica \
    -e POSTGRES_REPLICATE_FROM=postgres-primary \
    postgres:16
  
  # Step 2: Wait for replica to sync
  # Step 3: Promote replica to primary
  # Step 4: Remove old primary
  
  # Downtime: near zero (brief failover window)

Strategy 2: Backup-restore upgrade
  # Step 1: Backup current data
  docker exec postgres pg_dump > backup.sql
  
  # Step 2: Stop old container (brief downtime)
  docker stop postgres
  
  # Step 3: Start new version with same volume
  docker run -d \
    --name postgres-new \
    -v postgres-data:/var/lib/postgresql/data \  # same data volume
    postgres:17  # upgraded version
  
  # Step 4: Restore if needed (usually data migrates automatically)
  # Downtime: 30-60 seconds

Strategy 3: Blue-Green for stateless + external DB
  App containers: blue-green, zero downtime
  Database: external (RDS, managed service) — not containerised
  This is the production-recommended approach
  Never run critical databases in containers without proper HA setup
```

---

**Q54. Write a complete Dockerfile for a production-grade FastAPI application following all security best practices.**

What they're testing: comprehensive Dockerfile knowledge

```dockerfile
# syntax=docker/dockerfile:1

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app

# Install build dependencies (needed only for compiling packages)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (cached unless requirements change)
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM python:3.12-slim AS production

# Security: create non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd \
        --uid 1001 \
        --gid appgroup \
        --no-create-home \
        --shell /bin/false \
        appuser

WORKDIR /app

# Install only runtime dependencies (not build tools)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \        # PostgreSQL client library (runtime only)
        curl \          # for healthcheck
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from deps stage
COPY --from=deps /root/.local /root/.local

# Copy application code with correct ownership
COPY --chown=appuser:appgroup src/ .

# Set PATH to include user-installed packages
ENV PATH=/root/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \     # don't buffer stdout/stderr
    PYTHONDONTWRITEBYTECODE=1 \  # don't create .pyc files
    PYTHONFAULTHANDLER=1     # dump traceback on crash

# Switch to non-root user
USER appuser

# Document exposed port (doesn't actually publish)
EXPOSE 8080

# Health check
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=60s \
    --retries=3 \
    CMD curl -sf http://localhost:8080/health || exit 1

# Labels for metadata
LABEL maintainer="aditya@judicialsolutions.in" \
      version="1.0.0" \
      description="Judicial Solutions API"

# Run with exec form for proper signal handling
CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "4", \
     "--no-access-log"]
```

---

**Q55. Your team is moving from docker-compose to Kubernetes. What are the key differences and how do you migrate?**

What they're testing: Docker → Kubernetes migration

```
Key differences:

| Aspect | Docker Compose | Kubernetes |
|---|---|---|
| Scale | Single host | Multi-node cluster |
| Scheduling | Manual | Automatic (scheduler) |
| Self-healing | Limited (restart policy) | Full (ReplicaSet, probes) |
| Rolling updates | Manual | Automatic (Deployment strategy) |
| Config/Secrets | env_file, .env | ConfigMap, Secret |
| Networking | Bridge/overlay | CNI (Calico, Flannel) |
| Storage | Named volumes | PersistentVolume, PVC |
| Discovery | Service names | DNS (ClusterIP service) |
| Load balancing | Host ports | Service (ClusterIP/NodePort/LoadBalancer) |

Migration path:

Step 1: Kompose (automated conversion)
  # Install kompose
  curl -L https://github.com/kubernetes/kompose/releases/download/v1.32.0/kompose-linux-amd64 -o kompose

  # Convert docker-compose.yml to Kubernetes manifests
  kompose convert -f docker-compose.yml

  # Generates:
  # frontend-deployment.yaml
  # frontend-service.yaml
  # backend-deployment.yaml
  # backend-service.yaml
  # postgres-deployment.yaml (statefulset better for DBs)

Step 2: Review and fix generated manifests
  # Kompose output needs cleanup:
  # - Add resource limits
  # - Add health probes (liveness, readiness)
  # - Convert volumes to PVC
  # - Add proper labels and selectors

Step 3: Convert Compose config to ConfigMap
  # docker-compose environment → K8s ConfigMap/Secret
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: api-config
  data:
    DB_HOST: "postgres-service"
    LOG_LEVEL: "info"

Step 4: Test in dev cluster
  kubectl apply -f k8s/
  kubectl get pods
  kubectl logs deployment/api

Step 5: Gradual migration
  Don't migrate everything at once
  Start with stateless services
  Keep DB in Compose → RDS initially
  Migrate stateless services to K8s first
```

---

## QUICK REFERENCE — EXIT CODES

| Code | Signal | Meaning |
|---|---|---|
| 0 | - | Success / normal exit |
| 1 | - | General error |
| 2 | - | Shell misuse |
| 125 | - | Docker daemon error |
| 126 | - | Cannot invoke command |
| 127 | - | Command not found |
| 130 | SIGINT | Ctrl+C |
| 137 | SIGKILL | Force killed (often OOM) |
| 139 | SIGSEGV | Segmentation fault |
| 143 | SIGTERM | Graceful shutdown request |

## QUICK REFERENCE — MOST USED COMMANDS

```bash
# Build
docker build -t myapp:latest .
docker build --no-cache -t myapp:latest .
docker buildx build --platform linux/amd64,linux/arm64 -t myapp .

# Run
docker run -d -p 8080:80 --name myapp --restart unless-stopped myapp:latest
docker run --rm -it myapp:latest /bin/sh
docker run --network mynet --env-file .env myapp:latest

# Debug
docker logs -f myapp
docker exec -it myapp /bin/sh
docker stats myapp
docker inspect myapp
docker top myapp

# Cleanup
docker system prune -a
docker volume prune
docker image prune -a

# Compose
docker compose up -d --build
docker compose down -v
docker compose logs -f service-name
docker compose exec service-name bash
docker compose ps

# Network
docker network create mynet
docker network inspect mynet
docker network connect mynet container-name

# Volume
docker volume create mydata
docker volume inspect mydata
docker volume ls
```
