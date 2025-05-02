# Auto-pull when entering y3dhub project directory
cd() {
  builtin cd "$@"
  if [ -d .git ] && [[ "$(pwd)" == *"y3dhub"* ]]; then
    echo "Auto-pulling y3dhub from remote..."
    git fetch && git pull --ff-only
  fi
} 
