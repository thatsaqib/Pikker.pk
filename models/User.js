const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true },
    name: String,
    email: String,
    profilePic: {
        type: String,
        default: "/uploads/avatar/User.png"
    },
    cnic: {
        front: { type: String, default: null },
        back: { type: String, default: null },
        status: {
            type: String,
            enum: ["Not Submitted", "Pending", "Verified", "Rejected"],
            default: "Not Submitted"
        }
    },
    role: {
        type: String,
        enum: ["User", "Admin"],
        default: "User"
    },
    joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
