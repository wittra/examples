# MQTT to OPC UA bridge (Node-RED)

A Node-RED example that subscribes to Wittra telemetry from the Wittra MQTT connector and serves it from an OPC UA server, so OPC UA clients (UaExpert, Prosys OPC UA Browser, SCADA or MES connectors) can browse and read device data.

**Security:** the server offers one endpoint, Basic256Sha256 with Sign & Encrypt. Clients log in with a username and password from `users.json`; anonymous and certificate logins are refused, and a client's certificate must be trusted by hand before it can connect.

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
- **Security** comes from `scripts/opcua-security.js`. The compact server has no settings for logins, security policies or certificate trust, so the `Dockerfile` patches the package to use the options from that file.

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
cp users.example.json users.json              # then set a real password
cp .env.example .env                          # optional: every setting has a default
docker compose --profile lab up -d --build    # with a local test broker
docker compose up -d --build                  # with the broker set in .env
```

- **OPC UA endpoint:** `opc.tcp://<OPCUA_HOSTNAME>:53880/UA/Wittra/EU-Testbed`.
- **Node-RED editor:** http://127.0.0.1:1880, reachable from this machine only, and read-only.
- **`users.json` is required.** Compose refuses to start without it.
- **To change the flow,** import `scripts/flows.json` into any Node-RED, edit it there, export it back over the file, and run `docker compose restart node-red`.
- **State** is kept in the `data` volume: the server certificate and private key, the trusted and rejected client certificates, and Node-RED's own files. It survives restarts and `docker compose down`; `docker compose down -v` deletes it.

## Configure

Settings come from `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `MQTT_URL` | `mqtt://mosquitto:1883` | Broker URL. Use `mqtts://host:8883` for TLS, checked against the system CAs |
| `MQTT_USER`, `MQTT_PASS` | empty | Broker login |
| `MQTT_CLIENT_ID` | random | MQTT client ID |
| `MQTT_TOPIC` | `onprem/#` | Topic of your Wittra MQTT publication |
| `OPCUA_HOSTNAME` | `wittra-opcua` | Host name in the endpoint URL and the server certificate. Set it to the name clients use, before the first start |
| `USERS_FILE` | `./users.json` | OPC UA users, kept out of git |

`users.json` is a list of `{"username", "password"}` entries; see `users.example.json`. After changing it, run `docker compose restart node-red`: it is mounted as a single file, so the container only sees a replaced file after a restart.

The broker login reaches the flow through `scripts/flows_cred.json`, which holds only the `${MQTT_USER}` and `${MQTT_PASS}` placeholders. That is also why Node-RED logs "Using unencrypted credentials" at start-up.

## Connect an OPC UA client

1. **Give the client the server certificate** if it asks for one, for example as a `.der` file:
   ```sh
   docker compose exec -T node-red openssl x509 -outform der \
     -in /data/pki/own/certs/certificate.pem > wittra-opcua.der
   ```
2. **Configure the client:** the endpoint URL above, security policy Basic256Sha256, mode Sign & Encrypt, and a username and password from `users.json`.
3. **Connect once.** The server refuses the unknown client and stores its certificate in `rejected/`:
   ```sh
   docker compose exec node-red ls /data/pki/rejected
   ```
4. **Trust the certificate by moving it.** Don't copy it: a certificate in `rejected/` wins over the same one in `trusted/`.
   ```sh
   docker compose exec node-red mv "/data/pki/rejected/<file>.pem" /data/pki/trusted/certs/
   ```
   The server notices within about 10 s. If the client is still refused after that, run `docker compose restart node-red`.

To use a different host name later: delete `/data/pki/own/certs/certificate.pem`, restart, and give clients the new certificate.

## Test

```sh
docker compose --profile lab up -d --build
docker compose exec node-red node /opt/bridge/check.js
```

It ends with `PASS`, or with `FAIL` and the failed check. It takes about 25 s, because it waits for the server's certificate-folder poller. It checks that:

- the editor is read-only;
- the only endpoint is Basic256Sha256 with Sign & Encrypt, anonymous login is not offered, and the server certificate is for this host name;
- logins over an unencrypted connection, anonymous logins, wrong passwords and certificate logins are refused;
- an unknown client certificate is refused, and accepted once moved from `rejected/` to `trusted/certs/`;
- a test reading published over MQTT (device `WITTRA-CHECK`) reads back over OPC UA with the right values and data types, a list as an array, units as `EngineeringUnits`, and the reading's timestamp as SourceTimestamp;
- the browse path is `Objects/Devices/<device>/<message type>/<field>`.

The check logs in as the first user in `users.json`. It publishes test data, so it refuses to run unless the bridge uses the lab broker. If `.env` sets another broker, start the test with the lab broker instead, and run `docker compose up -d` afterwards to go back:

```sh
MQTT_URL=mqtt://mosquitto:1883 docker compose --profile lab up -d --build
```

## Known limitations

- **Plain-text passwords.** `users.json` holds passwords in plain text. Keep the file readable by as few people as possible.
- **Security relies on a patch.** The `Dockerfile` patches `node-red-contrib-opcua-compact-server` 2.2.0 to use `scripts/opcua-security.js`. The build fails if the package's code changes, so an upgrade means checking the patch again. The compact server still logs that it runs with "1 insecure/unbounded default", because its own check doesn't see the patch.
- **No model change events.** The script adds nodes inside a model change transaction, but node-opcua only reports an added node when its parent has a `NodeVersion` property, and the nodes this script creates have none. So no `GeneralModelChangeEvent` is sent, and clients must re-browse to find new devices and fields.
- **Host names and addresses.** The certificate names `OPCUA_HOSTNAME` and the container's own IP address, not the host's IP address. Clients should reach the server by `OPCUA_HOSTNAME`.
