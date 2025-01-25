#!/usr/bin/env bash

# Function to stop a server using its PID file
stop_server() {
  local pid_file=$1
  local server_name=$2

  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $server_name (PID: $pid)..."
      kill -9 "$pid" && rm -f "$pid_file"
      echo "$server_name stopped."
    else
      echo "$server_name is not running. Removing stale PID file."
      rm -f "$pid_file"
    fi
  else
    echo "No PID file found for $server_name. It might not be running."
  fi
}

# Stop the Python server
stop_server /tmp/python_server.pid "Python server"

# Stop the Node server
stop_server /tmp/node_server.pid "Node server"

echo "All servers have been stopped."
