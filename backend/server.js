const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const NodeCache = require('node-cache');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3001
const cache = new NodeCache({ stdTTL: 30 });
const SCALEFUSION_API_KEY = process.env.REACT_APP_API_KEY;

// Enable CORS
const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

const urlDB = "mysql://root:ZXXpbahTXoxLeVYxeGIMpdjdruSZqRqv@mysql.railway.internal:3306/railway"

//changes here
// Initialize database and create table if not exists
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
      hm_contact_numbers VARCHAR(30)
    )
  `);
  await connection.end();
};

initializeDatabase().catch((err) => console.error("Database initialization failed:", err));

// Fetch and store data in MySQL
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

      // Insert data into MySQL
      await connection.query(
        `INSERT INTO devices_db (id, name, district, block, power_on_time, power_off_time, last_seen_on, connection_state, connection_status, device_status, hm_name, hm_contact_numbers)
         VALUES ?
         ON DUPLICATE KEY UPDATE 
         name = VALUES(name),
         district = VALUES(district),
         block = VALUES(block),
         power_on_time = VALUES(power_on_time),
         power_off_time = VALUES(power_off_time),
         last_seen_on = VALUES(last_seen_on),
         connection_state = VALUES(connection_state),
         connection_status = VALUES(connection_status),
         device_status = VALUES(device_status),
         hm_name = VALUES(hm_name),
         hm_contact_numbers = VALUES(hm_contact_numbers)
        `,
        [devices]
      );

      nextCursor = response.data.next_cursor;
    } while (nextCursor);

    await connection.end();
  } catch (error) {
    console.error("Error fetching or storing data:", error.message);
  }
};

// Set a periodic sync every 5 minutes
setInterval(fetchAndStoreData, 5 * 60 * 1000);
fetchAndStoreData();

const fetchAndStoreActiveStatusData = async (fromDate, toDate) => {
  try {
    const connection = await mysql.createConnection(urlDB);

    let currentPage = 1;
    const activeDataMap = new Map();
    const allDeviceIds = new Set(); // To track all devices seen in the API response
    let totalPages = 0; // To store the total pages available

    // Fetch the first page to get total pages
    const firstResponse = await axios.get(
      `https://api.scalefusion.com/api/v1/reports/device_availabilities.json?device_group_ids=149219`,
      {
        params: { from_date: fromDate, to_date: toDate, page: currentPage },
        headers: { Authorization: `Token ${SCALEFUSION_API_KEY}` },
      }
    );

    const devices = firstResponse.data.devices || [];
    totalPages = firstResponse.data.total_pages || 1;

    // Function to process a single page of data
    const processPage = async (page) => {
      let retries = 0;
      const maxRetries = 5;
      const backoffFactor = 2;
      let delay = 1000; // Initial delay of 1 second
    
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
          if (devices.length === 0) {
            console.warn(`No devices found on page ${page}. Skipping.`);
            return; // Skip this page if there are no devices
          }
    
          devices.forEach((device) => {
            const deviceId = device.device_id;
            const deviceName = device.device_name || ""; // Safeguard for undefined device_name
    
            // Skip devices with blank device_name
            if (!deviceName.trim()) {
              console.warn(`Skipping device with ID ${deviceId} due to blank device_name.`);
              return;
            }
    
            allDeviceIds.add(deviceId);
    
            if (device.availability_status === "active") {
              const date = device.from_date.split(" ")[0];
    
              if (!activeDataMap.has(deviceId)) {
                activeDataMap.set(deviceId, { totalDuration: 0, activeDates: new Set() });
              }
    
              const deviceData = activeDataMap.get(deviceId);
              if (device.duration_in_seconds === 0) {
                deviceData.totalDuration += 1; // Set a minimal duration to indicate activity
              } else {
                deviceData.totalDuration += device.duration_in_seconds;
              }
              deviceData.activeDates.add(date);
            }
          });
    
          return; // Exit the function if successful
        } catch (error) {
          if (error.response && error.response.status === 429) {
            retries++;
            console.warn(`Rate limit hit. Retrying in ${delay / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= backoffFactor; // Exponential backoff
          } else {
            throw error; // Throw other errors
          }
        }
      }
    
      throw new Error(`Failed to fetch page ${page} after ${maxRetries} retries due to rate limit.`);
    };
    

    // Fetch all pages in parallel batches
    const batchSize = 15; //Numnber of pages to fetch per page
    const pageBatches = [];
    for (let i = 1; i <= totalPages; i += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, totalPages - i + 1) }, (_, index) => i + index);
      pageBatches.push(batch);
    }

    for (const batch of pageBatches) {
      console.log(`  pages: ${batch.join(", ")}`);
      await Promise.all(batch.map((page) => processPage(page)));

      // Delay between batches to respect rate limits
      if (batch.length === batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }

    // Get all device IDs from the database
    const [existingDevices] = await connection.query("SELECT id FROM devices_db");
    const existingDeviceIds = new Set(existingDevices.map((row) => row.id));

    // Prepare data for active devices
    const updates = [];
    for (const [deviceId, data] of activeDataMap.entries()) {
      const humanReadableDuration = convertToHumanReadable(data.totalDuration);
      updates.push([
        deviceId,
        [...data.activeDates].join(", "), // Join dates into a single string
        humanReadableDuration,
      ]);
    }

    // Prepare data for missing devices (not active in this date range)
    const inactiveDevices = [...existingDeviceIds].filter((id) => !allDeviceIds.has(id));
    const inactiveUpdates = inactiveDevices.map((id) => [id, "Not active", "0 sec"]);

    // Update database for active devices
    if (updates.length > 0) {
      console.log("Updating active devices in DB...");
      await connection.query(
        `
        INSERT INTO devices_db (id, active_dates, total_active_duration)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          active_dates = VALUES(active_dates),
          total_active_duration = VALUES(total_active_duration)
        `,
        [updates]
      );
    }

    // Update database for inactive devices
    if (inactiveUpdates.length > 0) {
      console.log("Updating inactive devices in DB...");
      await connection.query(
        `
        INSERT INTO devices_db (id, active_dates, total_active_duration)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          active_dates = VALUES(active_dates),
          total_active_duration = VALUES(total_active_duration)
        `,
        [inactiveUpdates]
      );
    }

    console.log("Active status data updated successfully!");
    await connection.end();
  } catch (error) {
    console.error("Error fetching or storing active status data:", error.message);
  }
};

let intervalId = null;

app.get("/api/fetchActiveStatusData", async (req, res) => {
  const { fromDate, toDate } = req.query;

  try {
    if (fromDate && toDate) {
      // User-specified date range
      console.log(`Fetching active status data from ${fromDate} to ${toDate}...`);
      await fetchAndStoreActiveStatusData(fromDate, toDate);

      return res.status(200).json({
        message: `Active status data updated successfully for the date range ${fromDate} to ${toDate}.`,
      });
    } else {
      const today = new Date();
      const defaultFromDate = today.toISOString().split("T")[0]; // Today's date
      const defaultToDate = defaultFromDate;

      if (!intervalId) {
        intervalId = setInterval(async () => {
          console.log(`Fetching default active status data for today: ${defaultFromDate}`);
          await fetchAndStoreActiveStatusData(defaultFromDate, defaultToDate);
        }, 1 * 60 * 1000); 
      }

      return res.status(200).json({
        message: `Fetching data every 10 minutes for today's date (${defaultFromDate}).`,
      });
    }
  } catch (error) {
    console.error("Error during fetchAndStoreActiveStatusData:", error.message);

    res.status(500).json({
      error: "An error occurred while fetching or storing active status data.",
      details: error.message, // Provide specific error details in response
    });
  }
});


