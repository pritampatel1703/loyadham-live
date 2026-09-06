# Loyadham Pixel Perfect — Broadcast Production Platform

Real-time multi-camera broadcast production and event coordination system featuring:
- Live RTMP ingestion from DJI Drones, GoPro, and vMix / OBS.
- WebRTC & RTMP live low-latency preview player.
- Instant Cloudflare Public Tunnel generation with QR Code for mobile camera operators on 4G/5G.
- PTZ camera controls, ATEM switcher integration, and live tally indicators.
- Offline memory mode fallback when PostgreSQL is not present.

---

## 🚀 Running on ANY Windows PC (Zero-Setup)

You can copy this folder or run directly from an external drive on any Windows PC.

### Starting the Event
Simply double-click:
```
start_event.bat
```
- **Auto-Detection & Auto-Install**: If the PC is missing Node.js, dependencies, or Cloudflare Tunnel, `start_event.bat` automatically downloads, installs, and configures everything in the background without needing Administrator privileges.
- Starts the backend server on port 4000.
- Launches the public Cloudflare tunnel and displays the QR code for mobile camera crews.

### Stopping the Event
To cleanly terminate the server, tunnel, and release network ports (4000, 8009, 1935):
```
stop_event.bat
```

---

## 📡 Network Ports Used
- `4000`: Web Dashboard & REST API
- `8009`: RTMP-FLV HTTP stream proxy
- `1935`: RTMP Camera ingestion port (DJI, GoPro, vMix)
