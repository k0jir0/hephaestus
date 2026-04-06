#!/bin/bash
# hephaestus Startup Script
# Starts the agent in a tmux session for 24/7 operation

set -e

SESSION_NAME="hephaestus"
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$AGENT_DIR/hephaestus.log"

echo "Starting hephaestus..."
echo "Log file: $LOG_FILE"

# Check if already running
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "hephaestus is already running in tmux session '$SESSION_NAME'"
    echo "Attach with: tmux attach -t $SESSION_NAME"
    exit 0
fi

# Check for dependencies
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "$AGENT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$AGENT_DIR"
    npm install
fi

# Create new tmux session and start the agent
tmux new-session -d -s "$SESSION_NAME" "cd '$AGENT_DIR' && npm run start:daemon 2>&1 | tee '$LOG_FILE'"

echo "hephaestus started in tmux session '$SESSION_NAME'"
echo ""
echo "Commands:"
echo "  View logs:   tail -f $LOG_FILE"
echo "  Attach:      tmux attach -t $SESSION_NAME"
echo "  Stop:        tmux kill-session -t $SESSION_NAME"
