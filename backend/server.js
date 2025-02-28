const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2/promise");
const NodeCache = require("node-cache");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const cache = new NodeCache({ stdTTL: 30 });
const SCALEFUSION_API_KEY = process.env.REACT_APP_API_KEY;

app.use(cors({ origin: "*", optionsSuccessStatus: 200 }));

const urlDB = process.env.DB_URL;

let fetchProgress = {
  completedPages: 0,
  totalPages: 0,
  isFetching: false,
};

const initializeDatabase = async () => {
  const connection = await mysql.createConnection(urlDB);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS devices_db (
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
  await connection.end();
};

initializeDatabase().catch((err) => console.error("Database initialization failed:", err));

const fetchAndStoreData = async () => {
  let nextCursor = null;
  try {
    const connection = await mysql.createConnection(urlDB);
    do {
      const response = await axios.get(
        `https://api.scalefusion.com/api/v2/devices.json?device_group_id=149219`,
        {
          params: { cursor: nextCursor },
          headers: { Authorization: `Token ${SCALEFUSION_API_KEY}` },
        }
      );

      const devices = response.data.devices.map((device) => [
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
      ]);

      await connection.query(
        `INSERT INTO devices_db (id, name, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)
         VALUES ?
         ON DUPLICATE KEY UPDATE 
         name = VALUES(name), district = VALUES(district), block = VALUES(block), power_on_time = VALUES(power_on_time),
         power_off_time = VALUES(power_off_time), last_seen_on = VALUES(last_seen_on), connection_state = VALUES(connection_state),
         connection_status = VALUES(connection_status), device_status = VALUES(device_status), hm_name = VALUES(hm_name),
         hm_contact_numbers = VALUES(hm_contact_numbers)`,
        [devices]
      );
      nextCursor = response.data.next_cursor;
    } while (nextCursor);
    await connection.end();
  } catch (error) {
    console.error("Error fetching or storing data:", error.message);
  }
};

setInterval(fetchAndStoreData, 5 * 60 * 1000);
fetchAndStoreData();

const fetchAndStoreActiveStatusData = async (fromDate, toDate) => {
  try {
    const connection = await mysql.createConnection(urlDB);
    const activeDataMap = new Map();
    const allDeviceIds = new Set();

    fetchProgress.isFetching = true;
    fetchProgress.completedPages = 0;

    const firstResponse = await axios.get(
      `https://api.scalefusion.com/api/v1/reports/device_availabilities.json?device_group_ids=149219`,
      {
        params: { from_date: fromDate, to_date: toDate, page: 1 },
        headers: { Authorization: `Token ${SCALEFUSION_API_KEY}` },
      }
    );

    fetchProgress.totalPages = firstResponse.data.total_pages || 1;
    console.log(`Total Pages: ${fetchProgress.totalPages}`);

    const processPage = async (page) => {
      let retries = 0;
      const maxRetries = 5;
      const backoffFactor = 2;
      let delay = 1000;

      while (retries < maxRetries) {
        try {
          const response = await axios.get(
            `https://api.scalefusion.com/api/v1/reports/device_availabilities.json?device_group_ids=149219`,
            {
              params: { from_date: fromDate, to_date: toDate, page },
              headers: { Authorization: `Token ${SCALEFUSION_API_KEY}` },
            }
          );

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

          fetchProgress.completedPages += 1;
          console.log(`Completed Page: ${fetchProgress.completedPages}/${fetchProgress.totalPages}`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay per page
          return;
        } catch (error) {
          if (error.response && error.response.status === 429) {
            retries++;
            console.warn(`Rate limit hit on page ${page}. Retrying in ${delay / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= backoffFactor;
          } else {
            throw error;
          }
        }
      }
      throw new Error(`Failed to fetch page ${page} after ${maxRetries} retries due to rate limit.`);
    };

    const batchSize = 10;
    const pageBatches = [];
    for (let i = 1; i <= fetchProgress.totalPages; i += batchSize) {
      const batch = Array.from(
        { length: Math.min(batchSize, fetchProgress.totalPages - i + 1) },
        (_, index) => i + index
      );
      pageBatches.push(batch);
    }

    for (const batch of pageBatches) {
      await Promise.all(batch.map((page) => processPage(page)));
      if (batch.length === batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const [existingDevices] = await connection.query("SELECT id FROM devices_db");
    const existingDeviceIds = new Set(existingDevices.map((row) => row.id));

    const updates = [];
    for (const [deviceId, data] of activeDataMap.entries()) {
      const humanReadableDuration = convertToHumanReadable(data.totalDuration);
      updates.push([deviceId, [...data.activeDates].join(", "), humanReadableDuration]);
    }

    const inactiveDevices = [...existingDeviceIds].filter((id) => !allDeviceIds.has(id));
    const inactiveUpdates = inactiveDevices.map((id) => [id, "Not active", "0 sec"]);

    if (updates.length > 0) {
      await connection.query(
        `INSERT INTO devices_db (id, active_dates, total_active_duration) VALUES ?
         ON DUPLICATE KEY UPDATE active_dates = VALUES(active_dates), total_active_duration = VALUES(total_active_duration)`,
        [updates]
      );
    }

    if (inactiveUpdates.length > 0) {
      await connection.query(
        `INSERT INTO devices_db (id, active_dates, total_active_duration) VALUES ?
         ON DUPLICATE KEY UPDATE active_dates = VALUES(active_dates), total_active_duration = VALUES(total_active_duration)`,
        [inactiveUpdates]
      );
    }

    fetchProgress.isFetching = false;
    await connection.end();
    console.log("Active status data updated successfully!");
  } catch (error) {
    fetchProgress.isFetching = false;
    console.error("Error fetching or storing active status data:", error.message);
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

app.get("/api/devices", async (req, res) => {
  const { searchTerm = "", page = 1, limit = 10, district = "All", status = "All" } = req.query;
  const offset = (page - 1) * limit;

  try {
    const connection = await mysql.createConnection(urlDB);
    let query = `SELECT * FROM devices_db WHERE 1=1`;
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
      FROM devices_db`;

    const districtCountQuery = `SELECT district, 
      SUM(total_active_duration != '0 sec') AS connected, 
      SUM(total_active_duration = '0 sec') AS notConnected 
      FROM devices_db GROUP BY district`;

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

    await connection.end();
  } catch (error) {
    console.error("Error fetching devices:", error.message);
    res.status(500).json({ error: "Failed to fetch devices from database" });
  }
});

app.get("/api/all-devices", async (req, res) => {
  const { searchTerm = "", district = "All", status = "All" } = req.query;
  try {
    const connection = await mysql.createConnection(urlDB);
    let query = `SELECT * FROM devices_db WHERE 1=1`;
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
    await connection.end();
  } catch (error) {
    console.error("Error fetching all devices:", error.message);
    res.status(500).json({ error: "Failed to fetch all devices from database" });
  }
});

app.get("/api/device-stats", async (req, res) => {
  try {
    const connection = await mysql.createConnection(urlDB);
    const [[stats]] = await connection.query(
      `SELECT COUNT(*) AS total, SUM(connection_state = 'Active') AS active, SUM(connection_state = 'Inactive') AS inactive FROM devices_db`
    );
    res.json(stats);
    await connection.end();
  } catch (error) {
    console.error("Error fetching device stats:", error.message);
    res.status(500).json({ error: "Failed to fetch device stats from database" });
  }
});

app.get("/api/fetchProgress", (req, res) => {
  const progress =
    fetchProgress.totalPages > 0
      ? Math.min((fetchProgress.completedPages / fetchProgress.totalPages) * 100, 100)
      : fetchProgress.isFetching
      ? 0
      : 100;
  console.log(`Progress API: ${progress}% (Completed: ${fetchProgress.completedPages}, Total: ${fetchProgress.totalPages})`);
  res.json({
    isFetching: fetchProgress.isFetching,
    progress: progress.toFixed(2),
    completedPages: fetchProgress.completedPages,
    totalPages: fetchProgress.totalPages,
  });
});

app.get("/api/fetchActiveStatusData", async (req, res) => {
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "Please provide both fromDate and toDate." });
  }

  try {
    fetchProgress.isFetching = true;
    fetchProgress.completedPages = 0;
    fetchProgress.totalPages = 0;

    await fetchAndStoreActiveStatusData(fromDate, toDate);
    res.json({ message: "Active status data updated successfully!" });
  } catch (error) {
    console.error("Error in API:", error.message);
    res.status(500).json({ error: "Failed to fetch or store active status data." });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));