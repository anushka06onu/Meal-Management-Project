require('dotenv').config();
const mysql=require('mysql2/promise');
const {databaseConfig}=require('./api/security.cjs');
const schema=[
 `CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(80) NOT NULL UNIQUE,password VARCHAR(255) NOT NULL,name VARCHAR(120) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,phone VARCHAR(40),role VARCHAR(20) NOT NULL DEFAULT 'customer')`,
 `CREATE TABLE IF NOT EXISTS customers (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL UNIQUE,balance DECIMAL(10,2) NOT NULL DEFAULT 0,FOREIGN KEY(user_id) REFERENCES users(id))`,
 `CREATE TABLE IF NOT EXISTS menu_items (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(120) NOT NULL,description TEXT,price DECIMAL(10,2) NOT NULL,category VARCHAR(60),active BOOLEAN NOT NULL DEFAULT TRUE)`,
 `CREATE TABLE IF NOT EXISTS orders (id INT AUTO_INCREMENT PRIMARY KEY,customer_id INT NOT NULL,total_amount DECIMAL(10,2) NOT NULL,status VARCHAR(30) NOT NULL,special_instructions TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES users(id))`,
 `CREATE TABLE IF NOT EXISTS order_items (id INT AUTO_INCREMENT PRIMARY KEY,order_id INT NOT NULL,menu_item_id INT NOT NULL,quantity INT NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(menu_item_id) REFERENCES menu_items(id))`,
 `CREATE TABLE IF NOT EXISTS transactions (id INT AUTO_INCREMENT PRIMARY KEY,customer_id INT NOT NULL,amount DECIMAL(10,2) NOT NULL,type VARCHAR(20) NOT NULL,description TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES users(id))`
];
async function setup(){const db=await mysql.createConnection(databaseConfig());try{for(const sql of schema)await db.query(sql);console.log('MySQL tables checked. Existing records preserved; no accounts or balances seeded.');}finally{await db.end();}}
if(require.main===module)setup().catch(()=>{console.error('Database setup failed. Check environment configuration and schema permissions.');process.exitCode=1;});
module.exports={schema};
