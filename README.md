# Social Serving Food Delivery System

## Project Overview

**Social Serving Food Delivery System** is a web-based food delivery and donation platform designed to provide affordable food while supporting NGOs and reducing food wastage.

The platform allows customers to order food from restaurants at discounted rates and provides an option for voluntary donations to NGOs. Restaurants can also list leftover food, which can be made available to nearby NGOs for distribution.

The system supports multiple user roles, location-based food discovery, discounted pricing, delivery charges based on distance, online payment, and Cash on Delivery.

---

## 🚀 Live Demo

👉 **[Visit FoodBridge Live](https://social-serving-food-delivery-system.onrender.com)**


## Features

### 🍽️ Food Tracking & Restaurant Management

- Restaurants can create accounts and log in.
- Restaurants can manage their food listings.
- Restaurant owners can enter details of available/leftover food.
- Food information includes:
  - Food item
  - Number of plates
  - Price per plate
  - Restaurant location
- Restaurant locations are stored using geographical coordinates.

---

### 🤝 Food Distribution to NGOs

- NGOs can view available leftover food from restaurants.
- Food can be filtered based on location.
- NGOs can discover available food within a **10 km radius**.
- NGOs can place orders for available leftover food.
- NGOs receive a **40% rebate** on the price per plate.
- The system supports delivery of food from restaurants to NGOs.

---

### 🛒 Food Sales for Customers

- Customers can browse available food.
- Customers can order food from nearby restaurants.
- Food is available at discounted rates.
- Restaurant availability is based on geographical distance.
- The application supports distance-based pricing.
- Customers can add food items to their cart.
- Customers can place orders from the cart.

---

### 📍 Location-Based Services

The application uses geographical location to provide nearby food services.

- Restaurant location tracking
- Customer location information
- NGO location information
- Nearby restaurant discovery
- Nearby leftover-food discovery
- Location filtering within a **10 km radius**

### Delivery Charges

The platform applies distance-based delivery rules.

- **Within 2 km:** Free delivery
- **Beyond 2 km:** Transportation/delivery fee is applied

---

### 💳 Payment Options

Customers can select from different payment methods:

- Online / Prepaid Payment
- Cash on Delivery (COD)

The order stores the selected payment mode and order/payment status.

---

### ❤️ Donations to NGOs

Customers can make voluntary donations to NGOs through the platform.

Donation-related information can be associated with the user for future reference.

---

## User Roles

The application supports different types of users.

### Customer

Customers can:

- Register and log in
- Browse food
- Add items to cart
- Place orders
- Select payment methods
- Track order information
- Make voluntary donations to NGOs

### Restaurant

Restaurants can:

- Register and log in
- Manage food items
- Add leftover food
- Manage available food
- Receive customer orders
- Participate in food distribution

### NGO

NGOs can:

- Register and log in
- View available leftover food
- Find food from nearby restaurants
- Place food distribution orders
- Participate in food donation activities

---

# Technology Stack

## Frontend

- EJS (Embedded JavaScript Templates)
- HTML5
- CSS3
- JavaScript
- Bootstrap

## Backend

- Node.js
- Express.js

## Database

- MongoDB
- Mongoose

## Other Technologies

- REST APIs
- Session-based authentication
- Role-based access
- Cloudinary
- Geolocation
- Environment Variables
- Payment Integration

---

# Project Architecture

```text
                         Web Browser
                              |
                              v
                         EJS Frontend
                              |
                              v
                       Express.js Server
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
          Customer        Restaurant          NGO
              |               |               |
              +---------------+---------------+
                              |
                              v
                           MongoDB
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
            Users           Orders          Food Data
```

---

# Project Structure

```text
Social-Serving-Food-Delivery-System/
│
├── cloudinary/
│
├── controllers/
│
├── models/
│
├── public/
│
├── routes/
│
├── utils/
│
├── views/
│
├── dist/
│
├── app.js
├── package.json
├── package-lock.json
├── .env
├── .gitignore
├── README.md
└── LICENSE
```

### Directory Description

**controllers/**  
Contains the application's business logic and request-handling functions.

**models/**  
Contains MongoDB/Mongoose schemas and database models.

**routes/**  
Contains Express.js routes used by different parts of the application.

**views/**  
Contains EJS templates used to render the web pages.

**public/**  
Contains static files such as CSS, JavaScript, images, and other frontend assets.

**utils/**  
Contains reusable utility/helper functions.

**cloudinary/**  
Contains functionality related to image and media management.

---

# Requirements

Before running the project, install the following:

| Requirement | Recommended Version |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| MongoDB | MongoDB Atlas or Local MongoDB |
| Git | Latest |
| Web Browser | Chrome / Edge / Firefox |

Check Node.js:

```powershell
node --version
```

Check npm:

```powershell
npm --version
```

---

# Getting Started

Follow the steps below to run the project locally.

## 1. Clone the Repository

```bash
git clone https://github.com/Deepakmeena-123/Social-Serving-Food-Delivery-System.git
```

Move into the project directory:

```bash
cd Social-Serving-Food-Delivery-System
```

---

## 2. Install Dependencies

Install all required Node.js packages:

```bash
npm install
```

---

# Database Setup

This project uses **MongoDB** as its database.

You can use either:

- MongoDB Atlas
- Local MongoDB installation

Create/configure your MongoDB database and obtain the MongoDB connection URI.

---

# Environment Variables

Create a `.env` file in the root directory of the project.

Example:

```env
MONGO_URI=your-mongodb-connection-uri
```

Add the other environment variables required by the services configured in the project.

For example:

```env
MONGO_URI=your-mongodb-connection-uri
SESSION_SECRET=your-session-secret
```

If Cloudinary or payment services are configured, add their corresponding credentials as well.

### Important

**Never upload your `.env` file to GitHub.**

Make sure your `.gitignore` contains:

```gitignore
.env
node_modules/
```

---

# Run the Application

After installing the dependencies and configuring MongoDB, start the application:

```bash
npm start
```

The application starts using:

```text
node app.js
```

If everything is configured correctly, you should see:

```text
Database connected
Serving on port 3000
```

Open the application in your browser:

```text
http://localhost:3000
```

---

# Application Workflow

## Customer Workflow

```text
Register / Login
       |
       v
Browse Restaurants
       |
       v
Select Food
       |
       v
Add to Cart
       |
       v
Checkout
       |
       v
Select Payment Method
       |
       +------ Online Payment
       |
       +------ Cash on Delivery
       |
       v
Place Order
       |
       v
Order Processing
       |
       v
Delivery / Pickup
```

---

# NGO Food Distribution Workflow

```text
Restaurant
     |
     v
Add Leftover Food
     |
     v
Food Becomes Available
     |
     v
Location Filtering
     |
     v
Nearby NGO
     |
     v
NGO Places Order
     |
     v
Food Distribution
```

---

# Location-Based Delivery

The system uses geographical information to calculate and filter nearby services.

```text
Customer
    |
    | Distance <= 2 km
    v
Free Delivery

Customer
    |
    | Distance > 2 km
    v
Transportation Fee
```

The application also supports finding restaurants and leftover food within a **10 km radius**.

---

# Pricing Model

The platform provides discounted food and different pricing rules based on distance.

### Customer Orders

```text
Restaurant Food
       |
       v
Discounted Price
       |
       v
Distance Calculation
       |
       +---- <= 2 km ----> Free Delivery
       |
       +---- > 2 km -----> Transportation Fee
```

### NGO Orders

NGOs can receive a **40% rebate** on the price per plate for eligible leftover-food orders.

---

# Payment

The system supports:

### Online / Prepaid Payment

Customers can choose online payment during checkout.

### Cash on Delivery

Customers can choose COD and pay when the order is delivered.

Order information stores the selected payment mode and status.

---

# Database

MongoDB is used for storing application data.

The system manages information related to:

- Users
- Customers
- Restaurants
- NGOs
- Food Items
- Cart Items
- Orders
- Notifications
- Locations
- Payment Information

---

# API & Backend

The backend is developed using **Node.js and Express.js**.

The server handles:

- User authentication
- Restaurant operations
- NGO operations
- Food management
- Cart operations
- Order processing
- Payment handling
- Location-based operations
- Donation-related operations

---

# Troubleshooting

## MongoDB Connection Error

If the application cannot connect to MongoDB:

1. Check your `.env` file.
2. Verify the MongoDB connection URI.
3. Make sure your MongoDB Atlas cluster is running.
4. Check MongoDB Atlas Network Access.
5. Make sure your current IP address is allowed.
6. Restart the application.

---

## Port 3000 Already in Use

If port `3000` is already being used, stop the existing Node.js process and run the application again.

You can check the port using:

```powershell
netstat -ano | findstr :3000
```

---

## Dependencies Error

If you receive a module-not-found error, run:

```powershell
npm install
```

Then start the project again:

```powershell
npm start
```

---

# Future Improvements

Possible future improvements include:

- Real-time order tracking
- Improved restaurant dashboard
- Improved NGO dashboard
- Advanced admin dashboard
- Real-time notifications
- Better payment verification
- Improved location-based search
- Order analytics
- Mobile application
- Improved food donation management
- Better responsive design
- Production-grade deployment

---

# Learning Outcomes

This project provides practical experience with:

- Node.js
- Express.js
- MongoDB
- Mongoose
- EJS
- Bootstrap
- JavaScript
- REST APIs
- Authentication
- Role-based access
- CRUD operations
- Geolocation
- Cloudinary
- Payment integration
- Environment variables
- Full-stack web development
- Git and GitHub

---

# Project Highlights

### Full-Stack Web Application

Developed a complete web application using Node.js, Express.js, MongoDB, EJS, and Bootstrap.

### Multi-Role Platform

Implemented different workflows for:

- Customers
- Restaurants
- NGOs

### Food Donation

Integrated a food donation workflow that allows leftover food from restaurants to be connected with NGOs.

### Location-Based Services

Implemented geographical filtering for nearby restaurants, food, and NGOs.

### Flexible Delivery

Implemented distance-based delivery rules including free delivery within 2 km and transportation charges beyond 2 km.

### Multiple Payment Methods

Supported online/prepaid payments and Cash on Delivery.

---

# Author

## Deepak Meena

**B.Tech Computer Science & Engineering**  
Indian Institute of Information Technology Design and Manufacturing, Jabalpur

### GitHub

https://github.com/Deepakmeena-123

### LinkedIn

https://www.linkedin.com/in/deepak-meena-a28848372/

### Project Repository

https://github.com/Deepakmeena-123/Social-Serving-Food-Delivery-System

---

<div align="center">

### ⭐ If you find this project useful, consider giving the repository a star!

</div>