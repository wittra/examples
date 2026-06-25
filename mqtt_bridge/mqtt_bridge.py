import paho.mqtt.client as mqtt
import ssl
import os

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

target = None


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected to source with result code {reason_code}")
    client.subscribe(SOURCE_TOPIC)


def on_message(client, userdata, msg):
    print(f"Relaying {msg.topic}")
    target.publish(msg.topic, msg.payload, qos=msg.qos, retain=msg.retain)


def main():
    global target

    target = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if TARGET_USER:
        target.username_pw_set(TARGET_USER, TARGET_PASS)
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
