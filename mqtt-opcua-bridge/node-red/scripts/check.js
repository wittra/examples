// End-to-end check: the OPC UA server's security, then one test reading published over MQTT and
// read back over OPC UA with Basic256Sha256 + SignAndEncrypt and a username and password.
// It publishes test data, so it only runs against the lab broker:
//   docker compose --profile lab up -d --build
//   docker compose exec node-red node /opt/bridge/check.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { X509Certificate } = require("node:crypto");
const mqtt = require("mqtt");
const {
    OPCUAClient, OPCUACertificateManager, MessageSecurityMode, SecurityPolicy, UserTokenType,
    AttributeIds, DataType, VariantArrayType, makeBrowsePath,
} = require("node-opcua");

const endpointUrl = `opc.tcp://${os.hostname()}:53880/UA/Wittra/EU-Testbed`;
const serverPki = "/data/pki";
const [{ username, password }] = JSON.parse(fs.readFileSync("/run/secrets/opcua-users.json", "utf8"));
const device = "WITTRA-CHECK";
const onpremDevice = "WITTRA-ONPREM";
// Same OPCUA_SENSORS matching as the flow. The test message type must pass the filter; "blocked" must not.
const allow = (process.env.OPCUA_SENSORS || "").split(",").map((s) => s.trim()).filter(Boolean);
const exposed = (s) => !allow.length || allow.some((p) => (p.endsWith("*") ? s.startsWith(p.slice(0, -1)) : s === p));
const type = allow.length ? allow[0].replace(/\*$/, "check") : "check-sensor";
const blocked = "check-blocked-sensor";
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
// The server polls its PKI folders every 5 s (+2 s to settle). A certificate moved out of rejected/
// before the poller has seen it stays rejected in memory until a restart, so wait before and after.
const pkiPoll = () => wait(10000);

async function rejects(promise, what) {
    await promise.then(() => assert.fail(`${what} was accepted`), () => console.log(`ok   ${what} refused`));
}

