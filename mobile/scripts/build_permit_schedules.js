#!/usr/bin/env node
/**
 * build_permit_schedules.js
 *
 * Preprocesses rutgers_parking_permits.json into a flat lookup:
 *   { [permitType]: { [lotId]: { schedule, time_text_1, time_text_2 } } }
 *
 * The raw permits JSON uses base64-encoded HTML keys that contain lot links
 * with `selected=XXXXX` query params where XXXXX is the lot mapId.
 *
 * Usage: node scripts/build_permit_schedules.js
 */

const fs = require('fs');
const path = require('path');

const RAW_PATH = path.join(__dirname, '..', 'data', 'rutgers_parking_permits.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'permit_schedules.json');

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));

// Extract lot IDs from a base64-encoded HTML key.
// The HTML contains links like: selected=10001&sidebar=true
function extractLotIds(base64Key) {
  try {
    const html = Buffer.from(base64Key, 'base64').toString('utf8');
    const matches = [...html.matchAll(/selected=(\d+)/g)];
    return matches.map(m => m[1]);
  } catch {
    return [];
  }
}

const result = {};

for (const [permitType, campuses] of Object.entries(raw)) {
  if (!result[permitType]) result[permitType] = {};

  for (const [, lotGroups] of Object.entries(campuses)) {
    for (const [encodedKey, lotData] of Object.entries(lotGroups)) {
      const lotIds = extractLotIds(encodedKey);
      const schedule = lotData.schedule || [];
      const time_text_1 = lotData.time_text_1 || '';
      const time_text_2 = lotData.time_text_2 || '';

      for (const id of lotIds) {
        // Only store if there's meaningful schedule or time text
        if (schedule.length > 0 || time_text_1 || time_text_2) {
          result[permitType][id] = { schedule, time_text_1, time_text_2 };
        }
      }
    }
  }
}

// Count stats
let permitCount = Object.keys(result).length;
let totalMappings = 0;
for (const lots of Object.values(result)) {
  totalMappings += Object.keys(lots).length;
}

fs.writeFileSync(OUT_PATH, JSON.stringify(result));

const stats = fs.statSync(OUT_PATH);
console.log(`Generated permit_schedules.json:`);
console.log(`  ${permitCount} permit types`);
console.log(`  ${totalMappings} total lot-schedule mappings`);
console.log(`  ${(stats.size / 1024).toFixed(1)} KB`);
