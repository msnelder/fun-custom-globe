#!/usr/bin/env node
/**
 * Pre-computes land dot positions for the globe and writes dots.js.
 * Run once: node generate-dots.mjs
 *
 * Requires: npm install topojson-client d3-geo node-fetch
 */

import { writeFileSync } from 'fs';

let feature, geoContains, fetch;

try {
  ({ feature } = await import('topojson-client'));
  ({ geoContains } = await import('d3-geo'));
  ({ default: fetch } = await import('node-fetch'));
} catch {
  console.error('Missing dependencies. Run:\n  npm install topojson-client d3-geo node-fetch');
  process.exit(1);
}

console.log('Fetching world-atlas data…');
const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then(r => r.json());
const land = feature(topo, topo.objects.land);

const DOT_COUNT = 2000;
const positions = [];

// ─── Coastal bias ────────────────────────────────────────────────────────────
function coastScore(lon, lat) {
  const dist = 6.0;
  const dirs = [[dist,0],[-dist,0],[0,dist],[0,-dist],[dist,dist],[-dist,dist],[dist,-dist],[-dist,-dist]];
  let sea = 0;
  for (const [dl, dp] of dirs) {
    if (!geoContains(land, [lon + dl, lat + dp])) sea++;
  }
  return sea / dirs.length;
}

// ─── Major cities / hotspots [lon, lat] ──────────────────────────────────────
const CITIES = [
  // North America
  [-74.0, 40.7],   // New York
  [-87.6, 41.9],   // Chicago
  [-118.2, 34.1],  // Los Angeles
  [-122.4, 37.8],  // San Francisco
  [-79.4, 43.7],   // Toronto
  [-73.6, 45.5],   // Montreal
  [-97.7, 30.3],   // Austin
  [-104.9, 39.7],  // Denver
  [-80.2, 25.8],   // Miami
  [-77.0, 38.9],   // Washington DC
  [-71.1, 42.4],   // Boston
  [-122.3, 47.6],  // Seattle
  [-90.2, 29.9],   // New Orleans
  [-99.1, 19.4],   // Mexico City
  [-79.5, 8.9],    // Panama City
  // South America
  [-46.6, -23.5],  // São Paulo
  [-43.2, -22.9],  // Rio de Janeiro
  [-58.4, -34.6],  // Buenos Aires
  [-70.7, -33.5],  // Santiago
  [-77.0, -12.1],  // Lima
  [-74.1, 4.7],    // Bogotá
  [-66.9, 10.5],   // Caracas
  [-47.9, -15.8],  // Brasília
  // Europe
  [-0.1, 51.5],    // London
  [2.3, 48.9],     // Paris
  [13.4, 52.5],    // Berlin
  [12.5, 41.9],    // Rome
  [-3.7, 40.4],    // Madrid
  [23.7, 37.9],    // Athens
  [18.1, 59.3],    // Stockholm
  [4.9, 52.4],     // Amsterdam
  [16.4, 48.2],    // Vienna
  [14.4, 50.1],    // Prague
  [19.0, 47.5],    // Budapest
  [21.0, 52.2],    // Warsaw
  [30.5, 50.5],    // Kyiv
  [37.6, 55.8],    // Moscow
  [24.7, 59.4],    // Tallinn
  [10.8, 59.9],    // Oslo
  [12.6, 55.7],    // Copenhagen
  [25.0, 60.2],    // Helsinki
  [-9.1, 38.7],    // Lisbon
  [8.5, 47.4],     // Zurich
  [2.2, 41.4],     // Barcelona
  [11.6, 48.1],    // Munich
  [4.4, 50.8],     // Brussels
  // Africa
  [3.4, 6.5],      // Lagos
  [36.8, -1.3],    // Nairobi
  [28.0, -26.2],   // Johannesburg
  [18.4, -33.9],   // Cape Town
  [31.2, 30.1],    // Cairo
  [7.5, 9.1],      // Abuja
  [15.3, 4.4],     // Bangui
  [-17.4, 14.7],   // Dakar
  [38.7, 9.0],     // Addis Ababa
  [32.5, 15.6],    // Khartoum
  [13.5, 32.9],    // Tripoli
  [-7.6, 33.6],    // Casablanca
  // Middle East
  [39.8, 21.4],    // Mecca
  [44.4, 33.3],    // Baghdad
  [35.2, 31.8],    // Jerusalem
  [51.5, 25.3],    // Doha
  [55.3, 25.3],    // Dubai
  [46.7, 24.7],    // Riyadh
  [36.3, 33.5],    // Damascus
  [35.5, 33.9],    // Beirut
  [59.6, 37.9],    // Ashgabat
  // Asia
  [121.5, 31.2],   // Shanghai
  [116.4, 39.9],   // Beijing
  [139.7, 35.7],   // Tokyo
  [127.0, 37.6],   // Seoul
  [114.2, 22.3],   // Hong Kong
  [103.8, 1.4],    // Singapore
  [77.2, 28.6],    // New Delhi
  [72.9, 19.1],    // Mumbai
  [88.4, 22.6],    // Kolkata
  [80.3, 13.1],    // Chennai
  [106.7, 10.8],   // Ho Chi Minh City
  [100.5, 13.8],   // Bangkok
  [106.8, -6.2],   // Jakarta
  [120.9, 14.6],   // Manila
  [90.4, 23.7],    // Dhaka
  [67.0, 24.9],    // Karachi
  [74.3, 31.5],    // Lahore
  [69.2, 41.3],    // Tashkent
  [76.9, 43.3],    // Almaty
  [132.5, 43.1],   // Vladivostok
  // Oceania
  [151.2, -33.9],  // Sydney
  [144.9, -37.8],  // Melbourne
  [153.0, -27.5],  // Brisbane
  [115.9, -32.0],  // Perth
  [174.8, -36.9],  // Auckland
  [172.6, -43.5],  // Christchurch
];

