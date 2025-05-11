#!/bin/bash
# filepath: /home/spandan/setup-nginx.sh

# Load environment variables
set -a
source .env
set +a

# Replace placeholders in nginx.conf.template
envsubst '${DOMAIN_NAME}' < nginx.conf.template > nginx.conf