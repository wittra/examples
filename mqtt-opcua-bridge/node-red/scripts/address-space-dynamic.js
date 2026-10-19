function constructAddressSpaceScript(server, addressSpace, eventObjects, done) {
  // Dynamic address space - paste this guy over the OPC UA Compact Server node's
  // "Address Space Script". 
  // 
  // No Tag Dictionary needed (You will notice many OPC UA Examples use a Tag Dictionary as placeholders for tags).
  //
  // A good approach here is event loop that scans the OpcData map in flow context 
  // (remember mqtt-ingest.js?) every SCAN_MS. A path seen for the first time is added
  // while the server keeps running; known paths just get their value updated.
  //
  //   Objects
  //    └ Devices                          Folder
  //       └ SOME-DEVICE-ID                Object  (one per device)
  //          └ some-object-property       Object  (one per message type)
  //             └ uptime                  Double, AnalogUnitType, EU = s
  //
  // - Numbers become Double, booleans Boolean, anything else String.
  //   Arrays (batches) stay one array variable.
  // - Numbers with a unit are AnalogUnitType with EngineeringUnits set.
  // - The message timestamp is used as the value's SourceTimestamp.
  // - Nodes are never removed while the server runs; a redeploy starts
  //   from an empty address space.

  const DATA_KEY = "OpcData";
  const HEARTBEAT_KEY = "OpcDataLastUpdate";
  const STORE = "memoryOnly";
  const SCAN_MS = 200;
  const STALE_MS = 300000; // This can be used to tweak when th OPC UA consider the data stale.
  const ALLOW_WRITES = false; // The clients may write (if true), but in general the idea here is just to show data. Maybe if you are implementing a control system you want to allow writes, but be careful with that...

  const opcua = coreServer.choreCompact.opcua;
  const { Variant, VariantArrayType, DataType, DataValue, StatusCodes } = opcua;
  // node-opcua wants Double arrays as a Float64Array from its own realm; the
  // sandbox's Float64Array fails its instanceof check and logs a warning on
  // every read. An empty Variant hands us node-opcua's constructor.
  // This is a bit of a hack, but it works...I used Claude to do it honestly, I don't know how to do it better.
  const HostFloat64Array = new Variant({
    dataType: DataType.Double,
    arrayType: VariantArrayType.Array,
    value: [],
  }).value.constructor;

  // Keys are upper-cased with any "UNIT_" prefix removed. Units without a
  // well-known UNECE code use unitId -1, which the OPC UA spec allows.
  const UNITS = {
    SECOND: ["SEC", "s", "second"],
    DAY: ["DAY", "d", "day"],
    DAYS: ["DAY", "d", "day"],
    BYTE: ["AD", "B", "byte"],
    DECIBEL: ["2N", "dB", "decibel"],
    LUX: ["LUX", "lx", "lux"],
    PERCENT: ["P1", "%", "percent"],
    CELSIUS: ["CEL", "°C", "degree Celsius"],
    DEGREE_CELSIUS: ["CEL", "°C", "degree Celsius"],
    DECIBEL_MILLIWATT: [null, "dBm", "decibel-milliwatt"],
    DBM: [null, "dBm", "decibel-milliwatt"],
    DBA: [null, "dB(A)", "A-weighted decibel"],
    "%RH": [null, "%RH", "relative humidity"],
    COUNT: [null, "count", "count"],
  };
  const NO_UNIT = ["", "UNSPECIFIED", "NONE"];

  // Here we build the address space "foundation" with a "Devices" folder.
  // If you don't like the name "Devices", change it here.
  // #TODO: Marked with TODO, because it is a good idea to make it a parameter in the future.
  const namespace = addressSpace.getOwnNamespace();
  const devicesFolder = namespace.addFolder(addressSpace.rootFolder.objects, {
    browseName: "Devices",
    nodeId: "s=Devices",
  });

  const analogUnitType = addressSpace.findVariableType("AnalogUnitType");
  // This looks up the standard OPC UA type AnalogUnitType in namespace 0, the OPC Foundation's built-in types.
  // To understand better, open a OPC UA client and browse on the root folder inside Types, and you'll realize what it is.

  const objects = new Map(); // "dev/msgType" -> object node
  const tags = new Map(); // "dev/msgType/field" -> { entry, kind }
  const rejected = new Set(); // paths that could not be added
  let stale = false;

  function engineeringUnits(unit) {
    const name = String(unit || "").trim();
    const key = name.toUpperCase().replace(/^UNIT_/, "");

    if (NO_UNIT.includes(key)) {
      return null;
    }
    const [code, symbol, description] = UNITS[key] || [null, name, name];
    const eu = opcua.makeEUInformation(code || "", symbol, description);
    
    if (!code) {
      eu.unitId = -1;
    }
    return eu;
  }

  // { dataType, isArray } for a value, or null while it can't be told yet
  // (an empty array) - the path is then retried on the next scan.
  function inferKind(value) {
    const isArray = Array.isArray(value);
    const items = isArray ? value : [value];

    if (items.length === 0) {
      return null;
    }

    let dataType = DataType.String;
    if (items.every((v) => typeof v === "number")) {
      dataType = DataType.Double;
    } else if (items.every((v) => typeof v === "boolean")) {
      dataType = DataType.Boolean;
    }

    return { dataType, isArray };
  }

  function coerce(dataType, v) {
    switch (dataType) {
      case DataType.Double:
        return Number(v);
      case DataType.Boolean:
        return typeof v === "string" ? v.toLowerCase() === "true" : !!v;
      default:
        return typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  function toVariant(kind, value) {
    if (kind.isArray) {
      const items = (Array.isArray(value) ? value : [value]).map((v) => coerce(kind.dataType, v));

      return new Variant({
        dataType: kind.dataType,
        arrayType: VariantArrayType.Array,
        value: kind.dataType === DataType.Double ? HostFloat64Array.from(items) : items,
      });
    }

    const v = Array.isArray(value) ? value[0] : value;
    return new Variant({ dataType: kind.dataType, value: coerce(kind.dataType, v) });
  }

  function sourceTimestamp(entry) {
    const date = new Date(entry.timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  // This function ensures that the object hierarchy exists for a given path. It creates any missing objects 
  // along the way. It is used inside addTag(), keep reading to understand how the address space is built 
  // dynamically.
  function ensureObject(segments) {

    const key = segments.join("/");
    let object = objects.get(key);

    if (!object) {
      const browseName = segments[segments.length - 1];
      object =
        segments.length === 1
          ? namespace.addObject({ organizedBy: devicesFolder, browseName, nodeId: "s=" + key })
          : namespace.addObject({ componentOf: ensureObject(segments.slice(0, -1)), browseName, nodeId: "s=" + key });
      objects.set(key, object);
    }
    return object;
  }

  // Bear with me, this function is a bit long, but it is the core of the dynamic address space creation and
  //  update. It is called from the scan() function below, which is called every SCAN_MS milliseconds.
  function addTag(path, entry) {

    // If there is no value, we can't infer the kind, so we skip it.
    const kind = inferKind(entry.value);
    if (!kind) {
      return false;
    }

    // The path is split into segments, and we create the object hierarchy if it doesn't exist yet.
    const segments = path.split("/").filter(Boolean);
    const tag = { entry, kind };
    const eu = kind.dataType === DataType.Double ? engineeringUnits(entry.unit) : null;
    const access = ALLOW_WRITES ? "CurrentRead | CurrentWrite" : "CurrentRead";
    
    // Here we create the variable node in the address space. If it already exists, we just update the value.
    const options = {
      componentOf: ensureObject(segments.slice(0, -1)),
      browseName: segments[segments.length - 1],
      nodeId: "s=" + segments.join("/"),
      dataType: kind.dataType,
      valueRank: kind.isArray ? 1 : -1,
      arrayDimensions: kind.isArray ? [0] : null,
      minimumSamplingInterval: SCAN_MS,
      accessLevel: access,
      userAccessLevel: access,
    };
    
    const binding = {
      timestamped_get: () =>
        new DataValue({
          value: toVariant(tag.kind, tag.entry.value),
          statusCode: stale ? StatusCodes.BadNoCommunication : StatusCodes.Good,
          sourceTimestamp: sourceTimestamp(tag.entry),
        }),
    };

    // If writes are allowed, we add a set() function to the binding that updates the entry 
    // and sends a message to the node-red flow. The thing doesn't actually write to the device, 
    // it just updates the entry in OpcData and sends a message to the flow. You have to implement the actual
    //  write to the device in your flow, if you want to do that.
    // Claude thought it was a good idea to allow writes, handle with care.
    if (ALLOW_WRITES) {
      binding.set = (variant) => {
        tag.entry = Object.assign({}, tag.entry, { value: variant.value, timestamp: new Date().toISOString() });
        // Keep the map in sync, otherwise the next scan reverts the write.
        const data = sandboxFlowContext.get(DATA_KEY, STORE) || {};
        data[path] = tag.entry;
        sandboxFlowContext.set(DATA_KEY, data, STORE);
        node.send({ topic: "WriteRequest", tagName: path, payload: variant.value });
        return StatusCodes.Good;
      };
    }

    // Now we actually add the variable to the address space. If it fails, we log a warning and add the path to
    //  the rejected set, so we don't try to add it again (maybe you wan to implement a retry mechanism in the 
    // future, but for now we just skip it).
    try {
      let variable;
      if (eu) {
        variable = analogUnitType.instantiate(options);
        variable.getPropertyByName("EngineeringUnits").setValueFromSource({
          dataType: DataType.ExtensionObject,
          value: eu,
        });
      } else {
        variable = namespace.addVariable(options);
      }
      variable.bindVariable(binding, true);
    } catch (err) {
      node.warn("Could not add OPC UA tag '" + path + "': " + err.message);
      rejected.add(path);
      return false;
    }
    tags.set(path, tag);
    return true;
  }

  // This is the main loop that scans the OpcData map in flow context every SCAN_MS.
  // If you want to add anything to the address space, you can do it here!
  // Or add any funny logic you want, like removing tags that have not been updated for a long time, etc.
  function scan() {
    const data = sandboxFlowContext.get(DATA_KEY, STORE) || {};
    const lastUpdate = sandboxFlowContext.get(HEARTBEAT_KEY, STORE);
    stale = typeof lastUpdate === "number" && Date.now() - lastUpdate > STALE_MS;

    const newPaths = [];
    for (const path of Object.keys(data)) {
      const entry = data[path];
      if (!entry || typeof entry !== "object" || !("value" in entry)) {
        continue; // not written by mqtt-ingest.js
      }
      const tag = tags.get(path);
      if (tag) {
        tag.entry = entry; // the ingest stores a new object per message
      } else if (!rejected.has(path)) {
        newPaths.push(path);
      }
    }

    if (newPaths.length > 0) {
      // Wrapped in a model change transaction so clients that listen for
      // GeneralModelChangeEvents know to re-browse.
      addressSpace.modelChangeTransaction(() => {
        newPaths.forEach((path) => addTag(path, data[path]));
      });
    }

    const devices = new Set([...tags.keys()].map((path) => path.split("/")[0]));
    node.status({
      fill: stale ? "yellow" : "green",
      shape: "dot",
      text:
        "Devices: " + devices.size +
        " | Tags: " + tags.size +
        " | Sessions: " + (server.engine ? server.engine.currentSessionCount : 0) +
        (stale ? " | stale" : ""),
    });
  }

  // The sandbox tracks this interval and clears it when the node closes.
  setInterval(scan, SCAN_MS);
  scan();
  done();
}
