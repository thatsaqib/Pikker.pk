// app.js
const express = require('express');
const session = require("express-session");
const passport = require("passport");
require("dotenv").config();
require("./config/passport"); // Passport config
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

// Models
const User = require("./models/User");
const Listing = require("./models/Listing");
const Review = require("./models/Review");
const Thread = require('./models/Thread');
const Message = require('./models/Message');

const app = express();

// MongoDB connect
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// Middlewares
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "PickkerSecret",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

// Auth Middlewares
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/auth/google");
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === "Admin") return next();
    res.status(404).render("404");
}

// --------------------
// ROUTES
// --------------------

// Home Page
app.get("/", async (req, res) => {
    try {
        const listings = await Listing.find().populate("createdBy")
            .sort({ createdAt: -1 })
            .limit(12);;

        let unreadCount = 0;
        if (req.user) {
            const threads = await Thread.find({ participants: req.user._id });

            threads.forEach(thread => {
                if (!thread.messages) return; // safety check

                unreadCount += thread.messages.filter(m => {
                    // convert ObjectIds to strings for comparison
                    return !m.readBy.map(id => id.toString()).includes(req.user._id.toString());
                }).length;
            });
        }

        res.render("index", { listings, user: req.user, unreadCount });
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});


// Legal Pages
app.get('/terms', (req, res) => res.render('Legal/terms'));
app.get('/privacy', (req, res) => res.render('Legal/Privacy'));
app.get('/cnic-policy', (req, res) => res.render('Legal/CNIC Handling'));

// Login & Logout
app.get("/login", (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/profile");
    res.render("login");
});

app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
        res.redirect("/profile"); // redirect to profile after login
    });


app.get("/logout", (req, res) => {
    req.logout(() => res.redirect("/"));
});

// Profile
app.get("/profile", isLoggedIn, (req, res) => res.render("profile", { user: req.user }));

// --------------------
// Profile & CNIC Upload
// --------------------