const convertToHumanReadable = (seconds) => {
  if (seconds <= 60) {
    return "Less than 1 min";
  }

  const hours = Math.floor(seconds / (60 * 60));
  seconds %= 60 * 60;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  let result = "";
  if (hours > 0) result += `${hours} hr `;
  if (minutes > 0) result += `${minutes} min `;
  if (seconds > 0) result += `${seconds} sec`;

  return result.trim();
};

// API endpoint to trigger active status data fetch
app.get("/api/fetchActiveStatusData", async (req, res) => {
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "Please provide both fromDate and toDate." });
  }

  try {
    await fetchAndStoreActiveStatusData(fromDate, toDate);
    res.json({ message: "Active status data updated successfully!" });
  } catch (error) {
    console.error("Error in API:", error.message);
    res.status(500).json({ error: "Failed to fetch or store active status data." });
  }
});

//********************************* */

app.get('/api/devices', async (req, res) => {
  const { searchTerm = '', nextCursor, limit = 4300 } = req.query;
  const offset = nextCursor ? Number(nextCursor) : 0;

  try {
    const connection = await mysql.createConnection(urlDB);

    let query = `SELECT * FROM devices_db WHERE 1=1`;
    const params = [];

    if (searchTerm.trim()) {
      query += ` AND (name LIKE ? OR id LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    query += ` LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [devices] = await connection.query(query, params);

    const [totalDevicesResult] = await connection.query(
      `SELECT COUNT(*) AS totalDevices FROM devices_db`
    );
    const totalDevices = totalDevicesResult[0].totalDevices;

    const [activeCountResult] = await connection.query(
      `SELECT COUNT(*) AS activeDevices FROM devices_db WHERE connection_state = 'Active'`
    );
    const activeDevices = activeCountResult[0].activeDevices;

    const inactiveDevices = totalDevices - activeDevices;

    res.json({
      devices,
      totalDevices,
      activeDevices,
      inactiveDevices,
      nextCursor: offset + devices.length < totalDevices ? offset + devices.length : null,
    });

    await connection.end();
  } catch (error) {
    console.error("Error fetching devices:", error.message);
    res.status(500).json({ error: "Failed to fetch devices from database" });
  }
});

//   const { fromDate, toDate } = req.query;

//   if (!fromDate || !toDate) {
//     return res.status(400).json({ error: "Please provide both fromDate and toDate." });
//   }

//   try {
//     await fetchAndStoreScreenTimeData(fromDate, toDate);  // Pass the date range to the function
//     res.json({ message: "Screen time data updated successfully!" });
//   } catch (error) {
//     console.error("Error fetching or storing screen time data:", error.message);
//     res.status(500).json({ error: "Failed to fetch or store screen time data." });
//   }
// });


// API to get Active and Inactive device counts
app.get('/api/device-stats', async (req, res) => {
  try {
    const connection = await mysql.createConnection(urlDB);

    const [[stats]] = await connection.query(
      `SELECT 
         COUNT(*) AS total,
         SUM(connection_state = 'Active') AS active,
         SUM(connection_state = 'Inactive') AS inactive
       FROM devices_db`
    );

    res.json(stats);
    await connection.end();
  } catch (error) {
    console.error("Error fetching device stats:", error.message);
    res.status(500).json({ error: "Failed to fetch device stats from database" });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

