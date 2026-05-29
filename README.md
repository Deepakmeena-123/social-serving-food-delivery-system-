
# Social serving food delivery system

## Project Overview

A social serving food delivery platform is a web-based solution designed for a non-profit organization. This platform allows customers to order food at discounted rates while simultaneously offering them the option to make voluntary donations to NGOs, supporting those in need

**Currently hosted on [https://npo-lbiy.onrender.com/](https://npo-lbiy.onrender.com/).**

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Database Setup](#database-setup)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)
- [License](#license)

## Features

### Food Tracking

- Restaurants can create accounts or log in to their existing accounts.
- Restaurant owners can enter details of leftover food, including food item, number of plates, price per plate, and restaurant location (latitude and longitude).

### Distribution and Sales

- For Distribution to NGO:
  - NGOs can view available food items from restaurants within a 10km radius.
  - NGOs can place orders with a 40% rebate on the price per plate.
  - The NPO assigns a delivery executive to transport food from the restaurant to the NGO.

- For Sales:
  - Users can order discounted food from restaurants within a 10km radius.
  - Prices are adjusted based on proximity to the restaurant.
  - Payment options include prepaid and cash on delivery.
  - If the user is within 2 kilometers, delivery is free; otherwise, a transportation fee is applied.

### Donations to NGOs

- Users can make voluntary donations to NGOs.
- User information (name and address) is stored for future reference.

## Technology Stack

- Frontend:
  - EJS (Embedded JavaScript) for dynamic HTML templates.
  - Bootstrap for responsive and user-friendly design.

- Backend:
  - Node.js for server-side development.
  - Express.js for routing and middleware.
  - MongoDB for data storage and management.

## Getting Started

To run the application locally, follow these steps:

1. Clone the repository:
   ```sh
   git clone git@github.com:ajaydhaked/social-serving-food-delivery-system.git
   cd social-serving-food-delivery-system
2. Install the project dependencies:
    ```sh
    npm install

3. Start the application:
    ```sh
    npm start

4. Database Setup
    The application uses MongoDB as the database. You should have a MongoDB instance running and provide the connection details in your .env file.

    Example .env configuration:

    env
    ```sh
    MONGO_URI=your-mongodb-connection-uri
    
5. Access the application in your web browser at http://localhost:4000.