// Multer config for avatar
const storageAvatar = multer.diskStorage({
    destination: "public/uploads/avatar/",
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadAvatar = multer({ storage: storageAvatar });

app.get("/profile/edit", isLoggedIn, async (req, res) => {
    const userListings = await Listing.find({ createdBy: req.user._id });
    res.render("edit-profile", { user: req.user, userListings });
});

app.post("/profile/edit", isLoggedIn, uploadAvatar.single("profilePic"), async (req, res) => {
    try {
        const updateData = { name: req.body.name };
        if (req.file) updateData.profilePic = "/uploads/avatar/" + req.file.filename;
        await User.findByIdAndUpdate(req.user._id, updateData);
        res.redirect("/profile");
    } catch (err) {
        console.error(err);
        res.send("Error updating profile");
    }
});

// Multer config for CNIC
const storageCnic = multer.diskStorage({
    destination: "public/uploads/cnic/",
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadCnic = multer({ storage: storageCnic });

app.post("/upload-cnic", uploadCnic.fields([{ name: "cnicFront" }, { name: "cnicBack" }]), async (req, res) => {
    if (!req.user) return res.redirect("/login");
    try {
        const user = await User.findById(req.user._id);
        user.cnic = {
            front: "/uploads/cnic/" + req.files["cnicFront"][0].filename,
            back: "/uploads/cnic/" + req.files["cnicBack"][0].filename,
            status: "Pending"
        };
        await user.save();
        res.redirect("/profile");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error uploading CNIC");
    }
});

// Admin CNIC approval
app.get("/admin/cnics", isAdmin, async (req, res) => {
    const users = await User.find({ "cnic.status": "Pending" });
    res.render("admin-cnic-list", { users });
});

app.get("/admin/cnics/:id", isAdmin, async (req, res) => {
    const { status } = req.query;
    if (!["approved", "rejected"].includes(status)) return res.status(400).send("Invalid status");
    await User.findByIdAndUpdate(req.params.id, { "cnic.status": status });
    res.redirect("/admin/cnics");
});

// --------------------
// User Profiles & Reviews
// --------------------

app.get("/all-users", isAdmin, async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
});

app.get("/user/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).render("404");

        const listings = await Listing.find({ seller: user._id });
        const reviews = await Review.find({ seller: user._id }).populate("from", "name");

        let hasReviewed = false;
        if (req.user) hasReviewed = reviews.some(r => r.from._id.toString() === req.user._id.toString());

        res.render("public-profile", { user, listings, reviews, currentUser: req.user, hasReviewed });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Submit review
app.post('/user/:id/review', isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).send("User not found");
        if (req.user._id.toString() === user._id.toString()) return res.status(400).send("Cannot review yourself");

        const alreadyReviewed = await Review.findOne({ from: req.user._id, seller: user._id });
        if (alreadyReviewed) return res.status(400).send("You already reviewed this user");

        const { rating, comment } = req.body;
        const review = new Review({ from: req.user._id, seller: user._id, rating, comment });
        await review.save();

        res.redirect(`/user/${user._id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// --------------------
// Listings
// --------------------

// Multer for listings
const storageImg = multer.diskStorage({
    destination: "public/uploads/listings",
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadImg = multer({ storage: storageImg, limits: { fileSize: 5 * 1024 * 1024 } });

// Add listing
app.get("/listing/add", isLoggedIn, (req, res) => res.render("add-listing", { user: req.user }));

app.post("/listing/add", isLoggedIn, uploadImg.array("images", 3), async (req, res) => {
    const { title, description, price, location, category, condition } = req.body;
    const images = req.files.map(f => "/uploads/listings/" + f.filename);
    if (images.length === 0) return res.send("Please upload at least 1 image");

    try {
        const newListing = new Listing({ title, description, price, location, category, condition, images, createdBy: req.user._id });
        await newListing.save();
        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// View listing
app.get("/listing/:id", async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id).populate("createdBy");
        if (!listing) return res.status(404).render("404");

        const reviews = await Review.find({ seller: listing.createdBy._id }).populate("from", "name");
        let hasReviewed = false;
        if (req.user) hasReviewed = reviews.some(r => r.from._id.toString() === req.user._id.toString());

        res.render("listing-page", { listing, reviews, currentUser: req.user, hasReviewed });
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// Delete listing
app.post("/listing/:id/delete", isLoggedIn, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).send("Listing not found");
        if (listing.createdBy.toString() !== req.user._id.toString()) return res.status(403).send("Cannot delete");

        await Listing.findByIdAndDelete(req.params.id);
        res.redirect("/profile/edit");
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// Category
app.get("/category/:name", async (req, res) => {
    try {
        const name = req.params.name;
        const listings = await Listing.find({ category: { $regex: new RegExp("^" + name + "$", "i") } }).populate("createdBy");
        res.render("category-listings", { listings, categoryName: name, user: req.user || null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// Search
app.get("/search", async (req, res) => {
    try {
        const q = req.query.q || "";
        const regex = { $regex: q, $options: "i" };

        const listings = await Listing.find({ $or: [{ title: regex }, { description: regex }, { category: regex }, { location: regex }] }).populate("createdBy");
        const users = await User.find({ $or: [{ name: regex }, { username: regex }, { location: regex }] });

        res.render("search-results", { listings, users, query: q });
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

// --------------------
// CHAT ROUTES
// --------------------

// Inbox first
app.get("/chat/inbox", isLoggedIn, async (req, res) => {
    try {
        const threads = await Thread.find({ participants: req.user._id })
            .populate("participants", "name profilePic")
            .populate("listing", "title")
            .sort({ lastMessageAt: -1 });

        res.render("inbox", { threads, currentUser: req.user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Chat with listing
app.get("/chat/:otherUserId/:listingId", isLoggedIn, async (req, res) => {
    const { otherUserId, listingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(otherUserId) || !mongoose.Types.ObjectId.isValid(listingId)) {
        return res.status(400).send("Invalid ID");
    }


    try {
        const otherUser = await User.findById(otherUserId);
        if (!otherUser) return res.status(404).send("User not found");

        // Check if thread exists
        let thread = await Thread.findOne({
            participants: { $all: [req.user._id, otherUser._id] },
            listing: listingId
        }).populate("messages.sender", "name profilePic");

        // If no thread, create one
        if (!thread) {
            thread = new Thread({
                participants: [req.user._id, otherUser._id],
                listing: listingId,
                messages: []
            });
            await thread.save();
        }

        res.render("chat-thread", {
            otherUser,
            listingId,
            currentUser: req.user,
            messages: thread.messages,
            thread
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Chat without listing
app.get("/chat/:otherUserId", isLoggedIn, async (req, res) => {
    const { otherUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) return res.status(400).send("Invalid user ID");

    try {
        const otherUser = await User.findById(otherUserId);
        if (!otherUser) return res.status(404).send("User not found");

        let thread = await Thread.findOne({
            participants: { $all: [req.user._id, otherUser._id] },
            listing: null
        }).populate("messages.sender", "name profilePic");

        if (!thread) {
            thread = new Thread({
                participants: [req.user._id, otherUser._id],
                listing: null,
                messages: []
            });
            await thread.save();
        }


        res.render("chat-thread", {
            otherUser,
            listingId: null,
            currentUser: req.user,
            messages: thread.messages,
            thread
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


// 404 Page
app.use((req, res) => {
    res.status(404).render("404");
});

// --------------------
// SERVER + SOCKET.IO
// --------------------
const http = require("http").createServer(app);
const io = require("socket.io")(http);

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("joinThread", (threadId) => {
        socket.join(threadId);
    });

    socket.on("sendMessage", async ({ threadId, senderId, content }) => {
        if (!content.trim()) return;

        const thread = await Thread.findById(threadId);
        if (!thread) return;

        const message = { sender: senderId, content, readBy: [senderId], createdAt: new Date() };
        thread.messages.push(message);
        thread.lastMessageAt = new Date();
        await thread.save();

        // Emit message with threadId included
        io.to(threadId).emit("newMessage", { ...message, threadId });
    });



    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));