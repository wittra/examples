FROM nodered/node-red:4.1.16-22

# Bake the extra nodes listed in scripts/package.json into the image, so a
# fresh ./data works without installing anything from the palette.
# They are added on top of the image's own package.json (which holds
# Node-RED itself) instead of replacing it.
COPY scripts/package.json /tmp/extra-nodes.json
RUN npm install --omit=dev --no-audit --no-fund --no-update-notifier \
      $(node -p "Object.entries(require('/tmp/extra-nodes.json').dependencies).map(([n, v]) => n + '@' + v).join(' ')")
