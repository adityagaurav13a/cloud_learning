# 🚀 Docker Setup for Judicial Solutions

This folder contains the **Docker configuration** for running the Judicial Solutions
website locally using containerized frontend and backend services.

## 📁 Project Structure

docker/
├── Dockerfile.backend
├── Dockerfile.frontend
├── README.md
├── docker-compose.yml
└── nginx
    └── default.conf

#### The application code (HTML, CSS, JS, backend Python) is stored in the project root.
#### Docker files remain cleanly isolated inside the `/docker` directory.

---

## 🌐 Frontend (Nginx)
```
The frontend is a static website served using **Nginx**.

### Build context:
- HTML files
- CSS/
- Javascript/
- Images/
```

### Dockerfile:
`docker/Dockerfile.frontend`

### Exposed Port:
- **8080 → 80 inside container**

Visit the site locally: http://localhost:8080


---

## 🔧 Backend (FastAPI Mock)

A lightweight backend runs using **FastAPI**, serving the same API structure as our AWS Lambda + API Gateway setup.

### Dockerfile:
`docker/Dockerfile.backend`

### Default Port:
- **8000**

Test health endpoint: http://localhost:8000/health



## 👉 Run in background
docker compose up -d --build

##👉 Stop containers:
docker compose down

## 🔄 Rebuild Images
When you update the code: docker compose build

## 📦 Pushing to ECR (Once Terraform creates ECR)

```
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com

docker tag judicial-frontend <frontend_repo_url>:v1
docker tag judicial-backend  <backend_repo_url>:v1

docker push <frontend_repo_url>:v1
docker push <backend_repo_url>:v1
```


## ✅ Summary

This Docker setup allows:

    - Clean local development
    - Consistent local backend for JS/API testing
    - Container images ready for deployment (ECR → Lambda/ECS/EKS)
