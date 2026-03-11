# k8s-ingress-demo

While learning Kubernetes, I wanted to actually understand how Ingress works instead of just reading about it. So I built this small project — a fake shop with 3 separate services routed through a single Nginx Ingress.

Nothing fancy, just enough to get the concepts to click.

---

## What I was trying to understand

- How does Ingress actually route traffic to different services?
- What's the difference between ClusterIP, NodePort and Ingress?
- Why do we need an Ingress Controller at all?
- How does this work locally on Minikube vs real clusters?

---

## The Setup

3 Python services, each serving a simple HTML page:

```
demo.local/           →  Frontend  (Demo Shop homepage)
demo.local/users      →  Users     (users table)
demo.local/orders     →  Orders    (orders table)
```

All 3 sit behind a single Nginx Ingress — which is the whole point of the exercise.

```
Browser
  ↓
Nginx Ingress  ← single entry point
  ↓
┌─────────────────────────────────────┐
│  /          →  frontend-service     │
│  /users     →  users-service        │
│  /orders    →  orders-service       │
└─────────────────────────────────────┘
```

---

## Project Structure

```
k8s-ingress-demo/
├── setup.sh                  ← builds + deploys everything
├── frontend/
│   ├── app.py
│   └── Dockerfile
├── users-service/
│   ├── app.py
│   └── Dockerfile
├── orders-service/
│   ├── app.py
│   └── Dockerfile
└── k8s/
    ├── deployments.yaml      ← deployments + services
    └── ingress.yaml          ← routing rules
```

---

## Running it

Make sure Minikube is running first:

```bash
minikube start
minikube status
```

Then just run the setup script:

```bash
chmod +x setup.sh
./setup.sh
```

At the end it prints the URLs:

```
 Frontend : http://127.0.0.1:34097
 Users    : http://127.0.0.1:43429
 Orders   : http://127.0.0.1:34521
```

Open those in your browser and it works.

---

## What the setup script does

**Step 1** — enables the Nginx Ingress addon on Minikube

```bash
minikube addons enable ingress
```

On a real cluster you'd do this with Helm instead:
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx
```

**Step 2** — builds Docker images inside Minikube's Docker daemon (not your local one)

```bash
eval $(minikube docker-env)
```

This step confused me at first. The reason you need it — Kubernetes pulls images from its own Docker daemon, not yours. If you build locally and Kubernetes can't find the image, pods get stuck in `ImagePullBackOff`.

**Step 3** — applies the Kubernetes manifests

```bash
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/ingress.yaml
```

**Step 4** — waits for all 3 pods to be ready before moving on

**Step 5** — starts minikube tunnels so the services are reachable from Windows browser

On WSL2 with the Docker driver, `192.168.49.2` (Minikube's IP) is trapped inside the WSL2 network. Running `minikube service --url` creates a tunnel to `127.0.0.1` which Windows can actually reach.

---

## Verifying Ingress is actually routing (not just the services)

```bash
# This goes through Ingress — proper test
curl -H "Host: demo.local" http://192.168.49.2/
curl -H "Host: demo.local" http://192.168.49.2/users
curl -H "Host: demo.local" http://192.168.49.2/orders
```

The `-H "Host: demo.local"` part is important — Ingress routes based on the Host header. Without it Nginx doesn't know which service to send traffic to and returns 404.

---

## Things I got wrong along the way

**Dockerfile capital F** — Linux is case sensitive. Docker looks for `Dockerfile` not `DockerFile`. Cost me 20 minutes.

**Forgot the trailing dot** in docker build:
```bash
# wrong
docker build -t demo-frontend:latest -f ./Dockerfile

# correct
docker build -t demo-frontend:latest -f ./Dockerfile .
```

**Minikube wasn't started** — every `kubectl` command was failing with `connection refused localhost:8080`. Always check `minikube status` first.

**Used 127.0.0.1 as Prometheus datasource in Grafana** — Grafana runs inside the cluster, it can't reach your laptop's localhost. Use the internal DNS instead:
```
http://prometheus-server.default.svc.cluster.local:80
```

---

## Useful commands

```bash
# see what's running
kubectl get pods
kubectl get svc
kubectl get ingress

# check ingress controller
kubectl get pods -n ingress-nginx

# check routing rules are applied
kubectl describe ingress demo-ingress

# check which port a service is actually using
kubectl describe svc frontend-service

# stop the tunnels when done
kill $(pgrep -f 'minikube service')
```

---

## Cleanup

```bash
kubectl delete -f k8s/deployments.yaml
kubectl delete -f k8s/ingress.yaml

eval $(minikube docker-env)
docker rmi -f demo-frontend:latest demo-users:latest demo-orders:latest
```

---

