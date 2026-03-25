// ~/teslamate-api/queries.js
import pool from './db.js';

export async function queryVehicleData(intent, timeRange) {
  const { startDate, endDate } = timeRange;

  switch (intent) {
    case 'battery_status': return queryBatteryStatus();
    case 'efficiency':     return queryEfficiency(startDate, endDate);
    case 'recent_drives':  return queryRecentDrives(startDate, endDate);
    case 'charge_cost':    return queryChargeCost(startDate, endDate);
    case 'location':       return queryLocation();
    case 'history':        return queryHistory(startDate, endDate);
    default:               return queryOverview();
  }
}

// ─── Battery ─────────────────────────────────────────────
async function queryBatteryStatus() {
  const chargeRes = await pool.query(`
    SELECT 
      battery_level,
      usable_battery_level,
      charge_energy_added,
      charger_power,
      date
    FROM charges
    ORDER BY date DESC
    LIMIT 1
  `);

  const rangeRes = await pool.query(`
    SELECT ideal_battery_range_km, date, battery_level
    FROM positions
    ORDER BY date DESC
    LIMIT 1
  `);

  return {
    charge: chargeRes.rows[0] || null,
    range: rangeRes.rows[0] || null,
  };
}

// ─── Efficiency ──────────────────────────────────────────
// Calculates efficiency from rated range consumed vs distance
async function queryEfficiency(startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT 
      DATE(start_date) as date,
      ROUND(AVG(
        CASE 
          WHEN (start_rated_range_km - end_rated_range_km) > 0 
          THEN distance / (start_rated_range_km - end_rated_range_km)
          ELSE NULL 
        END
      )::numeric, 2) as efficiency,
      ROUND(SUM(distance)::numeric, 1) as total_distance,
      ROUND(SUM(start_rated_range_km - end_rated_range_km)::numeric, 1) as rated_consumed
    FROM drives
    WHERE start_date >= $1 AND start_date <= $2
      AND distance > 0.5
      AND start_rated_range_km > end_rated_range_km
    GROUP BY DATE(start_date)
    ORDER BY date ASC
  `, [startDate, endDate]);

  return { daily: rows };
}

// ─── Recent Drives ───────────────────────────────────────
async function queryRecentDrives(startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT 
      d.id,
      d.start_date,
      d.end_date,
      ROUND(d.distance::numeric, 1) as distance_km,
      d.duration_min,
      ROUND((d.start_rated_range_km - d.end_rated_range_km)::numeric, 1) as range_consumed_km,
      ROUND(
        CASE 
          WHEN (d.start_rated_range_km - d.end_rated_range_km) > 0 
          THEN d.distance / (d.start_rated_range_km - d.end_rated_range_km)
          ELSE 0 
        END::numeric, 2
      ) as efficiency,
      s.name as start_address,
      e.name as end_address
    FROM drives d
    LEFT JOIN addresses s ON d.start_address_id = s.id
    LEFT JOIN addresses e ON d.end_address_id = e.id
    WHERE d.start_date >= $1 AND d.start_date <= $2
    ORDER BY d.start_date DESC
    LIMIT 20
  `, [startDate, endDate]);

  return { drives: rows };
}

// ─── Charge Cost ─────────────────────────────────────────
async function queryChargeCost(startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT 
      DATE(cp.start_date) as date,
      ROUND(SUM(cp.charge_energy_added)::numeric, 2) as total_kwh,
      ROUND(SUM(cp.cost)::numeric, 0) as total_cost,
      COUNT(*) as sessions
    FROM charging_processes cp
    WHERE cp.start_date >= $1 AND cp.start_date <= $2
      AND cp.cost IS NOT NULL
    GROUP BY DATE(cp.start_date)
    ORDER BY date ASC
  `, [startDate, endDate]);

  const total = rows.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);

  // Also get total without cost filter for kWh stats
  const kwhRes = await pool.query(`
    SELECT 
      ROUND(SUM(charge_energy_added)::numeric, 2) as total_kwh_all
    FROM charging_processes
    WHERE start_date >= $1 AND start_date <= $2
  `, [startDate, endDate]);

  return {
    daily: rows,
    total,
    total_kwh: Number(kwhRes.rows[0]?.total_kwh_all || 0),
  };
}

// ─── Location ────────────────────────────────────────────
async function queryLocation() {
  const { rows } = await pool.query(`
    SELECT latitude, longitude, date
    FROM positions
    ORDER BY date DESC
    LIMIT 1
  `);

  return { position: rows[0] || null };
}

// ─── History (drives + charges combined) ─────────────────
async function queryHistory(startDate, endDate) {
  const [drives, charges] = await Promise.all([
    queryRecentDrives(startDate, endDate),
    queryChargeCost(startDate, endDate),
  ]);

  return { drives: drives.drives, charges: charges.daily };
}

// ─── Overview (general questions) ────────────────────────
async function queryOverview() {
  const carRes = await pool.query('SELECT model, name, vin FROM cars LIMIT 1');

  const statsRes = await pool.query(`
    SELECT 
      COUNT(*) as total_drives,
      ROUND(SUM(distance)::numeric, 0) as total_distance_km,
      ROUND(AVG(
        CASE 
          WHEN (start_rated_range_km - end_rated_range_km) > 0 
          THEN distance / (start_rated_range_km - end_rated_range_km)
          ELSE NULL 
        END
      )::numeric, 2) as avg_efficiency
    FROM drives
    WHERE distance > 0.5
  `);

  const chargeRes = await pool.query(`
    SELECT 
      COUNT(*) as total_charges,
      ROUND(SUM(charge_energy_added)::numeric, 1) as total_kwh,
      ROUND(SUM(cost)::numeric, 0) as total_cost
    FROM charging_processes
  `);

  return {
    car: carRes.rows[0],
    drives: statsRes.rows[0],
    charges: chargeRes.rows[0],
  };
}
