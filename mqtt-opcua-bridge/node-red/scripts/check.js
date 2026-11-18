// End-to-end check: publishes one test reading over MQTT and reads it back over OPC UA.
// It publishes test data, so it only runs against the lab broker:
//   docker compose --profile lab up -d --build
//   docker compose exec node-red node /opt/bridge/check.js
const assert = require("node:assert/strict");
const os = require("node:os");
const mqtt = require("mqtt");
const { OPCUAClient, AttributeIds, DataType, VariantArrayType, makeBrowsePath } = require("node-opcua");

const endpointUrl = `opc.tcp://${os.hostname()}:53880/UA/Wittra/EU-Testbed`;
const device = "WITTRA-CHECK";
const type = "check-sensor";
const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000); // 1 min old, whole seconds
// field: [value sent, unit sent, OPC UA data type expected, unit symbol expected (null = no unit property)]
const fields = {
    temperature: [21.5, "CELSIUS", DataType.Double, "°C"],
    moving: [true, "", DataType.Boolean, null],
    state: ["idle", "", DataType.String, null],
    rssi: [[-52, -61, -70], "DECIBEL_MILLIWATT", DataType.Double, "dBm"],
};
const nodeId = (field) => `ns=1;s=${device}/${type}/${field}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    // Test data goes to the lab broker only, never to a broker set in .env.
    const brokerHost = new URL(process.env.MQTT_URL).hostname;
    assert.equal(brokerHost, "mosquitto", `the bridge uses the broker at ${brokerHost}; check.js publishes test data, so run it against the lab broker (see README, "Test")`);

    // 1. The editor is read-only: the flow is managed in git.
    const settings = await (await fetch("http://127.0.0.1:1880/settings")).json();
    assert.equal(settings.user?.permissions, "read", "editor is not read-only");
    console.log("ok   editor is read-only");

    // 2. Publish one cloud-connector message: a number with a unit, a boolean, a string and a list.
    const broker = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USER || undefined, password: process.env.MQTT_PASS || undefined });
    const reading = { timestamp: timestamp.toISOString() };
    for (const [field, [value, unit]] of Object.entries(fields)) reading[field] = { value, unit };
    const topic = process.env.MQTT_TOPIC.replace(/\+/g, "x").replace("#", device);
    await broker.publishAsync(topic, JSON.stringify({ projectId: "check-project", deviceId: device, payload: { [type]: reading } }), { qos: 1 });
    await broker.endAsync();
    console.log(`ok   published to ${topic}`);

    // 3. Read it back: values, data types, lists, units and the reading's own timestamp.
    const client = OPCUAClient.create({ endpointMustExist: false, connectionStrategy: { maxRetry: 0 } });
    await client.connect(endpointUrl);
    try {
        const session = await client.createSession();
        const toRead = Object.keys(fields).map((field) => ({ nodeId: nodeId(field), attributeId: AttributeIds.Value }));
        let results;
        for (let i = 0; i < 25; i++) {
            results = await session.read(toRead);
            if (results.every((r) => r.sourceTimestamp?.getTime() === timestamp.getTime())) break;
            await wait(400);
        }
        let i = 0;
        for (const [field, [value, , dataType, unitSymbol]] of Object.entries(fields)) {
            const r = results[i++];
            assert.ok(r.statusCode.isGood(), `${field}: ${r.statusCode.toString()}`);
            assert.equal(r.value.dataType, dataType, `${field} data type`);
            if (Array.isArray(value)) {
                assert.equal(r.value.arrayType, VariantArrayType.Array, `${field} is not an array`);
                assert.deepEqual(Array.from(r.value.value), value, `${field} value`);
            } else {
                assert.equal(r.value.value, value, `${field} value`);
            }
            assert.equal(r.sourceTimestamp?.toISOString(), timestamp.toISOString(), `${field} SourceTimestamp`);
            const eu = (await session.browse(nodeId(field))).references.find((ref) => ref.browseName.name === "EngineeringUnits");
            if (unitSymbol) {
                assert.ok(eu, `${field} has no EngineeringUnits`);
                const info = (await session.read({ nodeId: eu.nodeId, attributeId: AttributeIds.Value })).value.value;
                assert.equal(info.displayName.text, unitSymbol, `${field} unit`);
            } else {
                assert.equal(eu, undefined, `${field} should have no EngineeringUnits`);
            }
        }
        console.log(`ok   read back ${Object.keys(fields).join(", ")}: values, types, list, units, SourceTimestamp ${timestamp.toISOString()}`);

        // 4. The browse tree is Objects/Devices/<device>/<message type>/<field>.
        const [browse] = await session.translateBrowsePath([makeBrowsePath("RootFolder", `/Objects/1:Devices/1:${device}/1:${type}/1:temperature`)]);
        assert.equal(browse.targets?.[0]?.targetId.toString(), nodeId("temperature"), "browse path");
        console.log("ok   browse path Objects/Devices/device/message type/field");
        await session.close();
    } finally {
        await client.disconnect();
    }
    console.log("PASS");
}

main().catch((err) => {
    console.error("FAIL", err.message);
    process.exit(1);
});
