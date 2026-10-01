"use strict";

const express = require("express");
const c = require("../controllers/accountController");
const { requireUser } = require("../middleware/userAuth");

const router = express.Router();
router.use(requireUser);

router.get("/overview", c.overview);
router.get("/me", c.me);
router.patch("/me", c.updateMe);
router.get("/subscription", c.subscription);
router.post("/subscription/cancel", c.cancelSubscription);
router.post("/subscription/resume", c.resumeSubscription);
router.get("/transactions", c.transactions);
router.get("/orders", c.orders);
router.get("/orders/:orderId", c.orderDetail);
router.get("/orders/:orderId/files/:fileId", c.orderFile);

module.exports = router;
