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
| `TARGET_TOPIC` | _(same as source)_ | Topic to publish to on the target broker. Supports `<deviceId>` and `<deviceIdShort>` placeholders (see below) |

### Topic placeholders

`TARGET_TOPIC` supports two placeholders that are resolved from the message payload:

| Placeholder | Description |
|---|---|
| `<deviceId>` | Full device ID as found in the payload, e.g. `D0123456789ABCDEF` |
| `<deviceIdShort>` | Device ID with the leading type prefix stripped (`D`, `M`, `L`, `G`), e.g. `0123456789ABCDEF` |

Example: `TARGET_TOPIC=devices/<deviceIdShort>/telemetry`

## Running

```console
$ set -a && . ./.env && set +a
$ .venv/bin/python mqtt_bridge.py
```
