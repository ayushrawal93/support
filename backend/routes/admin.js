const express=require("express");
const {login,me}=require("../controllers/adminController");
const {requireAdmin}=require("../middleware/auth");
const r=express.Router();
r.post("/login",login);
r.get("/me",requireAdmin,me);
module.exports=r;