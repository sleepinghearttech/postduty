import fs from "node:fs";
import tls from "node:tls";
import crypto from "node:crypto";

const ip = process.env.BAMBU_PRINTER_IP || process.argv[2];
if (!ip) {
  throw new Error("Provide BAMBU_PRINTER_IP or pass the printer IP as an argument.");
}

const output = process.env.BAMBU_CA_FILE || "printer-ca.pem";

const socket = tls.connect({
  host: ip,
  port: 8883,
  rejectUnauthorized: false,
  servername: undefined,
});

socket.once("secureConnect", () => {
  const cert = socket.getPeerCertificate(true);
  if (!cert?.raw) throw new Error("Printer did not present a TLS certificate.");

  const pem =
    "-----BEGIN CERTIFICATE-----\n" +
    cert.raw.toString("base64").match(/.{1,64}/g).join("\n") +
    "\n-----END CERTIFICATE-----\n";

  fs.writeFileSync(output, pem, { mode: 0o600 });

  const fingerprint = crypto
    .createHash("sha256")
    .update(cert.raw)
    .digest("hex")
    .match(/.{1,2}/g)
    .join(":")
    .toUpperCase();

  console.log(`Pinned TLS certificate for ${ip}`);
  console.log(`SHA-256 fingerprint: ${fingerprint}`);
  console.log(`Saved locally to: ${output}`);
  socket.end();
});

socket.once("error", (error) => {
  console.error("TLS certificate pinning failed:", error.message);
  process.exitCode = 1;
});
