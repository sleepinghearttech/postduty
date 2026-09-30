# Post Duty Bambu Bridge — Phase 1

This local agent is the safe first step toward connecting a Bambu printer to Post Duty.

## What Phase 1 does

- Runs only on the Post Duty Windows PC.
- Connects to a printer on a private LAN address.
- Subscribes to Bambu MQTT status reports.
- Prints a small status JSON record when printer state changes.
- Never sends print/control MQTT messages.
- Never stores the Bambu access code in GitHub.

## What Phase 1 does not do

It cannot start, pause, cancel, heat, move axes, unload filament, or upload a print.
The code overrides MQTT `publish()` so those actions are unavailable.

## One-time local setup

1. Power on the printer and connect it to the same trusted Wi-Fi/LAN as this PC.
2. On the printer, open its network settings and enable LAN-only/local access.
3. For the first read-only test, leave Developer Mode OFF.
4. Note the printer's LAN IP, serial number, and LAN access code.
5. In this folder, copy `.env.example` to `.env`.
6. Put those three values into `.env`.
7. Set `BAMBU_ALLOW_UNVERIFIED_TLS=true` only while on your trusted private LAN.
8. Run `npm install`, then `npm start`.

The real `.env` is ignored by Git and must stay on this PC.

## Security note

Bambu's local MQTT service commonly uses a device/self-signed TLS certificate.
This first bridge therefore requires an explicit opt-in for unverified local TLS.
The next hardening step is certificate/fingerprint pinning before enabling any
printer-control capability.

## Planned Phase 2

Once read-only status is stable:

- Add a Post Duty print queue in Supabase.
- Map store SKUs to approved local `.gcode.3mf` files.
- Report printer state back to the Post Duty admin dashboard.
- Keep the printer behind the home/business LAN; never expose port 8883 publicly.
- Add a deliberate approval gate before any print-start capability.
- Prefer Bambu Connect for authorized print handoff where practical.

MakerWorld model licensing is tracked separately from printer connectivity.
A model is never made sellable merely because the printer can print it.
