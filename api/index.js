require("dotenv").config();
const {databaseConfig,signingSecret,validateItems} = require("./security.cjs");
const {placeOrder} = require("./order.cjs");
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8070);

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});
app.use('/Styles', express.static(path.join(__dirname, '../Styles')));
app.use('/scripts', express.static(path.join(__dirname, '../scripts')));
app.use('/images', express.static(path.join(__dirname, '../images')));

let pool;
let jwtSecret;
try { pool = mysql.createPool(databaseConfig()); jwtSecret = signingSecret(); }
catch { console.error('UniMeal API configuration is incomplete; set database and JWT environment variables.'); }
app.get('/api/health', (_req,res) => res.status(pool && jwtSecret ? 200 : 503).json({ready:Boolean(pool && jwtSecret)}));
app.use('/api', (_req,res,next) => {
    if (!pool || !jwtSecret) return res.status(503).json({error:'The meal service is not configured. Please try again later.'});
    next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied" });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
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
app.post("/api/auth/register", async (req,res) => {
    const {username,password,name,email,phone=''}=req.body;
    if(typeof username!=='string'||username.trim().length<3||username.length>80||typeof password!=='string'||password.length<8||password.length>72||typeof name!=='string'||!name.trim()||name.length>120||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof phone!=='string'||phone.length>40)return res.status(400).json({error:'Provide valid registration details and an 8–72 character password.'});
    let connection;
    try {
        connection=await pool.getConnection();
        await connection.beginTransaction();
        const hashedPassword=await bcrypt.hash(password,12);
        const [user]=await connection.query('INSERT INTO users (username,password,name,email,phone,role) VALUES (?, ?, ?, ?, ?, ?)',[username.trim(),hashedPassword,name.trim(),email.trim().toLowerCase(),phone,'customer']);
        await connection.query('INSERT INTO customers (user_id,balance) VALUES (?, ?)',[user.insertId,0]);
        await connection.commit();
        return res.status(201).json({message:'Customer registered successfully'});
    }catch(error){
        if(connection)await connection.rollback();
        return res.status(error.code==='ER_DUP_ENTRY'?409:500).json({error:error.code==='ER_DUP_ENTRY'?'Username or email already exists':'Registration could not be completed'});
    }finally{if(connection)connection.release();}
});

// Login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if(typeof username!=="string"||typeof password!=="string"||!username||!password)return res.status(400).json({error:"Username and password are required"});

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
            jwtSecret,
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
app.post("/api/orders", authenticateToken, async (req,res) => {
    if(req.user.role !== 'customer')return res.status(403).json({error:'Access denied'});
    let connection;
    try {
        const {items,specialInstructions=''}=req.body;
        validateItems(items,specialInstructions);
        connection=await pool.getConnection();
        const result=await placeOrder(connection,req.user.id,items,specialInstructions);
        return res.status(201).json({message:'Order placed successfully',...result});
    } catch(error) {
        return res.status(error.status || 500).json({error:error.status ? error.message : 'The order could not be completed.'});
    } finally { if(connection)connection.release(); }
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

