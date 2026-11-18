// MQTT ingest - paste into a Function node wired after an MQTT in node
// (e.g. topic "customer/<id>/telemetry/#"). It must be on the same tab as
// the OPC UA Compact Server node, because both share flow context.
//
// Understands the Wittra telemetry envelope and stores one entry per
// measurement in the OpcData map:
//
//   { "deviceId": "DEVICEID1234",
//     "payload": { "wittra-tag-uptime": {
//         "timestamp": "2026-10-19T10:55:47.329Z",
//         "uptime": { "value": 1026007, "unit": "SECOND" } } } }
//
//   OpcData["DEVICEID1234/wittra-tag-uptime/uptime"] =
//     { value: 1026007, unit: "SECOND", timestamp: "2026-10-19T10:55:47.329Z" }
//
// The server's address space script (address-space-dynamic.js) scans this
// map and creates an object/variable for every path it hasn't seen before.

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

if (!message || !message.deviceId || typeof message.payload !== "object") {
  const skipped = (context.get("skipped") || 0) + 1;
  context.set("skipped", skipped);
  node.status({ fill: "yellow", shape: "ring", text: "skipped " + skipped + " non-telemetry messages" });
  return null;
}

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

for (const [messageType, fields] of Object.entries(message.payload)) {
  if (!fields || typeof fields !== "object") {
    continue;
  }
  for (const [name, field] of Object.entries(fields)) {
    if (name !== "timestamp") {
      collect(message.deviceId + "/" + messageType + "/" + name, field, fields.timestamp);
    }
  }
}

flow.set("OpcData", data, STORE);
// Heartbeat: any message proves the feed is alive, even if nothing changed.
flow.set("OpcDataLastUpdate", Date.now(), STORE);
return null;
