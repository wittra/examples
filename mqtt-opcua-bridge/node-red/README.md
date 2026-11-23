# MQTT to OPC UA bridge (Node-RED)

A Node-RED example that subscribes to Wittra telemetry from the Wittra MQTT connector and serves it from an OPC UA server, so OPC UA clients (UaExpert, Prosys OPC UA Browser, SCADA or MES connectors) can browse and read device data.

> **Demo only.** As set up here, the OPC UA server accepts **any username and password**, allows anonymous logins and offers an unencrypted endpoint. Run it on a lab network only. See [Known limitations](#known-limitations).

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

Node-RED loads the flow from `scripts/flows.json` at start-up, with the settings in `scripts/settings.js`. Both scripts are embedded in the flow, and the copies in the flow are what runs. If you change a script, change it in the flow too.

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

```sh
cp .env.example .env                          # optional: every setting has a default
docker compose --profile lab up -d --build    # with a local test broker
docker compose up -d --build                  # with the broker set in .env
```

- **OPC UA endpoint:** `opc.tcp://<host>:53880/UA/Wittra/EU-Testbed`.
- **Node-RED editor:** http://127.0.0.1:1880, reachable from this machine only, and read-only.
- **To change the flow,** import `scripts/flows.json` into any Node-RED, edit it there, export it back over the file, and run `docker compose restart node-red`.
- **Node-RED's own state** is kept in the `data` volume. `docker compose down -v` deletes it.

## Configure

Settings come from `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `MQTT_URL` | `mqtt://mosquitto:1883` | Broker URL. Use `mqtts://host:8883` for TLS, checked against the system CAs |
| `MQTT_USER`, `MQTT_PASS` | empty | Broker login |
| `MQTT_CLIENT_ID` | random | MQTT client ID |
| `MQTT_TOPIC` | `onprem/#` | Topic of your Wittra MQTT publication |

The broker login reaches the flow through `scripts/flows_cred.json`, which holds only the `${MQTT_USER}` and `${MQTT_PASS}` placeholders. That is also why Node-RED logs "Using unencrypted credentials" at start-up.

## Test

```sh
docker compose --profile lab up -d --build
docker compose exec node-red node /opt/bridge/check.js
```

It ends with `PASS`, or with `FAIL` and the failed check. It checks that:

- the editor is read-only;
- a test reading published over MQTT (device `WITTRA-CHECK`) reads back over OPC UA with the right values and data types, a list as an array, units as `EngineeringUnits`, and the reading's timestamp as SourceTimestamp;
- the browse path is `Objects/Devices/<device>/<message type>/<field>`.

It publishes test data, so it refuses to run unless the bridge uses the lab broker. If `.env` sets another broker, start the test with the lab broker instead, and run `docker compose up -d` afterwards to go back:

```sh
MQTT_URL=mqtt://mosquitto:1883 docker compose --profile lab up -d --build
```

## Known limitations

- **Any login works.** `node-red-contrib-opcua-compact-server` 2.2.0 hard-codes its login check to accept every username and password (2.3.0 is the same), and anonymous login is on in this flow.
- **Unencrypted endpoint.** Security policies can't be configured, so the server offers `None` alongside `Basic256Sha256`, `Aes128_Sha256_RsaOaep` and `Aes256_Sha256_RsaPss`.
- **Server certificate inside the image.** It is generated when the image is built, so every rebuild creates a new one, and its name doesn't match the server's.
- **No model change events.** The script adds nodes inside a model change transaction, but node-opcua only reports an added node when its parent has a `NodeVersion` property, and the nodes this script creates have none. So no `GeneralModelChangeEvent` is sent, and clients must re-browse to find new devices and fields.
- **Endpoint host name.** The server advertises the container's host name in its endpoint URL. If a client can't follow it, set the server node's **Alternate Hostname**, or the container's `hostname`, to the name clients use.
