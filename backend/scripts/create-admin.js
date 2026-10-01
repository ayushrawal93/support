require("dotenv").config();
const bcrypt=require("bcrypt"),readline=require("readline");
const {initDatabase,query}=require("../config/database");
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const ask=q=>new Promise(r=>rl.question(q,r));
(async()=>{try{await initDatabase();const u=(await ask("Admin username: ")).trim(),p=await ask("Admin password: ");if(!u||!p)throw new Error("Username and password are required.");const h=await bcrypt.hash(p,12);await query(`INSERT INTO admin_users(username,password_hash,is_active) VALUES($1,$2,TRUE) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_active=TRUE`,[u,h]);console.log("Admin account ready:",u);}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();}})();