# Automating EC2 Configuration Using Ansible

## Project Overview
This project demonstrates how to use **Ansible** to automate the configuration of an AWS EC2 instance running **Amazon Linux 2023**.  
The playbook installs the Apache web server, starts and enables it, and deploys a custom index page.

---

## Prerequisites

### Control Node (Local Machine)
- Ubuntu 24.04 LTS
- Ansible installed (`sudo apt install ansible -y`)
- Python 3 installed

### Managed Node (EC2 Instance)
- Amazon Linux 2023
- Security Group allowing:
  - SSH (Port 22) from your local IP
  - HTTP (Port 80) from anywhere
- SSH private key for access (PEM file)

---

## Project Structure
ansible-project/
├── inventory.ini # EC2 inventory
├── playbook.yml # Ansible playbook
└── README.md # Project instructions


---

## Steps to Execute

### 1. Navigate to Project Folder
Ensure all files (`inventory.ini`, `playbook.yml`, `README.md`) are in the same folder.
```bash
cd /path/to/ansible-project

Verify SSH Key Permissions : chmod 400 ~/.ssh/ansible-key.pem

Test SSH Connectivity : ansible -i inventory.ini webservers -m ping

Run the Ansible Playbook : ansible-playbook -i inventory.ini playbook.yml

Verify Deployment : http://<EC2_PUBLIC_IP>
