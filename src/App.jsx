import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Wifi,
  Users,
  Cpu,
  AlertTriangle,
  TrendingUp,
  Info,
  Activity,
  CheckCircle,
  Zap,
  BookOpen,
  HelpCircle,
  RefreshCw,
  Server
} from 'lucide-react';
import { WIFI_STANDARDS, USER_PROFILES, calculateMetrics } from './math';
import './App.css';

function App() {
  // --- STATE ---
  const [wifiStandardId, setWifiStandardId] = useState('11ac');
  const [numUsers, setNumUsers] = useState(20);
  const [userProfileId, setUserProfileId] = useState('medium');
  const [numBacnetDevices, setNumBacnetDevices] = useState(50);
  const [bacnetProtocol, setBacnetProtocol] = useState('ip'); // 'ip' or 'sc'
  const [bacnetInterval, setBacnetInterval] = useState(2.0); // seconds
  const [ofdmaEnabled, setOfdmaEnabled] = useState(true);
  const [frequencyBand, setFrequencyBand] = useState('5'); // '2.4' or '5'
  const [activePreset, setActivePreset] = useState('none');
  const [activeTab, setActiveTab] = useState('simulation'); // 'simulation' or 'analysis'

  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // --- PRESETS ---
  const presets = {
    'legacy': {
      name: 'Legacy Factory (Heavy Broadcast)',
      wifiStandardId: '11g',
      numUsers: 10,
      userProfileId: 'light',
      numBacnetDevices: 120,
      bacnetProtocol: 'ip',
      bacnetInterval: 1.0,
      ofdmaEnabled: false,
      frequencyBand: '2.4'
    },
    'office': {
      name: 'Smart Office (SC Unicast)',
      wifiStandardId: '11ac',
      numUsers: 30,
      userProfileId: 'medium',
      numBacnetDevices: 80,
      bacnetProtocol: 'sc',
      bacnetInterval: 5.0,
      ofdmaEnabled: false,
      frequencyBand: '5'
    },
    'dense-ax': {
      name: 'Modern IoT Facility (Wi-Fi 6 OFDMA)',
      wifiStandardId: '11ax',
      numUsers: 50,
      userProfileId: 'heavy',
      numBacnetDevices: 200,
      bacnetProtocol: 'sc',
      bacnetInterval: 2.0,
      ofdmaEnabled: true,
      frequencyBand: '5'
    }
  };

  const applyPreset = (presetKey) => {
    const preset = presets[presetKey];
    if (preset) {
      setWifiStandardId(preset.wifiStandardId);
      setNumUsers(preset.numUsers);
      setUserProfileId(preset.userProfileId);
      setNumBacnetDevices(preset.numBacnetDevices);
      setBacnetProtocol(preset.bacnetProtocol);
      setBacnetInterval(preset.bacnetInterval);
      setOfdmaEnabled(preset.ofdmaEnabled);
      setFrequencyBand(preset.frequencyBand || '5');
      setActivePreset(presetKey);
    }
  };

  // Reset preset button highlight if user modifies parameters manually
  const handleParamChange = (setter, value) => {
    setter(value);
    setActivePreset('none');
  };

  // --- CALCULATE CURRENT METRICS ---
  const config = useMemo(() => ({
    wifiStandardId,
    numUsers,
    userProfileId,
    numBacnetDevices,
    bacnetProtocol,
    bacnetInterval,
    ofdmaEnabled,
    frequencyBand
  }), [wifiStandardId, numUsers, userProfileId, numBacnetDevices, bacnetProtocol, bacnetInterval, ofdmaEnabled, frequencyBand]);

  const metrics = useMemo(() => calculateMetrics(config), [config]);

  // --- GENERATE COMPARISON CURVES FOR CHARTS ---
  // Calculates collision rates for BACnet/IP vs BACnet/SC across a range of device counts
  const chartData = useMemo(() => {
    const dataPoints = [];
    const step = 20;
    const maxDevices = 200;

    for (let count = 0; count <= maxDevices; count += step) {
      // Config for IP
      const configIp = {
        ...config,
        numBacnetDevices: count,
        bacnetProtocol: 'ip'
      };
      // Config for SC
      const configSc = {
        ...config,
        numBacnetDevices: count,
        bacnetProtocol: 'sc'
      };

      const mIp = calculateMetrics(configIp);
      const mSc = calculateMetrics(configSc);

      dataPoints.push({
        deviceCount: count,
        ipCollision: mIp.collisionRate,
        scCollision: mSc.collisionRate,
        ipLoss: mIp.bacnetLossRate,
        scLoss: mSc.bacnetLossRate,
        ipThroughput: mIp.throughputs.actualUser,
        scThroughput: mSc.throughputs.actualUser
      });
    }
    return dataPoints;
  }, [config]);

  // --- LIVE CANVAS ANIMATION SIMULATOR ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.parentElement.clientWidth);
    let height = (canvas.height = canvas.parentElement.clientHeight);

    // Track resize
    const handleResize = () => {
      if (canvas && canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = canvas.parentElement.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    // Simulation entities
    const ap = { x: width / 2, y: height / 2, radius: 25, pulse: 0, status: 'idle', statusTimer: 0 };
    const nodes = [];
    const particles = [];
    const waves = []; // broadcast waves originating from AP
    const sparks = []; // collision indicators
    const outerRadius = 145;
    const bacUniRate = 1.0;
    const bacBcastRate = 1.0 / Math.max(0.1, bacnetInterval);

    // Helper to generate coordinates in rings
    const createNodes = () => {
      nodes.length = 0;
      
      // General user nodes (Inner ring)
      const userCount = Math.min(18, numUsers);
      const innerRadius = 90;
      for (let i = 0; i < userCount; i++) {
        const angle = (i / userCount) * Math.PI * 2;
        nodes.push({
          id: `user_${i}`,
          type: 'user',
          x: ap.x + Math.cos(angle) * innerRadius,
          y: ap.y + Math.sin(angle) * innerRadius,
          radius: 6,
          color: '#06b6d4',
          lastTx: 0,
          txInterval: 1000 / USER_PROFILES[userProfileId].packetsPerSec
        });
      }

      // BACnet nodes (Outer ring)
      const bacCount = Math.min(24, numBacnetDevices);
      for (let i = 0; i < bacCount; i++) {
        const angle = ((i + 0.5) / bacCount) * Math.PI * 2;
        nodes.push({
          id: `bac_${i}`,
          type: 'bacnet',
          x: ap.x + Math.cos(angle) * outerRadius,
          y: ap.y + Math.sin(angle) * outerRadius,
          radius: 5,
          color: bacnetProtocol === 'ip' ? '#f59e0b' : '#c1d301',
          lastTx: 0,
          txInterval: 1000 / (1.0 + 1.0 / bacnetInterval) // polling + broadcast frequency
        });
      }
    };

    createNodes();

    // Spawn packets and run animation
    let lastTime = performance.now();

    const animate = (time) => {
      const delta = time - lastTime;
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Network Connections (Background grid lines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      for (let r = 50; r < 200; r += 50) {
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Draw Access Point (Center Router)
      ap.pulse += delta * 0.003;
      const pulseRadius = ap.radius + Math.sin(ap.pulse) * 4;

      // Outer glow
      const apGlow = ctx.createRadialGradient(ap.x, ap.y, 5, ap.x, ap.y, pulseRadius * 1.5);
      if (ap.status === 'collision') {
        apGlow.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
        apGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
      } else if (ap.status === 'broadcast') {
        apGlow.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
        apGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        apGlow.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
        apGlow.addColorStop(1, 'rgba(139, 92, 246, 0)');
      }
      ctx.fillStyle = apGlow;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, pulseRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Core router body
      ctx.fillStyle = ap.status === 'collision' ? '#f43f5e' : (ap.status === 'broadcast' ? '#f59e0b' : '#8b5cf6');
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Router Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AP', ap.x, ap.y);

      // Decrement AP status timers
      if (ap.statusTimer > 0) {
        ap.statusTimer -= delta;
        if (ap.statusTimer <= 0) {
          ap.status = 'idle';
        }
      }

      // 3. Draw Broadcast Shockwaves
      for (let i = waves.length - 1; i >= 0; i--) {
        const wave = waves[i];
        wave.radius += delta * 0.12; // speed
        wave.alpha -= delta * 0.002;  // fade out

        if (wave.alpha <= 0 || wave.radius > outerRadius * 1.5) {
          waves.splice(i, 1);
          continue;
        }

        ctx.strokeStyle = `rgba(245, 158, 11, ${wave.alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, wave.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Update and Draw Nodes
      nodes.forEach((node) => {
        // Draw node line to AP
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(ap.x, ap.y);
        ctx.stroke();

        // Node Glow
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
        ctx.fill();

        // Node Core
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius - 1, 0, Math.PI * 2);
        ctx.fill();

        // Check if node should transmit a packet
        // We use a small randomized jitter so they don't sync up perfectly
        if (time - node.lastTx > node.txInterval + Math.random() * 200) {
          node.lastTx = time;

          // Determine packet properties
          let packetType = 'unicast';
          let color = node.color;
          
          if (node.type === 'bacnet') {
            if (bacnetProtocol === 'ip') {
              // BACnet/IP sends broadcasts (orange) and unicasts (amber/yellow)
              packetType = Math.random() < (bacBcastRate / (bacUniRate + bacBcastRate)) ? 'broadcast' : 'unicast';
              color = packetType === 'broadcast' ? '#f59e0b' : '#ffc048';
            } else {
              // BACnet/SC is all green TLS unicast
              packetType = 'sc_unicast';
              color = '#c1d301';
            }
          }

          particles.push({
            x: node.x,
            y: node.y,
            startX: node.x,
            startY: node.y,
            progress: 0,
            speed: 0.002 + Math.random() * 0.001, // travel speed
            color: color,
            type: packetType,
            size: packetType === 'broadcast' ? 5 : 4,
            nodeId: node.id
          });
        }
      });

      // 5. Update and Draw Packets (Particles)
      const arrivedPackets = [];
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += delta * p.speed;

        // Linear interpolation towards AP
        p.x = p.startX + (ap.x - p.startX) * p.progress;
        p.y = p.startY + (ap.y - p.startY) * p.progress;

        // Draw packet glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Check arrival at AP
        if (p.progress >= 1.0) {
          arrivedPackets.push(p);
          particles.splice(i, 1);
        }
      }

      // 6. Handle Packet Arrivals and Collisions at AP
      if (arrivedPackets.length > 0) {
        // If collision rate is high, simulate collisions based on calculated probability
        // If multiple packets arrive in the same frame, OR if we roll the dice against pCollision
        const willCollide = arrivedPackets.length > 1 || Math.random() < (metrics.collisionRate / 100);

        if (willCollide) {
          // Trigger collision state at AP
          ap.status = 'collision';
          ap.statusTimer = 250; // show collision color for 250ms

          // Spawn collision sparks
          arrivedPackets.forEach((p) => {
            for (let j = 0; j < 8; j++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.5 + Math.random() * 1.5;
              sparks.push({
                x: ap.x,
                y: ap.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: '#f43f5e',
                alpha: 1.0,
                life: 300 + Math.random() * 200
              });
            }
          });
        } else {
          // Successful arrival!
          const successfulPacket = arrivedPackets[0];
          
          if (successfulPacket.type === 'broadcast') {
            // Trigger AP broadcast shockwave
            ap.status = 'broadcast';
            ap.statusTimer = 350;
            waves.push({ radius: ap.radius, alpha: 0.8 });

            // Spawn success rings
            for (let j = 0; j < 5; j++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.3 + Math.random() * 0.7;
              sparks.push({
                x: ap.x,
                y: ap.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: '#f59e0b',
                alpha: 1.0,
                life: 400
              });
            }
          } else {
            // Unicast success
            ap.status = 'idle';
            ap.statusTimer = 100;
            for (let j = 0; j < 4; j++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.3 + Math.random() * 0.5;
              sparks.push({
                x: ap.x,
                y: ap.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: successfulPacket.color,
                alpha: 0.8,
                life: 250
              });
            }
          }
        }
      }

      // 7. Update and Draw Sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= delta;
        s.alpha = s.life / 500;

        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // reset
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [numUsers, numBacnetDevices, bacnetProtocol, userProfileId, bacnetInterval, metrics.collisionRate, activeTab, frequencyBand]);

  // --- CHART RENDERING HELPERS (Custom SVG Lines) ---
  const renderLineChart = () => {
    const chartWidth = 500;
    const chartHeight = 160;
    const padding = 25;

    const points = chartData;
    const maxX = 200;
    const maxY = 100; // 0 to 100% collision rate

    const scaleX = (x) => padding + (x / maxX) * (chartWidth - padding * 2);
    const scaleY = (y) => chartHeight - padding - (y / maxY) * (chartHeight - padding * 2);

    // Build path strings
    let pathIp = '';
    let pathSc = '';

    points.forEach((p, idx) => {
      const x = scaleX(p.deviceCount);
      const yIp = scaleY(p.ipCollision);
      const ySc = scaleY(p.scCollision);

      if (idx === 0) {
        pathIp = `M ${x} ${yIp}`;
        pathSc = `M ${x} ${ySc}`;
      } else {
        pathIp += ` L ${x} ${yIp}`;
        pathSc += ` L ${x} ${ySc}`;
      }
    });

    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = scaleY(tick);
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={padding - 5} y={y + 3} fill="var(--text-muted)" fontSize={8} textAnchor="end">{tick}%</text>
            </g>
          );
        })}

        {/* X axis ticks */}
        {[0, 50, 100, 150, 200].map((tick) => {
          const x = scaleX(tick);
          return (
            <g key={tick}>
              <line x1={x} y1={chartHeight - padding} x2={x} y2={chartHeight - padding + 5} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={x} y={chartHeight - padding + 15} fill="var(--text-muted)" fontSize={8} textAnchor="middle">{tick}</text>
            </g>
          );
        })}

        {/* Curves */}
        <path d={pathIp} fill="none" stroke="var(--accent-amber)" strokeWidth={2.5} strokeLinecap="round" />
        <path d={pathSc} fill="none" stroke="var(--accent-emerald)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Data points */}
        {points.map((p, idx) => {
          const x = scaleX(p.deviceCount);
          const yIp = scaleY(p.ipCollision);
          const ySc = scaleY(p.scCollision);
          
          return (
            <g key={idx}>
              <circle cx={x} cy={yIp} r={3} fill="var(--accent-amber)" />
              <circle cx={x} cy={ySc} r={3} fill="var(--accent-emerald)" />
            </g>
          );
        })}

        {/* Current position vertical marker */}
        {numBacnetDevices <= maxX && (
          <line
            x1={scaleX(numBacnetDevices)}
            y1={scaleY(0)}
            x2={scaleX(numBacnetDevices)}
            y2={scaleY(100)}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
      </svg>
    );
  };

  const renderThroughputChart = () => {
    const chartWidth = 500;
    const chartHeight = 160;
    const padding = 25;

    const points = chartData;
    const maxX = 200;
    // We scale max Y based on the offered throughput in the preset or standard
    const maxVal = Math.max(1.0, ...points.map(p => Math.max(p.ipThroughput, p.scThroughput)));
    const maxY = Math.ceil(maxVal * 1.2);

    const scaleX = (x) => padding + (x / maxX) * (chartWidth - padding * 2);
    const scaleY = (y) => chartHeight - padding - (y / maxY) * (chartHeight - padding * 2);

    let pathIp = '';
    let pathSc = '';

    points.forEach((p, idx) => {
      const x = scaleX(p.deviceCount);
      const yIp = scaleY(p.ipThroughput);
      const ySc = scaleY(p.scThroughput);

      if (idx === 0) {
        pathIp = `M ${x} ${yIp}`;
        pathSc = `M ${x} ${ySc}`;
      } else {
        pathIp += ` L ${x} ${yIp}`;
        pathSc += ` L ${x} ${ySc}`;
      }
    });

    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1.0].map((pct) => {
          const val = maxY * pct;
          const y = scaleY(val);
          return (
            <g key={pct}>
              <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={padding - 5} y={y + 3} fill="var(--text-muted)" fontSize={8} textAnchor="end">{val.toFixed(1)}M</text>
            </g>
          );
        })}

        {/* X axis ticks */}
        {[0, 50, 100, 150, 200].map((tick) => {
          const x = scaleX(tick);
          return (
            <g key={tick}>
              <line x1={x} y1={chartHeight - padding} x2={x} y2={chartHeight - padding + 5} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={x} y={chartHeight - padding + 15} fill="var(--text-muted)" fontSize={8} textAnchor="middle">{tick}</text>
            </g>
          );
        })}

        {/* Curves */}
        <path d={pathIp} fill="none" stroke="var(--accent-rose)" strokeWidth={2} strokeLinecap="round" strokeDasharray="3,3" />
        <path d={pathSc} fill="none" stroke="var(--accent-cyan)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Data points */}
        {points.map((p, idx) => {
          const x = scaleX(p.deviceCount);
          const yIp = scaleY(p.ipThroughput);
          const ySc = scaleY(p.scThroughput);
          
          return (
            <g key={idx}>
              <circle cx={x} cy={yIp} r={2.5} fill="var(--accent-rose)" />
              <circle cx={x} cy={ySc} r={2.5} fill="var(--accent-cyan)" />
            </g>
          );
        })}

        {/* Current position vertical marker */}
        {numBacnetDevices <= maxX && (
          <line
            x1={scaleX(numBacnetDevices)}
            y1={scaleY(0)}
            x2={scaleX(numBacnetDevices)}
            y2={scaleY(maxY)}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
      </svg>
    );
  };

  // Check alert indicators
  const isHighCollision = metrics.collisionRate > 30;
  const isSaturated = metrics.isSaturated;
  const isSevereLoss = metrics.bacnetLossRate > 15;

  // Compute theoretical vs likely user bandwidths
  const theoreticalUserBandwidth = numUsers > 0 
    ? (WIFI_STANDARDS[wifiStandardId].maxUnicastRate / 1e6) / numUsers 
    : (WIFI_STANDARDS[wifiStandardId].maxUnicastRate / 1e6);
  
  const likelyUserBandwidth = numUsers > 0 
    ? metrics.throughputs.actualUser / numUsers 
    : 0;

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <a href="https://aceiotsolutions.com" target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img 
              src="https://aceiotsolutions.com/uploads/ace-logo-3clr@3x.png" 
              alt="ACE IoT Solutions Logo" 
              style={{ height: '40px', display: 'block', minWidth: '144px' }} 
            />
          </a>
          <div className="header-title" style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.12)', paddingLeft: '1.25rem' }}>
            <h1>Wi-Fi &amp; BACnet Coexistence Simulator</h1>
            <p>Analyze CSMA/CA collisions, airtime congestion, and standard scaling limitations</p>
          </div>
        </div>
        <div className="presets-container">
          <span className="preset-label">Presets:</span>
          <button
            className={`preset-btn ${activePreset === 'legacy' ? 'active' : ''}`}
            onClick={() => applyPreset('legacy')}
          >
            Legacy Broadcast Subnet
          </button>
          <button
            className={`preset-btn ${activePreset === 'office' ? 'active' : ''}`}
            onClick={() => applyPreset('office')}
          >
            Smart Office (SC)
          </button>
          <button
            className={`preset-btn ${activePreset === 'dense-ax' ? 'active' : ''}`}
            onClick={() => applyPreset('dense-ax')}
          >
            Dense Wi-Fi 6 IoT
          </button>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        
        {/* LEFT COLUMN: CONTROLS PANEL */}
        <aside className="controls-panel">
          
          {/* Card 1: WiFi Standard Select */}
          <div className="panel-card">
            <h2><Wifi size={18} /> 1. Wi-Fi Configuration</h2>
            
            <div className="panel-group">
              <label className="panel-label">
                <span>Select IEEE 802.11 Standard</span>
              </label>
              
              <div className="wifi-select-grid">
                {Object.values(WIFI_STANDARDS).map((std) => (
                  <button
                    key={std.id}
                    className={`wifi-option ${wifiStandardId === std.id ? 'selected' : ''}`}
                    onClick={() => handleParamChange(setWifiStandardId, std.id)}
                  >
                    <span className="wifi-option-name">{std.id.toUpperCase()}</span>
                    <span className="wifi-option-desc">{std.year}</span>
                  </button>
                ))}
              </div>

              {/* Frequency Band Selector */}
              <div className="panel-group" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                <label className="panel-label">Frequency Band</label>
                <div className="protocol-select" style={{ marginBottom: 0 }}>
                  <button
                    className={`protocol-btn ${frequencyBand === '2.4' ? 'active' : ''}`}
                    onClick={() => handleParamChange(setFrequencyBand, '2.4')}
                  >
                    2.4 GHz (IoT)
                  </button>
                  <button
                    className={`protocol-btn ${frequencyBand === '5' ? 'active' : ''}`}
                    onClick={() => handleParamChange(setFrequencyBand, '5')}
                  >
                    5 GHz (Standard)
                  </button>
                </div>
                {wifiStandardId === '11ac' && frequencyBand === '2.4' && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.7rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <AlertTriangle size={12} />
                    <span>802.11ac is 5GHz-only. Falling back to 11n speeds.</span>
                  </div>
                )}
                {(wifiStandardId === '11b' || wifiStandardId === '11g') && frequencyBand === '5' && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.7rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <AlertTriangle size={12} />
                    <span>802.11b/g are 2.4GHz-only. Capped at 2.4GHz rates.</span>
                  </div>
                )}
              </div>

              {/* Dynamic Spec Sheet */}
              <div className="wifi-spec-sheet">
                <div className="spec-row">
                  <span className="spec-key">PHY Data Rate (Max):</span>
                  <span className="spec-val">
                    {metrics.wifiSpecs ? metrics.wifiSpecs.maxRate.toFixed(1) : (WIFI_STANDARDS[wifiStandardId].maxUnicastRate / 1e6).toFixed(1)} Mbps
                    {wifiStandardId === '11ac' && frequencyBand === '2.4' && ' (11n Fallback)'}
                  </span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Basic Broadcast Rate:</span>
                  <span className="spec-val">
                    {metrics.wifiSpecs ? metrics.wifiSpecs.basicRate.toFixed(1) : (WIFI_STANDARDS[wifiStandardId].basicRate / 1e6).toFixed(1)} Mbps
                  </span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Active Frequency:</span>
                  <span className="spec-val">
                    {frequencyBand} GHz
                    {(wifiStandardId === '11b' || wifiStandardId === '11g') && frequencyBand === '5' && ' (2.4GHz Only)'}
                  </span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Contention Slot Time:</span>
                  <span className="spec-val">
                    {metrics.wifiSpecs ? metrics.wifiSpecs.slotTime : WIFI_STANDARDS[wifiStandardId].slotTime} &mu;s (CW: {WIFI_STANDARDS[wifiStandardId].cwMin})
                  </span>
                </div>
              </div>
              
              {/* OFDMA Toggle (Conditional for Wi-Fi 6/7) */}
              {WIFI_STANDARDS[wifiStandardId].ofdmaSupported && (
                <div className="toggle-row">
                  <span className="panel-label" style={{ margin: 0, display: 'inline-flex', alignItems: 'center' }}>
                    <span>Enable OFDMA scheduling</span>
                    <span className="tooltip-container">
                      <Info size={12} style={{ marginLeft: 4, cursor: 'help' }} />
                      <span className="tooltip-text">
                        OFDMA divides the channel into subchannels (Resource Units), allowing multiple small IoT packets to transmit in parallel without colliding.
                      </span>
                    </span>
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={ofdmaEnabled}
                      onChange={(e) => handleParamChange(setOfdmaEnabled, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: General Network Traffic */}
          <div className="panel-card">
            <h2><Users size={18} /> 2. General Network Traffic</h2>
            
            <div className="panel-group">
              <div className="panel-label">
                <span>Active Users per AP</span>
                <span className="panel-val">{numUsers}</span>
              </div>
              <input
                type="range"
                className="slider-input"
                min="0"
                max="80"
                step="5"
                value={numUsers}
                onChange={(e) => handleParamChange(setNumUsers, parseInt(e.target.value))}
              />
              <div className="slider-ticks">
                <span>0</span>
                <span>40</span>
                <span>80</span>
              </div>
            </div>

            <div className="panel-group">
              <label className="panel-label">General User Activity Profile</label>
              <div className="protocol-select">
                {Object.values(USER_PROFILES).map((profile) => (
                  <button
                    key={profile.id}
                    className={`protocol-btn ${userProfileId === profile.id ? 'active' : ''}`}
                    onClick={() => handleParamChange(setUserProfileId, profile.id)}
                  >
                    {profile.id.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="wifi-option-desc" style={{ display: 'block', marginTop: '-0.5rem' }}>
                Each user generates average {USER_PROFILES[userProfileId].packetsPerSec} packets/sec ({USER_PROFILES[userProfileId].packetSize} bytes)
              </span>
            </div>
          </div>

          {/* Card 3: BACnet IoT Setup */}
          <div className="panel-card">
            <h2><Cpu size={18} /> 3. BACnet Automation Devices</h2>

            <div className="panel-group">
              <div className="panel-label">
                <span>BACnet Devices per AP</span>
                <span className="panel-val">{numBacnetDevices}</span>
              </div>
              <input
                type="range"
                className="slider-input"
                min="0"
                max="300"
                step="10"
                value={numBacnetDevices}
                onChange={(e) => handleParamChange(setNumBacnetDevices, parseInt(e.target.value))}
              />
              <div className="slider-ticks">
                <span>0</span>
                <span>150</span>
                <span>300</span>
              </div>
            </div>

            <div className="panel-group">
              <label className="panel-label">BACnet Communication Standard</label>
              <div className="protocol-select">
                <button
                  className={`protocol-btn ${bacnetProtocol === 'ip' ? 'active' : ''}`}
                  onClick={() => handleParamChange(setBacnetProtocol, 'ip')}
                >
                  BACnet/IP (Broadcast)
                </button>
                <button
                  className={`protocol-btn ${bacnetProtocol === 'sc' ? 'active' : ''}`}
                  onClick={() => handleParamChange(setBacnetProtocol, 'sc')}
                >
                  BACnet/SC (TLS Unicast)
                </button>
              </div>
            </div>

            {/* BACnet Broadcast Frequency */}
            <div className="panel-group">
              <div className="panel-label">
                <span>Update / Broadcast Interval</span>
                <span className="panel-val">{bacnetInterval}s</span>
              </div>
              <input
                type="range"
                className="slider-input"
                min="0.2"
                max="10.0"
                step="0.2"
                value={bacnetInterval}
                onChange={(e) => handleParamChange(setBacnetInterval, parseFloat(e.target.value))}
              />
              <div className="slider-ticks">
                <span>0.2s (Fast COV)</span>
                <span>5.0s</span>
                <span>10s (Slow Poll)</span>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT COLUMN: VISUALS & METRICS */}
        <main className="visuals-panel">
          
          {/* Metrics Grid */}
          <div className="metrics-grid">
            
            {/* Metric 1: Collision Probability */}
            <div className={`metric-card ${isHighCollision ? 'danger' : 'success'}`}>
              <div className="metric-header">
                <span>Collision Rate</span>
                <Activity size={16} />
              </div>
              <div className="metric-value-container">
                <span className="metric-value">{metrics.collisionRate.toFixed(1)}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-bar-bg">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${metrics.collisionRate}%`,
                    backgroundColor: isHighCollision ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                  }}
                ></div>
              </div>
              <span className="metric-desc">
                {isHighCollision ? 'Frequent packet overlaps, retries occur' : 'Healthy medium contention'}
              </span>
            </div>

            {/* Metric 2: Airtime Utilization */}
            <div className={`metric-card ${isSaturated ? 'danger' : 'success'}`}>
              <div className="metric-header">
                <span>Airtime Load</span>
                <Zap size={16} />
              </div>
              <div className="metric-value-container">
                <span className="metric-value">{Math.min(100, (100 - metrics.airtime.free)).toFixed(1)}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-bar-bg">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${Math.min(100, (100 - metrics.airtime.free))}%`,
                    backgroundColor: isSaturated ? 'var(--accent-rose)' : 'var(--accent-cyan)'
                  }}
                ></div>
              </div>
              <span className="metric-desc">
                {isSaturated ? 'Medium saturated. Latency spike!' : 'Capacity available'}
              </span>
            </div>

            {/* Metric 3: Bandwidth Reduction */}
            <div className={`metric-card ${metrics.bandwidthReduction > 50 ? 'warning' : 'success'}`}>
              <div className="metric-header">
                <span>Bandwidth Drop</span>
                <TrendingUp size={16} />
              </div>
              <div className="metric-value-container">
                <span className="metric-value">{metrics.bandwidthReduction.toFixed(1)}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-bar-bg">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${metrics.bandwidthReduction}%`,
                    backgroundColor: metrics.bandwidthReduction > 50 ? 'var(--accent-amber)' : 'var(--accent-cyan)'
                  }}
                ></div>
              </div>
              <span className="metric-desc">
                Capacity wasted on retry overhead
              </span>
            </div>

            {/* Metric 4: BACnet Packet Loss */}
            <div className={`metric-card ${isSevereLoss ? 'danger' : 'success'}`}>
              <div className="metric-header">
                <span>BACnet Packet Loss</span>
                <AlertTriangle size={16} />
              </div>
              <div className="metric-value-container">
                <span className="metric-value">{metrics.bacnetLossRate.toFixed(1)}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-bar-bg">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${metrics.bacnetLossRate}%`,
                    backgroundColor: isSevereLoss ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                  }}
                ></div>
              </div>
              <span className="metric-desc">
                {bacnetProtocol === 'ip' 
                  ? (isSevereLoss ? 'Critical broadcast loss (no retries!)' : 'Acceptable broadcast delivery')
                  : '0% physical drops (TCP TLS guarantees delivery)'
                }
              </span>
            </div>

            {/* Metric 5: User Bandwidth (Theoretical vs Likely) */}
            <div className={`metric-card ${likelyUserBandwidth < (theoreticalUserBandwidth * 0.5) ? 'warning' : 'success'}`}>
              <div className="metric-header">
                <span>User Bandwidth</span>
                <Users size={16} />
              </div>
              <div className="metric-value-container">
                <span className="metric-value">
                  {numUsers > 0 ? likelyUserBandwidth.toFixed(2) : '0.00'}
                </span>
                <span className="metric-unit">Mbps</span>
              </div>
              <div className="metric-bar-bg">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${theoreticalUserBandwidth > 0 ? (likelyUserBandwidth / theoreticalUserBandwidth) * 100 : 0}%`,
                    backgroundColor: likelyUserBandwidth < (theoreticalUserBandwidth * 0.5) ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                  }}
                ></div>
              </div>
              <span className="metric-desc">
                Max: {numUsers > 0 ? theoreticalUserBandwidth.toFixed(1) : (WIFI_STANDARDS[wifiStandardId].maxUnicastRate / 1e6).toFixed(1)} Mbps/user
              </span>
            </div>
          </div>

          {/* Segmented Tab Select for Visualization / Graphs */}
          <div className="protocol-select" style={{ marginBottom: 0 }}>
            <button
              className={`protocol-btn ${activeTab === 'simulation' ? 'active' : ''}`}
              onClick={() => setActiveTab('simulation')}
            >
              Live Medium Contention Visualizer
            </button>
            <button
              className={`protocol-btn ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              Analytical Scaling &amp; Graphs
            </button>
          </div>

          {/* Tab 1: Live Simulation */}
          {activeTab === 'simulation' && (
            <section className="simulation-card">
              <div className="simulation-card-header">
                <div className="header-title">
                  <h3 style={{ fontSize: '1rem', display: 'flex', alignPosition: 'center', gap: '0.25rem' }}>
                    <Server size={16} /> Real-Time BSS Activity
                  </h3>
                  <p style={{ fontSize: '0.75rem' }}>Visualizing packet paths, backoffs, and collision points</p>
                </div>
                <div className="simulation-legend">
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#06b6d4' }}></span>
                    <span>General Unicast</span>
                  </div>
                  {bacnetProtocol === 'ip' ? (
                    <>
                      <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#ffc048' }}></span>
                        <span>BACnet IP Poll</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                        <span>BACnet Broadcast</span>
                      </div>
                    </>
                  ) : (
                    <div className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: '#c1d301' }}></span>
                      <span>BACnet/SC TLS (TCP)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Canvas Rendering Box */}
              <div className="canvas-container">
                <canvas ref={canvasRef} className="simulation-canvas" />
              </div>

              {/* Airtime Segment Breakdown */}
              <div className="panel-group" style={{ margin: 0 }}>
                <span className="panel-label">Medium Airtime Breakdown (Channel Utilization)</span>
                <div className="airtime-bar">
                  <div className="airtime-segment" style={{ width: `${metrics.airtime.user}%`, backgroundColor: '#06b6d4' }} title={`General Unicast: ${metrics.airtime.user.toFixed(1)}%`} />
                  <div className="airtime-segment" style={{ width: `${metrics.airtime.bacnetUni}%`, backgroundColor: bacnetProtocol === 'ip' ? '#ffc048' : '#c1d301' }} title={`BACnet Unicast: ${metrics.airtime.bacnetUni.toFixed(1)}%`} />
                  <div className="airtime-segment" style={{ width: `${metrics.airtime.bacnetBcast}%`, backgroundColor: '#f59e0b' }} title={`BACnet Broadcasts: ${metrics.airtime.bacnetBcast.toFixed(1)}%`} />
                  <div className="airtime-segment" style={{ width: `${metrics.airtime.free}%`, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} title={`Free Air: ${metrics.airtime.free.toFixed(1)}%`} />
                </div>
                
                <div className="airtime-details-grid">
                  <div className="airtime-detail-item">
                    <span><span className="airtime-indicator" style={{ backgroundColor: '#06b6d4' }}></span>General Traffic:</span>
                    <span className="panel-val">{metrics.airtime.user.toFixed(1)}%</span>
                  </div>
                  <div className="airtime-detail-item">
                    <span>
                      <span className="airtime-indicator" style={{ backgroundColor: bacnetProtocol === 'ip' ? '#ffc048' : '#c1d301' }}></span>
                      BACnet Unicast:
                    </span>
                    <span className="panel-val">{metrics.airtime.bacnetUni.toFixed(1)}%</span>
                  </div>
                  <div className="airtime-detail-item">
                    <span><span className="airtime-indicator" style={{ backgroundColor: '#f59e0b' }}></span>BACnet Broadcasts:</span>
                    <span className="panel-val">{metrics.airtime.bacnetBcast.toFixed(1)}%</span>
                  </div>
                  <div className="airtime-detail-item">
                    <span><span className="airtime-indicator" style={{ backgroundColor: '#475569' }}></span>Idle / Available:</span>
                    <span className="panel-val">{metrics.airtime.free.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Tab 2: Comparison Analysis Charts */}
          {activeTab === 'analysis' && (
            <div className="secondary-grid">
              
              {/* Chart 1: Collision rate comparison */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3><Activity size={16} style={{ color: 'var(--accent-amber)' }} /> Collision Curve Comparison</h3>
                  <span className="wifi-option-desc">As BACnet Nodes scale (0-200)</span>
                </div>
                <div className="chart-svg-container">
                  {renderLineChart()}
                </div>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <span className="legend-color" style={{ backgroundColor: 'var(--accent-amber)' }}></span>
                    <span>BACnet/IP (Subnet Broadcasts)</span>
                  </div>
                  <div className="chart-legend-item">
                    <span className="legend-color" style={{ backgroundColor: 'var(--accent-emerald)' }}></span>
                    <span>BACnet/SC (Hub Unicasts)</span>
                  </div>
                </div>
                <div className="edu-section" style={{ marginTop: '1rem', padding: '0.75rem', fontSize: '0.8rem' }}>
                  <p><strong>Note:</strong> Under BACnet/IP, broadcast frames are sent at the slow Basic physical rate (e.g. 6 Mbps) without CSMA acknowledgement (ACK). Under BACnet/SC, all frames are unicast TLS over TCP, utilizing the highest supported MCS rate (e.g. 866 Mbps) which clears the channel 100x faster.</p>
                </div>
              </div>

              {/* Chart 2: Throughput degradation */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3><TrendingUp size={16} style={{ color: 'var(--accent-cyan)' }} /> User Throughput Degradation</h3>
                  <span className="wifi-option-desc">General User Actual Data Rate (Mbps)</span>
                </div>
                <div className="chart-svg-container">
                  {renderThroughputChart()}
                </div>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <span className="legend-color" style={{ backgroundColor: 'var(--accent-rose)', border: '1px dashed white' }}></span>
                    <span>User Rate with BACnet/IP</span>
                  </div>
                  <div className="chart-legend-item">
                    <span className="legend-color" style={{ backgroundColor: 'var(--accent-cyan)' }}></span>
                    <span>User Rate with BACnet/SC</span>
                  </div>
                </div>
                <div className="edu-section cyan" style={{ marginTop: '1rem', padding: '0.75rem', fontSize: '0.8rem' }}>
                  <p><strong>Insight:</strong> As BACnet/IP broadcast rate increases, CSMA/CA backoff cycles double for users. User packets must wait or collide repeatedly. When the channel saturates, general user throughput drops exponentially, regardless of how fast the standard's physical speed is.</p>
                </div>
              </div>
            </div>
          )}

          {/* Educational Content & Comparison */}
          <section className="panel-card">
            <h2><BookOpen size={18} /> Protocol Coexistence Physics</h2>
            <div className="edu-content">
              <div className="edu-section cyan">
                <h4>1. The Slow-Rate Broadcast Bottleneck</h4>
                <p>
                  By default, Wi-Fi treats broadcast and multicast frames as <strong>Group Address</strong> frames. To ensure all stations (even those on the boundary with weak signals) can decode them, they are transmitted at the basic mandatory rate (often 1 or 2 Mbps in 2.4GHz and 6 Mbps in 5GHz).
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  A 250-byte BACnet/IP broadcast at 6 Mbps occupies the air for <strong>333 &mu;s</strong>. The same packet sent as a unicast at 866 Mbps takes only <strong>2.3 &mu;s</strong>. Broadcasts therefore consume <strong>over 140x more airtime</strong> per byte, clogging the medium and inducing collisions.
                </p>
              </div>

              <div className="edu-section">
                <h4>2. The Collision Cascade (CSMA/CA)</h4>
                <p>
                  Wi-Fi uses <strong>Carrier Sense Multiple Access with Collision Avoidance</strong>. When the AP receives a BACnet/IP broadcast, it must re-transmit it as a broadcast to all stations. This creates double-exposure airtime. As collision rates spike, unicast stations double their Contention Window (CW), adding silent retry delay. Once collision rates exceed 30%, the effective bandwidth capacity drops exponentially.
                </p>
              </div>

              <div className="edu-section" style={{ borderLeftColor: 'var(--accent-emerald)' }}>
                <h4>3. The BACnet/SC Option</h4>
                <p>
                  <strong>BACnet Secure Connect (ASHRAE 135-2020)</strong> is an alternative communication design option that eliminates broadcasts. It establishes point-to-point secure TLS (TCP) connections from devices to a Hub. Broadcasts like Who-Is or COV updates are sent as unicast TCP packets to the hub, which forwards them as unicast packets to active subscribers. Because these are standard unicasts, they are sent at full rate, are protected by WMM QoS, use CSMA retries, and can leverage OFDMA parallel slots in Wi-Fi 6.
                </p>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* FOOTER */}
      <footer className="app-footer">
        <p>
          Interactive Coexistence Analysis System &bull; Powered by{' '}
          <a href="https://aceiotsolutions.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-ace)', fontWeight: 'bold', textDecoration: 'none' }}>
            ACE IoT Solutions
          </a>
        </p>
        <p style={{ opacity: 0.5 }}>
          Built in accordance with IEEE 802.11 and ASHRAE 135 Standards &bull; React, Canvas Particle Simulations, and Bianchi CSMA/CA Contention Approximations.
        </p>
      </footer>
    </div>
  );
}

export default App;
