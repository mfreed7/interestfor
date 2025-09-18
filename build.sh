#!/bin/bash

# Exit on any error
set -e

BASE_DIR=$(pwd)
SRC_DIR="${BASE_DIR}/src"
BUILD_DIR="${BASE_DIR}/dist"
SOURCE_FILE="${SRC_DIR}/interestfor.js"
MINIFIED_FILE="${BUILD_DIR}/interestfor.min.js"
OUTPUT_FILE="${SRC_DIR}/interestfor.min.js"

# Minify the combined file
terser "${SOURCE_FILE}" --compress --mangle --output "${MINIFIED_FILE}"

cat COPYRIGHT "${MINIFIED_FILE}" > "${OUTPUT_FILE}"

rm "${MINIFIED_FILE}"

echo "--- Minified output to ${OUTPUT_FILE} ---"
