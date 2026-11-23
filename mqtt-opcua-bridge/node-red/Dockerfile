FROM nodered/node-red:4.1.16-22

# Bake the extra nodes listed in scripts/package.json into the image, so a
# fresh data volume works without installing anything from the palette.
# They are added on top of the image's own package.json (which holds
# Node-RED itself) instead of replacing it.
COPY scripts/package.json /tmp/extra-nodes.json
RUN npm install --omit=dev --no-audit --no-fund --no-update-notifier \
      $(node -p "Object.entries(require('/tmp/extra-nodes.json').dependencies).map(([n, v]) => n + '@' + v).join(' ')")

# The compact server has no settings for logins, security policies or certificate trust, and its
# login check accepts everyone. Where it builds the OPC UA server options, drop that login check and
# add the options from scripts/opcua-security.js last, so they win over the node's own settings.
# The greps fail the build if the package's code is not exactly what this patch expects.
RUN F=node_modules/node-red-contrib-opcua-compact-server/opcuaCompact/core/server.js \
 && OLD='userManager:{isValidUser:module.exports.choreCompact.coreSecurity.checkUserLogon},isAuditing:e.isAuditing,disableDiscovery:e.disableDiscovery,registerServerMethod:i}' \
 && NEW='isAuditing:e.isAuditing,disableDiscovery:e.disableDiscovery,registerServerMethod:i,...require("/opt/bridge/opcua-security.js")()}' \
 && grep -qF "$OLD" $F \
 && sed -i "s|$OLD|$NEW|" $F \
 && grep -qF "$NEW" $F \
 && ! grep -q 'checkUserLogon}' $F

# Lets scripts in /opt/bridge (opcua-security.js, check.js) load the image's node-opcua and mqtt
ENV NODE_PATH=/usr/src/node-red/node_modules
