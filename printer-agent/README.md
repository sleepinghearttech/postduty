# Post Duty Bambu Bridge — Phase 1

This local agent is the safe first step toward connecting a Bambu printer to Post Duty.

## Current behaviour

- Runs only on the Post Duty Windows PC.
- Connects only to a private-LAN printer IP.
- Uses the printer's locally pinned TLS certificate.
- Subscribes to Bambu MQTT status reports.
- Emits a compact status record when printer state changes.
- Never stores the Bambu access code or printer certificate in GitHub.
- Never sends printer-control MQTT messages.

## Read-only guarantee

The bridge overrides MQTT `publish()` and throws if code attempts to use it.
Phase 1 therefore cannot start, pause, cancel, heat, move axes, unload filament,
or upload a print.

## One-time local setup

1. Keep the printer in normal cloud-connected mode; LAN Only is not required.
2. Put the PC and printer on the same trusted Wi-Fi/LAN.
3. Copy `.env.example` to `.env`.
4. Fill in the printer IP, serial number, and LAN access code.
5. Run `npm run pin-cert` once to save the printer certificate locally.
6. Run `npm install`, then `npm start`.

The real `.env` and `printer-ca.pem` are ignored by Git and stay on this PC.

## TLS trust model

The first certificate pin is a trust-on-first-use step performed while the printer
is on the user's trusted local network. After that, MQTT uses normal certificate
verification against the pinned printer certificate. If the printer certificate
changes unexpectedly, the bridge should fail closed until the certificate is
deliberately pinned again.

## Permanent scope

This integration is read-only by design and will remain read-only.

Post Duty may:

- Read printer state, current job, temperatures, progress and remaining time.
- Maintain a production queue describing what should be printed next.
- Map approved store SKUs to the corresponding local Bambu project/model name.
- Show whether a queued item is waiting, printing, finished, or ready for manual bed clearing.
- Report printer state back to the Post Duty admin dashboard.
- Keep printer services behind the LAN; never expose port 8883 publicly.

Post Duty will never:

- Start a print.
- Pause, resume or cancel a print.
- Upload a print job.
- Change temperatures, motion, filament, AMS state or printer settings.
- Send any printer-control command.

The operator manually selects and starts every job through Bambu Studio or Bambu Handy.
A person manually removes each completed object from the build plate before the next job.

MakerWorld licensing is tracked separately from printer connectivity.
Printer connectivity never makes a model commercially sellable.
