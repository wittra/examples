// MQTT ingest - paste into a Function node wired after an MQTT in node
// (e.g. topic "pubname/<id>/sensor/#"). 
// 
// ATENTION: It must be on the same tab as the OPC UA Compact Server node, because both share flow context.
//
// Understands the data structure envelope and stores one entry per
// measurement in the OPC Data map:
//
//   { "deviceId": "DEVICEID1234",
//     "payload": { "some-tag-uptime": {
//         "timestamp": "2026-10-19T10:55:47.329Z",
//         "uptime": { "value": 1026007, "unit": "SECOND" } } } }
//
//   OpcData["DEVICEID1234/some-tag-uptime/uptime"] =
//     { value: 1026007, unit: "SECOND", timestamp: "2026-10-19T10:55:47.329Z" }
//
// The server's address space script (address-space-dynamic.js) scans this
// map and creates an object/variable for every path it hasn't seen before.

// About:
// Note that this script is not a Node-RED node, but a Function node script.
// It is not a complete program, but a snippet that is meant to be used within the Node-RED environment.

// Usage:
// 1. Set up an MQTT input node in Node-RED to subscribe to the desired topic (e.g., "pubname/<id>/sensor/#").
// 2. Create a Function node and paste this code into the editor of the Function node.
// 3. Connect the MQTT input node to the Function node.
// 4. Deploy the flow in Node-RED.

// Note:
// - The script expects incoming MQTT messages to be in JSON format with a specific structure.
// - It processes the messages, extracts telemetry data, and stores it in the flow context for use by the OPC UA Compact Server node.
// - The script handles different data types (numbers, booleans, strings) and supports units for measurements.

// This script will process incoming MQTT messages, extract telemetry data, and store it in the flow context for use by the OPC UA Compact Server node.
// To use it, you have to create a Function node in Node-RED, and paste this code into the Function node's editor. 
// The Function node should be connected to an MQTT input node that receives messages from your MQTT broker.

const STORE = "memoryOnly";

// msg is whatever is being sent to this node, e.g. from an MQTT input node.
// It does have some properties, but we only care about msg.payload, which is the message body.
// take a look at Node-RED debug to examine the message structure.
// This comment is here to help you undersand the context in which this script is executed.
// Now you are free to read and understand the rest of the code!

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

// Selecting messages that have a deviceId and a payload object. If not, discard and count the skipped.
if (!message || !message.deviceId || typeof message.payload !== "object") {
  const skipped = (context.get("skipped") || 0) + 1;
  context.set("skipped", skipped);
  node.status({ fill: "yellow", shape: "ring", text: "skipped " + skipped + " non-telemetry messages" });
  return null;
}

// We use flow context here because the OPC UA Compact Server don't offer a way to share context with other nodes.
// So we need to communicate to the other nodes someway, and flow context is the only way to do it.
// See this almost as Channels on Golang, where you can send data from one node to another...

// This is used to store the telemetry data in a way that the OPC UA Compact Server node can access it and 
// create the address space dynamically.
const data = flow.get("OpcData", STORE) || {};


// In terms of complexity, this call with recursion inside is a bit scary, 
// but it is the only way to handle nested objects.
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
// This heartbeats the OPC UA Compact Server node, so it knows that 
// new data has arrived and it can update the address space.
flow.set("OpcDataLastUpdate", Date.now(), STORE);
return null;
