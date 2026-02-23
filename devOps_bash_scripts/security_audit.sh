#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : security_audit.sh
# Purpose: Audit users, SSH logins, open ports,
#          and failed login attempts
# Usage  : bash security_audit.sh
# ─────────────────────────────────────────────

echo "======================================"
echo " Security Audit — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

# Users with login shell
echo "--- Users with Login Shell ---"
grep -E '/bash|/sh|/zsh' /etc/passwd | cut -d: -f1,3,6

echo ""
echo "--- Users with sudo access ---"
getent group sudo | cut -d: -f4

echo ""
echo "--- Currently Logged-in Users ---"
who

echo ""
echo "--- Last 5 SSH Logins ---"
last -n 5 | head -6

echo ""
echo "--- Failed Login Attempts (last 10) ---"
grep "Failed password" /var/log/auth.log 2>/dev/null | tail -10 \
    || grep "Failed password" /var/log/secure 2>/dev/null | tail -10 \
    || echo "No auth log found (may need root)"

echo ""
echo "--- Open Ports ---"
ss -tlnp | grep LISTEN

echo ""
echo "--- SSH Config Check ---"
echo -n "Root login : " && grep "^PermitRootLogin" /etc/ssh/sshd_config || echo "default (check sshd_config)"
echo -n "Password   : " && grep "^PasswordAuthentication" /etc/ssh/sshd_config || echo "default"

echo "======================================"
