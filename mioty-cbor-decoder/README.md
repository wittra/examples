# Decoding CBOR Mioty-tag Payload

Currently, Wittra sensors transmit data in CBOR format, a compressed JSON representation.
To decode this data:

1. **Obtain the Raw Data:** Get the payload from the service center.
2. **Decode the CBOR:** Use a CBOR library in your preferred programming language (e.g., Python's cbor2) to parse the binary data into a JSON structure.

## Sensor Configurability

Wittra sensors offer flexible configuration options to customize:

- **Enabled Sensors:** Select which sensors to activate or deactivate.
- **Data Transmission Intervals:** Set the frequency of data transmission for each enabled sensor.
- **Data Conditions:** Configure specific conditions that trigger data transmission (e.g., temperature thresholds, motion detection).

The sensor asks for the configuration the first time it boots, then every six hours.
This period is also configurable, nd we can disable teh configuration request completely.
By tailoring these settings, you can optimize data collection and transmission to suit your specific application requirements.
However, this is only possible through the Wittra Portal and using Wittra's gateway as of today.

### Note on Future Format

We're transitioning to a blueprint-compatible binary format for future sensor data.
This change will simplify data handling and processing.
We'll provide detailed information about the new format and decoding instructions closer to the transition.

## The decoded JSON Format

Decoding CBOR will give a standard JSON object, where only the enabled sensors are posted.
Note that this format is an internal representation, and we do not guarantee its stability across releases, but in practice it has been pretty stable.

```json
{
  "v3": {
    "s": "e", // source is event
    "d": { // Sensor data
      // Accelerometer data list [x, y, z] (mg)
      "a": [97, -43, -1016],
      // Accelerometer impact, this will always be event driven and reflect
      // the values that triggered the impact detection
      "i": {
        // Impact data [x, y, z] (mg)
        "a": [-1050, 10, 100]
      },
      // Temperature (mC)
      "t": 24351,
      // Usage list [moving, stationary] (s)
      "u": [0, 15],
      // Magnetometer data list [x, y, z] (mGauss)
      "m": [-25, 240, 418],
      // Fluid level (0 or 1)
      "f": 0,
      // Pressure [pressure (hPa)]
      "p": [1001.48486],
      // UWB Pressure [pressure (hPa)]
      "P": [1013.1232],
      // Humidity [humidity (percentage), temperature (°mC)]
      "h": [78, 22.5],
      // Light (lux)
      "l": 70,
      // current meter
      "c": {
        // Current measurement [min (mA), max (mA), avg-since-last-post (mA), number-of-samples-taken]
        "i": [0, 2567, 1285, 15],
        // Battery voltage (mv)
        "V": 3945,
        // Battery temperature (Kelvin)
        "T": 298
      },
      // sensorbridge currentloop [latest, min, max, avg-since-last-post] (μA)
      "f": [46, 0, 64, 32],
      // sensorbridge rtd [latest, min, max, avg-since-last-post] (mOhm)
      "r": [443264, 1223, 5946309, 2363160],
      // sensorbridge digitalin [current state, count-since-last-post, minimum period, maximum period] (Boolean, Number of falling edges, time in milliseconds, time in milliseconds)
      "q": [true, 42, 120, 2045]
    }
  }
}
```

## Decoding Example

You can decode the payload in any popular programming language that has a CBOR library.
In the following sections you will see two examples, one in Python and the other in JavaScript.

### Python example

It has been tested with Python 3.10.
It depends on the library cbor2, which can be installed using pip:
`pip3 install cbor2`.
[Download the example here](./scripts/standalone-mioty-cbor-decoder.py)

Here is a code snippet that shows CBOR decoding

```python
import cbor2

# Assuming you have the raw CBOR data in a byte string
raw_data = b"A1627633A2617361656164BF616183183A2E190421FF"

# Decode the CBOR data
decoded_data = cbor2.loads(raw_data)

# Print the decoded JSON
print(decoded_data)
```

### JavaScript example

We use a CBOR library like cbor-web: `https://unpkg.com/cbor-web@9.0.2/dist/cbor.js`.

Check this minimal working example in a web document where you can enter the payload in a textbox and it will decode it and print it.
[Download it here](./scripts/mioty-cbor-parser.html)

```javascript
const payloadHex = "A1627633A2617361656164BF616183183A2E190421FF";

// Convert hex string to Uint8Array
const buf = new Uint8Array(payloadHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

// Decode the CBOR data
cbor.decodeFirst(buf, {bigint: true, preferWeb: true}).then(o => {
  // Convert the decoded CBOR data to JSON
  const jsonData = JSON.stringify(o, null, 2);
  // Display the JSON data
  outputDiv.innerHTML = `<pre>${jsonData}</pre>`;
}).catch(error => {
  console.error('Error decoding payload:', error);
  outputDiv.innerHTML = `<p>Error decoding payload: ${error}</p>`;
});
```

This code will decode an example payload `A1627633A2617361656164BF616183183A2E190421FF` of a Wittra sensor.
It only contains the accelerometer measurement in this case, but it will work with any other sensor.

#### The output of this example

JSON object with an array of the x, y, z acceleration values.

```json
{
  "v3": {
    "s": "e",
    "d": {
      "a": [
        58,
        -15,
        1057
      ]
    }
  }
}
```
