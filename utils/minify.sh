#!/bin/bash

# Minify a JavaScript file in-place
# Usage: ./minify.sh <file.js>

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <file.js>"
    exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found"
    exit 1
fi

# Check if the file is a JavaScript file
if [[ ! "$FILE" =~ \.js$ ]]; then
    echo "Error: File must have .js extension"
    exit 1
fi

# Minify the file using a simple approach with sed and tr
# This removes comments, extra whitespace, and newlines
TMP_FILE="${FILE}.tmp"

# Remove single-line comments, multi-line comments, and compress whitespace
sed 's|//.*$||g' "$FILE" | \
    tr '\n' ' ' | \
    sed 's|/\*.*\*/||g' | \
    sed 's/[[:space:]]\+/ /g' | \
    sed 's/[[:space:]]*\([{};,=()[\]<>+\-*/%!&|?:]\)[[:space:]]*/\1/g' | \
    sed 's/^[[:space:]]*//;s/[[:space:]]*$//' > "$TMP_FILE"

# Replace original file with minified version
mv "$TMP_FILE" "$FILE"

echo "Minified: $FILE"
