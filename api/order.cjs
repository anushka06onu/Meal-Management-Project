const {failure,validateItems,cents}=require('./security.cjs');
async function placeOrder(connection,userId,items,instructions=''){
 validateItems(items,instructions);
 await connection.beginTransaction();
 try{
  const [customers]=await connection.query('SELECT balance FROM customers WHERE user_id = ? FOR UPDATE',[userId]);
  if(!customers.length)throw failure(404,'Customer not found');
  let totalCents=0;
  for(const item of items){
   const [menu]=await connection.query('SELECT price FROM menu_items WHERE id = ? AND active = 1',[item.menuItemId]);
   if(!menu.length)throw failure(404,'Menu item not available');
   totalCents+=cents(menu[0].price)*item.quantity;
  }
  if(cents(customers[0].balance)<totalCents)throw failure(400,'Insufficient balance');
  const totalAmount=totalCents/100;
  const [order]=await connection.query('INSERT INTO orders (customer_id,total_amount,status,special_instructions) VALUES (?, ?, ?, ?)',[userId,totalAmount,'pending',instructions]);
  for(const item of items)await connection.query('INSERT INTO order_items (order_id,menu_item_id,quantity) VALUES (?, ?, ?)',[order.insertId,item.menuItemId,item.quantity]);
  const [debit]=await connection.query('UPDATE customers SET balance = balance - ? WHERE user_id = ? AND balance >= ?',[totalAmount,userId,totalAmount]);
  if(debit.affectedRows!==1)throw failure(409,'Balance changed; please retry your order.');
  await connection.query('INSERT INTO transactions (customer_id,amount,type,description) VALUES (?, ?, ?, ?)',[userId,totalAmount,'debit',`Payment for order #${order.insertId}`]);
  await connection.commit();return {orderId:order.insertId,totalAmount};
 }catch(error){await connection.rollback();throw error;}
}
module.exports={placeOrder};
