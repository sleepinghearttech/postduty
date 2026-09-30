import mqtt from "mqtt";

const {
  BAMBU_PRINTER_IP: ip,
  BAMBU_PRINTER_SERIAL: serial,
  BAMBU_ACCESS_CODE: accessCode,
  BAMBU_ALLOW_UNVERIFIED_TLS: allowUnverifiedTls,
} = process.env;

function isPrivateIPv4(value = "") {
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  const match = value.match(/^172\.(\d+)\./);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function requireLocalConfig() {
  const missing = [];
  if (!ip) missing.push("BAMBU_PRINTER_IP");
  if (!serial) missing.push("BAMBU_PRINTER_SERIAL");
  if (!accessCode) missing.push("BAMBU_ACCESS_CODE");
  if (missing.length) {
    throw new Error(`Missing local settings: ${missing.join(", ")}`);
  }

  if (!isPrivateIPv4(ip)) {
    throw new Error("BAMBU_PRINTER_IP must be a private LAN IPv4 address.");
  }

  if (allowUnverifiedTls !== "true") {
    throw new Error(
      "Set BAMBU_ALLOW_UNVERIFIED_TLS=true only on a trusted private LAN. " +
        "Certificate pinning will replace this temporary opt-in."
    );
  }
}

requireLocalConfig();

const maskedSerial =
  serial.length > 4 ? `…${serial.slice(-4)}` : "(configured)";
const topic = `device/${serial}/report`;
const state = {};
let lastStatusJson = "";

const client = mqtt.connect(`mqtts://${ip}:8883`, {
  username: "bblp",
  password: accessCode,
  clientId: `postduty-readonly-${process.pid}`,
  clean: true,
  protocolVersion: 4,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: false,
});

client.publish = () => {
  throw new Error("Read-only bridge: MQTT publish is disabled.");
};

client.on("connect", () => {
  console.log(
    `Connected read-only to Bambu printer ${maskedSerial} at ${ip}.`
  );
  client.subscribe(topic, { qos: 0 }, (error) => {
    if (error) console.error("Subscribe failed:", error.message);
    else console.log("Subscribed to printer status.");
  });
});

client.on("message", (_topic, buffer) => {
  try {
    const payload = JSON.parse(buffer.toString("utf8"));
    const incoming = payload.print || payload;
    if (!incoming || typeof incoming !== "object") return;

    Object.assign(state, incoming);

    const status = {
      timestamp: new Date().toISOString(),
      printer: maskedSerial,
      state: state.gcode_state ?? null,
      progressPct: state.mc_percent ?? null,
      remainingMinutes: state.mc_remaining_time ?? null,
      nozzleC: state.nozzle_temper ?? null,
      nozzleTargetC: state.nozzle_target_temper ?? null,
      bedC: state.bed_temper ?? null,
      bedTargetC: state.bed_target_temper ?? null,
      wifiSignal: state.wifi_signal ?? null,
      jobName: state.subtask_name ?? null,
    };

    const json = JSON.stringify(status);
    if (json !== lastStatusJson) {
      lastStatusJson = json;
      console.log(json);
    }
  } catch (error) {
    console.error("Ignored malformed status message:", error.message);
  }
});

client.on("reconnect", () => {
  console.log("Reconnecting to printer…");
});

client.on("offline", () => {
  console.log("Printer connection offline.");
});

client.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

process.on("SIGINT", () => {
  client.end(true, () => process.exit(0));
});
