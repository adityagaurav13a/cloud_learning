#!/bin/bash
#
#########################
#Author : Aditya Gaurav
#Date   : 18 Feb 2026
#
#Purpose: Aim is to montitor node health
#
#Version: v1
#

set -x   # debug mode
set -e   # exit the script when there is an errror
set -o   # pipefail

df -h
echo " "
free -g
echo " "
nproc

ps -ef #use to print process and ID

ps -ef | grep -i "python" | awk -F" " '{print $2}'
