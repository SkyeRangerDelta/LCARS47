// Beszel API Type Interfaces

/**
 * System record from Beszel systems collection
 */
export interface BeszelSystemRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  name: string;
  host: string;
  port: number | string;
  status: string;
  users: string[];
  info?: BeszelSystemInfo; // System details object (not JSON string)
}

/**
 * System metrics/stats data
 * Note: Actual structure may vary based on Beszel version
 */
export interface BeszelSystemMetrics {
  id: string;
  name: string;
  status: string;
  cpu: number;
  memUsed: string;
  memTotal: string;
  memPercent: number;
  diskUsed: string;
  diskTotal: string;
  diskPercent: number;
  netDown: string;
  netUp: string;
  uptime: string;
  temperature?: number;
  gpuUsage?: number;
  containers?: number;
}

/**
 * System info structure (static system information)
 */
export interface BeszelSystemInfo {
  h?: string;        // hostname
  k?: string;        // kernel version
  c?: number;        // CPU cores
  t?: number;        // CPU threads
  m?: string;        // CPU model
  u?: number;        // uptime in seconds
  cpu?: number;      // CPU usage percentage
  mp?: number;       // memory usage percentage
  dp?: number;       // disk usage percentage
  b?: number;        // bandwidth/network usage
  v?: string;        // Beszel agent version
  os?: number;       // OS type
  l1?: number;       // load average 1 min
  l5?: number;       // load average 5 min
  l15?: number;      // load average 15 min
  bb?: number;       // total bandwidth bytes
  la?: number[];     // load averages array
  ct?: number;       // container count
}

/**
 * System stats structure (live metrics from stats collection)
 */
export interface BeszelSystemStats {
  cpu?: number;      // CPU usage percentage
  m?: number;        // memory total GB
  mu?: number;       // memory used GB
  mp?: number;       // memory percentage
  mb?: number;       // memory buffers/cache GB
  s?: number;        // swap GB
  d?: number;        // disk total GB
  du?: number;       // disk used GB
  dp?: number;       // disk percentage
  dr?: number;       // disk read
  dw?: number;       // disk write
  ns?: number;       // network sent
  nr?: number;       // network received
  b?: number[];      // bandwidth [upload, download]
  la?: number[];     // load averages [1m, 5m, 15m]
  ni?: Record<string, number[]>; // network interfaces
  dio?: number[];    // disk I/O
  cpub?: number[];   // CPU breakdown
  cpus?: number[];   // CPU stats
}
