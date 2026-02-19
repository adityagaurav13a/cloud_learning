terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_instance" "ci_cd_jenkins" {
  ami           = "ami-019715e0d74f695be"  # AL2023 ap-south-1
  instance_type = "t3.micro"
  subnet_id     = "subnet-02c8d9e267fe93b40"  # ← YOUR SUBNET
  key_name      = "Ansible-key"

  tags = {
    Name = "CI-CD-Jenkins"
  }
}

output "public_ip" {
  value = aws_instance.ci_cd_jenkins.public_ip
}

