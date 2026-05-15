const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = 8070;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('.'));

// Database connection (Restoring original MySQL credentials)
const pool = mysql.createPool({
    host: "uk02-sql.pebblehost.com",
    port: 3306,
    user: "customer_684607_meal_management",
    password: "l98^!iJUcmCQ4u^Q18pnDBs8",
    database: "customer_684607_meal_management",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied" });
    }

    jwt.verify(token, "jwt_secret", (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
        req.user = user;
        next();
    });
};

// -------------------------
// Authentication Routes
// -------------------------

// Customer Registration
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, password, name, email, phone } = req.body;

        const [existingUsers] = await pool.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            "INSERT INTO users (username, password, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)",
            [username, hashedPassword, name, email, phone, "customer"]
        );

        await pool.query(
            "INSERT INTO customers (user_id, balance) VALUES (?, ?)",
            [result.insertId, 100]
        );

        res.status(201).json({ message: "Customer registered successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const [users] = await pool.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        if (users.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = users[0];

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            "jwt_secret",
            { expiresIn: "24h" }
        );

        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// -------------------------
// Customer Routes
// -------------------------

// Get current customer profile
app.get("/api/customers/profile", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied" });
        }

        const [users] = await pool.query(
            "SELECT id, username, name, email, phone FROM users WHERE id = ?",
            [req.user.id]
        );
        const [customers] = await pool.query(
            "SELECT balance FROM customers WHERE user_id = ?",
            [req.user.id]
        );

        if (users.length === 0 || customers.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.json({ ...users[0], balance: customers[0].balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Get menu items
app.get("/api/menu", authenticateToken, async (req, res) => {
    try {
        const [menuItems] = await pool.query(
            "SELECT * FROM menu_items WHERE active = 1"
        );
        res.json(menuItems);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Place an order
app.post("/api/orders", authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied" });
        }

        const { items, specialInstructions } = req.body;

        await connection.beginTransaction();

        const [customers] = await connection.query(
            "SELECT balance FROM customers WHERE user_id = ?",
            [req.user.id]
        );

        if (customers.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: "Customer not found" });
        }

        let currentBalance = customers[0].balance;
        let orderTotal = 0;

        for (const item of items) {
            const [menuItems] = await connection.query(
                "SELECT price FROM menu_items WHERE id = ?",
                [item.menuItemId]
            );

            if (menuItems.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    error: `Menu item with id ${item.menuItemId} not found`,
                });
            }

            orderTotal += menuItems[0].price * item.quantity;
        }

        if (currentBalance < orderTotal) {
            await connection.rollback();
            return res.status(400).json({ error: "Insufficient balance" });
        }

        const [orderResult] = await connection.query(
            "INSERT INTO orders (customer_id, total_amount, status, special_instructions) VALUES (?, ?, ?, ?)",
            [req.user.id, orderTotal, "pending", specialInstructions || ""]
        );

        for (const item of items) {
            await connection.query(
                "INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)",
                [orderResult.insertId, item.menuItemId, item.quantity]
            );
        }

        await connection.query(
            "UPDATE customers SET balance = balance - ? WHERE user_id = ?",
            [orderTotal, req.user.id]
        );

        await connection.query(
            "INSERT INTO transactions (customer_id, amount, type, description) VALUES (?, ?, ?, ?)",
            [
                req.user.id,
                orderTotal,
                "debit",
                `Payment for order #${orderResult.insertId}`,
            ]
        );

        await connection.commit();

        res.status(201).json({
            message: "Order placed successfully",
            orderId: orderResult.insertId,
            totalAmount: orderTotal,
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: "Server error" });
    } finally {
        connection.release();
    }
});

// Get customer's order history
app.get("/api/customers/orders", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied" });
        }

        // Original MySQL query
        const [orders] = await pool.query(
            `
      SELECT o.*, 
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', oi.id,
          'menuItemId', oi.menu_item_id,
          'name', mi.name,
          'price', mi.price,
          'quantity', oi.quantity
        )
      ) FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = o.id) as items
      FROM orders o
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `,
            [req.user.id]
        );

        // MySQL returns items as a JSON string or array depending on driver configuration.
        // Usually it's a string for JSON_ARRAYAGG if not parsed.
        orders.forEach(order => {
            if (typeof order.items === 'string') {
                order.items = JSON.parse(order.items);
            }
        });

        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Only listen locally
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
