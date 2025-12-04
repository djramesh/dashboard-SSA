const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2/promise");
const NodeCache = require("node-cache");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3006;
const cache = new NodeCache({ stdTTL: 30 });

const API_KEYS = {
  "2228": "526906b4a7c546fcade5fc370ed6f94c",
  "3570": "0f708bc142624a1ba8209359cb65d5b7"
};

app.use(
  cors({
    origin: [
      "https://ssaassamsmartclassroomschoolnetindia.com",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

const dbPool = mysql.createPool({
  connectionLimit: 10,
  uri: process.env.DATABASE_URL || "mysql://root:ZXXpbahTXoxLeVYxeGIMpdjdruSZqRqv@mysql.railway.internal:3306/railway",
});

const fetchProgressMap = {
  2228: { completedPages: 0, totalPages: 0, isFetching: false, lastUpdated: Date.now() },
  3570: { completedPages: 0, totalPages: 0, isFetching: false, lastUpdated: Date.now() },
};

const initializeDatabase = async () => {
  const connection = await dbPool.getConnection();
  await connection.execute(`
   CREATE TABLE IF NOT EXISTS project_2228_db (
      id INT PRIMARY KEY,
      name VARCHAR(255),
      serial_no VARCHAR(255),
      udise VARCHAR(255),
      district VARCHAR(255),
      block VARCHAR(255),
      power_on_time VARCHAR(50),
      power_off_time VARCHAR(50),
      last_seen_on VARCHAR(50),
      connection_state VARCHAR(50),
      connection_status VARCHAR(50),
      device_status VARCHAR(50),
      hm_name VARCHAR(255),
      hm_contact_numbers VARCHAR(30),
      active_dates TEXT,
      approximate_duration VARCHAR(50),
      total_active_duration VARCHAR(50)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS project_3570_db (
      id INT PRIMARY KEY,
      name VARCHAR(255),
      searial_no VARCHAR(255),
      district VARCHAR(255),
      block VARCHAR(255),
      power_on_time VARCHAR(50),
      power_off_time VARCHAR(50),
      last_seen_on VARCHAR(50),
      connection_state VARCHAR(50),
      connection_status VARCHAR(50),
      device_status VARCHAR(50),
      hm_name VARCHAR(255),
      hm_contact_numbers VARCHAR(30),
      active_dates TEXT,
      approximate_duration VARCHAR(50),
      total_active_duration VARCHAR(50)
    )
  `);
  connection.release();
};

initializeDatabase().catch((err) =>
  console.error("Database initialization failed:", err)
);

const fetchAndStoreData = async (projectId) => {
  const tableName = `project_${projectId}_db`;
  const apiUrl =
    projectId === "2228"
      ? `https://api-in.scalefusion.com/api/v2/devices.json`
      : `https://api.scalefusion.com/api/v2/devices.json?device_group_id=149219`;
  const apiKey = API_KEYS[projectId];

  if (!apiKey) {
    console.error(`API key for project ${projectId} is not defined`);
    return;
  }

  let nextCursor = null;
  try {
    const connection = await dbPool.getConnection();
    do {
      const response = await axios.get(apiUrl, {
        params: { cursor: nextCursor },
        headers: { Authorization: `Token ${apiKey}` },
      });

      // Replace the devices.map section in fetchAndStoreData function
      const devices = response.data.devices.map((device) => {
        const baseDevice = [
          device.device.id,
          device.device.name,
          device.device.serial_no || "N/A", // Add serial_no here
          device.device.custom_properties.find((prop) => prop.name === "District")?.value || "N/A",
          device.device.custom_properties.find((prop) => prop.name === "Block")?.value || "N/A",
          device.device.power_on_time || null,
          device.device.power_off_time || null,
          device.device.last_seen_on || null,
          device.device.connection_state || "N/A",
          device.device.connection_status || "N/A",
          device.device.device_status || "N/A",
          device.device.custom_properties.find((prop) => prop.name === "HM Name")?.value || "N/A",
          device.device.custom_properties.find((prop) => prop.name === "HM Contact Number")?.value || "N/A",
        ];

        // Include udise only for project 2228
        if (projectId === "2228") {
          baseDevice.splice(3, 0, device.device.custom_properties.find((prop) => prop.name === "Udise Code")?.value || "N/A");
        }

        return baseDevice;
      });

      // Update the columns definition
      const columns =
        projectId === "2228"
          ? `(id, name, serial_no, udise, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)`
          : `(id, name, serial_no, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)`;

      // Update the updateColumns definition
      const updateColumns =
        projectId === "2228"
          ? `name = VALUES(name), serial_no = VALUES(serial_no), udise = VALUES(udise), district = VALUES(district), block = VALUES(block), power_on_time = VALUES(power_on_time), power_off_time = VALUES(power_off_time), last_seen_on = VALUES(last_seen_on), connection_state = VALUES(connection_state), connection_status = VALUES(connection_status), device_status = VALUES(device_status), hm_name = VALUES(hm_name), hm_contact_numbers = VALUES(hm_contact_numbers)`
          : `name = VALUES(name), serial_no = VALUES(serial_no), district = VALUES(district), block = VALUES(block), power_on_time = VALUES(power_on_time), power_off_time = VALUES(power_off_time), last_seen_on = VALUES(last_seen_on), connection_state = VALUES(connection_state), connection_status = VALUES(connection_status), device_status = VALUES(device_status), hm_name = VALUES(hm_name), hm_contact_numbers = VALUES(hm_contact_numbers)`;

      await connection.query(
        `INSERT INTO ${tableName} ${columns}
         VALUES ?
         ON DUPLICATE KEY UPDATE 
         ${updateColumns}`,
        [devices]
      );
      nextCursor = response.data.next_cursor;
    } while (nextCursor);
    await connection.end();
  } catch (error) {
    console.error(
      `Error fetching or storing data for project ${projectId}:`,
      error.message
    );
  }
};
setInterval(() => fetchAndStoreData("2228"), 5 * 60 * 1000);
setInterval(() => fetchAndStoreData("3570"), 5 * 60 * 1000);
fetchAndStoreData("2228");
fetchAndStoreData("3570");

const fetchAndStoreActiveStatusData = async (projectId, fromDate, toDate) => {
  const tableName = `project_${projectId}_db`;
  const apiUrl =
    projectId === "3570"
      ? `https://api.scalefusion.com/api/v1/reports/device_availabilities.json?device_group_ids=149219`
      : `https://api-in.scalefusion.com/api/v1/reports/device_availabilities.json`;
  const apiKey = API_KEYS[projectId];

  if (!apiKey) throw new Error("API key missing");

  // Reset progress
  fetchProgressMap[projectId] = {
    completedPages: 0,
    totalPages: 1,
    isFetching: true,
    lastUpdated: Date.now(),
  };

  let connection;
  try {
    connection = await dbPool.getConnection();
    const activeDataMap = new Map();

    // Get total pages first
    const firstRes = await axios.get(apiUrl, {
      params: { from_date: fromDate, to_date: toDate, page: 1 },
      headers: { Authorization: `Token ${apiKey}` },
      timeout: 30000,
    });

    const totalPages = firstRes.data.total_pages || 1;
    fetchProgressMap[projectId].totalPages = totalPages;
    fetchProgressMap[projectId].completedPages = 1; // Page 1 done

    // Process page 1
    processPageData(firstRes.data.devices || [], activeDataMap);

    // Now fetch remaining pages in batches
    const promises = [];
    for (let page = 2; page <= totalPages; page++) {
      promises.push(fetchPageWithRetry(page, apiUrl, apiKey, fromDate, toDate, projectId, activeDataMap));
    }

    // Process in batches of 5 to avoid rate limiting
    for (let i = 0; i < promises.length; i += 5) {
      const batch = promises.slice(i, i + 5);
      await Promise.all(batch);
      await new Promise((r) => setTimeout(r, 1200)); // Respect rate limit
    }

    // Final DB Update
    await updateDatabaseWithActiveData(connection, tableName, activeDataMap);

    // Success
    fetchProgressMap[projectId].isFetching = false;
    fetchProgressMap[projectId].completedPages = totalPages;
    console.log(`SUCCESS: Project ${projectId} data fetched (${totalPages} pages)`);

  } catch (err) {
    console.error("Fetch failed:", err.message);
    fetchProgressMap[projectId].isFetching = false;
    throw err;
  } finally {
    if (connection) connection.release();
  }
};

// Helper: Fetch single page with retry
const fetchPageWithRetry = async (page, url, key, from, to, projectId, map) => {
  let retries = 0;
  while (retries < 6) {
    try {
      const res = await axios.get(url, {
        params: { from_date: from, to_date: to, page },
        headers: { Authorization: `Token ${key}` },
        timeout: 30000,
      });

      processPageData(res.data.devices || [], map);

      fetchProgressMap[projectId].completedPages += 1;
      fetchProgressMap[projectId].lastUpdated = Date.now();

      return;
    } catch (err) {
      if (err.response?.status === 429 || err.code === 'ECONNABORTED') {
        retries++;
        const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        console.warn(`Rate limited (page ${page}), retry ${retries}/6 in ${delay/1000}s`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Page ${page} failed after 6 retries`);
};

// Helper: Process device data
const processPageData = (devices, map) => {
  for (const device of devices) {
    if (!device.device_name?.trim()) continue;

    if (device.availability_status === "active") {
      const date = device.from_date.split(" ")[0];
      if (!map.has(device.device_id)) {
        map.set(device.device_id, { totalDuration: 0, activeDates: new Set() });
      }
      const data = map.get(device.device_id);
      const sec = device.duration_in_seconds;
      data.totalDuration += sec === 0 ? 1 : Math.min(sec, 99999);
      data.activeDates.add(date);
    }
  }
};

// Helper: Final DB Update
const updateDatabaseWithActiveData = async (conn, tableName, activeDataMap) => {
  const [existing] = await conn.query(`SELECT id FROM ${tableName}`);
  const existingIds = new Set(existing.map((r) => r.id));

  const updates = [];
  const inactive = [];

  for (const [id, { totalDuration, activeDates }] of activeDataMap) {
    const durationStr = convertToHumanReadable(totalDuration);
    const approx = getApproximateDuration(durationStr);
    updates.push([id, Array.from(activeDates).join(", "), durationStr, approx]);
    existingIds.delete(id);
  }

  // Remaining = inactive
  for (const id of existingIds) {
    inactive.push([id, "Not active", "0 sec", "Not used"]);
  }

  const batchSize = 500;
  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await conn.query(
        `INSERT INTO ${tableName} (id, active_dates, total_active_duration, approximate_duration) VALUES ?
         ON DUPLICATE KEY UPDATE active_dates=VALUES(active_dates), total_active_duration=VALUES(total_active_duration), approximate_duration=VALUES(approximate_duration)`,
        [batch]
      );
    }
  }

  if (inactive.length > 0) {
    for (let i = 0; i < inactive.length; i += batchSize) {
      const batch = inactive.slice(i, i + batchSize);
      await conn.query(
        `INSERT INTO ${tableName} (id, active_dates, total_active_duration, approximate_duration) VALUES ?
         ON DUPLICATE KEY UPDATE active_dates=VALUES(active_dates), total_active_duration=VALUES(total_active_duration), approximate_duration=VALUES(approximate_duration)`,
        [batch]
      );
    }
  }
};

const convertToHumanReadable = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${hours} hr ${minutes} min ${seconds} sec`;
};

// Add this function after convertToHumanReadable
const getApproximateDuration = (duration) => {
  if (!duration || duration === "0 hr 0 min 0 sec" || duration === "0 sec") {
    return "Less than a min";
  }
  
  const matches = duration.match(/(\d+)\s*hr\s*(\d+)\s*min\s*(\d+)\s*sec|(\d+)\s*min\s*(\d+)\s*sec|(\d+)\s*sec/);
  if (!matches) return "Invalid duration";

  const hours = parseInt(matches[1] || 0);
  const minutes = parseInt(matches[2] || matches[4] || 0);
  const seconds = parseInt(matches[3] || matches[5] || matches[6] || 0);

  if (hours === 0 && minutes === 0) return "Less than a min";
  if (hours === 0) return "Less than an hour";
  return `About ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

app.get("/api/devices/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { searchTerm = "", page = 1, limit = 10, district = "All", status = "All" } = req.query;
  const offset = (page - 1) * limit;
  const tableName = `project_${projectId}_db`;

  if (!["2228", "3570"].includes(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  try {
    const connection = await dbPool.getConnection();
    let query = `SELECT * FROM ${tableName} WHERE 1=1`;
    const params = [];

    if (searchTerm.trim()) {
      query += ` AND (name LIKE ? OR id LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (district !== "All") {
      query += ` AND district = ?`;
      params.push(district);
    }

    if (status === "connected") {
      query += ` AND total_active_duration != '0 sec'`;
    } else if (status === "notConnected") {
      query += ` AND total_active_duration = '0 sec'`;
    }

    query += ` LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const totalCountQuery = `SELECT 
      COUNT(*) AS totalDevices, 
      SUM(connection_state = 'Active') AS activeDevices, 
      SUM(connection_state = 'Inactive') AS inactiveDevices, 
      SUM(total_active_duration != '0 sec') AS connectedCount, 
      SUM(total_active_duration = '0 sec') AS notConnectedCount 
      FROM ${tableName}`;

    const districtCountQuery = `SELECT district, 
      SUM(total_active_duration != '0 sec') AS connected, 
      SUM(total_active_duration = '0 sec') AS notConnected 
      FROM ${tableName} GROUP BY district`;

    const [devices] = await connection.query(query, params);
    const [[totalCounts]] = await connection.query(totalCountQuery);
    const [districtCounts] = await connection.query(districtCountQuery);

    const totalDevices = totalCounts.totalDevices;
    const activeDevices = totalCounts.activeDevices;
    const inactiveDevices = totalCounts.inactiveDevices;
    const connectedCount = totalCounts.connectedCount;
    const notConnectedCount = totalCounts.notConnectedCount;
    const totalPages = Math.ceil(devices.length > 0 ? totalDevices / limit : 1);

    res.json({
      devices,
      totalDevices,
      activeDevices,
      inactiveDevices,
      connectedCount,
      notConnectedCount,
      districtData: districtCounts,
      currentPage: Number(page),
      totalPages,
    });

    connection.release();
  } catch (error) {
    console.error(`Error fetching devices for project ${projectId}:`, error.message);
    res.status(500).json({ error: `Failed to fetch devices from database for project ${projectId}` });
  }
});

app.get("/api/all-devices/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { searchTerm = "", district = "All", status = "All" } = req.query;
  const tableName = `project_${projectId}_db`;

  if (!["2228", "3570"].includes(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  try {
    const connection = await dbPool.getConnection();
    let query = `SELECT *, 
      COUNT(*) OVER (PARTITION BY approximate_duration) as duration_count 
      FROM ${tableName} WHERE 1=1`;
    const params = [];

    if (searchTerm.trim()) {
      query += ` AND (name LIKE ? OR id LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (district !== "All") {
      query += ` AND district = ?`;
      params.push(district);
    }

    if (status === "connected") {
      query += ` AND total_active_duration != '0 sec'`;
    } else if (status === "notConnected") {
      query += ` AND total_active_duration = '0 sec'`;
    }

    const [devices] = await connection.query(query, params);
    
    // Calculate duration statistics
    const durationStats = devices.reduce((acc, device) => {
      const duration = device.approximate_duration;
      if (!acc[duration]) {
        acc[duration] = device.duration_count;
      }
      return acc;
    }, {});

    // Prepare pie chart data
    const pieChartData = {
      labels: Object.keys(durationStats),
      values: Object.values(durationStats)
    };

    res.json({ 
      devices,
      durationStats,
      pieChartData
    });
    connection.release();
  } catch (error) {
    console.error(`Error fetching all devices for project ${projectId}:`, error.message);
    res.status(500).json({ error: `Failed to fetch all devices from database for project ${projectId}` });
  }
});

app.get("/api/device-stats/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const tableName = `project_${projectId}_db`;

  if (!["2228", "3570"].includes(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  try {
    const connection = await dbPool.getConnection();
    const [[stats]] = await connection.query(
      `SELECT COUNT(*) AS total, SUM(connection_state = 'Active') AS active, SUM(connection_state = 'Inactive') AS inactive FROM ${tableName}`
    );
    res.json(stats);
    connection.release();
  } catch (error) {
    console.error(`Error fetching device stats for project ${projectId}:`, error.message);
    res.status(500).json({ error: `Failed to fetch device stats from database for project ${projectId}` });
  }
});

app.get("/api/fetchProgress/:projectId", (req, res) => {
  const { projectId } = req.params;
  const progressData = fetchProgressMap[projectId];

  if (!progressData) return res.status(400).json({ error: "Invalid project" });

  const progress = progressData.totalPages > 0
    ? (progressData.completedPages / progressData.totalPages) * 100
    : progressData.isFetching ? 5 : 100; // At least 5% if started

  res.json({
    isFetching: progressData.isFetching,
    progress: Number(progress.toFixed(2)),
    completedPages: progressData.completedPages,
    totalPages: progressData.totalPages,
  });
});

app.get("/api/fetchActiveStatusData/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { fromDate, toDate } = req.query;

  if (!["2228", "3570"].includes(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "Please provide both fromDate and toDate." });
  }

  try {
    fetchProgressMap[projectId].isFetching = true;
    fetchProgressMap[projectId].completedPages = 0;
    fetchProgressMap[projectId].totalPages = 0;

    await fetchAndStoreActiveStatusData(projectId, fromDate, toDate);
    res.json({ message: `Active status data updated successfully for project ${projectId}!` });
  } catch (error) {
    console.error(`Error in API for project ${projectId}:`, error.message);
    res.status(500).json({ error: `Failed to fetch or store active status data for project ${projectId}.` });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
