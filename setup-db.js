const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    // Create tables
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

    // Insert dummy data
    db.get("SELECT COUNT(*) as count FROM menu_items", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO menu_items (name, price, active, description, image_path) VALUES 
                ('Classic Burger', 5.99, 1, 'Juicy beef patty with lettuce and tomato.', './images/classic_burger.png'),
                ('Veggie Pizza', 8.49, 1, 'Fresh vegetables and mozzarella cheese.', './images/food_banner.png'),
                ('Grilled Chicken Salad', 6.99, 1, 'Healthy greens with grilled chicken breast.', './images/food_banner.png'),
                ('Pasta Carbonara', 7.99, 1, 'Creamy pasta with bacon and parmesan.', './images/food_banner.png')
            `);
            console.log("Dummy menu items inserted.");
        }
        console.log("Database setup complete.");
        db.close();
    });
});
