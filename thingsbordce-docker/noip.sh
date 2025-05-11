#!/bin/bash

# --- Configuration ---
USERNAME=$NOIP_USERNAME  # Update in environment file or replace with your No-IP username
PASSWORD=$NOIP_PASSWORD  # Update in environment file or replace with your No-IP password
HOSTNAME=$NOIP_HOSTNAME  # Update in environment file or replace with your No-IP hostname
LOG_FILE="$HOME/noip_update.log"

# --- Function to log and print ---
log_and_print() {
    echo "$1" | tee -a "$LOG_FILE"
}

# --- Get current public IP address ---
PUBLIC_IP=$(curl -s https://api.ipify.org)

if [ -z "$PUBLIC_IP" ]; then
    log_and_print "$(date) - Error: Could not retrieve public IP address."
    exit 1
fi

log_and_print "$(date) - Current public IP address: $PUBLIC_IP"

# --- Check if USERNAME, PASSWORD, and HOSTNAME are set ---
if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$HOSTNAME" ]; then
    log_and_print "$(date) - Error: USERNAME, PASSWORD, or HOSTNAME is not set."
    exit 1
fi

# --- Construct the update URL ---
UPDATE_URL="https://${USERNAME}:${PASSWORD}@dynupdate.no-ip.com/nic/update?hostname=${HOSTNAME}&myip=${PUBLIC_IP}"

# --- Update No-IP ---
RESPONSE=$(curl -s -i "$UPDATE_URL")

log_and_print "$(date) - No-IP update response:"
log_and_print "$RESPONSE"

# --- Check the response for success ---
if [[ "$RESPONSE" == *"good $PUBLIC_IP"* || "$RESPONSE" == *"nochg $PUBLIC_IP"* ]]; then
    log_and_print "$(date) - No-IP hostname $HOSTNAME updated successfully to $PUBLIC_IP."
else
    log_and_print "$(date) - Error: Failed to update No-IP hostname $HOSTNAME."
fi

exit 0
