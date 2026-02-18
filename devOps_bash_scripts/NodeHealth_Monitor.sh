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

set -x

df -h
echo " "
free -g
echo " "
nproc
