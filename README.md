# Wi-Fi & BACnet Coexistence Simulator

An interactive Single Page Application (SPA) designed to simulate BACnet automation traffic coexisting on Wi-Fi networks alongside general internet traffic, highlighting the critical importance of managing broadcast traffic.

### 🔗 Live Simulation
Access the live interactive dashboard here:  
**[https://ace-iot-solutions.github.io/wifi-bacnet-simulator/](https://ace-iot-solutions.github.io/wifi-bacnet-simulator/)**

---

## Features & Mathematical Model

The simulator approximates medium contention dynamics based on IEEE 802.11 (CSMA/CA) and ASHRAE 135 (BACnet) standards:

1.  **WiFi Standard Selection (802.11b/g/n/ac/ax/be):** Models the physical unicast MCS data rates, mandatory basic broadcast rates, preambles, and slot times for each standard.
2.  **Frequency Band Selection (2.4 GHz vs. 5 GHz):** Simulates real-world IoT constraints where 2.4 GHz bands are restricted to 20 MHz channel widths (capping top rates) and require longer slot times (20 $\mu\text{s}$ instead of 9 $\mu\text{s}$) for backward compatibility with legacy devices.
3.  **Contention & Collision Rate ($P_c$):** Uses a hybrid model combining duty-cycle random overlap under light loads and Bianchi's DCF saturation approximation for dense environments.
4.  **Broadcast airtime penalty (BACnet/IP):** Demonstrates how BACnet/IP subnet broadcasts are sent over the air at basic rates (e.g. 6 Mbps instead of 866 Mbps) without CSMA acknowledgement (ACK). Since they consume up to 140x more airtime per byte, they choke the channel and trigger a collision cascade.
5.  **Unicast optimization (BACnet/SC):** Demonstrates how BACnet/SC replaces broadcasts with secure TLS unicasts over TCP, utilizing the highest supported MCS rates, standard ACKs, and Wi-Fi 6 OFDMA parallel RU scheduling.
6.  **User Bandwidth Output:** Real-time feedback calculating both the shared **Theoretical Bandwidth** per user and the **Likely Bandwidth** achieved when accounting for CSMA/CA collision and retry overheads.

---

## Preset Scenarios

*   **Legacy Factory (2.4 GHz, Heavy Broadcast):** 802.11g, 10 users, 120 BACnet/IP devices broadcasting at 1 Hz. Shows complete channel saturation, high collision rates ($&gt;60\%$), and heavy BACnet packet loss.
*   **Smart Office (5 GHz, SC Unicast):** 802.11ac, 30 users, 80 BACnet/SC devices. Shows high user throughput, 0% BACnet loss, and low collision rates.
*   **Modern Dense IoT (5 GHz, Wi-Fi 6 OFDMA):** 802.11ax, 50 users, 200 BACnet/SC devices, OFDMA enabled. Shows how Wi-Fi 6 scheduling accommodates massive IoT counts.

---

## Local Development

To run the project locally:

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Compile production assets
npm run build
```

---

## Seamless Deployment via Git Tags

The repository is configured with a GitHub Actions workflow that automatically builds and publishes the SPA to GitHub Pages when a release version tag is pushed:

```bash
# 1. Stage and commit changes
git add .
git commit -m "feat: Add updates"

# 2. Tag a new version (e.g., v1.0.6)
git tag -a v1.0.6 -m "Release version 1.0.6"

# 3. Push main and tag to GitHub
git push origin main
git push origin v1.0.6
```

---
*Developed by [ACE IoT Solutions](https://aceiotsolutions.com)*
