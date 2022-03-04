# Python Flask Example

Data consumer example built using Python3 and
[Flask](https://github.com/pallets/flask)

## Setup

```console
$ pip3 install --user flask
```

## Running

Running the server:

```console
$ python3 python-flask-example.py
 * Serving Flask app "python-flask-example" (lazy loading)
 * Environment: production
   WARNING: This is a development server. Do not use it in a production deployment.
   Use a production WSGI server instead.
 * Debug mode: off
 * Running on http://127.0.0.1:5000/ (Press CTRL+C to quit)
----- Got message from D0123456789ABCDEF (YYYY-MM-DD HH:MM:SS.ffffff) -------
Message path: /
{'accelerometer': {'x': 0.123, 'y': 0.456, 'z': 0.789},
 'battery': 3.210,
 'gyroscope': {'x': 0.123, 'y': 0.456, 'z': 0.789},
 'magnetometer': {'x': 0.123, 'y': 0.456, 'z': 0.789},
 'neighbours': [{'id': 'D0123012301230123', 'rssi': -12},
                {'id': 'DABCDABCDABCDABCD', 'rssi': -34},
                {'id': 'D0011223344556677', 'rssi': -56}],
 'temperature': 24.321,
 'timestamp': 'YYYY-MM-DDTHH:MM:SS.ffffff',
 'usage': {'moving': 123, 'stationary': 456}}
127.0.0.1 - - [DD/MONTH/YYYY HH:MM:SS] "POST / HTTP/1.1" 200 -
```

## Exposing a local server

To test the setup on a local machine a tunneling service like
[ngrok](https://ngrok.com/) can be used to expose the session. This will give
you a URL to register in the Wittra Portal.

```console
$ ./ngrok http 1234
ngrok by @inconshreveable

Session Status                online
Account                       John Doe (Plan: Free)
Web Interface                 http://127.0.0.1:4040
Forwarding                    http://123456783.ngrok.io -> http://localhost:1234
Forwarding                    https://12345678.ngrok.io -> http://localhost:1234
```

In this case registering `https://12345678.ngrok.io` in the Wittra Portal would
result in the local server getting the data from the Wittra devices.
