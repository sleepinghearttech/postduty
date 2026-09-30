import fs from "node:fs";
import mqtt from "mqtt";

const {
  BAMBU_PRINTER_IP: ip,
  BAMBU_PRINTER_SERIAL: serial,
  BAMBU_ACCESS_CODE: accessCode,
  BAMBU_CA_FILE: caFile = "printer-ca.pem",
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

  if (!fs.existsSync(caFile)) {
    throw new Error(
      `Pinned printer certificate not found at ${caFile}. Run npm run pin-cert first.`
    );
  }
}

requireLocalConfig();

const deviceCa = fs.readFileSync(caFile);

const bambuCaCandidates = [
  process.env.BAMBU_PRINTER_CA_BUNDLE,
  "D:/Bambu Lab/Bambu Studio/resources/cert/printer.cer",
  "C:/Program Files/Bambu Studio/resources/cert/printer.cer",
].filter(Boolean);

const bambuCaFile = bambuCaCandidates.find((candidate) =>
  fs.existsSync(candidate)
);

if (!bambuCaFile) {
  throw new Error(
    "Bambu Studio printer.cer not found. Install Bambu Studio or set " +
      "BAMBU_PRINTER_CA_BUNDLE to its resources/cert/printer.cer path."
  );
}

const bambuCa = fs.readFileSync(bambuCaFile);
const maskedSerial =
  serial.length > 4 ? `…${serial.slice(-4)}` : "(configured)";
const topic = `device/${serial}/report`;
const state = {};
let lastStatusKey = "";
let lastStatusWriteAt = 0;

const client = mqtt.connect(`mqtts://${ip}:8883`, {
  username: "bblp",
  password: accessCode,
  clientId: `postduty-readonly-${process.pid}`,
  clean: true,
  protocolVersion: 4,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: true,
  ca: [bambuCa, deviceCa],
  allowPartialTrustChain: true,
  servername: serial,
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

    const statusKey = JSON.stringify({
      state: status.state,
      progressPct: status.progressPct,
      remainingMinutes: status.remainingMinutes,
      nozzleC: status.nozzleC,
      nozzleTargetC: status.nozzleTargetC,
      bedC: status.bedC,
      bedTargetC: status.bedTargetC,
      wifiSignal: status.wifiSignal,
      jobName: status.jobName,
    });

    const now = Date.now();
    const changed = statusKey !== lastStatusKey;
    const heartbeatDue = now - lastStatusWriteAt >= 60000;

    if (changed || heartbeatDue) {
      fs.writeFileSync(
        "bridge-status.json",
        JSON.stringify(status, null, 2),
        "utf8"
      );
      lastStatusWriteAt = now;
    }

    if (changed) {
      lastStatusKey = statusKey;
      console.log(JSON.stringify(status));
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
