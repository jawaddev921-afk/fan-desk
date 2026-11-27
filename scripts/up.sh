#!/usr/bin/env bash
# Starts what Fan Desk needs locally, skipping what already runs: database (:54329), Ollama (:11434), the app (:3001).
cd "$(dirname "$0")/.."
up() { (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
up 54329 || { nohup npm run db:dev > /tmp/fd-db.log 2>&1 & sleep 8; }
up 11434 || OLLAMA_KEEP_ALIVE=30m nohup ~/.local/ollama/bin/ollama serve > /tmp/ollama-serve.log 2>&1 &
up 3001 || nohup npm run dev -- -p 3001 > /tmp/fd-dev.log 2>&1 &
sleep 12
for p in 54329 11434 3001; do up $p && echo "port $p: up" || echo "port $p: DOWN"; done
echo "Fan Desk: http://localhost:3001"
