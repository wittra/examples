from flask import Flask, request, abort
import base64
import json
import pprint
import datetime
app = Flask(__name__)

@app.route('/', defaults={'path': ''}, methods=['POST'])
@app.route('/<path:path>', methods=['POST'])
def log_payload(path):
    # Check valid request media type
    if request.content_type != 'application/json':
        return 'Content type is not JSON', 415

    # Ensure that payload is a dictionary
    data = request.json
    if not isinstance(data, dict):
        return 'Payload is not JSON', 500

    # Get message data
    try:
        device_id = data['deviceId']
        payload = data.get('payload', {})
        timestamp = data.get('timestamp', '(no timestamp provided)')
        print('----- Got message from {} ({}) -------'.format(device_id, timestamp))
        pprint.pprint(payload)
    except:
        print('----- Got message that could not be parsed -----')
        print(payload)
    return 'OK', 200

if __name__ == '__main__':
    app.run()
