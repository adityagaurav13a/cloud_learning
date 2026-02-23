#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : port_checker.sh
# Purpose: Check which ports are open/in use
#          and which processes own them
# Usage  : bash port_checker.sh
#          bash port_checker.sh 8000      ← check specific port
# ─────────────────────────────────────────────

PORT=$1  # optional specific port argument

echo "======================================"
echo " Port Checker — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

if [ -n "$PORT" ]; then
    # Check specific port
    echo "--- Checking port $PORT ---"
    RESULT=$(ss -tlnp | grep ":$PORT ")
    if [ -n "$RESULT" ]; then
        echo "✅ Port $PORT is IN USE:"
        echo "$RESULT"
        echo ""
        echo "--- Process using port $PORT ---"
        fuser -v ${PORT}/tcp 2>&1
    else
        echo "✅ Port $PORT is FREE"
    fi
else
    # Show all listening ports
    echo "--- All Listening Ports ---"
    ss -tlnp | awk 'NR==1 || /LISTEN/' | column -t

    echo ""
    echo "--- Common Ports Status ---"
    PORTS=(22 80 443 3000 5000 8000 8080 5432 3306 6379)
    for P in "${PORTS[@]}"; do
        STATUS=$(ss -tln | grep ":$P " > /dev/null && echo "🟢 IN USE" || echo "⚪ FREE")
        printf "Port %-6s %s\n" "$P" "$STATUS"
    done
fi

echo "======================================"
