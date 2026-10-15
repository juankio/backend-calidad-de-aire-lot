export interface DashboardStats {
  bronzeCount: number;
  silverCount: number;
  sessionsCount: number;
  port: number | string;
  uptime: number;
  memory: string;
  nodeVersion: string;
  bunVersion: string;
  liveTelemetry: any;
  simulator: any;
}

export function getDashboardHtml(stats: DashboardStats): string {
  const {
    bronzeCount,
    silverCount,
    sessionsCount,
    port,
    uptime,
    memory,
    bunVersion,
    liveTelemetry,
    simulator,
  } = stats;

  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Air Guardian IoT • Backend Sentinel S3 (Vista MVC)</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2306b6d4'><circle cx='12' cy='12' r='10'/></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            mono: ['"JetBrains Mono"', 'monospace'],
            scifi: ['"Orbitron"', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #030712;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.1) 0%, transparent 60%),
        linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 100% 100%, 32px 32px, 32px 32px;
    }
    pre {
      scrollbar-width: thin;
      scrollbar-color: #06b6d4 #0f172a;
    }
  </style>
</head>
<body class="text-slate-100 font-mono min-h-screen flex flex-col p-3 sm:p-5 lg:p-6">

  <!-- CABECERA PRINCIPAL TÁCTICA -->
  <header class="max-w-7xl w-full mx-auto mb-4 bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-4 sm:p-5 shadow-[0_0_25px_rgba(6,182,212,0.15)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-400 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] shrink-0">
        <svg class="w-6 h-6 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-lg sm:text-xl font-scifi font-black tracking-wider text-white">SENTINEL S3 • BACKEND MVC</h1>
          <span class="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold">VISTA DEL BACKEND</span>
        </div>
        <p class="text-xs text-slate-400">
          NestJS v11 + Bun SQLite Data Lakehouse • Endpoints REST & WebSocket
        </p>
      </div>
    </div>

    <!-- Indicadores de Estado -->
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/20 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span class="text-slate-300">PUERTO: <strong class="text-white">${port}</strong></span>
      </div>
      <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/20 text-slate-300">
        BUN: <strong class="text-cyan-300">${bunVersion}</strong>
      </div>
      <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/20 text-slate-300">
        RAM: <strong class="text-amber-300">${memory}</strong>
      </div>
      <a href="/docs" target="_blank" class="px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-300 font-bold transition flex items-center gap-1.5">
        <span>Swagger / OpenAPI ↗</span>
      </a>
      <a href="http://localhost:3000" target="_blank" class="px-3 py-1.5 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 border border-cyan-400 text-white font-bold transition flex items-center gap-1.5">
        <span>Frontend Nuxt (3000) ↗</span>
      </a>
    </div>
  </header>

  <!-- TARJETAS DE ESTADO DEL SISTEMA -->
  <div class="max-w-7xl w-full mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
    
    <!-- 1. Data Lakehouse SQLite -->
    <div class="bg-slate-950/80 border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
      <div class="flex items-center justify-between text-xs font-bold text-cyan-400 mb-2">
        <span>DATA LAKE (SQLITE WAL)</span>
        <span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">3 CAPAS</span>
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">Bronze (Crudo):</span> <strong class="text-amber-300">${bronzeCount}</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">Silver (Filtrado):</span> <strong class="text-cyan-300">${silverCount}</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">Gold (Zonas):</span> <strong class="text-emerald-300">${sessionsCount}</strong></div>
      </div>
    </div>

    <!-- 2. Última Telemetría -->
    <div class="bg-slate-950/80 border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
      <div class="flex items-center justify-between text-xs font-bold text-cyan-400 mb-2">
        <span>ÚLTIMA LECTURA IoT</span>
        <span class="text-[9px] px-1.5 py-0.5 rounded font-bold ${
          liveTelemetry?.risk_status === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
          liveTelemetry?.risk_status === 'WARNING_PREDICTIVE' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
          'bg-emerald-950 text-emerald-300 border border-emerald-800'
        }">${liveTelemetry?.risk_status || 'STANDBY'}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div><span class="text-[10px] text-slate-400 block">PPM (eCO2)</span><strong class="text-base text-cyan-300">${liveTelemetry ? Number(liveTelemetry.ppm).toFixed(1) : '---'}</strong></div>
        <div><span class="text-[10px] text-slate-400 block">CO (MQ-7)</span><strong class="text-base text-amber-300">${liveTelemetry ? Number(liveTelemetry.co_ppm).toFixed(1) : '---'}</strong></div>
        <div><span class="text-[10px] text-slate-400 block">Temp / Hum</span><span class="text-white">${liveTelemetry ? Number(liveTelemetry.temperature).toFixed(1) + '°C / ' + Number(liveTelemetry.humidity).toFixed(0) + '%' : '---'}</span></div>
        <div><span class="text-[10px] text-slate-400 block">Pred 15m</span><span class="text-emerald-300 font-bold">${liveTelemetry ? (Number(liveTelemetry.predicted_ppm_15m) || 0).toFixed(0) + ' ppm' : '---'}</span></div>
      </div>
    </div>

    <!-- 3. Simulador IoT -->
    <div class="bg-slate-950/80 border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
      <div class="flex items-center justify-between text-xs font-bold text-cyan-400 mb-2">
        <span>SIMULADOR AMBIENTAL</span>
        <span class="text-[9px] px-1.5 py-0.5 rounded font-bold ${simulator?.running ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-900 text-slate-400'}">
          ${simulator?.running ? 'ACTIVO (2s)' : 'PAUSADO'}
        </span>
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">Fase actual:</span> <strong class="text-cyan-300">${simulator?.current_phase || 'AUTO'}</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">PPM simulado:</span> <strong class="text-white">${simulator?.current_ppm ? Number(simulator.current_ppm).toFixed(1) : '---'}</strong></div>
      </div>
      <div class="flex gap-2 mt-2 pt-2 border-t border-slate-800/80">
        <button onclick="quickAction('/api/simulate/toggle', 'POST', {})" class="flex-1 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold transition">
          ${simulator?.running ? 'Pausar' : 'Iniciar'}
        </button>
        <button onclick="quickAction('/api/simulate/seed', 'POST', { force: true })" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-300 text-[11px] font-bold transition">
          Sembrar
        </button>
      </div>
    </div>

    <!-- 4. WebSocket Feed Stream -->
    <div class="bg-slate-950/80 border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
      <div class="flex items-center justify-between text-xs font-bold text-cyan-400 mb-2">
        <span>WEBSOCKET LIVE FEED</span>
        <span id="ws-badge" class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">ONLINE</span>
      </div>
      <div id="ws-stream" class="h-20 bg-slate-900/90 rounded-lg p-2 text-[10px] text-slate-300 overflow-y-auto font-mono space-y-1 border border-slate-800">
        <div class="text-slate-500 italic">Conectando a ws://localhost:${port}/ ...</div>
      </div>
      <div class="text-[9px] text-slate-500 mt-1 flex justify-between">
        <span>Ruta: <code>/</code></span>
        <span>Ping/Pong: 30s</span>
      </div>
    </div>

  </div>

  <!-- CONSOLA INTERACTIVA: LISTA DE GETS Y POSTS CON EJECUTOR EN VIVO -->
  <main class="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4">

    <!-- COLUMNA IZQUIERDA: CATÁLOGO DE TODOS LOS ENDPOINTS (GET / POST / PATCH / DELETE) -->
    <div class="lg:col-span-7 bg-slate-950/90 border border-cyan-500/30 rounded-2xl p-4 flex flex-col">
      <div class="flex items-center justify-between pb-3 mb-3 border-b border-cyan-500/20">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>ENDPOINTS Y SERVICIOS ACTIVOS DEL BACKEND</span>
          </h2>
          <p class="text-[11px] text-slate-400">Haz clic en cualquier botón <strong class="text-cyan-300">"PROBAR"</strong> para ejecutar el GET/POST y ver qué responde el backend.</p>
        </div>
        <span class="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold">19 RUTAS</span>
      </div>

      <!-- Filtro rápido -->
      <div class="flex items-center gap-1.5 mb-3 text-xs">
        <span class="text-slate-400 text-[11px]">Filtrar:</span>
        <button onclick="filterEndpoints('ALL')" class="filter-btn px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500 text-cyan-300 font-bold text-[10px]">TODOS</button>
        <button onclick="filterEndpoints('GET')" class="filter-btn px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10px]">GET</button>
        <button onclick="filterEndpoints('POST')" class="filter-btn px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10px]">POST</button>
        <button onclick="filterEndpoints('PATCH')" class="filter-btn px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10px]">PATCH</button>
        <button onclick="filterEndpoints('DELETE')" class="filter-btn px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10px]">DELETE</button>
      </div>

      <!-- Contenedor scrollable de endpoints -->
      <div id="endpoints-list" class="space-y-2 overflow-y-auto max-h-[640px] pr-1">
        <!-- Generado dinámicamente vía script -->
      </div>
    </div>

    <!-- COLUMNA DERECHA: CONSOLA DE PRUEBAS INTERACTIVA Y RESPUESTA JSON -->
    <div class="lg:col-span-5 flex flex-col gap-3">
      
      <!-- Panel de Petición (Payload Editor) -->
      <div class="bg-slate-950/90 border border-cyan-500/30 rounded-2xl p-4 flex flex-col">
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
          <h3 class="text-xs font-bold text-white flex items-center gap-1.5">
            <span class="text-cyan-400">⚡</span>
            <span id="active-title">EJECUTOR DE PETICIÓN</span>
          </h3>
          <span id="active-method" class="text-[10px] px-2 py-0.5 rounded font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">GET</span>
        </div>

        <div class="mb-2">
          <label class="text-[10px] text-slate-400 block mb-1">URL / Ruta a Invocar:</label>
          <input id="req-url" type="text" value="/api/telemetry/live" class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-mono focus:border-cyan-400 focus:outline-none" />
        </div>

        <div id="body-container" class="mb-2 hidden">
          <label class="text-[10px] text-slate-400 flex justify-between items-center mb-1">
            <span>Cuerpo JSON (Body Payload):</span>
            <span class="text-[9px] text-slate-500">Editable antes de enviar</span>
          </label>
          <textarea id="req-body" rows="6" class="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px] text-emerald-300 font-mono focus:border-cyan-400 focus:outline-none"></textarea>
        </div>

        <button id="send-btn" onclick="executeCurrentRequest()" class="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>ENVIAR PETICIÓN AL BACKEND</span>
        </button>
      </div>

      <!-- Panel de Respuesta JSON en Vivo -->
      <div class="bg-slate-950/90 border border-cyan-500/30 rounded-2xl p-4 flex-1 flex flex-col min-h-[300px]">
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-bold text-white">RESPUESTA HTTP</h3>
            <span id="res-status" class="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-900 text-slate-400">---</span>
          </div>
          <span id="res-time" class="text-[10px] text-slate-500">0 ms</span>
        </div>

        <div class="relative flex-1 bg-slate-900/90 rounded-xl p-3 border border-slate-800 overflow-hidden flex flex-col">
          <button onclick="copyResponse()" class="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[9px] text-slate-300 transition" title="Copiar JSON">
            Copiar
          </button>
          <pre id="res-body" class="flex-1 overflow-auto text-[11px] text-cyan-200 font-mono leading-relaxed">
{
  "info": "Haz clic en 'PROBAR' en cualquier endpoint para ejecutarlo en vivo."
}</pre>
        </div>
      </div>

    </div>

  </main>

  <footer class="max-w-7xl w-full mx-auto text-center text-xs text-slate-500 py-3 mt-4 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2">
    <span>Air Guardian IoT • Sentinel S3 Backend Architecture (NestJS MVC)</span>
    <span>Uptime: ${uptime}s • Memoria RSS: ${memory}</span>
  </footer>

  <!-- SCRIPT INTERACTIVO CLIENTE -->
  <script>
    const ENDPOINTS = [
      // TELEMETRY
      { method: 'GET', path: '/api/telemetry/live', title: 'Última Telemetría', desc: 'Obtiene la última muestra procesada en Capa Silver.', body: null },
      { method: 'GET', path: '/api/telemetry/history?limit=10', title: 'Historial de Telemetría', desc: 'Recupera series temporales históricas con filtros (limit, device_id).', body: null },
      { method: 'POST', path: '/api/telemetry/ingest', title: 'Ingesta de Telemetría IoT', desc: 'Inserta en Bronze, clasifica con inercia a 15m, guarda en Silver y emite WS.', 
        body: { device_id: 'air-guardian-01', timestamp: Date.now(), ppm: 520, co_ppm: 3.5, temperature: 25.4, humidity: 58.0, delta_ppm: 2.1, raw_adc: 720, emotion: 'NORMAL', view_mode: 'FACE' } },
      { method: 'POST', path: '/api/telemetry/command', title: 'Comando de Pantalla/Emoción', desc: 'Encola comandos (FACE/HUD/3D) para el ESP32 y difunde por WebSocket.',
        body: { device_id: 'air-guardian-01', view_mode: 'HUD', emotion: 'HAPPY' } },
      { method: 'POST', path: '/api/telemetry/batch', title: 'Offline Flush de Lotes', desc: 'Ingesta atómica SQLite WAL ordenada cronológicamente de múltiples muestras.',
        body: { device_id: 'air-guardian-01', samples: [
          { timestamp: Date.now() - 6000, ppm: 420, co_ppm: 2.0, temperature: 24, humidity: 55, raw_adc: 600 },
          { timestamp: Date.now() - 3000, ppm: 435, co_ppm: 2.2, temperature: 24.2, humidity: 55.2, raw_adc: 615 },
          { timestamp: Date.now(), ppm: 450, co_ppm: 2.4, temperature: 24.5, humidity: 55.5, raw_adc: 630 }
        ]} },

      // SESSIONS & MAPS
      { method: 'GET', path: '/api/sessions', title: 'Listado de Campañas Geo (Gold)', desc: 'Consulta todas las zonas de medición con métricas agregadas Gold.', body: null },
      { method: 'POST', path: '/api/sessions', title: 'Crear Nueva Campaña Geo', desc: 'Crea una zona geo-referenciada con radio para asociar telemetría.',
        body: { name: 'Laboratorio de Pruebas', description: 'Monitoreo ambiental interior', latitude: 4.1425, longitude: -73.6266, radius_meters: 60, start_time: Date.now(), device_id: 'air-guardian-01' } },
      { method: 'GET', path: '/api/heatmap', title: 'Puntos del Mapa de Calor', desc: 'Recupera coordenadas con promedios químicos para el mapa Leaflet.', body: null },

      // ANALYTICS & DATA SCIENCE
      { method: 'GET', path: '/api/analytics/model-metrics', title: 'Benchmark de Modelos IA', desc: 'Compara Damped Exponential vs XGBoost vs Holt-Winters (R², RMSE, MAE).', body: null },
      { method: 'GET', path: '/api/analytics/correlation-matrix', title: 'Matriz de Correlación de Pearson', desc: 'Matriz 5x5 entre PPM, CO, Temp, Hum y Delta PPM.', body: null },
      { method: 'GET', path: '/api/analytics/numerical-analysis', title: 'Cátedra EDO: Euler vs RK4', desc: 'Solución analítica vs integración numérica (Lipschitz, estabilidad).', body: null },
      { method: 'GET', path: '/api/analytics/export/bronze?format=json&limit=5', title: 'Exportar Capa Bronze', desc: 'Descarga registros en crudo inmutables bajo estándar RFC 4180.', body: null },
      { method: 'GET', path: '/api/analytics/export/silver?format=json&limit=5', title: 'Exportar Capa Silver', desc: 'Descarga registros enriquecidos con derivada e inercia calculadas.', body: null },
      { method: 'GET', path: '/api/analytics/export/gold?format=json', title: 'Exportar Capa Gold', desc: 'Descarga vistas consolidadas por zona para data science.', body: null },

      // SIMULATOR
      { method: 'GET', path: '/api/simulate/status', title: 'Estado del Simulador', desc: 'Consulta si el simulador cíclico está corriendo y su fase actual.', body: null },
      { method: 'POST', path: '/api/simulate/toggle', title: 'Alternar Simulador', desc: 'Inicia o detiene el bucle periódico estocástico.', body: { enable: true } },
      { method: 'POST', path: '/api/simulate/seed', title: 'Sembrar Muestras Sintéticas', desc: 'Puebla 80 muestras realistas y 4 ubicaciones en SQLite.', body: { force: true } },
      { method: 'POST', path: '/api/simulate/phase', title: 'Forzar Fase Ambiental', desc: 'Fuerza estado: OPTIMAL, WARNING_PREDICTIVE, CRITICAL o RECOVERY.', body: { phase: 'WARNING_PREDICTIVE' } },

      // SYSTEM HEALTH
      { method: 'GET', path: '/health', title: 'Health Check', desc: 'Verificación de salud del proceso de backend.', body: null },
    ];

    let currentEndpoint = ENDPOINTS[0];

    function renderEndpoints(filter = 'ALL') {
      const container = document.getElementById('endpoints-list');
      container.innerHTML = '';

      const filtered = filter === 'ALL' ? ENDPOINTS : ENDPOINTS.filter(e => e.method === filter);

      filtered.forEach((ep, idx) => {
        const item = document.createElement('div');
        item.className = 'p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition flex items-center justify-between gap-3 text-xs';
        
        const methodColor = 
          ep.method === 'GET' ? 'bg-cyan-950 text-cyan-300 border-cyan-800' :
          ep.method === 'POST' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
          ep.method === 'PATCH' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-rose-950 text-rose-300 border-rose-800';

        item.innerHTML = \`
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold border \${methodColor} shrink-0">\${ep.method}</span>
            <div class="min-w-0">
              <div class="font-bold text-slate-200 truncate font-mono">\${ep.path}</div>
              <div class="text-[10.5px] text-slate-400 truncate">\${ep.title} • \${ep.desc}</div>
            </div>
          </div>
          <button onclick="selectEndpoint(\${ENDPOINTS.indexOf(ep)})" class="px-3 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold transition active:scale-95 shrink-0 cursor-pointer">
            PROBAR ↗
          </button>
        \`;
        container.appendChild(item);
      });
    }

    function filterEndpoints(filter) {
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-cyan-500/20', 'border-cyan-500', 'text-cyan-300');
        btn.classList.add('bg-slate-900', 'border-slate-800', 'text-slate-400');
      });
      event.target.classList.remove('bg-slate-900', 'border-slate-800', 'text-slate-400');
      event.target.classList.add('bg-cyan-500/20', 'border-cyan-500', 'text-cyan-300');
      renderEndpoints(filter);
    }

    function selectEndpoint(idx) {
      currentEndpoint = ENDPOINTS[idx];
      document.getElementById('active-title').innerText = currentEndpoint.title.toUpperCase();
      const methodBadge = document.getElementById('active-method');
      methodBadge.innerText = currentEndpoint.method;
      
      methodBadge.className = 'text-[10px] px-2 py-0.5 rounded font-bold border ' + (
        currentEndpoint.method === 'GET' ? 'bg-cyan-950 text-cyan-300 border-cyan-800' :
        currentEndpoint.method === 'POST' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
        currentEndpoint.method === 'PATCH' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-rose-950 text-rose-300 border-rose-800'
      );

      document.getElementById('req-url').value = currentEndpoint.path;

      const bodyContainer = document.getElementById('body-container');
      const bodyTextarea = document.getElementById('req-body');

      if (currentEndpoint.body) {
        bodyContainer.classList.remove('hidden');
        bodyTextarea.value = JSON.stringify(currentEndpoint.body, null, 2);
      } else {
        bodyContainer.classList.add('hidden');
        bodyTextarea.value = '';
      }

      executeCurrentRequest();
    }

    async function executeCurrentRequest() {
      const url = document.getElementById('req-url').value;
      const method = currentEndpoint.method;
      const bodyVal = document.getElementById('req-body').value;
      
      const resStatus = document.getElementById('res-status');
      const resTime = document.getElementById('res-time');
      const resBody = document.getElementById('res-body');

      resBody.innerText = 'Cargando respuesta del backend...';
      const startTime = performance.now();

      try {
        const options = {
          method,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        };

        if (['POST', 'PATCH', 'PUT'].includes(method) && bodyVal) {
          options.body = bodyVal;
        }

        const res = await fetch(url, options);
        const duration = Math.round(performance.now() - startTime);
        resTime.innerText = duration + ' ms';

        resStatus.innerText = 'HTTP ' + res.status + ' ' + res.statusText;
        resStatus.className = 'text-[10px] px-2 py-0.5 rounded font-bold border ' + (
          res.ok ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-rose-950 text-rose-300 border-rose-800'
        );

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          resBody.innerText = JSON.stringify(json, null, 2);
        } else {
          const text = await res.text();
          resBody.innerText = text;
        }
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        resTime.innerText = duration + ' ms';
        resStatus.innerText = 'ERROR DE RED';
        resStatus.className = 'text-[10px] px-2 py-0.5 rounded font-bold bg-rose-950 text-rose-300 border border-rose-800';
        resBody.innerText = 'Error ejecutando fetch: ' + err.message;
      }
    }

    async function quickAction(url, method, body) {
      currentEndpoint = { method, path: url, title: 'Acción Rápida', body };
      document.getElementById('req-url').value = url;
      document.getElementById('req-body').value = JSON.stringify(body, null, 2);
      if (body) document.getElementById('body-container').classList.remove('hidden');
      await executeCurrentRequest();
      setTimeout(() => location.reload(), 800);
    }

    function copyResponse() {
      const text = document.getElementById('res-body').innerText;
      navigator.clipboard.writeText(text);
      alert('¡JSON copiado al portapapeles!');
    }

    // Inicializar WebSocket en la vista para monitoreo en vivo
    function initWebSocket() {
      const stream = document.getElementById('ws-stream');
      const badge = document.getElementById('ws-badge');
      const wsUrl = 'ws://' + window.location.host + '/';

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          badge.innerText = 'ONLINE';
          badge.className = 'text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold';
          stream.innerHTML = '<div class="text-emerald-400 font-bold">✓ Conectado al Gateway de Telemetría</div>';
        };

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            const time = new Date().toLocaleTimeString();
            const div = document.createElement('div');
            div.className = 'text-cyan-300 truncate';
            div.innerText = \`[\${time}] \${data.type || 'PPM'}: \${data.ppm ? data.ppm.toFixed(1) : ''} ppm (CO: \${data.co_ppm || 0})\`;
            stream.prepend(div);
            if (stream.children.length > 25) stream.removeChild(stream.lastChild);
          } catch {}
        };

        ws.onclose = () => {
          badge.innerText = 'OFFLINE';
          badge.className = 'text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold';
        };
      } catch (err) {
        badge.innerText = 'ERROR';
      }
    }

    // Al cargar la página
    window.addEventListener('DOMContentLoaded', () => {
      renderEndpoints();
      selectEndpoint(0);
      initWebSocket();
    });
  </script>
</body>
</html>`;
}
