#!/bin/bash
# Setup for Phi-3 with llama.cpp

# Install build tools
sudo apt-get update && sudo apt-get install -y cmake build-essential

# Ensure virtual environment 
source llamacpp-env/bin/activate

# Navigate to llama.cpp
cd llama.cpp

# Build with CMake for CUDA
mkdir -p build && cd build
cmake .. -DLLAMA_CUBLAS=ON
cmake --build . --config Release -j4
cd ..

# Create models directory
mkdir -p models

# Download Phi-3 14B model
echo "Downloading Phi-3 model..."
wget https://huggingface.co/TheBloke/phi-3-14B-GGUF/resolve/main/phi-3-14b.Q4_K.gguf -O models/phi-3-14b.Q4_K.gguf

# Create server startup script
cat > ../start-server.sh << 'EOF'
#!/bin/bash
cd llama.cpp
source ../llamacpp-env/bin/activate

# Run server optimized for RTX 3060 with Phi-3
./build/bin/server \
  -m models/phi-3-14b.Q4_K.gguf \
  -c 8192 \
  --host 0.0.0.0 \
  --port 8080 \
  -ngl 35 \
  -cb \
  -t 6
EOF

chmod +x ../start-server.sh
