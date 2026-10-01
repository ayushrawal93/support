const bcrypt=require("bcrypt"),jwt=require("jsonwebtoken");
const {query}=require("../config/database");
async function login(req,res){
 try{
  const username=String(req.body?.username||"").trim(),password=String(req.body?.password||"");
  if(!username||!password)return res.status(400).json({success:false,message:"Username and password are required."});
  const r=await query("SELECT id,username,password_hash,is_active FROM admin_users WHERE username=$1 LIMIT 1",[username]);
  const a=r.rows[0];
  if(!a||!a.is_active||!(await bcrypt.compare(password,a.password_hash)))return res.status(401).json({success:false,message:"Invalid username or password."});
  const token=jwt.sign({id:Number(a.id),username:a.username,role:"admin"},process.env.JWT_SECRET,{expiresIn:"12h"});
  res.json({success:true,token,username:a.username});
 }catch(e){console.error("ADMIN LOGIN ERROR:",e);res.status(500).json({success:false,message:"Unable to log in."});}
}
function me(req,res){res.json({success:true,admin:req.admin});}
module.exports={login,me};