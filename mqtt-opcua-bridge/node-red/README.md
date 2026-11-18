# MQTT to OPC UA bridge (Node-RED)

A Node-RED example that subscribes to Wittra telemetry from the Wittra MQTT connector and serves it from an OPC UA server, so OPC UA clients (UaExpert, Prosys OPC UA Browser, SCADA or MES connectors) can browse and read device data.

> **Demo only.** As set up here, the OPC UA server accepts **any username and password**, allows anonymous logins and offers an unencrypted endpoint, and the Node-RED editor has no login. Run it on a lab network only. See [Known limitations](#known-limitations).

## How it works

```
MQTT in  ──▶  ingest function  ──▶  flow context "OpcData"  ◀──  OPC UA Compact Server
                                                                  (address-space script,
                                                                   reads every 200 ms)
```

- **MQTT in** subscribes to `MQTT_TOPIC`.
- **The ingest function** (`scripts/mqtt-ingest.js`) reads messages of the form
  `{"deviceId": "...", "payload": {"<message type>": {"timestamp": "...", "<field>": {"value": ..., "unit": "..."}}}}`
  and stores each field, with its value, unit and timestamp, in the tab's flow context under `OpcData`. It sends nothing on, so it has no wire to the server.
- **The OPC UA Compact Server** runs the address-space script (`scripts/address-space-dynamic.js`). Every 200 ms the script reads `OpcData`, adds variables for fields it hasn't seen before and serves the latest values.

Both scripts are embedded in `scripts/flows.json`, and the copies in the flow are what Node-RED runs. If you change a script, change it in the flow too.

### Address space

```
Objects
└ Devices
   └ <device>
      └ <message type>
         └ <field>          node ID ns=1;s=<device>/<message type>/<field>
```

- Numbers become Double, booleans Boolean, anything else String. A list becomes one array variable.
- Numbers with a unit are `AnalogUnitType` variables with `EngineeringUnits` set (UNECE codes where known).
- SourceTimestamp is the message's `timestamp`.
- New devices and fields appear as their data arrives. Clients must re-browse to see them, because no model change events are sent (see [Known limitations](#known-limitations)).
- If no MQTT message arrives for 5 minutes, every value reads as `BadNoCommunication`.
- Variables are read-only and kept in memory. After a restart, each one comes back with its next reading.

## Run

1. Copy `.env.example` to `.env` and fill it in (see below).
2. Start Node-RED:
   ```sh
   docker compose up -d --build
   ```
3. Open the editor at http://localhost:1880, then use the menu: **Import**, select `scripts/flows.json`, **Import**.
4. Open the **MQTT Wittra Broker** configuration node, and on its **Security** tab enter `${MQTT_USER}` as the username and `${MQTT_PASS}` as the password. Node-RED fills both in from `.env`.
5. **Deploy**.

The OPC UA endpoint is `opc.tcp://<host>:53880/UA/Wittra/EU-Testbed`.

## Configure

| Variable | Meaning |
|---|---|
| `MQTT_HOST` | Broker host name |
| `MQTT_PORT` | Broker port. The broker node connects with TLS, so use the TLS port, usually 8883 |
| `MQTT_USER`, `MQTT_PASS` | Broker login, used through `${MQTT_USER}` and `${MQTT_PASS}` in the broker node |
| `MQTT_CLIENT_ID` | MQTT client ID; leave empty for a random one |
| `MQTT_TOPIC` | Topic of your Wittra MQTT publication |

## Known limitations

- **Any login works.** `node-red-contrib-opcua-compact-server` 2.2.0 hard-codes its login check to accept every username and password (2.3.0 is the same), and anonymous login is on in this flow.
- **Unencrypted endpoint.** Security policies can't be configured, so the server offers `None` alongside `Basic256Sha256`, `Aes128_Sha256_RsaOaep` and `Aes256_Sha256_RsaPss`.
- **Server certificate inside the image.** It is generated when the image is built, so every rebuild creates a new one, and its name doesn't match the server's.
- **No model change events.** The script adds nodes inside a model change transaction, but node-opcua only reports an added node when its parent has a `NodeVersion` property, and the nodes this script creates have none. So no `GeneralModelChangeEvent` is sent, and clients must re-browse to find new devices and fields.
- **Endpoint host name.** The server advertises the container's host name in its endpoint URL. If a client can't follow it, set the server node's **Alternate Hostname**, or the container's `hostname`, to the name clients use.
- **Open editor.** The editor is published on all network interfaces, with no login.
- **Context store warning.** The scripts use a context store named `memoryOnly`. Without one in Node-RED's `settings.js`, Node-RED logs a warning at start-up and uses its default memory store, which works the same.
