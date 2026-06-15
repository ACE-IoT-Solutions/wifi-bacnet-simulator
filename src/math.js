// WiFi and BACnet Coexistence Simulator - Mathematics Model

export const WIFI_STANDARDS = {
  '11b': {
    id: '11b',
    name: '802.11b (Wi-Fi 1)',
    year: 1999,
    frequency: '2.4 GHz',
    maxUnicastRate: 11 * 1e6, // 11 Mbps
    basicRate: 1 * 1e6,       // 1 Mbps
    sifs: 10,                 // microseconds
    difs: 50,                 // microseconds
    slotTime: 20,             // microseconds
    preamble: 192,            // microseconds (long preamble)
    cwMin: 31,
    cwMax: 1023,
    ofdmaSupported: false,
    color: '#ff6b6b'
  },
  '11g': {
    id: '11g',
    name: '802.11g (Wi-Fi 3)',
    year: 2003,
    frequency: '2.4 GHz',
    maxUnicastRate: 54 * 1e6, // 54 Mbps
    basicRate: 6 * 1e6,       // 6 Mbps
    sifs: 10,
    difs: 28,
    slotTime: 9,
    preamble: 20,
    cwMin: 15,
    cwMax: 1023,
    ofdmaSupported: false,
    color: '#feca57'
  },
  '11n': {
    id: '11n',
    name: '802.11n (Wi-Fi 4)',
    year: 2009,
    frequency: '2.4 / 5 GHz',
    maxUnicastRate: 150 * 1e6, // 150 Mbps (Single Stream, 40MHz, Short GI)
    basicRate: 6 * 1e6,
    sifs: 16,
    difs: 34,
    slotTime: 9,
    preamble: 36,
    cwMin: 15,
    cwMax: 1023,
    ofdmaSupported: false,
    color: '#1dd1a1'
  },
  '11ac': {
    id: '11ac',
    name: '802.11ac (Wi-Fi 5)',
    year: 2013,
    frequency: '5 GHz',
    maxUnicastRate: 866.7 * 1e6, // 866.7 Mbps (2x2 MIMO, 80MHz, Short GI)
    basicRate: 6 * 1e6,
    sifs: 16,
    difs: 34,
    slotTime: 9,
    preamble: 40,
    cwMin: 15,
    cwMax: 1023,
    ofdmaSupported: false,
    color: '#48dbfb'
  },
  '11ax': {
    id: '11ax',
    name: '802.11ax (Wi-Fi 6)',
    year: 2021,
    frequency: '2.4 / 5 / 6 GHz',
    maxUnicastRate: 1201 * 1e6, // 1201 Mbps (2x2 MIMO, 80MHz, 1024-QAM)
    basicRate: 6 * 1e6,
    sifs: 16,
    difs: 34,
    slotTime: 9,
    preamble: 46,
    cwMin: 15,
    cwMax: 1023,
    ofdmaSupported: true,
    color: '#5f27cd'
  },
  '11be': {
    id: '11be',
    name: '802.11be (Wi-Fi 7)',
    year: 2024,
    frequency: '2.4 / 5 / 6 GHz',
    maxUnicastRate: 2402 * 1e6, // 2402 Mbps (2x2 MIMO, 160MHz, 4096-QAM)
    basicRate: 6 * 1e6,
    sifs: 16,
    difs: 34,
    slotTime: 9,
    preamble: 52,
    cwMin: 15,
    cwMax: 1023,
    ofdmaSupported: true,
    color: '#ff9ff3'
  }
};

export const USER_PROFILES = {
  'light': {
    id: 'light',
    name: 'Light (Web browsing, Email)',
    packetsPerSec: 10,
    packetSize: 600, // bytes
    bitrate: 48 * 1000 // 48 kbps
  },
  'medium': {
    id: 'medium',
    name: 'Medium (Office, Social Media)',
    packetsPerSec: 30,
    packetSize: 900, // bytes
    bitrate: 216 * 1000 // 216 kbps
  },
  'heavy': {
    id: 'heavy',
    name: 'Heavy (Video Streaming, Calls)',
    packetsPerSec: 75,
    packetSize: 1250, // bytes
    bitrate: 750 * 1000 // 750 kbps
  }
};

/**
 * Calculates a single frame's physical airtime in seconds
 */
