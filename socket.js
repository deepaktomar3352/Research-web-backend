const socketIO = require("socket.io");
const pool = require("./routes/pool");
let io;

function setupSocket(server) {
  io = socketIO(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    },
  });

  const usp = io.of("/user-namespace");
  const vsp = io.of("/viewer-namespace");
  const adminNamespace = io.of("/admin-namespace");
  // User namespace
  usp.on("connection", (socket) => {
    console.log("User connected");

    socket.on("fetch_comments", async ({ user_id, paper_id, user }) => {
      try {
        let query, queryParams;
        if (user === "user") {
          query = paper_id
            ? "SELECT * FROM Comments WHERE paper_id = ?"
            : "SELECT * FROM Comments WHERE userId = ?";
          queryParams = [paper_id || user_id];
        } else if (user === "admin") {
          query = paper_id
            ? "SELECT * FROM Comments WHERE paper_id = ?"
            : "SELECT * FROM Comments WHERE userId = ?";
          queryParams = [paper_id || user_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        socket.emit("comments", comments);
      } catch (error) {
        console.error("Database error:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });

    socket.on("new_comment", async (data) => {
      try {
        const { user_id, is_admin_comment, comment, paper_id, user } = data;
        const query =
          user === "user"
            ? "INSERT INTO Comments (UserId, content, is_admin_comment, paper_id, status) VALUES (?, ?, ?, ?, 1)"
            : "INSERT INTO Comments (UserId, content, is_admin_comment, target_user_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
        const params =
          user === "user"
            ? [user_id, comment, is_admin_comment, paper_id]
            : [user_id, comment, is_admin_comment, user_id, paper_id];

        await new Promise((resolve, reject) => {
          pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const selectQuery = "SELECT * FROM Comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) reject(err);
            else resolve(response);
          });
        });

        usp.emit("comments", comments);
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  // Viewer namespace
  vsp.on("connection", (socket) => {
    console.log("Viewer connected");

    socket.on("fetch_comments", async ({ viewer_id, paper_id, user }) => {
      try {
        let query, queryParams;
        if (user === "viewer") {
          query = viewer_id
            ? "SELECT * FROM viewer_comments WHERE viewer_id = ?"
            : null;
          queryParams = [viewer_id];
        } else if (user === "admin") {
          query = viewer_id
            ? "SELECT * FROM viewer_comments WHERE viewer_id = ? AND paper_id = ?"
            : null;
          queryParams = [viewer_id, paper_id];
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        socket.emit("comments", comments);
      } catch (error) {
        console.error("Database error:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });

    socket.on("new_comment", async (data) => {
      try {
        const { viewer_id, is_admin_comment, comment, paper_id, user } = data;
        const query =
          user === "viewer"
            ? "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, paper_id, status) VALUES (?, ?, ?, ?, 1)"
            : "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, target_viewer_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
        const params =
          user === "viewer"
            ? [viewer_id, comment, is_admin_comment, paper_id]
            : [viewer_id, comment, is_admin_comment, viewer_id, paper_id];

        await new Promise((resolve, reject) => {
          pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const selectQuery = "SELECT * FROM viewer_comments WHERE paper_id = ?";
        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) reject(err);
            else resolve(response);
          });
        });

        vsp.emit("comments", comments);
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    socket.on("disconnect", () => {
      console.log("Viewer disconnected");
    });
  });

  //********* */ Handle new WebSocket connections for admin namespace********************
  adminNamespace.on("connection", (socket) => {
    console.log("Admin connected");

    // Define a function to fetch data and emit
    const fetchAndEmitData = () => {
      const sqlUserComments = `
                    SELECT c.CommentID, c.paper_id, u.id, u.firstname, u.lastname, u.userpic, c.content, c.created_at, 'user' AS commentType
                    FROM comments c
                    JOIN user_registration u ON c.UserId = u.id
                    WHERE c.is_admin_comment = 0
                `;

      const sqlViewerComments = `
                    SELECT vc.CommentID, vc.paper_id, v.id, v.firstname AS viewerName, v.lastname AS lastName, v.userpic, vc.content, vc.created_at, 'viewer' AS commentType
                    FROM viewer_comments vc
                    JOIN viewer_registration v ON vc.viewer_id = v.id
                    WHERE vc.is_admin_comment = 0
                `;

      const sqlUserCommentCount = `
                    SELECT COUNT(*) AS userCommentCount 
                    FROM comments 
                    WHERE status = 1
                `;

      const sqlViewerCommentCount = `
                    SELECT COUNT(*) AS viewerCommentCount 
                    FROM viewer_comments 
                    WHERE is_admin_comment = 0
                `;

      pool.query(sqlUserComments, (err, userComments) => {
        if (err) {
          console.error("Error fetching user comments:", err);
          return;
        }

        pool.query(sqlViewerComments, (err, viewerComments) => {
          if (err) {
            console.error("Error fetching viewer comments:", err);
            return;
          }

          pool.query(sqlUserCommentCount, (err, userCommentCountResult) => {
            if (err) {
              console.error("Error fetching user comment count:", err);
              return;
            }

            pool.query(
              sqlViewerCommentCount,
              (err, viewerCommentCountResult) => {
                if (err) {
                  console.error("Error fetching viewer comment count:", err);
                  return;
                }

                const userCommentCount =
                  userCommentCountResult[0].userCommentCount;
                const viewerCommentCount =
                  viewerCommentCountResult[0].viewerCommentCount;

                // Emit the data to the clients
                adminNamespace.emit("counter", {
                  userCommentCount,
                  viewerCommentCount,
                });

                // Optionally emit the full comments data
                adminNamespace.emit("comments", {
                  userComments,
                  viewerComments,
                });
              }
            );
          });
        });
      });
    };

    // Call the function to fetch and emit data when an admin connects
    fetchAndEmitData();

    // You can set up an interval to periodically fetch and emit data
    const interval = setInterval(fetchAndEmitData, 60000); // Every 60 seconds

    socket.on("disconnect", () => {
      console.log("Admin disconnected");
      clearInterval(interval);
    });
  });
}

function getIo() {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}

module.exports = { setupSocket, getIo };
