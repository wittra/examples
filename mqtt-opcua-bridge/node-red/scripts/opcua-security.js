// Security settings for the OPC UA server.
//
// node-red-contrib-opcua-compact-server has no settings for these: its own login check accepts every
// username and password. The Dockerfile patches its server start-up to merge in the options this
// function returns (they override the package's own). Loaded from /opt/bridge, see docker-compose.yml.
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
    OPCUACertificateManager, MessageSecurityMode, SecurityPolicy, makeRoles, WellKnownRoles,
} = require("node-opcua");

// Server certificate, private key and trusted/rejected client certificates, in the data volume.
const PKI = "/data/pki";
const USERS_FILE = "/run/secrets/opcua-users.json";

// An entry without a non-empty password string never matches.
function passwordMatches(expected, given) {
    if (typeof expected !== "string" || expected === "") return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Read on every login. users.json is mounted as a single file, so a file that is replaced rather
// than edited in place is only seen after a restart.
function isValidUser(userName, password) {
    let users;
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (err) {
        console.error(`[opcua-security] cannot read ${USERS_FILE}: ${err.message}`);
        return false;
    }
    const user = Array.isArray(users) && users.find((u) => u && u.username === userName);
    return Boolean(user && typeof password === "string" && passwordMatches(user.password, password));
}

module.exports = () => ({
    allowAnonymous: false,
    // Only Basic256Sha256 with Sign & Encrypt, the policy the Siemens connectors use.
    securityModes: [MessageSecurityMode.SignAndEncrypt],
    securityPolicies: [SecurityPolicy.Basic256Sha256],
    // Clients ask for the endpoint list (GetEndpoints) over an unencrypted channel before connecting.
    // Keep that possible; logins over such a channel are still refused.
    disableDiscovery: false,
    // Unknown client certificates land in /data/pki/rejected until moved to /data/pki/trusted/certs.
    serverCertificateManager: new OPCUACertificateManager({
        name: "PKI",
        rootFolder: PKI,
        automaticallyAcceptUnknownCertificate: false,
    }),
    // Certificate logins (X509 user tokens) are refused unless their certificate is trusted by hand.
    userCertificateManager: new OPCUACertificateManager({
        name: "UserPKI",
        rootFolder: `${PKI}-users`,
        automaticallyAcceptUnknownCertificate: false,
    }),
    // Created on first start for this host name, then kept in the data volume.
    certificateFile: `${PKI}/own/certs/certificate.pem`,
    privateKeyFile: `${PKI}/own/private/private_key.pem`,
    userManager: {
        isValidUser,
        getUserRoles: () => makeRoles([WellKnownRoles.AuthenticatedUser]),
    },
});