export function calculateFrameTime(sizeInBytes, rateInBps, preambleInMicroseconds) {
  const bits = sizeInBytes * 8;
  const transmissionTimeSec = bits / rateInBps;
  const preambleSec = preambleInMicroseconds * 1e-6;
  return preambleSec + transmissionTimeSec;
}

/**
 * Runs the analytical model to calculate collision probabilities,
 * airtime usage, throughputs, and latency estimations.
 */
export function calculateMetrics(config) {
  const {
    wifiStandardId,
    numUsers,
    userProfileId,
    numBacnetDevices,
    bacnetProtocol, // 'ip' or 'sc'
    bacnetInterval, // seconds per broadcast / COV update
    ofdmaEnabled, // boolean
    frequencyBand = '5', // '2.4' or '5'
    multicastToUnicast = false
  } = config;

  const wifi = WIFI_STANDARDS[wifiStandardId] || WIFI_STANDARDS['11ac'];
  const userProfile = USER_PROFILES[userProfileId] || USER_PROFILES['medium'];

  // Adjust physical rate based on frequency band (2.4 GHz is restricted to 20MHz channels for dense IoT)
  let maxRate = wifi.maxUnicastRate;
  if (frequencyBand === '2.4') {
    if (wifiStandardId === '11n') {
      maxRate = 72.2 * 1e6; // 20 MHz single stream
    } else if (wifiStandardId === '11ac') {
      maxRate = 72.2 * 1e6; // Fallback to 802.11n on 2.4GHz (11ac is 5GHz only)
    } else if (wifiStandardId === '11ax') {
      maxRate = 143.4 * 1e6; // 20 MHz single stream (HE20)
    } else if (wifiStandardId === '11be') {
      maxRate = 172.0 * 1e6; // 20 MHz single stream (EHT20)
    }
  } else {
    // 5 GHz
    if (wifiStandardId === '11b' || wifiStandardId === '11g') {
      // 802.11b and 802.11g are 2.4 GHz only, keep legacy rate limits
    }
  }

  // 1. Packet configurations
  const generalPacketSize = userProfile.packetSize;
  const generalPacketRate = userProfile.packetsPerSec; // packets/sec per user

  // BACnet sizes
  const bacUniSize = 150; // bytes (Read-Property polling)
  const bacUniRate = 1.0; // packets/sec per device (0.5 Hz request-response cycle)

  const bacBcastSize = 250; // bytes (Who-Is/I-Am, COV notifications)
  const bacBcastRate = 1.0 / Math.max(0.1, bacnetInterval); // updates/sec per device

  // Unicast and Basic physical rates (apply 80% efficiency to unicast rate for real-world path loss)
  const unicastRate = maxRate * 0.8;
  const basicRate = wifi.basicRate;

  // Time overheads: 2.4 GHz networks often use long slot times (20us) and DIFS (50us) for backward compatibility
  let slotTime = wifi.slotTime;
  let difs = wifi.difs;
  if (frequencyBand === '2.4' && (wifiStandardId === '11g' || wifiStandardId === '11n' || wifiStandardId === '11ac' || wifiStandardId === '11ax' || wifiStandardId === '11be')) {
    slotTime = 20; // microseconds
    difs = 50;    // microseconds
  }

  const tSifs = wifi.sifs * 1e-6;
  const tDifs = difs * 1e-6;
  const tSlot = slotTime * 1e-6;
  const tAck = calculateFrameTime(14, basicRate, wifi.preamble);
  const tBackoff = (wifi.cwMin / 2) * tSlot;

  // 2. Airtime per single successful transaction (uplink & downlink if applicable)
  // Unicast transaction: DIFS + Frame + SIFS + ACK + Backoff
  const tUserFrame = calculateFrameTime(generalPacketSize, unicastRate, wifi.preamble);
  const tUserTx = tDifs + tUserFrame + tSifs + tAck + tBackoff;

  const tBacUniFrame = calculateFrameTime(bacUniSize, unicastRate, wifi.preamble);
  const tBacUniTx = tDifs + tBacUniFrame + tSifs + tAck + tBackoff;

  let tBacBcastTx = 0;
  let tBacScTx = 0;

  if (bacnetProtocol === 'ip') {
    // BACnet/IP Broadcast:
    // Uplink (Unicast from device to AP): DIFS + Frame + SIFS + ACK + Backoff
    const tBcastUpFrame = calculateFrameTime(bacBcastSize, unicastRate, wifi.preamble);
    const tBcastUpTx = tDifs + tBcastUpFrame + tSifs + tAck + tBackoff;
    
    let tBcastDownTx;
    if (multicastToUnicast) {
      // AP converts the broadcast to a unicast for each other BACnet device (using unicast rate, needing ACK)
      const tBcastDownUnicastFrame = calculateFrameTime(bacBcastSize, unicastRate, wifi.preamble);
      const tBcastDownUnicastSingle = tDifs + tBcastDownUnicastFrame + tSifs + tAck + tBackoff;
      // We send it to all other BACnet devices. Since one device sent it, there are (numBacnetDevices - 1) receivers.
      const numDestinations = Math.max(0, numBacnetDevices - 1);
      tBcastDownTx = numDestinations * tBcastDownUnicastSingle;
    } else {
      // Downlink (Broadcast from AP to BSS, at basic rate, no SIFS, no ACK): DIFS + Frame + Backoff
      const tBcastDownFrame = calculateFrameTime(bacBcastSize, basicRate, wifi.preamble);
      tBcastDownTx = tDifs + tBcastDownFrame + tBackoff;
    }
    // Total airtime is the sum of both uplink and downlink
    tBacBcastTx = tBcastUpTx + tBcastDownTx;
  } else {
    // BACnet/SC (TLS Unicast):
    // 2 Unicast transactions: Uplink to SC Hub, Downlink from Hub to Client (both over TLS)
    // Packet size is slightly larger (e.g. +60 bytes for TCP/TLS headers)
    const scSize = bacBcastSize + 60;
    const tScFrame = calculateFrameTime(scSize, unicastRate, wifi.preamble);
    const tScSingleTx = tDifs + tScFrame + tSifs + tAck + tBackoff;
    tBacScTx = tScSingleTx * 2; // uplink + downlink
  }

  // 3. Offered Traffic Rates (packets/sec)
  const lambdaUser = numUsers * generalPacketRate;
  const lambdaBacUni = numBacnetDevices * bacUniRate;
  
  let lambdaBacBcast = 0;
  let lambdaBacSc = 0;

  if (bacnetProtocol === 'ip') {
    lambdaBacBcast = numBacnetDevices * bacBcastRate;
  } else {
    // BACnet/SC replaces 1 broadcast with 1 SC event (which consists of 1 uplink and 1 downlink)
    // We already accounted for both hops in tBacScTx, so the rate of these events is:
    lambdaBacSc = numBacnetDevices * bacBcastRate;
  }

  // 4. Raw Offered Airtime Load (fraction of 1.0)
  const loadUser = lambdaUser * tUserTx;
  const loadBacUni = lambdaBacUni * tBacUniTx;
  const loadBacBcast = lambdaBacBcast * tBacBcastTx;
  const loadBacSc = lambdaBacSc * tBacScTx;

  const totalOfferedLoad = loadUser + loadBacUni + loadBacBcast + loadBacSc;

  // 5. Contention and Collision Probability
  // Calculate effective contending nodes (OFDMA reduction)
  // If OFDMA is enabled (ax/be only), BACnet nodes are grouped into RUs, reducing collision probability.
  const isOfdmaActive = wifi.ofdmaSupported && ofdmaEnabled;
  const ofdmaFactor = isOfdmaActive ? 9.0 : 1.0; // 9 RUs for a 20MHz channel
  
  const effectiveBacnetNodes = numBacnetDevices / ofdmaFactor;
  const effectiveTotalNodes = numUsers + effectiveBacnetNodes;

  // Average transmission probability in a slot is proportional to offered load
  // If no devices, P_c is 0.
  let pCollision = 0;
  if (effectiveTotalNodes > 1 && totalOfferedLoad > 0) {
    // In CSMA/CA, collision probability increases with node count and channel load.
    // Non-saturated collision rate:
    const avgLoadPerNode = totalOfferedLoad / effectiveTotalNodes;
    const pCollisionNonSat = 1 - Math.pow(1 - avgLoadPerNode, effectiveTotalNodes - 1);

    // Saturated collision rate (Bianchi model approximation for CW_min)
    const tauSat = 2.0 / (wifi.cwMin + effectiveTotalNodes * 0.5);
    const pCollisionSat = 1 - Math.pow(1 - tauSat, effectiveTotalNodes - 1);

    // Interpolate between non-saturated and saturated collision probability
    const saturationWeight = Math.min(1.0, totalOfferedLoad);
    pCollision = pCollisionNonSat * (1 - saturationWeight) + pCollisionSat * saturationWeight;

    // Apply OFDMA reduction factor to collision probability
    if (isOfdmaActive) {
      pCollision = pCollision * 0.25; // 75% reduction in collision rate for small IoT frames
    }
    
    // Cap collision rate realistically
    pCollision = Math.min(0.85, Math.max(0.0, pCollision));
  }

  // 6. Impact of Collisions (Retransmissions and Drops)
  // Unicast packets retry up to 7 times.
  // The average number of attempts for a unicast packet is:
  const pDropUnicast = Math.pow(pCollision, 7);
  const deliverUnicastRate = 1 - pDropUnicast;
  
  const avgAttempts = pCollision < 0.99 
    ? (1 - Math.pow(pCollision, 7)) / (1 - pCollision) 
    : 7.0;

  // Broadcasts do not retransmit!
  const pDropBroadcast = pCollision;
  const deliverBroadcastRate = 1 - pDropBroadcast;

  // 7. Calculate Effective Channel Load with Retransmissions
  const effectiveLoadUser = loadUser * avgAttempts;
  const effectiveLoadBacUni = loadBacUni * avgAttempts;
  const effectiveLoadBacSc = loadBacSc * avgAttempts;
  // Broadcasts do not retry, so effective load equals offered load
  const effectiveLoadBacBcast = loadBacBcast;

  const totalEffectiveLoad = effectiveLoadUser + effectiveLoadBacUni + effectiveLoadBacBcast + effectiveLoadBacSc;

  // 8. Queue Saturation and Throughput Scaling
  // If totalEffectiveLoad > 1.0, the channel is saturated. Throughput is scaled down.
  const saturationFactor = totalEffectiveLoad > 1.0 ? 1.0 / totalEffectiveLoad : 1.0;

  // Throughput in bps
  const offeredThroughputUser = lambdaUser * generalPacketSize * 8;
  const offeredThroughputBac = (lambdaBacUni * bacUniSize + lambdaBacBcast * bacBcastSize + lambdaBacSc * bacBcastSize) * 8;

  const actualThroughputUser = offeredThroughputUser * deliverUnicastRate * saturationFactor;
  let actualThroughputBac;
  let bacnetLossRate = 0;

  if (bacnetProtocol === 'ip') {
    const uniThroughput = (lambdaBacUni * bacUniSize * 8) * deliverUnicastRate * saturationFactor;
    const bcastThroughput = (lambdaBacBcast * bacBcastSize * 8) * deliverBroadcastRate * saturationFactor;
    actualThroughputBac = uniThroughput + bcastThroughput;

    // Weighted loss rate for BACnet/IP (unicast drops + broadcast drops)
    const totalBacPackets = lambdaBacUni + lambdaBacBcast;
    if (totalBacPackets > 0) {
      const lostUni = lambdaBacUni * (pDropUnicast + (1 - deliverUnicastRate * saturationFactor));
      const lostBcast = lambdaBacBcast * (pDropBroadcast + (1 - deliverBroadcastRate * saturationFactor));
      bacnetLossRate = (lostUni + lostBcast) / totalBacPackets;
    }
  } else {
    // BACnet/SC (all unicast)
    actualThroughputBac = offeredThroughputBac * deliverUnicastRate * saturationFactor;
    bacnetLossRate = pDropUnicast + (1 - deliverUnicastRate * saturationFactor);
  }

  // 9. Bandwidth Capacity Reduction
  // Capacity loss represents what portion of the channel's absolute theoretical capacity
  // is wasted or unavailable due to overhead, collisions, and queue overflow.
  const rawBcastDownFrameTime = multicastToUnicast
    ? Math.max(0, numBacnetDevices - 1) * calculateFrameTime(bacBcastSize, unicastRate, wifi.preamble)
    : calculateFrameTime(bacBcastSize, basicRate, wifi.preamble);

  const rawDataAirtime = (lambdaUser * tUserFrame + lambdaBacUni * tBacUniFrame + 
                         lambdaBacBcast * (calculateFrameTime(bacBcastSize, unicastRate, wifi.preamble) + rawBcastDownFrameTime) +
                         lambdaBacSc * (calculateFrameTime(bacBcastSize + 60, unicastRate, wifi.preamble) * 2)) * saturationFactor;

  // Airtime details
  const airtimeUser = Math.min(1.0, effectiveLoadUser * saturationFactor);
  const airtimeBacUni = Math.min(1.0, effectiveLoadUniAirtime(bacnetProtocol, effectiveLoadBacUni, effectiveLoadBacSc) * saturationFactor);
  const airtimeBacBcast = Math.min(1.0, effectiveLoadBcastAirtime(bacnetProtocol, effectiveLoadBacBcast) * saturationFactor);
  const airtimeFree = Math.max(0.0, 1.0 - (airtimeUser + airtimeBacUni + airtimeBacBcast));

  // Bandwidth capacity loss breakdown
  const overheadAirtime = (totalEffectiveLoad - rawDataAirtime) * saturationFactor;
  const collisionWasteAirtime = (totalEffectiveLoad - totalOfferedLoad) * saturationFactor;
  const saturationLossAirtime = totalEffectiveLoad > 1.0 ? (1.0 - 1.0 / totalEffectiveLoad) : 0.0;

  const bandwidthReduction = (1.0 - (rawDataAirtime / Math.max(0.001, totalEffectiveLoad))) * 100;

  // 10. Latency Estimation (in milliseconds)
  // Successful unicast latency: SIFS + frame + ACK + backoff.
  // With retries, each retry adds a backoff that doubles in window size.
  // If queue is saturated, latency increases exponentially.
  let avgUnicastLatencyMs;
  if (pCollision < 0.99) {
    let latencySum = 0;
    let probSum = 0;
    for (let r = 0; r < 7; r++) {
      const cw = Math.min(wifi.cwMax, wifi.cwMin * Math.pow(2, r));
      const avgBackoff = (cw / 2) * tSlot;
      const tAttempt = tDifs + tUserFrame + tSifs + tAck + avgBackoff;
      const pAttempt = Math.pow(pCollision, r) * (1 - pCollision);
      latencySum += (r * tAttempt + tAttempt) * pAttempt;
      probSum += pAttempt;
    }
    avgUnicastLatencyMs = (latencySum / Math.max(0.01, probSum)) * 1000;
  } else {
    avgUnicastLatencyMs = 1500; // max latency cap
  }

  // Queue latency due to saturation
  if (totalEffectiveLoad > 1.0) {
    const queueFactor = Math.min(20, (totalEffectiveLoad - 1.0) * 15);
    avgUnicastLatencyMs += queueFactor * 100; // add queue delay
  }

  return {
    collisionRate: pCollision * 100, // percentage
    bandwidthReduction: Math.min(99.9, Math.max(0.0, bandwidthReduction)), // percentage
    airtime: {
      user: airtimeUser * 100,
      bacnetUni: airtimeBacUni * 100,
      bacnetBcast: airtimeBacBcast * 100,
      free: airtimeFree * 100
    },
    lossBreakdown: {
      overhead: Math.min(100, overheadAirtime * 100),
      collision: Math.min(100, Math.max(0, collisionWasteAirtime * 100)),
      saturation: Math.min(100, saturationLossAirtime * 100),
      free: airtimeFree * 100
    },
    throughputs: {
      offeredUser: offeredThroughputUser / 1e6, // Mbps
      actualUser: actualThroughputUser / 1e6,  // Mbps
      offeredBac: offeredThroughputBac / 1e6,  // Mbps
      actualBac: actualThroughputBac / 1e6     // Mbps
    },
    bacnetLossRate: bacnetLossRate * 100, // percentage
    avgLatencyMs: avgUnicastLatencyMs,
    isSaturated: totalEffectiveLoad > 1.0,
    wifiSpecs: {
      maxRate: maxRate / 1e6, // Mbps
      basicRate: basicRate / 1e6, // Mbps
      slotTime: slotTime, // microseconds
      difs: difs // microseconds
    }
  };
}

// Helpers for airtime distribution
function effectiveLoadUniAirtime(proto, loadUni, loadSc) {
  if (proto === 'ip') {
    return loadUni;
  }
  return loadSc;
}

function effectiveLoadBcastAirtime(proto, loadBcast) {
  if (proto === 'ip') {
    return loadBcast;
  }
  return 0;
}
