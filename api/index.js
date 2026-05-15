const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = 8070;

const app = express();
app.use(express.json());
app.use(cors());

// In Vercel, static files are served from the root automatically.
// We don't need app.use(express.static('.')) here if we use Vercel's static routing.
// But keeping it for local development is fine.
app.use(express.static('.'));

// Database connection
const dbPath = process.env.VERCEL ? '/tmp/database.sqlite' : 'database.sqlite';
const db = new sqlite3.Database(dbPath);

// Initialize DB if on Vercel or fresh local
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        email TEXT,
        phone TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS customers (
        user_id INTEGER PRIMARY KEY,
        balance REAL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        active BOOLEAN,
        description TEXT,
        image_path TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        total_amount REAL,
        status TEXT,
        special_instructions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        menu_item_id INTEGER,
        quantity INTEGER,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        amount REAL,
        type TEXT,
        description TEXT,
        FOREIGN KEY(customer_id) REFERENCES users(id)
    )`);

    // Insert dummy data if empty
    db.get("SELECT COUNT(*) as count FROM menu_items", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO menu_items (name, price, active, description, image_path) VALUES 
                ('Classic Burger', 5.99, 1, 'Juicy beef patty with lettuce and tomato.', './images/classic_burger.png'),
                ('Veggie Pizza', 8.49, 1, 'Fresh vegetables and mozzarella cheese.', './images/food_banner.png'),
                ('Grilled Chicken Salad', 6.99, 1, 'Healthy greens with grilled chicken breast.', './images/food_banner.png'),
                ('Pasta Carbonara', 7.99, 1, 'Creamy pasta with bacon and parmesan.', './images/food_banner.png')
            `);
        }
    });
});

// Wrapper for async/await to mimic mysql2
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        const upperSql = sql.trim().toUpperCase();
        if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH')) {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve([rows]);
            });
        } else {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve([{ insertId: this.lastID, changes: this.changes }]);
            });
        }
    });
};

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

        const [existingUsers] = await query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await query(
            "INSERT INTO users (username, password, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)",
            [username, hashedPassword, name, email, phone, "customer"]
        );

        await query(
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

        const [users] = await query(
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

        const [users] = await query(
            "SELECT id, username, name, email, phone FROM users WHERE id = ?",
            [req.user.id]
        );
        const [customers] = await query(
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
        const [menuItems] = await query(
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
    try {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied" });
        }

        const { items, specialInstructions } = req.body;

        await query("BEGIN TRANSACTION");

        try {
            const [customers] = await query(
                "SELECT balance FROM customers WHERE user_id = ?",
                [req.user.id]
            );

            if (customers.length === 0) {
                await query("ROLLBACK");
                return res.status(404).json({ error: "Customer not found" });
            }

            let currentBalance = customers[0].balance;
            let orderTotal = 0;

            for (const item of items) {
                const [menuItems] = await query(
                    "SELECT price FROM menu_items WHERE id = ?",
                    [item.menuItemId]
                );

                if (menuItems.length === 0) {
                    await query("ROLLBACK");
                    return res.status(404).json({
                        error: `Menu item with id ${item.menuItemId} not found`,
                    });
                }

                orderTotal += menuItems[0].price * item.quantity;
            }

            if (currentBalance < orderTotal) {
                await query("ROLLBACK");
                return res.status(400).json({ error: "Insufficient balance" });
            }

            const [orderResult] = await query(
                "INSERT INTO orders (customer_id, total_amount, status, special_instructions) VALUES (?, ?, ?, ?)",
                [req.user.id, orderTotal, "pending", specialInstructions || ""]
            );

            for (const item of items) {
                await query(
                    "INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)",
                    [orderResult.insertId, item.menuItemId, item.quantity]
                );
            }

            await query(
                "UPDATE customers SET balance = balance - ? WHERE user_id = ?",
                [orderTotal, req.user.id]
            );

            await query(
                "INSERT INTO transactions (customer_id, amount, type, description) VALUES (?, ?, ?, ?)",
                [
                    req.user.id,
                    orderTotal,
                    "debit",
                    `Payment for order #${orderResult.insertId}`,
                ]
            );

            await query("COMMIT");

            res.status(201).json({
                message: "Order placed successfully",
                orderId: orderResult.insertId,
                totalAmount: orderTotal,
            });
        } catch (error) {
            await query("ROLLBACK");
            throw error;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Get customer's order history
app.get("/api/customers/orders", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied" });
        }

        const [orders] = await query(
            `
      SELECT o.*, 
      (SELECT json_group_array(
        json_object(
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

        orders.forEach(order => {
            if (order.items) {
                order.items = JSON.parse(order.items);
            }
        });

        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Only listen locally, Vercel will handle the app export
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export the app for Vercel
module.exports = app;
