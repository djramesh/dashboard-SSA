import React from 'react';
import './navbar.css';

 const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <img src="https://www.schoolnetindia.com/static/372dd395c01da58f8921a5f3877007ff/f66a4/a.webp" alt="Logo" />
      </div>
      {/* <ul className="navbar-links">
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#services">Services</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul> */}
    </nav>
  );
  
};
export default Navbar;
