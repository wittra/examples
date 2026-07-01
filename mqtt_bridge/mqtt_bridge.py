import paho.mqtt.client as mqtt
import ssl
import os
import json

SOURCE_HOST = os.environ.get("SOURCE_HOST", "localhost")
SOURCE_PORT = int(os.environ.get("SOURCE_PORT", "1883"))
SOURCE_USER = os.environ.get("SOURCE_USER", "")
SOURCE_PASS = os.environ.get("SOURCE_PASS", "")
SOURCE_TOPIC = os.environ.get("SOURCE_TOPIC", "#")
SOURCE_TLS = os.environ.get("SOURCE_TLS", "").lower() in ("1", "true", "yes")

TARGET_HOST = os.environ.get("TARGET_HOST", "localhost")
TARGET_PORT = int(os.environ.get("TARGET_PORT", "1883"))
TARGET_USER = os.environ.get("TARGET_USER", "")
TARGET_PASS = os.environ.get("TARGET_PASS", "")
TARGET_TOPIC = os.environ.get("TARGET_TOPIC", "")
TARGET_TLS = os.environ.get("TARGET_TLS", "").lower() in ("1", "true", "yes")

target = None


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected to source with result code {reason_code}")
    client.subscribe(SOURCE_TOPIC)


def on_message(client, userdata, msg):
    dest = TARGET_TOPIC if TARGET_TOPIC else msg.topic
    parts = dest.split("/")
    if "<deviceId>" in parts or "<deviceIdShort>" in parts:
        try:
            device_id = json.loads(msg.payload)["deviceId"]
            device_id_short = device_id[1:] if device_id and device_id[0] in ("D", "M", "L", "G") else device_id
            dest = dest.replace("<deviceId>", device_id).replace("<deviceIdShort>", device_id_short)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Failed to extract deviceId: {e}")
            return
    print(f"Relaying {msg.topic} -> {dest}")
    target.publish(dest, msg.payload, qos=msg.qos, retain=msg.retain)


def main():
    global target

    target = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if TARGET_USER:
        target.username_pw_set(TARGET_USER, TARGET_PASS)
    if TARGET_TLS:
        target.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
    target.connect(TARGET_HOST, TARGET_PORT)
    target.loop_start()

    source = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if SOURCE_USER:
        source.username_pw_set(SOURCE_USER, SOURCE_PASS)
    if SOURCE_TLS:
        source.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
    source.on_connect = on_connect
    source.on_message = on_message

    source.connect(SOURCE_HOST, SOURCE_PORT)
    source.loop_forever()


if __name__ == "__main__":
    main()
