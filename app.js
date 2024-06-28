const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const socketIO = require("socket.io");
const pool = require("./routes/pool");

const { setupSocket } = require("./socket");
const adminRouter = require("./routes/admin");
const usersRouter = require("./routes/users");
const viewerRouter = require("./routes/viewer");
const userForm = require("./routes/form");

const app = express();
app.use(express.urlencoded({ extended: true }));
// Socket.IO setup
const server = http.createServer(app);
setupSocket(server); // Passing the io instance to the setupSocket function

// Middleware setup
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// CORS setup
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Routes setup
app.use("/admin", adminRouter);
app.use("/users", usersRouter);
app.use("/viewer", viewerRouter);
app.use("/form", userForm);

// Error handling middleware
app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: err.message,
  });
});

server.listen(5000, () => {
  console.log("Server listening on port 5000");
});

module.exports = app;
