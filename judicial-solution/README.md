# Docker Project: Judicial Solution Website

This project demonstrates how to containerize a simple static website using **Docker** and serve it with **Nginx**.  
It covers building a Docker image, running it in a container, monitoring it, and cleaning up resources.  

> **Note**: I am using a Linux environment on a Windows machine through WSL (Ubuntu).

---

## 📂 Project Structure

Judicial-solution/
│── index.html
│── script.js
│── style.css
│── Dockerfile



---

## 🐳 Dockerfile

```dockerfile
# Use Nginx base image
FROM nginx:alpine

# By default, Nginx serves a demo page, This command deletes those default files from /usr/share/nginx/html/, which is the Nginx web root directory.
RUN rm -rf /usr/share/nginx/html/*

# Copies all files from your project folder into /usr/share/nginx/html inside the container (index.html, style.css, script.js)
COPY . /usr/share/nginx/html

# Nginx listens on port 80 by default
EXPOSE 80

# This is the default command that runs when the container starts.it tells Nginx to run in the foreground
CMD ["nginx", "-g", "daemon off;"]





⚙️ Steps to Build and Run
1️⃣ Build Docker Image - 
    docker build -t demo_image_build .
        docker build -t demo_image_build .

    Breakdown:
        docker build : Build an image from Dockerfile.
         . : Use the Dockerfile in the current directory.
        -t demo_image_build : Tag the image with a name.

2️⃣ Verify Image -
    Command : docker images
    Output :
        REPOSITORY         TAG       IMAGE ID       CREATED       SIZE
        demo_image_build   latest    b7f4e9bd7a8c   7 hours ago   79.4MB

3️⃣ Run Container -
    Command : docker run -d -p 5000:80 b7f4e9bd7a8c
    Breakdown:
        -d → Run in detached mode (background).
        -p 5000:80 → Map host port 5000 → container port 80.
        b7f4e9bd7a8c → Image ID.

4️⃣ Verify Running Container -
    Command : docker ps -a
    Output :
        CONTAINER ID   IMAGE          COMMAND                  CREATED          STATUS          PORTS                  NAMES
        200a58ece2bb   b7f4e9bd7a8c   "/docker-entrypoint.…"   20 minutes ago   Up 20 minutes   0.0.0.0:5000->80/tcp   wizardly_cray

📊 Monitoring Containers-
    Command :
        Check resource usage : docker stats
        Inspect container details : docker inspect <container_id>
        View container logs : docker logs <container_id>
            Output :
                nginx/1.29.1
                Configuration complete; ready for start up
                172.17.0.1 - - [18/Sep/2025:18:40:27 +0000] "GET / HTTP/1.1" 200
                172.17.0.1 - - [18/Sep/2025:18:40:27 +0000] "GET /style.css HTTP/1.1" 304

🌐 Access Website-
    Open in browser:
    👉 http://localhost:5000

🧹 Cleanup :
    Command :
        Stop the container : docker stop <container_id>
        Remove the container : docker rm <container_id>
        Remove the image : docker rmi <image_id>


✅ Summary :

Built a Docker image using Nginx.
Deployed a static website inside a container.
Monitored with docker stats, inspect, and logs.
Accessed website at http://localhost:5000
Cleaned up resources after testing.