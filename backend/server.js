const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2/promise");
const NodeCache = require("node-cache");
const https = require("https");
require("dotenv").config();

/* ================= BASIC SETUP ================= */

const app = express();
const PORT = process.env.PORT || 3006;
const cache = new NodeCache({ stdTTL: 30 });

app.use(express.json());
const whitelist = [
  "https://ssasmartclassroom.schoolnetindia.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://ssaassamsmartclassroomschoolnetindia.com" 
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

/* ================= API KEYS ================= */

const API_KEYS = {
  "2228": "526906b4a7c546fcade5fc370ed6f94c",
  "3570": "0f708bc142624a1ba8209359cb65d5b7"
};

/* ================= MYSQL POOL ================= */

const dbPool = mysql.createPool({
  connectionLimit: 10,
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

/* ================= AXIOS SAFE INSTANCE ================= */

const axiosClient = axios.create({
  timeout: 60000,
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { "Content-Type": "application/json" }
});

/* ================= RATE LIMIT QUEUE ================= */

const MAX_CONCURRENT = 10;
let activeRequests = 0;
const queue = [];

const enqueue = (fn) =>
  new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });

const processQueue = async () => {
  if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;
  const { fn, resolve, reject } = queue.shift();
  activeRequests++;
  try {
    resolve(await fn());
  } catch (e) {
    reject(e);
  } finally {
    activeRequests--;
    setTimeout(processQueue, 70); // ~850 req/min
  }
};

const safeAxiosGet = (config) =>
  enqueue(() => axiosClient(config));

/* ================= PROGRESS ================= */

const fetchProgressMap = {
  2228: {},
  3570: {}
};

/* ================= DB INIT ================= */

(async () => {
  const conn = await dbPool.getConnection();
  await conn.query(`
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

  await conn.query(`
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
  conn.release();
})();

/* ================= FETCH DEVICES ================= */

const fetchAndStoreData = async (projectId) => {
  const apiUrl =
    projectId === "2228"
      ? "https://api-in.scalefusion.com/api/v2/devices.json"
      : "https://api.scalefusion.com/api/v2/devices.json?device_group_id=149219";

  let cursor = null;
  const conn = await dbPool.getConnection();

  try {
    do {
      const res = await safeAxiosGet({
        url: apiUrl,
        params: { cursor },
        headers: { Authorization: `Token ${API_KEYS[projectId]}` }
      });

      let devices = [];
      let sql = "";

      if (projectId === "2228") {
        devices = res.data.devices.map(d => [
          d.device.id,
          d.device.name,
          d.device.serial_no || "N/A",
          d.device.custom_properties?.find(p => p.name === "Udise Code")?.value || "N/A",
          d.device.custom_properties?.find(p => p.name === "District")?.value || "N/A",
          d.device.custom_properties?.find(p => p.name === "Block")?.value || "N/A",
          d.device.power_on_time,
          d.device.power_off_time,
          d.device.last_seen_on,
          d.device.connection_state,
          d.device.connection_status,
          d.device.device_status,
          d.device.custom_properties?.find(p => p.name === "HM Name")?.value || "N/A",
          d.device.custom_properties?.find(p => p.name === "HM Contact Number")?.value || "N/A"
        ]);

        sql = `
          INSERT INTO project_2228_db
          (id,name,serial_no,udise,district,block,power_on_time,power_off_time,last_seen_on,
           connection_state,connection_status,device_status,hm_name,hm_contact_numbers)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            name=VALUES(name),
            serial_no=VALUES(serial_no),
            udise=VALUES(udise),
            district=VALUES(district),
            block=VALUES(block),
            power_on_time=VALUES(power_on_time),
            power_off_time=VALUES(power_off_time),
            last_seen_on=VALUES(last_seen_on),
            connection_state=VALUES(connection_state),
            connection_status=VALUES(connection_status),
            device_status=VALUES(device_status),
            hm_name=VALUES(hm_name),
            hm_contact_numbers=VALUES(hm_contact_numbers)
        `;
      } else {
        devices = res.data.devices.map(d => [
          d.device.id,
          d.device.name,
          d.device.serial_no || "N/A",
          d.device.custom_properties?.find(p => p.name === "District")?.value || "N/A",
          d.device.custom_properties?.find(p => p.name === "Block")?.value || "N/A",
          d.device.power_on_time,
          d.device.power_off_time,
          d.device.last_seen_on,
          d.device.connection_state,
          d.device.connection_status,
          d.device.device_status,
          d.device.custom_properties?.find(p => p.name === "HM Name")?.value || "N/A",
          d.device.custom_properties?.find(p => p.name === "HM Contact Number")?.value || "N/A"
        ]);

        sql = `
          INSERT INTO project_3570_db
          (id,name,serial_no,district,block,power_on_time,power_off_time,last_seen_on,
           connection_state,connection_status,device_status,hm_name,hm_contact_numbers)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            name=VALUES(name),
            serial_no=VALUES(serial_no),
            district=VALUES(district),
            block=VALUES(block),
            power_on_time=VALUES(power_on_time),
            power_off_time=VALUES(power_off_time),
            last_seen_on=VALUES(last_seen_on),
            connection_state=VALUES(connection_state),
            connection_status=VALUES(connection_status),
            device_status=VALUES(device_status),
            hm_name=VALUES(hm_name),
            hm_contact_numbers=VALUES(hm_contact_numbers)
        `;
      }

      if (devices.length > 0) {
        await conn.query(sql, [devices]);
      }

      cursor = res.data.next_cursor;
    } while (cursor);
  } catch (e) {
    console.error(`Fetch failed ${projectId}:`, e.message);
  } finally {
    conn.release();
  }
};


/* ================= AUTO FETCH ================= */

setInterval(() => fetchAndStoreData("2228"), 5 * 60 * 1000);
setInterval(() => fetchAndStoreData("3570"), 5 * 60 * 1000);
fetchAndStoreData("2228");
fetchAndStoreData("3570");

/* ================= ROUTES (UNCHANGED) ================= */

/* Devices */
app.get("/api/devices/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const [devices] = await dbPool.query(
    `SELECT * FROM project_${projectId}_db LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );
  res.json({ devices });
});

/* All Devices */
app.get("/api/all-devices/:projectId", async (req, res) => {
  const [devices] = await dbPool.query(
    `SELECT * FROM project_${req.params.projectId}_db`
  );
  res.json({ devices });
});

/* Stats */
app.get("/api/device-stats/:projectId", async (req, res) => {
  const [[stats]] = await dbPool.query(
    `SELECT COUNT(*) total FROM project_${req.params.projectId}_db`
  );
  res.json(stats);
});

/* Progress */
app.get("/api/fetchProgress/:projectId", (req, res) => {
  res.json(fetchProgressMap[req.params.projectId] || {});
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log(`🔥 Server stable at http://localhost:${PORT}`);
});
