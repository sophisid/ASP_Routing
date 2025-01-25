#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

# ------------------------------------------------------------------------------
# Step 1: Start the Python server (background process)
# ------------------------------------------------------------------------------
echo "Starting Python server..."
(
  cd neo4j*/web || {
    echo "ERROR: Could not find or enter neo4j*/web"
    exit 1
  }
  echo "Running Python http.server on port 8000..."
  python3 -m http.server &
  echo $! > /tmp/python_server.pid
)
echo "Python server started and PID saved to /tmp/python_server.pid."

# ------------------------------------------------------------------------------
# Step 2: Install Node dependencies and start the Node server
# ------------------------------------------------------------------------------
echo "Starting Node server..."
(
  cd RouteMaster-2/src || {
    echo "ERROR: Could not find or enter RouteMaster-2/src"
    exit 1
  }

  echo "Installing npm dependencies..."
  npm i

  echo "Installing @mapbox/polyline..."
  npm install @mapbox/polyline

  echo "Starting Node server..."
  node mainServer.mjs &
  echo $! > /tmp/node_server.pid
)
echo "Node server started and PID saved to /tmp/node_server.pid."

echo "Both servers are running. Use ./stop.sh to stop them."
