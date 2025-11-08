// ✅ Smart Queue Optimiser Backend
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// ✅ MongoDB Connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

// ✅ Queue Schema
const queueSchema = new mongoose.Schema({
  name: String,
  type: String, // urgency (Normal, VIP, etc.)
  serviceType: String, // e.g., Hospital, Bank, Cafeteria
  status: { type: String, default: "waiting" },
  ticketNumber: { type: Number, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const QueueItem = mongoose.model("QueueItem", queueSchema);

// ✅ Helper: Get next ticket number
async function getNextTicketNumber() {
  const last = await QueueItem.findOne().sort({ ticketNumber: -1 });
  return last ? last.ticketNumber + 1 : 1;
}

// ✅ Route: Join Queue
app.post("/api/join", async (req, res) => {
  try {
    const { name, type, serviceType } = req.body;

    if (!serviceType) {
      return res.status(400).json({ error: "Service type required" });
    }

    const ticketNumber = await getNextTicketNumber();

    const newItem = new QueueItem({
      name: name || "Guest",
      type,
      serviceType,
      ticketNumber,
    });

    await newItem.save();

    io.emit("queue_updated");
    res.json(newItem);
  } catch (err) {
    console.error("❌ Join error:", err);
    res.status(500).json({ error: "Failed to join queue" });
  }
});

// ✅ Route: Check Status
app.get("/api/status/:ticketNumber", async (req, res) => {
  try {
    const ticket = await QueueItem.findOne({
      ticketNumber: req.params.ticketNumber,
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const waitingList = await QueueItem.find({ status: "waiting" }).sort({
      createdAt: 1,
    });
    const position = waitingList.findIndex(
      (q) => q.ticketNumber === ticket.ticketNumber
    );
    const avgTimePerTicket = 2; // minutes per person
    const estimatedWait = position >= 0 ? (position + 1) * avgTimePerTicket : 0;

    res.json({
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      name: ticket.name,
      type: ticket.type,
      serviceType: ticket.serviceType,
      position: position >= 0 ? position + 1 : null,
      queueLength: waitingList.length,
      estimatedWaitTime: `${estimatedWait} minutes`,
    });
  } catch (err) {
    console.error("❌ Status check error:", err);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// ✅ Route: Admin - Call Next
app.post("/api/admin/next", async (req, res) => {
  try {
    const next = await QueueItem.findOne({ status: "waiting" }).sort({
      createdAt: 1,
    });
    if (!next) return res.json({ message: "Queue empty" });

    next.status = "served";
    await next.save();
    io.emit("queue_updated");

    res.json({
      served: next,
      message: `🎟 Ticket #${next.ticketNumber} served successfully`,
    });
  } catch (err) {
    console.error("❌ Admin next error:", err);
    res.status(500).json({ error: "Error calling next" });
  }
});

// ✅ Route: Admin - Reset Queue
app.delete("/api/admin/reset", async (req, res) => {
  try {
    await QueueItem.deleteMany({});
    io.emit("queue_updated");
    res.json({ message: "🧹 Queue cleared successfully" });
  } catch (err) {
    console.error("❌ Reset error:", err);
    res.status(500).json({ error: "Failed to reset queue" });
  }
});

// ✅ Route: View Queue (for Admin Dashboard)
app.get("/api/queue", async (req, res) => {
  try {
    const queue = await QueueItem.find({ status: "waiting" }).sort({
      createdAt: 1,
    });
    res.json({ queue });
  } catch (err) {
    console.error("❌ Fetch queue error:", err);
    res.status(500).json({ error: "Failed to load queue" });
  }
});

// ✅ Default Route
app.get("/", (req, res) => {
  res.send("🚀 Smart Queue Optimiser Backend is running...");
});

// ✅ Start Server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
