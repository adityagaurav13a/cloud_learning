#!/bin/bash
################################
#Author : Aditya Gaurav
#Date   : 19 Feb 2026
#Version: v2
#Purpose: Monitor AWS services (S3, EC2, Lambda, ECS)
################################

# Exit on error
set -e
# Debug mode (remove in production)
set -x

# Log file with timestamp
LOGFILE="aws_monitor_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOGFILE")
exec 2>&1

echo "=== AWS Service Monitor Started: $(date) ==="

## 1. S3 Buckets
echo "📦 S3 Buckets ($(date +%H:%M:%S)):"
aws s3 ls 2>/dev/null || echo "No S3 buckets or access denied"

## 2. EC2 Instances (Native AWS CLI - NO jq needed)
echo -e "\n☁️ EC2 Instances (Running):"
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,PrivateIpAddress,State.Name]' \
  --output table 2>/dev/null || echo "No running EC2 instances"

## 3. Lambda Functions
echo -e "\n⚡ Lambda Functions:"
aws lambda list-functions \
  --query 'Functions[].[FunctionName,Runtime,LastModified]' \
  --output table 2>/dev/null || echo "No Lambda functions"

## 4. ECS Services (if you use containers)
echo -e "\n🐳 ECS Services:"
aws ecs list-clusters --query 'clusterArns' --output text 2>/dev/null | \
while read cluster; do
  echo "  Cluster: $cluster"
  aws ecs list-services --cluster "$cluster" --query 'serviceArns' --output text
done || echo "No ECS clusters"

## 5. Check AWS CLI Config
echo -e "\n🔑 AWS Identity:"
aws sts get-caller-identity --query 'Arn' --output text

echo -e "\n✅ Monitoring complete. Log: $LOGFILE"

