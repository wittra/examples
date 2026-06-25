# MQTT Bridge

Relays all messages from a source MQTT broker to a target broker, preserving topic, QoS, and retain flag.

## Requirements

```console
$ pip3 install paho-mqtt
```

## Configuration

All settings are provided via environment variables:

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
| `TARGET_USER` | _(none)_ | Target broker username |
| `TARGET_PASS` | _(none)_ | Target broker password |

## Running

```console
$ python3 mqtt_bridge.py
```
