#!/bin/bash
################################
#Author : Aditya Gaurav
#Date   : 18 Feb 2026
#Version: v1
#Purpose: To monitor running services
################################
#
set -x
#set -o
#set -e

echo "S3 Buckets"
aws s3 ls

echo "EC2 instance"
#aws ec2 describe-instances
aws ec2 describe-instances | jq '.Reservations[].Instances[].InstanceId'

echo "list lmabda"
aws lambda list-functions
