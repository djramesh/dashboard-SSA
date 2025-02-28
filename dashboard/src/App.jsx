import React, { useState, useEffect } from "react";
import Navbar from "./navbar";
import "./App.css";
import axios from "axios";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import * as XLSX from "xlsx";
import LinearProgress from "@mui/material/LinearProgress";

ChartJS.register(ArcElement, Tooltip, Legend);

const formatDateTime = (isoDate) => {
  if (!isoDate) return "N/A";
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const amPm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month}/${day}/${year} ${String(hours).padStart(
    2,
    "0"
  )}:${minutes}:${seconds}${amPm}`;
};

const districtsOfAssam = [
  "BAJALI",
  "BAKSA",
  "BARPETA",
  "BISWANATH",
  "BONGAIGAON",
  "CACHAR",
  "CHARAIDEO",
  "CHIRANG",
  "DARRANG",
  "DHEMAJI",
  "DHUBRI",
  "DIBRUGARH",
  "DIMA HASAO",
  "GOALPARA",
  "GOLAGHAT",
  "HAILAKANDI",
  "HOJAI",
  "JORHAT",
  "KAMRUP-RURAL",
  "KAMRUP-METRO",
  "KARBI ANGLONG",
  "KARIMGANJ",
  "KOKRAJHAR",
  "LAKHIMPUR",
  "MAJULI",
  "MORIGAON",
  "NAGAON",
  "NALBARI",
  "SIVASAGAR",
  "SONITPUR",
  "SOUTH SALMARA-MANKACHAR",
  "TINSUKIA",
  "UDALGURI",
  "WEST KARBI ANGLONG",
];

const DeviceData = () => {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalDevices, setTotalDevices] = useState(0);
  const [activeDevices, setActiveDevices] = useState(0);
  const [inactiveDevices, setInactiveDevices] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("All");
  const [districtData, setDistrictData] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [connectedCount, setConnectedCount] = useState(0);
  const [notConnectedCount, setNotConnectedCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("All");
  const [fetchProgress, setFetchProgress] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const fetchData = async (page = currentPage) => {
    setLoading(true);
    try {
      const response = await axios.get("https://dashboard-ssa-production.up.railway.app/api/devices", {
        params: {
          searchTerm,
          page,
          limit,
          district: selectedDistrict,
          status: connectionStatus,
        },
      });
      const devices = response.data.devices || [];
      setData(devices);
      setFilteredData(devices);
      setTotalDevices(response.data.totalDevices);
      setActiveDevices(response.data.activeDevices);
      setInactiveDevices(response.data.inactiveDevices);
      setConnectedCount(response.data.connectedCount);
      setNotConnectedCount(response.data.notConnectedCount);
      setDistrictData(response.data.districtData);
      setTotalPages(response.data.totalPages);
      setCurrentPage(response.data.currentPage);
      setError(null);
    } catch (err) {
      setError("Failed to fetch data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData(1);
  }, []);

  // Fetch on district or status change
  useEffect(() => {
    fetchData(1);
  }, [selectedDistrict, connectionStatus]);

  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      fetchData(1);
    }
  };

  const handleFetchData = async () => {
    if (!startDate || !endDate) {
      alert("Please select both start and end dates.");
      return;
    }
    setLoading(true);
    setIsFetching(true);
    setFetchProgress(0);
    // console.log("Starting data fetch...");

    try {
      // console.log("Sending fetchActiveStatusData request...");
      axios
        .get("https://dashboard-ssa-production.up.railway.app/api/fetchActiveStatusData", {
          params: { fromDate: startDate, toDate: endDate },
        })
        .then(() => {
          console.log("Fetch request completed on server");
        })
        .catch((error) => {
          console.error("Error in fetchActiveStatusData:", error.message);
          setIsFetching(false);
          setLoading(false);
          alert("Error fetching data");
        });

      // console.log("Starting polling immediately...");
      const pollProgress = setInterval(async () => {
        try {
          const progressResponse = await axios.get(
            "hhttps://dashboard-ssa-production.up.railway.app/api/fetchProgress"
          );
          const { progress, isFetching, completedPages, totalPages } =
            progressResponse.data;
          // console.log(
          //   `Poll Response - Progress: ${progress}%, Completed: ${completedPages}/${totalPages}, IsFetching: ${isFetching}`
          // );
          setFetchProgress((prev) => {
            const newProgress = parseFloat(progress);
            // console.log(`Updating fetchProgress: ${prev} -> ${newProgress}`);
            return newProgress;
          });
          setIsFetching(isFetching);
          if (!isFetching && progress >= 100) {
            console.log("Fetching complete, clearing interval");
            clearInterval(pollProgress);
            await fetchData(1);
            setIsFetching(false);
            setLoading(false);
            alert("Data fetched successfully!");
          }
        } catch (error) {
          console.error("Polling error:", error.message);
          clearInterval(pollProgress);
          setIsFetching(false);
          setLoading(false);
          alert("Polling failed");
        }
      }, 500);
    } catch (error) {
      console.error("Unexpected error in handleFetchData:", error.message);
      setIsFetching(false);
      setLoading(false);
      alert("Error initiating fetch");
    }
  };

  const handleFilter = (status) => {
    if (status === "all") {
      setFilteredData(data);
    } else {
      setFilteredData(data.filter((item) => item.connection_state === status));
    }
  };

  const pieChartData = {
    labels: ["Active Devices", "Inactive Devices"],
    datasets: [
      {
        data: [activeDevices, inactiveDevices],
        backgroundColor: ["#32CD32", "#FF0000"],
        hoverBackgroundColor: ["#228B22", "#B22222"],
      },
    ],
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        "https://dashboard-ssa-production.up.railway.app/api/all-devices",
        {
          params: {
            searchTerm,
            district: selectedDistrict,
            status: connectionStatus,
          },
        }
      );
      const allDevices = response.data.devices || [];
      const sanitizedData = allDevices.map(
        ({ hm_contact_number, ...rest }) => rest
      );
      const ws = XLSX.utils.json_to_sheet(sanitizedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Devices_db");
      XLSX.writeFile(wb, "devices_data.xlsx");
    } catch (error) {
      console.error("Error downloading Excel:", error);
      alert("Failed to download Excel file.");
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      fetchData(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      fetchData(currentPage - 1);
    }
  };

  if (loading || isFetching) {
    console.log(`Rendering progress bar with fetchProgress: ${fetchProgress}`);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <div className="loader">
          <img
            src="/loading.gif"
            alt="Loading..."
            style={{ width: "220px", height: "200px" }}
          />
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: "5px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <p>Due to API rate limits, loading may slow down. Please wait...</p>
          {isFetching && (
            <div style={{ width: "50%", marginTop: "10px" }}>
              <div>
                <p>
                  Date Range : {startDate} to {endDate}
                </p>
                <p>Fetching Data: {fetchProgress.toFixed(2)}%</p>
              </div>
              <LinearProgress
                variant="determinate"
                value={fetchProgress}
                sx={{ height: 10, borderRadius: 5 }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <h1 style={styles.header}>Dashboard of Assam Smart Classroom Project</h1>
      <h2 style={styles.header}>Device Data</h2>
      <div className="chartContainer" style={styles.chartContainer}>
        <div className="summary" style={styles.summary}>
          <h3>Total Devices: {totalDevices}</h3>
          <p
            style={styles.activeCount}
            onClick={() => {
              handleFilter("Active");
              window.scrollBy({ top: 800, behavior: "smooth" });
            }}
          >
            Live Active Devices: {activeDevices}
          </p>
          <p
            style={styles.inactiveCount}
            onClick={() => {
              handleFilter("Inactive");
              window.scrollBy({ top: 800, behavior: "smooth" });
            }}
          >
            Live Inactive Devices: {inactiveDevices}
          </p>
          <p
            style={{ cursor: "pointer", color: "#000" }}
            onClick={() => handleFilter("all")}
          >
            Show All Devices
          </p>
          <h4>
            Total Count for Date Range: <br />
            <span style={{ opacity: 0.6, fontSize: "0.9rem" }}>
              {startDate && endDate
                ? `${new Date(startDate).toLocaleDateString(
                    "en-GB"
                  )} to ${new Date(endDate).toLocaleDateString("en-GB")}`
                : "Please select a date range."}
            </span>
          </h4>
          <p
            style={styles.activeCount}
            onClick={() => {
              setConnectionStatus("connected");
              window.scrollBy({ top: 500, behavior: "smooth" });
            }}
          >
            Total Connected: {connectedCount}
          </p>
          <p
            style={styles.inactiveCount}
            onClick={() => {
              setConnectionStatus("notConnected");
              window.scrollBy({ top: 500, behavior: "smooth" });
            }}
          >
            Total Not Connected: {notConnectedCount}
          </p>
        </div>

        <div style={styles.pieChartContainer}>
          <Pie data={pieChartData} />
        </div>

        <div className="districtContainer" style={styles.districtContainer}>
          <h4 style={styles.districtHeader}>
            District Wise Data for Date Range: <br />
            <span style={{ opacity: 0.6, fontSize: "0.9rem" }}>
              {startDate && endDate
                ? `${new Date(startDate).toLocaleDateString(
                    "en-GB"
                  )} to ${new Date(endDate).toLocaleDateString("en-GB")}`
                : `${new Date().toLocaleDateString(
                    "en-GB"
                  )} to ${new Date().toLocaleDateString("en-GB")}`}
            </span>
          </h4>
          <div style={styles.scrollable}>
            {districtData.map((item, index) => (
              <div key={index} style={styles.districtItem}>
                <p>
                  <strong>{item.district}</strong>
                </p>
                <p style={styles.activeCount}>Connected: {item.connected}</p>
                <p style={styles.inactiveCount}>
                  Not Connected: {item.notConnected}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="container"
        style={{ display: "flex", alignItems: "center" }}
      >
        <div className="datePickerContainer">
          <p>From :</p>{" "}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.dateInput}
          />
          <p> To : </p>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.dateInput}
          />
          <br />
          <button onClick={handleFetchData} style={styles.fetchButton}>
            Fetch Data
          </button>
        </div>
        <div style={styles.searchContainer}>
          <img
            src="/search.png"
            alt="Search"
            style={{
              width: "15px",
              height: "15px",
              position: "absolute",
              marginRight: "215px",
            }}
          />

          <input
            type="text"
            placeholder="Search by name or Device ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            style={{
              ...styles.searchInput,
              width: "210px",
              paddingLeft: "30px",
            }}
          />
        </div>
        <div style={styles.dropdownContainer}>
          <label htmlFor="">Select District : </label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            style={styles.dropdown}
          >
            <option value="All">All Districts</option>
            {districtsOfAssam.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.dropdownContainer}>
          <label htmlFor="">Select Status : </label>
          <select
            value={connectionStatus}
            onChange={(e) => setConnectionStatus(e.target.value)}
            style={styles.dropdown}
          >
            <option value="All">All</option>
            <option value="connected">Connected</option>
            <option value="notConnected">Not Connected</option>
          </select>
        </div>
        <button onClick={handleDownload} style={styles.downloadButton}>
          Download Excel
        </button>
      </div>
      <br />
      {filteredData.length > 0 ? (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead style={styles.tableHeader}>
              <tr>
                {[
                  "S.No",
                  "ID",
                  "Name",
                  "District",
                  "Block",
                  "Last Seen On",
                  "Live Connection State",
                  "Active Dates",
                  "Total Active Duration",
                  "HM Name",
                  "HM Contact No.",
                ].map((header) => (
                  <th style={styles.tableHeader} key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={styles.tableBody}>
              {filteredData.map((item, index) => (
                <tr
                  key={item.id}
                  style={index % 2 === 0 ? styles.evenRow : styles.oddRow}
                >
                  <td style={styles.tableData}>
                    {(currentPage - 1) * limit + index + 1}
                  </td>
                  <td style={styles.tableData}>{item.id}</td>
                  <td style={styles.tableData}>{item.name}</td>
                  <td style={styles.tableData}>{item.district}</td>
                  <td style={styles.tableData}>{item.block}</td>
                  <td style={styles.tableData}>
                    {formatDateTime(item.last_seen_on)}
                  </td>
                  <td style={styles.tableData}>
                    <span
                      style={{
                        ...styles.statusDot,
                        background:
                          item.connection_state === "Active"
                            ? "linear-gradient(45deg, #32CD32, #00FF00)"
                            : "linear-gradient(45deg, #FF0000, #B22222)",
                      }}
                    ></span>
                    {item.connection_state}
                  </td>
                  <td style={styles.tableData}>{item.active_dates}</td>
                  <td style={styles.tableData}>{item.total_active_duration}</td>
                  <td style={styles.tableData}>{item.hm_name}</td>
                  <td style={styles.tableData}>{item.hm_contact_numbers}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.pagination}>
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              style={{
                ...styles.paginationButton,
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              style={{
                ...styles.paginationButton,
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <p>No data available to display.</p>
      )}
    </div>
  );
};

const styles = {
  header: {
    textAlign: "center",
    marginTop: "20px",
    fontSize: "2rem",
    color: "#333",
  },
  searchContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  searchInput: {
    padding: "12px",
    fontSize: "1rem",
    borderRadius: "50px",
    border: "1px solid #ccc",
  },
  downloadButton: {
    padding: "10px 20px",
    backgroundColor: "#0096FF",
    color: "#fff",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
    fontSize: "1rem",
    marginLeft: "20px",
  },
  chartContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    margin: "20px auto",
    width: "80%",
    gap: "40px",
    flexWrap: "nowrap",
  },
  summary: {
    textAlign: "center",
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },
  activeCount: { color: "#32CD32", cursor: "pointer" },
  inactiveCount: { color: "#FF0000", cursor: "pointer" },
  tableHeader: {
    backgroundColor: "#0096FF",
    color: "white",
    padding: "15px",
    textAlign: "center",
  },
  tableData: {
    padding: "10px",
    borderBottom: "1px dotted #ddd",
    textAlign: "center",
  },
  evenRow: { backgroundColor: "#f2f2f2" },
  oddRow: { backgroundColor: "#ffffff" },
  statusDot: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    marginRight: "8px",
  },
  table: { width: "100%", borderCollapse: "collapse", marginTop: "20px" },
  dropdownContainer: { textAlign: "center", margin: "10px 20px" },
  dropdown: {
    padding: "10px",
    fontSize: "1rem",
    borderRadius: "30px",
    width: "10rem",
  },
  tableContainer: {
    overflowX: "auto",
    marginTop: "20px",
    position: "relative",
    paddingBottom: "10px",
  },
  dateInput: {
    padding: "10px",
    margin: "0 10px",
    fontSize: "1rem",
    border: "1px solid #ccc",
    borderRadius: "5px",
  },
  fetchButton: {
    padding: "10px 20px",
    fontSize: "1rem",
    backgroundColor: "#0096FF",
    color: "#fff",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
  },
  districtContainer: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },
  districtHeader: { marginBottom: "10px", textAlign: "center" },
  scrollable: { maxHeight: "300px", overflowY: "auto", padding: "10px" },
  districtItem: {
    marginBottom: "10px",
    borderBottom: "1px solid #ddd",
    paddingBottom: "10px",
  },
  loader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "150px",
    height: "150px",
  },
  pagination: { marginTop: "20px", textAlign: "center" },
  paginationButton: {
    padding: "10px 20px",
    margin: "0 10px",
    backgroundColor: "#0096FF",
    color: "#fff",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
  },

  pieChartContainer: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },
};

export default DeviceData;
