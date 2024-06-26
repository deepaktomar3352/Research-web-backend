var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const socketIO = require("socket.io");
var pool = require("./routes/pool");

var adminRouter = require("./routes/admin");
var usersRouter = require("./routes/users");
var viewerRouter = require("./routes/viewer");
var userForm = require("./routes/form");

var app = express();

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

// Socket.IO setup
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});

const usp = io.of("/user-namespace");
const vsp = io.of("/viewer-namespace");

// Endpoint to get comments for a specific paper
usp.on("connection", async function (socket) {
  console.log("user connected");

  //fetching user & admin comments from here
  socket.on("fetch_comments", async function ({ user_id, paper_id, user }) {
    try {
      if (user === "user") {
        let query;
        let queryParams;

        if (paper_id) {
          query = "SELECT * FROM Comments WHERE paper_id = ?";
          queryParams = [paper_id];
        } else if (user_id) {
          query = "SELECT * FROM Comments WHERE userId = ?";
          queryParams = [user_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
        socket.emit("comments", comments);
      } else if (user === "admin") {
        let query;
        let queryParams;

        if (paper_id) {
          query = "SELECT * FROM Comments WHERE paper_id = ?";
          queryParams = [paper_id];
        } else if (user_id) {
          query = "SELECT * FROM Comments WHERE userId = ?";
          queryParams = [user_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
        socket.emit("comments", comments);
      }
    } catch (error) {
      console.error("Database error:", error);
      socket.emit("error", "Failed to retrieve comments");
    }
  });

  // Listen for an event that carries the comment data
  socket.on("new_comment", async function (data) {
    try {
      if (data.user === "user") {
        console.log("socket body", data.comment);
        const { user_id, is_admin_comment, comment, paper_id } = data;

        const query =
          "INSERT INTO Comments (UserId, content, is_admin_comment, paper_id,status) VALUES (?, ?, ?, ?,1)";

        // Use a promise-based query function for better async handling
        await new Promise((resolve, reject) => {
          pool.query(
            query,
            [user_id, comment, is_admin_comment, paper_id],
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        const selectQuery = "SELECT * FROM Comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response);
            }
          });
        });

        // Emit the comments back to the client
        usp.emit("comments", comments);
      } else if (data.user === "admin") {
        console.log("socket body", data.comment);
        const { user_id, is_admin_comment, comment, paper_id } = data;

        const query =
          "INSERT INTO Comments (UserId, content,is_admin_comment,target_user_id,paper_id,status) VALUES (?, ?, ?,?,?,0) ";

        // Use a promise-based query function for better async handling
        await new Promise((resolve, reject) => {
          pool.query(
            query,
            [user_id, comment, is_admin_comment, user_id, paper_id],
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        const selectQuery = "SELECT * FROM Comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response);
            }
          });
        });

        // Emit the comments back to the client
        usp.emit("comments", comments);
      }
    } catch (error) {
      console.error("Error inserting or retrieving comments:", error);
      socket.emit("error", "Failed to insert or retrieve comments");
    }
  });

  socket.on("disconnect", async function () {
    console.log("disconnected");
  });
});

//*************viewer & admin comment ******************/

vsp.on("connection", async function (socket) {
  console.log("viewer connected");

  //fetching user & admin com ments from here
  socket.on("fetch_comments", async function ({ viewer_id, paper_id, user }) {
    try {
      if (user === "viewer") {
        let query;
        let queryParams;

        if (viewer_id) {
          query = "SELECT * FROM viewer_comments WHERE viewer_id = ?";
          queryParams = [viewer_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
        socket.emit("comments", comments);
      } 
      else if (user === "admin") {
        let query;
        let queryParams;

        console.log("id admin ke viewer ki-", viewer_id,"paper ki id-",paper_id);

        if (viewer_id) {
          query = "SELECT * FROM viewer_comments WHERE viewer_id = ? AND paper_id = ?";
          queryParams = [viewer_id,paper_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
        socket.emit("comments", comments);
      }
    } catch (error) {
      console.error("Database error:", error);
      socket.emit("error", "Failed to retrieve comments");
    }
  });

  // Listen for an event that carries the comment data
  socket.on("new_comment", async function (data) {
    try {
      if (data.user === "viewer") {
        console.log("socket body", data.comment, data.paper_id);
        const { viewer_id, is_admin_comment, comment, paper_id } = data;

        const query =
          "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, paper_id,status) VALUES (?, ?, ?, ?,1)";

        // Use a promise-based query function for better async handling
        await new Promise((resolve, reject) => {
          pool.query(
            query,
            [viewer_id, comment, is_admin_comment, paper_id],
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        const selectQuery = "SELECT * FROM viewer_comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response);
            }
          });
        });

        // Emit the comments back to the client
        vsp.emit("comments", comments);
      } else if (data.user === "admin") {
        console.log("socket body", data.comment);
        const { viewer_id, is_admin_comment, comment, paper_id } = data;

        const query =
          "INSERT INTO viewer_comments (viewer_id, content,is_admin_comment,target_viewer_id,paper_id,status) VALUES (?, ?, ?,?,?,0) ";

        // Use a promise-based query function for better async handling
        await new Promise((resolve, reject) => {
          pool.query(
            query,
            [viewer_id, comment, is_admin_comment, viewer_id, paper_id],
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        const selectQuery = "SELECT * FROM viewer_comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) {
              reject(err);
            } else {
              resolve(response);
            }
          });
        });

        // Emit the comments back to the client
        vsp.emit("comments", comments);
      }
    } catch (error) {
      console.error("Error inserting or retrieving comments:", error);
      socket.emit("error", "Failed to insert or retrieve comments");
    }
  });

  socket.on("disconnect", async function () {
    console.log("viewer disconnected");
  });
});

server.listen(5000, () => {
  console.log("listening port 5000");
});

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

module.exports = app;
