const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Prevent self-review
reviewSchema.pre("save", async function (next) {
    if (this.seller.toString() === this.from.toString()) {
        return next(new Error("You cannot review yourself"));
    }
    next();
});

// Ensure unique review per buyer per seller
reviewSchema.index({ seller: 1, from: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
