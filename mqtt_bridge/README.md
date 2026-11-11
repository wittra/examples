# MQTT Bridge

Relays all messages from a source MQTT broker to a target broker, preserving topic, QoS, and retain flag.

## Installation

`install.sh` is written for Debian/Ubuntu. It needs `python3` and `python3-venv`:

```console
$ sudo apt install python3 python3-venv
```

On other systems, any Python 3 that ships with the `venv` module works.

```console
$ ./install.sh
```

This creates a virtual environment in `.venv`, installs `requirements.txt` into it, and copies `.env.example` to `.env` (if `.env` doesn't already exist).

## Configuration

All settings are provided via environment variables. Edit `.env` to set them:

| Variable | Default | Description |
|---|---|---|
| `SOURCE_HOST` | `localhost` | Source broker hostname |
| `SOURCE_PORT` | `1883` | Source broker port |
| `SOURCE_USER` | _(none)_ | Source broker username |
| `SOURCE_PASS` | _(none)_ | Source broker password |
| `SOURCE_TOPIC` | `#` | Topic filter to subscribe to |
| `SOURCE_TLS` | `false` | Enable TLS for the source connection |
| `TARGET_HOST` | `localhost` | Target broker hostname |
| `TARGET_PORT` | `1883` | Target broker port |
| `TARGET_TLS` | `false` | Enable TLS for the target connection |
| `TARGET_USER` | _(none)_ | Target broker username |
| `TARGET_PASS` | _(none)_ | Target broker password |
| `DEVICE_TYPES` | _(all)_ | Only relay devices whose ID starts with one of these letters, comma separated, e.g. `D,L,M` to skip gateways (`G`) |
| `TARGET_TOPIC` | _(same as source)_ | Topic to publish to on the target broker. Supports `<deviceId>` and `<deviceIdShort>` placeholders (see below) |

### Topic placeholders

`TARGET_TOPIC` supports two placeholders that are resolved from the message payload:

| Placeholder | Description |
|---|---|
| `<deviceId>` | Full device ID as found in the payload, e.g. `D0123456789ABCDEF` |
| `<deviceIdShort>` | Device ID with the leading type prefix stripped (`D`, `M`, `L`, `G`), e.g. `0123456789ABCDEF` |

### Example: relay all devices of a project

```
SOURCE_TOPIC='customer/abc123/telemetry/+'
TARGET_TOPIC='/up/mysecret/id/<deviceIdShort>'
```

The `+` matches every device of project `abc123`. Each message is published on its own target topic:

| Message received on the source broker | Published on the target broker |
|---|---|
| `customer/abc123/telemetry/LA81758FFFE0F4508` | `/up/mysecret/id/A81758FFFE0F4508` |
| `customer/abc123/telemetry/D00124B0026ACFA97` | `/up/mysecret/id/00124B0026ACFA97` |
| `customer/abc123/telemetry/GA0B1C2D3E4F5A6B7` | `/up/mysecret/id/A0B1C2D3E4F5A6B7` |

If `TARGET_TOPIC` is not set, each message is published on the same topic it arrived on.

### Example: relay only some device types

The first letter of a device ID is its type:

| Letter | Device type |
|---|---|
| `D` | Wittra device |
| `M` | mioty device |
| `L` | LoRa device |
| `G` | gateway |

By default every device is relayed, gateways included. To relay only some types, list their letters in `DEVICE_TYPES`:

```
SOURCE_TOPIC='customer/abc123/telemetry/+'
DEVICE_TYPES=D,L,M
```

| Message received on the source broker | Result |
|---|---|
| `customer/abc123/telemetry/D00124B0026ACFA97` | relayed |
| `customer/abc123/telemetry/LA81758FFFE0F4508` | relayed |
| `customer/abc123/telemetry/G01230C1D29E2695EEE` | skipped, the bridge prints `Skipping … device type 'G' is not in DEVICE_TYPES` |

## Running

Keep the settings in `.env` and load them as below.

```console
$ set -a && . ./.env && set +a
$ .venv/bin/python mqtt_bridge.py
```

On start the bridge prints the exact filter it subscribes to and the broker's answer:

```
Connected to source with result code Success
Subscribing to 'customer/<projectId>/telemetry/#'
Subscription result: ['Granted QoS 0']
```

Check that the printed filter is the one you configured. Each relayed message prints a `Relaying <source topic> -> <target topic>` line.
