// MQTT ingest - paste into a Function node wired after an MQTT in node
// (e.g. topic "customer/<id>/telemetry/#"). It must be on the same tab as
// the OPC UA Compact Server node, because both share flow context.
//
// Understands both formats of Wittra telemetry and stores one entry per
// measurement in the OpcData map:
//
//   cloud MQTT connector:
//   { "projectId": "...", "deviceId": "DEVICEID1234",
//     "payload": { "wittra-tag-uptime": {
//         "timestamp": "2026-10-19T10:55:47.329Z",
//         "uptime": { "value": 1026007, "unit": "SECOND" } } } }
//
//   on-prem gateways, topic onprem/DEVICEID1234 (the device ID is only in the topic):
//   { "wittra-tag-uptime": {
//       "timestamp": "2026-10-19T10:55:47.329Z",
//       "uptime": { "value": 1026007, "unit": "SECOND" } } }
//
//   OpcData["DEVICEID1234/wittra-tag-uptime/uptime"] =
//     { value: 1026007, unit: "SECOND", timestamp: "2026-10-19T10:55:47.329Z" }
//
// The server's address space script (address-space-dynamic.js) scans this
// map and creates an object/variable for every path it hasn't seen before.
//
// OPCUA_SENSORS limits which message types are exposed: comma-separated
// names, a trailing * matches a prefix (e.g. "LAN-MIOTY-*,wittra-tag-battery").
// Empty exposes all.

const STORE = "memoryOnly";

let message = msg.payload;
if (Buffer.isBuffer(message)) {
  message = message.toString();
}
if (typeof message === "string") {
  try {
    message = JSON.parse(message);
  } catch (e) {
    message = null;
  }
}

let deviceId = null;
let payload = null;
if (message && message.deviceId && message.payload && typeof message.payload === "object") {
  // Cloud format. A project-level message (e.g. wittra-kpi-drssi) uses the
  // project ID as its deviceId: it is not a device, so skip it.
  if (message.deviceId === message.projectId) {
    return null;
  }
  deviceId = message.deviceId;
  payload = message.payload;
} else if (message && typeof message === "object" && !Array.isArray(message) &&
  Object.values(message).some((v) => v && typeof v === "object" && "timestamp" in v)) {
  // On-prem format: the device ID is the last level of the topic.
  deviceId = String(msg.topic || "").split("/").pop();
  payload = message;
}

if (!deviceId || !payload) {
  const skipped = (context.get("skipped") || 0) + 1;
  context.set("skipped", skipped);
  node.status({ fill: "yellow", shape: "ring", text: "skipped " + skipped + " non-telemetry messages" });
  return null;
}

const allow = (env.get("OPCUA_SENSORS") || "").split(",").map((s) => s.trim()).filter(Boolean);
const exposed = (type) => !allow.length || allow.some((p) => (p.endsWith("*") ? type.startsWith(p.slice(0, -1)) : type === p));

const data = flow.get("OpcData", STORE) || {};

// A measurement is any object with a "value" key; anything else nests
// deeper (e.g. "Last_packet_sent_due_to_alarm_trigg": { "reset": {...} }).
function collect(path, field, timestamp) {
  if (field === null || field === undefined) {
    return;
  }
  if (typeof field === "object" && !Array.isArray(field)) {
    if ("value" in field) {
      data[path] = { value: field.value, unit: field.unit || "", timestamp };
      return;
    }
    for (const key of Object.keys(field)) {
      collect(path + "/" + key, field[key], timestamp);
    }
    return;
  }
  data[path] = { value: field, unit: "", timestamp };
}

for (const [messageType, fields] of Object.entries(payload)) {
  if (!exposed(messageType) || !fields || typeof fields !== "object") {
    continue;
  }
  for (const [name, field] of Object.entries(fields)) {
    if (name !== "timestamp") {
      collect(deviceId + "/" + messageType + "/" + name, field, fields.timestamp);
    }
  }
}

flow.set("OpcData", data, STORE);
// Heartbeat: any message proves the feed is alive, even if nothing changed.
flow.set("OpcDataLastUpdate", Date.now(), STORE);
return null;
