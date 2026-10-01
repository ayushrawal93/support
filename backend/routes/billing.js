"use strict";

const express = require("express");
const controller = require("../controllers/billingController");
const { chatRateLimit } = require("../middleware/chatRateLimit");
const { optionalUser } = require("../middleware/userAuth");

const router = express.Router();

router.post("/checkout", chatRateLimit, optionalUser, controller.checkout);
router.get("/confirm", chatRateLimit, optionalUser, controller.confirm);

module.exports = router;
