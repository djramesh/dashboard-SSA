const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2/promise");
const NodeCache = require("node-cache");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3006; // Use Railway's PORT or fallback to 3006
const cache = new NodeCache({ stdTTL: 30 });

const API_KEYS = {
  "2228": "526906b4a7c546fcade5fc370ed6f94c",
  "3570": "0f708bc142624a1ba8209359cb65d5b7"
};

app.use(
  cors({
    origin: [
      "https://ssaassamsmartclassroomschoolnetindia.com",
      "http://localhost:3000", // For local development
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
  2228: { completedPages: 0, totalPages: 0, isFetching: false },
  3570: { completedPages: 0, totalPages: 0, isFetching: false },
};

const initializeDatabase = async () => {
  const connection = await dbPool.getConnection();
  await connection.execute(`
   CREATE TABLE IF NOT EXISTS project_2228_db (
      id INT PRIMARY KEY,
      name VARCHAR(255),
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
      total_active_duration VARCHAR(50)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS project_3570_db (
      id INT PRIMARY KEY,
      name VARCHAR(255),
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

      const devices = response.data.devices.map((device) => {
        const baseDevice = [
          device.device.id,
          device.device.name,
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
          baseDevice.splice(2, 0, device.device.custom_properties.find((prop) => prop.name === "Udise Code")?.value || "N/A");
        }



        return baseDevice;
      });

      // Define columns for the INSERT query based on projectId
      const columns =
        projectId === "2228"
          ? `(id, name, udise, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)`
          : `(id, name, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)`;

      // Define columns for the ON DUPLICATE KEY UPDATE clause
      const updateColumns =
        projectId === "2228"
          ? `name = VALUES(name), udise = VALUES(udise), district = VALUES(district), block = VALUES(block), power_on_time = VALUES(power_on_time), power_off_time = VALUES(power_off_time), last_seen_on = VALUES(last_seen_on), connection_state = VALUES(connection_state), connection_status = VALUES(connection_status), device_status = VALUES(device_status), hm_name = VALUES(hm_name), hm_contact_numbers = VALUES(hm_contact_numbers)`
          : `name = VALUES(name), district = VALUES(district), block = VALUES(block), power_on_time = VALUES(power_on_time), power_off_time = VALUES(power_off_time), last_seen_on = VALUES(last_seen_on), connection_state = VALUES(connection_state), connection_status = VALUES(connection_status), device_status = VALUES(device_status), hm_name = VALUES(hm_name), hm_contact_numbers = VALUES(hm_contact_numbers)`;

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

  if (!apiKey) {
    console.error(`API key for project ${projectId} is not defined`);
    throw new Error(`API key for project ${projectId} is not defined`);
  }

  try {
    const connection = await dbPool.getConnection();
    const activeDataMap = new Map();
    const allDeviceIds = new Set();

    fetchProgressMap[projectId].isFetching = true;
    fetchProgressMap[projectId].completedPages = 0;
    fetchProgressMap[projectId].totalPages = 1; // Fallback

    console.log(`Fetching first page for project ${projectId}...`);
    const firstResponse = await axios.get(apiUrl, {
      params: { from_date: fromDate, to_date: toDate, page: 1 },
      headers: { Authorization: `Token ${apiKey}` },
    });

    console.log(`First response data for project ${projectId}:`, firstResponse.data);
    fetchProgressMap[projectId].totalPages = firstResponse.data.total_pages || 1;
    console.log(`Total Pages for project ${projectId}: ${fetchProgressMap[projectId].totalPages}`);

    // Process first page data (fix: no re-fetch)
    const devices = firstResponse.data.devices || [];
    devices.forEach((device) => {
      const deviceId = device.device_id;
      const deviceName = device.device_name || "";
      if (!deviceName.trim()) return;
      allDeviceIds.add(deviceId);

      if (device.availability_status === "active") {
        const date = device.from_date.split(" ")[0];
        if (!activeDataMap.has(deviceId)) {
          activeDataMap.set(deviceId, { totalDuration: 0, activeDates: new Set() });
        }
        const deviceData = activeDataMap.get(deviceId);
        if (device.duration_in_seconds === 0) {
          deviceData.totalDuration += 1;
        } else if (device.duration_in_seconds <= 99999) {
          deviceData.totalDuration += device.duration_in_seconds;
        }
        deviceData.activeDates.add(date);
      }
    });
    fetchProgressMap[projectId].completedPages += 1;
    console.log(`Completed Page 1 for project ${projectId}: ${fetchProgressMap[projectId].completedPages}/${fetchProgressMap[projectId].totalPages}`);

    const processPage = async (page) => {
      let retries = 0;
      const maxRetries = 5;
      const backoffFactor = 2;
      let delay = 1000; // Reduced initial delay

      while (retries < maxRetries) {
        try {
          console.log(`Fetching page ${page} for project ${projectId}...`);
          const response = await axios.get(apiUrl, {
            params: { from_date: fromDate, to_date: toDate, page },
            headers: { Authorization: `Token ${apiKey}` },
          });

          const devices = response.data.devices || [];
          devices.forEach((device) => {
            const deviceId = device.device_id;
            const deviceName = device.device_name || "";
            if (!deviceName.trim()) return;
            allDeviceIds.add(deviceId);

            if (device.availability_status === "active") {
              const date = device.from_date.split(" ")[0];
              if (!activeDataMap.has(deviceId)) {
                activeDataMap.set(deviceId, { totalDuration: 0, activeDates: new Set() });
              }
              const deviceData = activeDataMap.get(deviceId);
              if (device.duration_in_seconds === 0) {
                deviceData.totalDuration += 1;
              } else if (device.duration_in_seconds <= 99999) {
                deviceData.totalDuration += device.duration_in_seconds;
              }
              deviceData.activeDates.add(date);
            }
          });

          fetchProgressMap[projectId].completedPages += 1;
          console.log(
            `Completed Page for project ${projectId}: ${fetchProgressMap[projectId].completedPages}/${fetchProgressMap[projectId].totalPages}`
          );
          return;
        } catch (error) {
          if (error.response && error.response.status === 429) {
            retries++;
            console.warn(
              `Rate limit hit on page ${page} for project ${projectId}. Retrying in ${delay / 1000} seconds...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= backoffFactor;
          } else {
            console.error(`Error fetching page ${page} for project ${projectId}:`, error.message);
            throw error;
          }
        }
      }
      throw new Error(
        `Failed to fetch page ${page} for project ${projectId} after ${maxRetries} retries due to rate limit.`
      );
    };

    const batchSize = 5; // Reduced to avoid rate limits
    const pageBatches = [];
    for (let i = 2; i <= fetchProgressMap[projectId].totalPages; i += batchSize) { // Start from page 2
      const batch = Array.from(
        { length: Math.min(batchSize, fetchProgressMap[projectId].totalPages - i + 1) },
        (_, index) => i + index
      );
      pageBatches.push(batch);
    }

    for (const batch of pageBatches) {
      await Promise.all(batch.map((page) => processPage(page)));
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Reduced delay between batches
    }

    fetchProgressMap[projectId].isFetching = false;
    if (fetchProgressMap[projectId].completedPages < fetchProgressMap[projectId].totalPages) {
      fetchProgressMap[projectId].completedPages = fetchProgressMap[projectId].totalPages; // Force 100% if done
    }
    console.log(`Active status data updated successfully for project ${projectId}!`);
    activeDataMap.clear(); // Clear memory
    allDeviceIds.clear();
    connection.release();
  } catch (error) {
    fetchProgressMap[projectId].isFetching = false;
    console.error(`Error fetching or storing active status data for project ${projectId}:`, error.message);
    throw error;
  }
};

const convertToHumanReadable = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${hours} hr ${minutes} min ${seconds} sec`;
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

    const [devices] = await connection.query(query, params);
    res.json({ devices });
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

  if (!["2228", "3570"].includes(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const progress =
    fetchProgressMap[projectId].totalPages > 0
      ? Math.min((fetchProgressMap[projectId].completedPages / fetchProgressMap[projectId].totalPages) * 100, 100)
      : fetchProgressMap[projectId].isFetching
        ? 0
        : 100;
  console.log(`Progress API for project ${projectId}: ${progress}% (Completed: ${fetchProgressMap[projectId].completedPages}, Total: ${fetchProgressMap[projectId].totalPages})`);
  res.json({
    isFetching: fetchProgressMap[projectId].isFetching,
    progress: progress.toFixed(2),
    completedPages: fetchProgressMap[projectId].completedPages,
    totalPages: fetchProgressMap[projectId].totalPages,
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
