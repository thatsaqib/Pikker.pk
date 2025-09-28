// models/Thread.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    sender: { type: Schema.Types.ObjectId, ref: "User" }, // <- must be ObjectId ref
    content: { type: String, required: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now }
});

const threadSchema = new Schema({
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    listing: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Thread", threadSchema);
