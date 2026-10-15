function failure(status,message){return Object.assign(new Error(message),{status});}
function databaseConfig(env=process.env){
 const names=['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME'];
 if(names.some(k=>!env[k]))throw failure(503,'Database configuration is missing.');
 return {host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,waitForConnections:true,connectionLimit:10,queueLimit:0};
}
function signingSecret(env=process.env){if(typeof env.JWT_SECRET!=='string'||env.JWT_SECRET.length<32)throw failure(503,'Configure a JWT secret with at least 32 characters.');return env.JWT_SECRET;}
function validateItems(items,instructions=''){
 if(!Array.isArray(items)||items.length<1||items.length>50)throw failure(400,'An order needs 1 to 50 items.');
 if(typeof instructions!=='string'||instructions.length>1000)throw failure(400,'Instructions must be shorter than 1000 characters.');
 for(const item of items)if(!item||!Number.isInteger(item.menuItemId)||item.menuItemId<1||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)throw failure(400,'Item IDs and quantities must be positive integers; quantity must not exceed 100.');
}
function cents(value){const n=Number(value);if(!Number.isFinite(n)||n<0)throw failure(500,'Invalid stored monetary amount.');return Math.round(n*100);}
module.exports={failure,databaseConfig,signingSecret,validateItems,cents};