const CITY_RADIUS = 5.0;   // degrees — influence radius per city
const CITY_STRENGTH = 0.9; // max acceptance boost from city proximity

function cityScore(lon, lat) {
  let best = 0;
  for (const [cLon, cLat] of CITIES) {
    const dLon = lon - cLon;
    const dLat = lat - cLat;
    const dist = Math.sqrt(dLon * dLon + dLat * dLat);
    if (dist < CITY_RADIUS) {
      const s = 1.0 - dist / CITY_RADIUS;
      if (s > best) best = s;
    }
  }
  return best;
}

console.log(`Placing ${DOT_COUNT} dots…`);
let placed = 0;
let attempts = 0;
while (placed < DOT_COUNT) {
  attempts++;
  const theta = 2 * Math.PI * Math.random();
  const phi   = Math.acos(2 * Math.random() - 1);
  const lon   = 180 - theta * (180 / Math.PI);
  const lat   = 90 - phi * (180 / Math.PI);
  if (!geoContains(land, [lon, lat])) continue;

  const coast = coastScore(lon, lat);
  const city  = cityScore(lon, lat);
  const score = Math.max(coast, city * CITY_STRENGTH);

  if (Math.random() > 0.01 + 0.99 * score) continue;

  const r = 1.002;
  positions.push(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
  placed++;
  if (placed % 200 === 0) process.stdout.write(`  ${placed}/${DOT_COUNT}\r`);
}

console.log(`\nDone — ${attempts} attempts for ${DOT_COUNT} dots.`);

const floats = positions.map(v => v.toFixed(6));
const output = `// Auto-generated by generate-dots.mjs — do not edit by hand.
// ${DOT_COUNT} pre-computed land dot positions (x, y, z interleaved).
export const DOT_POSITIONS = new Float32Array([
  ${floats.join(', ')}
]);
`;

writeFileSync(new URL('./dots.js', import.meta.url), output);
console.log('Wrote dots.js');