async function main() {
    // Test data goes to the lab broker only, never to a broker set in .env.
    const brokerHost = new URL(process.env.MQTT_URL).hostname;
    assert.equal(brokerHost, "mosquitto", `the bridge uses the broker at ${brokerHost}; check.js publishes test data, so run it against the lab broker (see README, "Test")`);

    // 1. The editor is read-only: the flow is managed in git.
    const settings = await (await fetch("http://127.0.0.1:1880/settings")).json();
    assert.equal(settings.user?.permissions, "read", "editor is not read-only");
    console.log("ok   editor is read-only");

    // 2. Only Basic256Sha256 + SignAndEncrypt, no anonymous login, and a certificate for this host.
    const discovery = OPCUAClient.create({ endpointMustExist: false, connectionStrategy: { maxRetry: 0 } });
    await discovery.connect(endpointUrl);
    const endpoints = await discovery.getEndpoints();
    await discovery.disconnect();
    for (const e of endpoints) {
        assert.equal(e.securityMode, MessageSecurityMode.SignAndEncrypt, "endpoint security mode");
        assert.equal(e.securityPolicyUri, SecurityPolicy.Basic256Sha256, "endpoint security policy");
        assert.ok(e.userIdentityTokens.every((t) => t.tokenType !== UserTokenType.Anonymous), "anonymous login offered");
    }
    const san = new X509Certificate(endpoints[0].serverCertificate).subjectAltName;
    assert.ok(san.includes(`DNS:${os.hostname()}`), `certificate is not for ${os.hostname()}: ${san}`);
    assert.ok(san.includes(`URI:${endpoints[0].server.applicationUri}`), `certificate URI is not ${endpoints[0].server.applicationUri}: ${san}`);
    console.log(`ok   ${endpoints.length} endpoint(s), all Basic256Sha256/SignAndEncrypt, no anonymous, certificate for ${os.hostname()}`);

    // 3. No login over an unencrypted connection.
    await rejects((async () => {
        const plain = OPCUAClient.create({ endpointMustExist: false, connectionStrategy: { maxRetry: 0 } });
        await plain.connect(endpointUrl);
        try {
            await plain.createSession({ type: UserTokenType.UserName, userName: username, password });
        } finally {
            await plain.disconnect();
        }
    })(), "login over an unencrypted connection");

    // 4. A new client certificate is refused until it is moved from rejected/ to trusted/certs/.
    const clientPki = fs.mkdtempSync(path.join(os.tmpdir(), "check-pki-"));
    const client = OPCUAClient.create({
        securityMode: MessageSecurityMode.SignAndEncrypt,
        securityPolicy: SecurityPolicy.Basic256Sha256,
        endpointMustExist: false,
        clientCertificateManager: new OPCUACertificateManager({ rootFolder: clientPki, automaticallyAcceptUnknownCertificate: true }),
        connectionStrategy: { maxRetry: 0 },
    });
    await rejects(client.connect(endpointUrl), "untrusted client certificate");
    await pkiPoll();
    const ours = new X509Certificate(fs.readFileSync(client.certificateFile)).fingerprint256;
    const rejectedDir = path.join(serverPki, "rejected");
    const rejected = fs.readdirSync(rejectedDir).find((f) => new X509Certificate(fs.readFileSync(path.join(rejectedDir, f))).fingerprint256 === ours);
    assert.ok(rejected, "client certificate not found in rejected/");
    const trusted = path.join(serverPki, "trusted/certs", rejected);
    fs.renameSync(path.join(rejectedDir, rejected), trusted);
    try {
        await pkiPoll();
        await client.connect(endpointUrl);
        console.log("ok   client certificate trusted after the move to trusted/certs/");

        // 5. Anonymous logins, wrong passwords and certificate logins are refused; the user gets in.
        await rejects(client.createSession(), "anonymous login");
        await rejects(client.createSession({ type: UserTokenType.UserName, userName: username, password: password + "x" }), "wrong password");
        await rejects(client.createSession({ type: UserTokenType.Certificate, certificateData: new X509Certificate(fs.readFileSync(client.certificateFile)).raw, privateKey: fs.readFileSync(client.privateKeyFile, "utf8") }), "certificate login");
        const session = await client.createSession({ type: UserTokenType.UserName, userName: username, password });
        console.log(`ok   logged in as ${username}`);

        // 6. Publish test messages. A reading has a number with a unit, a boolean, a string and a list.
        const broker = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USER || undefined, password: process.env.MQTT_PASS || undefined });
        const reading = { timestamp: timestamp.toISOString() };
        for (const [field, [value, unit]] of Object.entries(fields)) reading[field] = { value, unit };
        const topicFor = (id) => process.env.MQTT_TOPIC.replace(/\+/g, "x").replace("#", id);
        const topic = topicFor(device);
        // A project-level message (deviceId = projectId) goes first on the same topic and must be skipped.
        await broker.publishAsync(topic, JSON.stringify({ projectId: "check-project", deviceId: "check-project", payload: { [type]: reading } }), { qos: 1 });
        // A cloud-connector message, with a second message type that OPCUA_SENSORS may filter out.
        await broker.publishAsync(topic, JSON.stringify({ projectId: "check-project", deviceId: device, payload: { [type]: reading, [blocked]: reading } }), { qos: 1 });
        // An on-prem gateway message: no envelope, the device ID is the last level of the topic.
        await broker.publishAsync(topicFor(onpremDevice), JSON.stringify({ [type]: reading }), { qos: 1 });
        await broker.endAsync();
        console.log(`ok   published to ${topic} and ${topicFor(onpremDevice)}`);

        // 7. Read it back: values, data types, lists, units and the reading's own timestamp.
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

        // 8. The on-prem message reads back; the project-level message and filtered types create nothing.
        let onprem;
        for (let j = 0; j < 25; j++) {
            onprem = await session.read({ nodeId: `ns=1;s=${onpremDevice}/${type}/temperature`, attributeId: AttributeIds.Value });
            if (onprem.sourceTimestamp?.getTime() === timestamp.getTime()) break;
            await wait(400);
        }
        assert.ok(onprem.statusCode.isGood(), `on-prem message: ${onprem.statusCode.toString()}`);
        assert.equal(onprem.value.value, fields.temperature[0], "on-prem message value");
        const [project, blockedNode] = await session.read([
            { nodeId: "ns=1;s=check-project", attributeId: AttributeIds.BrowseName },
            { nodeId: `ns=1;s=${device}/${blocked}`, attributeId: AttributeIds.BrowseName },
        ]);
        assert.equal(project.statusCode.name, "BadNodeIdUnknown", "project-level message created a device");
        if (!exposed(blocked)) assert.equal(blockedNode.statusCode.name, "BadNodeIdUnknown", "message type outside OPCUA_SENSORS exposed");
        console.log(`ok   on-prem message read back, project-level message skipped, ${exposed(blocked) ? "OPCUA_SENSORS not set (filter not checked)" : "message type outside OPCUA_SENSORS skipped"}`);

        // 9. The browse tree is Objects/Devices/<device>/<message type>/<field>.
        const [browse] = await session.translateBrowsePath([makeBrowsePath("RootFolder", `/Objects/1:Devices/1:${device}/1:${type}/1:temperature`)]);
        assert.equal(browse.targets?.[0]?.targetId.toString(), nodeId("temperature"), "browse path");
        console.log("ok   browse path Objects/Devices/device/message type/field");
        await session.close();
    } finally {
        await client.disconnect();
        fs.rmSync(trusted, { force: true });
        fs.rmSync(clientPki, { recursive: true, force: true });
    }
    console.log("PASS");
}

main().catch((err) => {
    console.error("FAIL", err.message);
    process.exit(1);
});
