#!/bin/bash

# Fix imports in scripts
find scripts -type f -name "*.ts" -exec sed -i 's|from '"'"'@/lib|from '"'"'../../src/lib|g' {} \;
