#!/bin/bash
# ════════════════════════════════════════════════════════
#   K8s Ingress Demo - Complete Setup Script
# ════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 1: Enable Minikube Ingress Addon"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
minikube addons enable ingress
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 2: Build Docker Images inside Minikube"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
eval $(minikube docker-env)

cd frontend       && docker build -t demo-frontend:latest -f ./Dockerfile . && cd ..
cd users-service  && docker build -t demo-users:latest    -f ./Dockerfile . && cd ..
cd orders-service && docker build -t demo-orders:latest   -f ./Dockerfile . && cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 3: Deploy to Kubernetes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/ingress.yaml

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 4: Wait for pods to be ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl wait --for=condition=ready pod -l app=frontend --timeout=60s
kubectl wait --for=condition=ready pod -l app=users    --timeout=60s
kubectl wait --for=condition=ready pod -l app=orders   --timeout=60s

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 5: Starting Minikube Tunnels"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# clear old logs
> /tmp/frontend.log
> /tmp/users.log
> /tmp/orders.log

minikube service frontend-service --url > /tmp/frontend.log 2>&1 &
minikube service users-service    --url > /tmp/users.log    2>&1 &
minikube service orders-service   --url > /tmp/orders.log   2>&1 &

# Wait until all 3 URLs appear in log files
echo "Waiting for tunnels..."
for LOG in /tmp/frontend.log /tmp/users.log /tmp/orders.log; do
  for i in $(seq 1 20); do
    URL=$(grep -o 'http://127.0.0.1:[0-9]*' "$LOG" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then break; fi
    sleep 1
  done
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ALL DONE! Open these URLs in browser:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Frontend : $(grep -o 'http://127.0.0.1:[0-9]*' /tmp/frontend.log | head -1)"
echo " Users    : $(grep -o 'http://127.0.0.1:[0-9]*' /tmp/users.log    | head -1)"
echo " Orders   : $(grep -o 'http://127.0.0.1:[0-9]*' /tmp/orders.log   | head -1)"
echo ""
echo " Check pods    : kubectl get pods"
echo " Check services: kubectl get svc"
echo " Check ingress : kubectl get ingress"
echo " Kill tunnels  : kill \$(pgrep -f 'minikube service')"
