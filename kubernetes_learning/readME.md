# 🚀 Getting Started with Your First Kubernetes Pod

This guide walks through the steps to run your first pod using a YAML file on Minikube.

---

## 📄 YAML File: `dummy_pod.yaml`

Make sure your YAML file includes the correct `apiVersion`, `kind`, and container spec.

---

## 🧭 Step 1: Check if Minikube is Running

```bash
minikube status

🔴 If Not Running
    minikube
    type: Control Plane
    host: Stopped
    kubelet: Stopped
    apiserver: Stopped
    kubeconfig: Stopped

🟢 If Running
    minikube
    type: Control Plane
    host: Running
    kubelet: Running
    apiserver: Running
    kubeconfig: Configured

⚙️ Step 2: Start Minikube (if not running)
    minikube start

    Sample Output: 
        😄  minikube v1.37.0 on Ubuntu 24.04 (kvm/amd64)
        ✨  Using the docker driver based on existing profile

        🧯  The requested memory allocation of 2876MiB does not leave room for system overhead...
        💡  Suggestion: minikube start --memory=2876mb

        👍  Starting "minikube" primary control-plane node...
        🚜  Pulling base image...
        🔄  Restarting existing docker container...
        🐳  Preparing Kubernetes v1.34.0 on Docker 28.4.0...
        🔎  Verifying Kubernetes components...
        🌟  Enabled addons: storage-provisioner, default-storageclass
        🏄  Done! kubectl is now configured to use "minikube"

📦 Step 3: Create Your Pod
    kubectl apply -f dummy_pod.yaml
    
    Output:
        pod/ngnix created

🔍 Step 4: Monitor Pod Status
    
    kubectl get pod
    Output:
        NAME    READY   STATUS             RESTARTS   AGE
        ngnix   0/1     ImagePullBackOff   0          51s

    kubectl get pod -o wide
    Output:
        NAME    READY   STATUS             RESTARTS   AGE    IP           NODE
        ngnix   0/1     ImagePullBackOff   0          2m3s   10.244.0.5   minikube

📋 Step 5: Describe Pod Details
    kubectl describe pod ngnix
