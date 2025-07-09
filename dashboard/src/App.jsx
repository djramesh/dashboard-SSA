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
  const [selectedProject, setSelectedProject] = useState("2228");
  const limit = 10;

  const fetchData = async (page = currentPage) => {
    setLoading(true);
    try {
      const response = await axios.get(`https://dashboard-ssa-production.up.railway.app/api/all-devices/${selectedProject}`, {
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

  useEffect(() => {
    fetchData(1);
  }, [selectedProject, selectedDistrict, connectionStatus]);

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
    try {
      await axios.get(`https://dashboard-ssa-production.up.railway.app/api/fetchActiveStatusData/${selectedProject}`, {
        params: { fromDate: startDate, toDate: endDate },
      });
      const pollProgress = setInterval(async () => {
        try {
          const progressResponse = await axios.get(
            `https://dashboard-ssa-production.up.railway.app/api/fetchProgress/${selectedProject}`
          );
          const { progress, isFetching, completedPages, totalPages } = progressResponse.data;
          setFetchProgress(parseFloat(progress));
          setIsFetching(isFetching);
          if (!isFetching && progress >= 100) {
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
      console.error("Error in fetchActiveStatusData:", error.message);
      setIsFetching(false);
      setLoading(false);
      alert("Error fetching data");
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
        backgroundColor: ["#10B981", "#EF4444"],
        hoverBackgroundColor: ["#059669", "#DC2626"],
      },
    ],
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `https://dashboard-ssa-production.up.railway.app/api/all-devices/${selectedProject}`,
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
      XLSX.writeFile(wb, `devices_data_${selectedProject}.xlsx`);
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
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loader}>
          <img
            src="/loading.gif"
            alt="Loading..."
            style={styles.loaderImage}
          />
        </div>
        <div style={styles.loadingTextContainer}>
          <p style={styles.loadingText}>Due to API rate limits, loading may slow down. Please wait...</p>
          {isFetching && (
            <div style={styles.progressContainer}>
              <div>
                <p style={styles.progressText}>Date Range: {startDate} to {endDate}</p>
                <p style={styles.progressText}>Fetching Data: {fetchProgress.toFixed(2)}%</p>
              </div>
              <LinearProgress
                variant="determinate"
                value={fetchProgress}
                sx={styles.progressBar}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.mainContainer}>
      <Navbar />
      <div style={styles.projectContainer}>
        <label style={styles.label}>Select Project:</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={styles.dropdown}
        >
          <option value="2228">FY24-25 (Project 2228)</option>
          <option value="3570">FY23-24 (Project 3570)</option>
        </select>
      </div>
      <h1 style={styles.header}>Dashboard of Assam Smart Classroom Project</h1>
      <h2 style={styles.subHeader}>Smartclassroom {selectedProject}</h2>
      <h3 style={styles.subHeader}>Device Data</h3>
      <div style={styles.chartContainer} className="chartContainer">
        <div style={styles.summary} className="summary">
          <h3 style={styles.summaryTitle}>Total Devices: {totalDevices}</h3>
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
            style={styles.showAll}
            onClick={() => handleFilter("all")}
          >
            Show All Devices
          </p>
          <h4 style={styles.dateRangeTitle}>
            Total Count for Date Range: <br />
            <span style={styles.dateRangeText}>
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

        <div style={styles.districtContainer} className="districtContainer">
          <h4 style={styles.districtHeader}>
            District Wise Data for Date Range: <br />
            <span style={styles.dateRangeText}>
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
                <p style={styles.districtName}>
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

      <div style={styles.controlsContainer} className="container">
        <div style={styles.datePickerContainer} className="datePickerContainer">
          <p style={styles.label}>From:</p>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.dateInput}
          />
          <p style={styles.label}>To:</p>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.dateInput}
          />
          <button onClick={handleFetchData} style={styles.fetchButton}>
            Fetch Data
          </button>
        </div>
        <div style={styles.searchContainer}>
          <img
            src="/search.png"
            alt="Search"
            style={styles.searchIcon}
          />
          <input
            type="text"
            placeholder="Search by name or Device ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            style={styles.searchInput}
          />
        </div>
        <div style={styles.dropdownContainer}>
          <label style={styles.label}>Select District:</label>
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
          <label style={styles.label}>Select Status:</label>
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
                  <th style={styles.tableHeaderCell} key={header}>
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
                            ? "linear-gradient(45deg, #10B981, #059669)"
                            : "linear-gradient(45deg, #EF4444, #DC2626)",
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
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <span style={styles.paginationText}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              style={{
                ...styles.paginationButton,
                opacity: currentPage === totalPages ? 0.5 : 1,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <p style={styles.noDataText}>No data available to display.</p>
      )}
    </div>
  );
};

const styles = {
  mainContainer: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1F2937 0%, #111827 100%)",
    color: "#FFFFFF",
    padding: "20px",
  },
  projectContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    marginBottom: "20px",
  },
  header: {
    textAlign: "center",
    marginTop: "32px",
    fontSize: "2.5rem",
    fontWeight: "700",
    color: "#F3F4F6",
  },
  subHeader: {
    textAlign: "center",
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#F3F4F6",
    marginTop: "8px",
  },
  chartContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    margin: "32px auto",
    gap: "40px",
    flexWrap: "wrap",
  },
  summary: {
    textAlign: "center",
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    padding: "24px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    width: "100%",
    maxWidth: "360px",
  },
  summaryTitle: {
    fontSize: "1.25rem",
    fontWeight: "600",
    color: "#F3F4F6",
  },
  activeCount: {
    color: "#10B981",
    cursor: "pointer",
    marginTop: "12px",
    fontSize: "1rem",
  },
  inactiveCount: {
    color: "#EF4444",
    cursor: "pointer",
    marginTop: "8px",
    fontSize: "1rem",
  },
  showAll: {
    cursor: "pointer",
    color: "#D1D5DB",
    marginTop: "8px",
    fontSize: "1rem",
  },
  dateRangeTitle: {
    marginTop: "16px",
    fontSize: "1.125rem",
    color: "#F3F4F6",
  },
  dateRangeText: {
    opacity: 0.7,
    fontSize: "0.875rem",
    color: "#D1D5DB",
  },
  pieChartContainer: {
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    padding: "24px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    width: "100%",
    maxWidth: "360px",
  },
  districtContainer: {
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    padding: "24px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    width: "100%",
    maxWidth: "360px",
  },
  districtHeader: {
    marginBottom: "16px",
    textAlign: "center",
    fontSize: "1.125rem",
    color: "#F3F4F6",
  },
  scrollable: {
    maxHeight: "320px",
    overflowY: "auto",
    padding: "12px",
  },
  districtItem: {
    marginBottom: "12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
    paddingBottom: "12px",
  },
  districtName: {
    fontWeight: "600",
    color: "#F3F4F6",
  },
  controlsContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "24px",
    flexWrap: "wrap",
    marginTop: "32px",
  },
  datePickerContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  label: {
    color: "#F3F4F6",
    fontSize: "1rem",
  },
  dateInput: {
    padding: "12px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.9)",
    color: "#111827",
    outline: "none",
    transition: "border-color 0.3s",
  },
  fetchButton: {
    padding: "12px 24px",
    fontSize: "1rem",
    background: "#3B82F6",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.3s",
  },
  searchContainer: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    width: "16px",
    height: "16px",
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
  },
  searchInput: {
    padding: "12px 12px 12px 40px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.9)",
    color: "#111827",
    width: "224px",
    outline: "none",
    transition: "border-color 0.3s",
  },
  dropdownContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  dropdown: {
    padding: "12px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.9)",
    color: "#111827",
    width: "160px",
    outline: "none",
    transition: "border-color 0.3s",
  },
  downloadButton: {
    padding: "12px 24px",
    background: "#3B82F6",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1rem",
    transition: "background 0.3s",
  },
  tableContainer: {
    margin: "32px auto",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
  },
  tableHeader: {
    background: "#3B82F6",
  },
  tableHeaderCell: {
    padding: "16px",
    textAlign: "center",
    color: "#FFFFFF",
    fontWeight: "600",
  },
  tableBody: {
    background: "transparent",
  },
  tableData: {
    padding: "12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
    textAlign: "center",
    color: "#F3F4F6",
  },
  evenRow: {
    background: "rgba(255, 255, 255, 0.05)",
  },
  oddRow: {
    background: "rgba(255, 255, 255, 0.1)",
  },
  statusDot: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    marginRight: "8px",
  },
  pagination: {
    marginTop: "24px",
    textAlign: "center",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
  },
  paginationButton: {
    padding: "12px 24px",
    background: "#3B82F6",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "50px",
    fontSize: "1rem",
    transition: "background 0.3s",
  },
  paginationText: {
    color: "#F3F4F6",
    fontSize: "1rem",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1F2937 0%, #111827 100%)",
    color: "#FFFFFF",
  },
  loader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderImage: {
    width: "220px",
    height: "220px",
  },
  loadingTextContainer: {
    textAlign: "center",
    marginTop: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  loadingText: {
    fontSize: "1.125rem",
    color: "#F3F4F6",
  },
  progressContainer: {
    width: "50%",
    marginTop: "16px",
  },
  progressText: {
    color: "#F3F4F6",
    fontSize: "1rem",
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    "& .MuiLinearProgress-bar": {
      backgroundColor: "#3B82F6",
    },
  },
  noDataText: {
    textAlign: "center",
    marginTop: "32px",
    fontSize: "1.125rem",
    color: "#F3F4F6",
  },
};

export default DeviceData;