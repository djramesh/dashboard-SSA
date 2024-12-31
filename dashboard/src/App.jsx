import React, { useState, useEffect } from "react";
import Navbar from "./navbar";
import "./App.css";
import axios from "axios";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import * as XLSX from "xlsx";

ChartJS.register(ArcElement, Tooltip, Legend);

const formatDateTime = (isoDate) => {
  if (!isoDate) return "N/A"; // Handle empty or null values

  const date = new Date(isoDate);

  // Extract date and time components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const amPm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12; //

  // Format the date and time string
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
  const [currentCursor, setCurrentCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [prevCursors, setPrevCursors] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("All");
  const [districtData, setDistrictData] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [completedPages, setCompletedPages] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const [notConnectedCount, setNotConnectedCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("All"); // State for connection filter
  const [district, setDistrict] = useState("All");

  const handleFetchData = async () => {
    if (!startDate || !endDate) {
      alert("Please select both start and end dates.");
      return;
    }

    setLoading(true);

    try {
      // Send request to backend with date range
      const response = await axios.get(
        "https://dashboard-ssa-production.up.railway.app/api/fetchActiveStatusData",
        {
          params: { fromDate: startDate, toDate: endDate },
        }
      );

      console.log(
        "Data fetched and stored successfully:",
        response.data.message
      );
      alert("Data fetched successfully!");

      fetchData();
    } catch (error) {
      console.error("Error fetching screen time data:", error);
      alert("Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true); // Start loading
    try {
      const response = await axios.get("https://dashboard-ssa-production.up.railway.app/api/devices");
      const devices = response.data.devices || [];
      setData(devices);
      setFilteredData(devices);
      setTotalDevices(response.data.totalDevices);
      setActiveDevices(response.data.activeDevices);
      setInactiveDevices(response.data.inactiveDevices);
      setError(null);
      // console.log(devices);
    } catch (err) {
      setError("Failed to fetch data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDistrict === "All") {
      setFilteredData(data);
    } else {
      setFilteredData(
        data.filter((item) => item.district === selectedDistrict)
      );
    }
  }, [selectedDistrict, data]);

  // useEffect(() => {
  //   if (filteredData.length > 0) {
  //     const updatedDistrictData = districtsOfAssam.map((district) => {
  //       const districtDevices = filteredData.filter((item) => item.district === district);
  //       const connectedCount = districtDevices.filter((item) => item.connection_state === "Active").length;
  //       const notConnectedCount = districtDevices.filter((item) => item.connection_state === "Inactive").length;

  //       return {
  //         district,
  //         connected: connectedCount,
  //         notConnected: notConnectedCount,
  //       };
  //     });

  //     setDistrictData(updatedDistrictData);
  //   }
  // }, [filteredData]);
  const filterByConnectionStatus = (status) => {
    const districtFilteredData =
      selectedDistrict === "All"
        ? data
        : data.filter((item) => item.district === selectedDistrict);
  
    if (status === "connected") {
      setFilteredData(
        districtFilteredData.filter(
          (item) => item.total_active_duration !== "0 sec"
        )
      );
    } else if (status === "notConnected") {
      setFilteredData(
        districtFilteredData.filter(
          (item) => item.total_active_duration === "0 sec"
        )
      );
    } else {
      setFilteredData(districtFilteredData); // Reset to show all district-filtered data
    }
  };
  
  // Update when connectionStatus or selectedDistrict changes
  useEffect(() => {
    filterByConnectionStatus(connectionStatus);
  }, [connectionStatus, selectedDistrict, data]);
  
  const applyFilters = () => {
    let filtered = data;

    // Filter by district
    if (district !== "All") {
        filtered = filtered.filter((item) => item.district === district);
    }

    // Filter by connection status
    if (connectionStatus === "connected") {
        filtered = filtered.filter((item) => item.total_active_duration !== "0 sec");
    } else if (connectionStatus === "notConnected") {
        filtered = filtered.filter((item) => item.total_active_duration === "0 sec");
    }

    setFilteredData(filtered);
}
  useEffect(() => {
    const calculateDistrictData = () => {
      const updatedDistrictData = districtsOfAssam.map((district) => {
        const districtDevices = data.filter(
          (item) => item.district === district
        );
        const activeCount = districtDevices.filter(
          (item) => item.total_active_duration !== "0 sec"
        ).length;
        const inactiveCount = districtDevices.filter(
          (item) => item.total_active_duration === "0 sec"
        ).length;

        return {
          district,
          connected: activeCount,
          notConnected: inactiveCount,
        };
      });

      setDistrictData(updatedDistrictData);
    };

    calculateDistrictData(); // Initial calculation

    const intervalId = setInterval(() => {
      calculateDistrictData();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [data]); // Run whenever `data` changes

  // Function to update counts
  const updateCounts = () => {
    const connectedCount = data.filter(
      (item) => item.total_active_duration !== "0 sec"
    ).length;
    const notConnectedCount = data.filter(
      (item) => item.total_active_duration === "0 sec"
    ).length;

    setConnectedCount(connectedCount);
    setNotConnectedCount(notConnectedCount);
  };

  useEffect(() => {
    updateCounts(); // Initial calculation
    const interval = setInterval(updateCounts, 30000);

    return () => clearInterval(interval);
  }, [data]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredData(data); // Reset to all data if no search term
    } else {
      const lowercasedSearchTerm = searchTerm.toLowerCase();
      setFilteredData(
        data.filter((item) =>
          ["name", "id"].some((key) =>
            item[key]?.toString().toLowerCase().includes(lowercasedSearchTerm)
          )
        )
      );
    }
  }, [searchTerm, data]);

  const handleNext = () => {
    if (nextCursor) {
      fetchData(nextCursor, false);
    }
  };

  // Navigate to the previous page
  const handlePrevious = () => {
    if (prevCursors.length > 0) {
      const previousCursor = prevCursors[prevCursors.length - 1];
      fetchData(previousCursor, true);
    }
  };

  // Filter data based on connection state
  const handleFilter = (status) => {
    if (status === "all") {
      setFilteredData(data);
    } else {
      setFilteredData(data.filter((item) => item.connection_state === status));
    }
  };

  // Pie chart data
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

  // Download filtered data as Excel
  const handleDownload = () => {
    // Remove 'hm_contact_number' from each object in filteredData
    const sanitizedData = filteredData.map(({ hm_contact_number, ...rest }) => rest);
  
    const ws = XLSX.utils.json_to_sheet(sanitizedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Devices");
    XLSX.writeFile(wb, "devices_data.xlsx");
  };
  
  if (loading) {
    return (
      <div className="loader" style={styles.loader}>
        <img
          src="/loading.gif"
          alt="Loading..."
          style={{ width: "130px", height: "130px" }}
        />
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
            Live Active Devices : {activeDevices}
          </p>
          <p
            style={styles.inactiveCount}
            onClick={() => {
              handleFilter("Inactive");
              window.scrollBy({ top: 800, behavior: "smooth" });
            }}
          >
            Live Inactive Devices : {inactiveDevices}
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
              filterByConnectionStatus("connected");
              window.scrollBy({ top: 500, behavior: "smooth" });
            }}
          >
            Total Connected: {connectedCount}
          </p>
          <p
            style={styles.inactiveCount}
            onClick={() => {
              filterByConnectionStatus("notConnected");
              window.scrollBy({ top: 500, behavior: "smooth" });
            }}
          >
            Total Not Connected: {notConnectedCount}
          </p>
        </div>
        <div style={styles.pieChart}>
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
                <p style={styles.activeCount}>Connected: {item.connected} </p>
                <p style={styles.inactiveCount}>
                  Not Connected: {item.notConnected}{" "}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="container" style={{ display: "flex", alignItems: "center"}}>
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
        <div style={{ ...styles.searchContainer, }}>
          <input
            type="text"
            placeholder="Search by name or Device ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...styles.searchInput, width: "210px" }}
          />
        </div>
        <div style={styles.dropdownContainer}>
          <label htmlFor="">Select District :  </label>
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
          <label htmlFor="">Select Status :  </label>
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
            <thead>
              <tr>
                {[
                  "S.No",
                  "ID",
                  "Name",
                  "District",
                  "Block",
                  // "Power On Time",
                  // "Power Off Time",
                  // "Last Seen On",
                  "Live Connection State",
                  "Connection Status",
                  "Device Status",
                  "Active Dates",
                  "Total Active Duration",
                  "HM Name",
                  "HM Contact No.",
                  // New column
                  // "Inactive Duration",    // New column
                  // "Avg Active Duration", // New column
                  // "Avg Idle Duration" // New column
                ].map((header, index) => (
                  <th
                    style={
                      header === "District" || header === "Block"
                        ? {
                            ...styles.tableHeader,
                            ...styles.districtBlockColumn,
                          }
                        : styles.tableHeader
                    }
                    key={header}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody style={styles.tableBody}>
              {filteredData.map((item, index) => {
                return (
                  <tr
                    key={item.id}
                    style={index % 2 === 0 ? styles.evenRow : styles.oddRow}
                  >
                    <td style={styles.tableData}>{index + 1}</td>
                    <td style={styles.tableData}>{item.id}</td>
                    <td style={styles.tableData}>{item.name}</td>
                    <td style={styles.tableData}>{item.district}</td>
                    <td style={styles.tableData}>{item.block}</td>
                    {/* <td style={styles.tableData}>{formatDateTime(item.power_on_time)}</td>
        <td style={styles.tableData}>{formatDateTime(item.power_off_time)}</td> */}
                    {/* <td style={styles.tableData}>
                      {formatDateTime(item.last_seen_on)}
                    </td> */}
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
                    <td style={styles.tableData}>{item.connection_status}</td>
                    <td style={styles.tableData}>{item.device_status}</td>
                    {/* New columns */}
                    <td style={styles.tableData}>{item.active_dates}</td>
                    <td style={styles.tableData}>
                      {item.total_active_duration}
                    </td>
                    <td style={styles.tableData}>{item.hm_name}</td>
                    <td style={styles.tableData}>{item.hm_contact_numbers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No data available to display.</p>
      )}
      
    </div>
  );
};

// Styling
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
    // marginTop: "20px",
    alignItems: "center",
  },
  searchInput: {
    padding: "12px",
    fontSize: "1rem",
    // width: "50%",
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
    alignItems: "flex-start", // Align items at the top
    margin: "20px auto",
    width: "80%",
    gap: "40px",
    flexWrap: "nowrap",
  },

  // pieChart: {
  //   width: "30%",
  // },
  summary: {
    // width: "40%",
    textAlign: "center",
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },
  activeCount: {
    color: "#32CD32",

    cursor: "pointer",
  },
  inactiveCount: {
    color: "#FF0000",

    cursor: "pointer",
  },
  tableHeader: {
    backgroundColor: "#0096FF",
    color: "white",
    padding: "10px",
    textAlign: "left",
  },
  tableData: {
    padding: "10px",
    borderBottom: "1px solid #ddd",
    textAlign: "left",
  },
  evenRow: {
    backgroundColor: "#f2f2f2",
  },
  oddRow: {
    backgroundColor: "#ffffff",
  },
  statusDot: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    marginRight: "8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "20px",
  },

  pagination: {
    marginTop: "20px",
    textAlign: "center",
  },
  paginationButton: {
    padding: "10px 20px",
    margin: "0 10px",
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  header: { textAlign: "center", fontSize: "1.5rem" },
  dropdownContainer: { textAlign: "center", margin: "10px 20px" },
  dropdown: {
    padding: "10px",
    fontSize: "1rem",
    borderRadius: "30px",
    width: "10rem",
  },
  tableContainer: {
    // width: "100%",
    // maxWidth: "100%", // Ensure it fits the viewport
    overflowX: "auto", // Enable horizontal scrolling
    marginTop: "20px",
    position: "relative", // Keep it positioned relative to its container
    paddingBottom: "10px", // Space for scrollbar inside the container
},
table: {
    minWidth: "1000px", // Wider than the container to enable scroll
    borderCollapse: "collapse",
},


  // datePickerContainer: {
  //   display: "flex",
  //   justifyContent: "center",
  //   alignItems: "center",
  //   marginTop: "20px",
  // },
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
    // width: "40%",
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },

  districtHeader: {
    marginBottom: "10px",
    textAlign: "center",
  },
  scrollable: {
    maxHeight: "300px",
    overflowY: "auto",
    padding: "10px",
  },
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
    width: "150px", // Adjust the size as per your need
    height: "150px", // Adjust the size as per your need
  },
};

export default DeviceData;
