// Node-RED settings for the bridge, mounted read-only (see docker-compose.yml).
// Anything not set here keeps Node-RED's default.
module.exports = {
    // The flow file is set by FLOWS in docker-compose.yml: the image passes it on the command line.

    // flows_cred.json only holds ${MQTT_USER} and ${MQTT_PASS} placeholders, so it needs no encryption.
    credentialSecret: false,

    // Everyone gets read-only access to the editor: change the flow in git, not on the running box.
    adminAuth: {
        type: "credentials",
        users: [],
        default: { permissions: "read" },
    },

    // The ingest and address-space scripts keep their data in the "memoryOnly" store.
    contextStorage: {
        default: { module: "memory" },
        memoryOnly: { module: "memory" },
    },
};
