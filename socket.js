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

  let adminCurrentPaperId = null;
  const usp = io.of("/user-namespace");
  const vsp = io.of("/viewer-namespace");
  const adminNamespace = io.of("/admin-namespace");
  //**************** */ User namespace************************************************
  usp.on("connection", (socket) => {
    console.log("User connected");

    socket.on("fetch_user_comments", async ({ paper_id, user_id }) => {
      try {
        console.log("Received paper_id:", paper_id);
        console.log("Received user_id:", user_id);
        let query, queryParams;

        if (paper_id) {
          // Fetch comments for a specific paper
          query = "SELECT * FROM Comments WHERE paper_id = ?";
          queryParams = [paper_id];
        } else if (user_id) {
          // Fetch comments for a specific user
          query = "SELECT * FROM Comments WHERE userId = ?";
          queryParams = [user_id];
        } else {
          throw new Error("Invalid paper_id and user_id");
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

        usp.emit("user_comments", comments);

        const userquery =
          "SELECT paper_id, COUNT(*) as count FROM Comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";
        // Fetch the count of new admin comments and emit it
        const userCommentCounts = await new Promise((resolve, reject) => {
          pool.query(userquery, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        usp.emit("comment_count", userCommentCounts);
      } catch (error) {
        console.error("Database error:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });

    socket.on("new_comment", async (data) => {
      try {
        const { user_id, comment, paper_id } = data;
        let query, params;
        query =
          "INSERT INTO Comments (UserId, content, is_admin_comment, paper_id, status) VALUES (?, ?, ?, ?, 1)";
        params = [user_id, comment, 0, paper_id];

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
        // Emit only if the paper_id matches the admin's current paper_id
        usp.emit("user_comments", comments);
        if (paper_id === adminCurrentPaperId) {
          adminNamespace.emit("user_comments", comments);
        }
        const sqlUserComments = `
        SELECT c.CommentID,c.status, c.paper_id, u.id, u.firstname, u.lastname, u.userpic, c.content, c.created_at, 'user' AS commentType
        FROM comments c
        JOIN user_registration u ON c.UserId = u.id
        WHERE c.is_admin_comment = 0
    `;

        const sqlViewerComments = `
        SELECT vc.CommentID,vc.status, vc.paper_id, v.id AS Viewer_id, v.firstname AS viewerName, v.lastname AS lastName, v.userpic, vc.content, vc.created_at, 'viewer' AS commentType
        FROM viewer_comments vc
        JOIN viewer_registration v ON vc.viewer_id = v.id
        WHERE vc.is_admin_comment = 0
    `;

        const sqlUserCommentCount = `
        SELECT COUNT(*) AS userCommentCount
        FROM comments
        WHERE is_admin_comment =0 AND status = 1
    `;

        const sqlViewerCommentCount = `
        SELECT COUNT(*) AS viewerCommentCount
        FROM viewer_comments
        WHERE is_admin_comment =0 AND status = 1
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
                  adminNamespace.emit("notification_comments", {
                    userComments,
                    viewerComments,
                  });
                }
              );
            });
          });
        });
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    socket.on("user_reset_comment_count", (data) => {
      const { paper_id } = data;
      console.log("reset comment count id", paper_id);
      const query =
        "UPDATE Comments SET status = 1 WHERE paper_id = ? AND is_admin_comment = 1 AND status = 0";
      const queryParams = [paper_id];

      pool.query(query, queryParams, (err, results) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Error updating comment status",
            error: err.sqlMessage || err.message,
          });
        }

        // Emit the update confirmation if needed
        usp.emit("user_comment_count", results);
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  //************ */ Viewer namespace***************************************************
  vsp.on("connection", (socket) => {
    console.log("Viewer connected");

    socket.on("fetch_viewer_comments", async ({ viewer_id, paper_id }) => {
      try {
        console.log("Received viewer paper_id:", paper_id);
        console.log("Received viewer user_id:", viewer_id);
        let query, queryParams;

        if (paper_id) {
          query = "SELECT * FROM viewer_comments WHERE paper_id = ?";
          queryParams = [paper_id];
        } else if (viewer_id) {
          query = "SELECT * FROM viewer_comments WHERE viewer_id = ?";
          queryParams = [viewer_id];
        } else {
          throw new Error("Invalid paper_id and user_id");
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(query, queryParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        vsp.emit("viewer_comments", comments);

        const userquery =
          "SELECT paper_id, COUNT(*) as count FROM viewer_comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";
        // Fetch the count of new admin comments and emit it
        const viewerCommentCounts = await new Promise((resolve, reject) => {
          pool.query(userquery, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        usp.emit("viewer_comment_count", viewerCommentCounts);
      } catch (error) {
        console.error("Database error:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });

    socket.on("new_viewer_comment", async (data) => {
      try {
        const { viewer_id, comment, paper_id, user } = data;
        const query =
          "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, paper_id, status) VALUES (?, ?, ?, ?, 1)";
        const params = [viewer_id, comment, 0, paper_id];

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

        vsp.emit("viewer_comments", comments);
        if (paper_id === adminCurrentPaperId) {
          adminNamespace.emit("viewer_comments", comments);
        }

        const sqlUserComments = `
        SELECT c.CommentID,c.status, c.paper_id, u.id, u.firstname, u.lastname, u.userpic, c.content, c.created_at, 'user' AS commentType
        FROM comments c
        JOIN user_registration u ON c.UserId = u.id
        WHERE c.is_admin_comment = 0
    `;

        const sqlViewerComments = `
        SELECT vc.CommentID,vc.status, vc.paper_id, v.id AS Viewer_id, v.firstname AS viewerName, v.lastname AS lastName, v.userpic, vc.content, vc.created_at, 'viewer' AS commentType
        FROM viewer_comments vc
        JOIN viewer_registration v ON vc.viewer_id = v.id
        WHERE vc.is_admin_comment = 0
    `;

        const sqlUserCommentCount = `
        SELECT COUNT(*) AS userCommentCount
        FROM comments
        WHERE is_admin_comment =0 AND status = 1
    `;

        const sqlViewerCommentCount = `
        SELECT COUNT(*) AS viewerCommentCount
        FROM viewer_comments
        WHERE is_admin_comment =0 AND status = 1
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
                  adminNamespace.emit("notification_comments", {
                    userComments,
                    viewerComments,
                  });
                }
              );
            });
          });
        });
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    socket.on("viewer_reset_comment_count", (data) => {
      const { paper_id } = data;
      console.log("reset comment count id", paper_id);
      const query =
        "UPDATE viewer_comments SET status = 1 WHERE paper_id = ? AND is_admin_comment = 1 AND status = 0";
      const queryParams = [paper_id];

      pool.query(query, queryParams, (err, results) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Error updating comment status",
            error: err.sqlMessage || err.message,
          });
        }

        // Emit the update confirmation if needed
        vsp.emit("viewer_comment_count", results);
      });
    });

    socket.on("disconnect", () => {
      console.log("Viewer disconnected");
    });
  });

  //********* */ Handle new WebSocket connections for admin namespace********************
  adminNamespace.on("connection", (socket) => {
    console.log("Admin connected");

    const sqlUserComments = `
                    SELECT c.CommentID,c.status, c.paper_id, u.id, u.firstname, u.lastname, u.userpic, c.content, c.created_at, 'user' AS commentType
                    FROM comments c
                    JOIN user_registration u ON c.UserId = u.id
                    WHERE c.is_admin_comment = 0
                `;

    const sqlViewerComments = `
                    SELECT vc.CommentID,vc.status, vc.paper_id, v.id AS Viewer_id, v.firstname AS viewerName, v.lastname AS lastName, v.userpic, vc.content, vc.created_at, 'viewer' AS commentType
                    FROM viewer_comments vc
                    JOIN viewer_registration v ON vc.viewer_id = v.id
                    WHERE vc.is_admin_comment = 0
                `;

    const sqlUserCommentCount = `
                    SELECT COUNT(*) AS userCommentCount
                    FROM comments
                    WHERE is_admin_comment =0 AND status = 1
                `;

    const sqlViewerCommentCount = `
                    SELECT COUNT(*) AS viewerCommentCount
                    FROM viewer_comments
                    WHERE is_admin_comment =0 AND status = 1
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

          pool.query(sqlViewerCommentCount, (err, viewerCommentCountResult) => {
            if (err) {
              console.error("Error fetching viewer comment count:", err);
              return;
            }

            const userCommentCount = userCommentCountResult[0].userCommentCount;
            const viewerCommentCount =
              viewerCommentCountResult[0].viewerCommentCount;

            // Emit the data to the clients
            adminNamespace.emit("counter", {
              userCommentCount,
              viewerCommentCount,
            });

            // Optionally emit the full comments data
            adminNamespace.emit("notification_comments", {
              userComments,
              viewerComments,
            });
          });
        });
      });
    });

    socket.on(
      "fetch_admin_comments",
      async ({ user_id, paper_id, user, viewer_id }) => {
        try {
          let query, queryParams;

          if (user === "user") {
            // Admin fetches comments for a specific paper of a specific user
            query = "SELECT * FROM comments WHERE paper_id = ? AND UserId = ?";
            queryParams = [paper_id, user_id];
          } else if (user === "viewer") {
            // Admin fetches viewer comments for a specific paper
            query =
              "SELECT * FROM viewer_comments WHERE paper_id = ? AND viewer_id = ?";
            queryParams = [paper_id, viewer_id];
          } else {
            throw new Error("Invalid user type specified");
          }

          const comments = await new Promise((resolve, reject) => {
            pool.query(query, queryParams, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          if (user === "user") {
            adminCurrentPaperId = paper_id;
            adminNamespace.emit("user_comments", comments);
          } else if (user === "viewer") {
            console.log("viewr", user);
            adminCurrentPaperId = paper_id;
            adminNamespace.emit("viewer_comments", comments);
          }
        } catch (error) {
          console.error("Error fetching comments:", error);
          socket.emit("error", "Failed to retrieve comments");
        }
      }
    );

    socket.on("new_comment", async (data) => {
      try {
        const { user_id, comment, paper_id, user, viewer_id } = data;
        let query, params;

        if (user === "user") {
          // Insert comment into Comments table
          query =
            "INSERT INTO comments (UserId, content, is_admin_comment, target_user_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
          params = [user_id, comment, 1, user_id, paper_id];
        } else if (user === "viewer") {
          // Insert comment into Viewer_Comments table
          query =
            "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, target_viewer_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
          params = [viewer_id, comment, 1, viewer_id, paper_id];
        } else {
          throw new Error("Invalid user type specified");
        }

        // Execute the insert query
        await new Promise((resolve, reject) => {
          pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        // Fetch comments after insertion
        let selectQuery;
        if (user === "user") {
          selectQuery = "SELECT * FROM Comments WHERE paper_id = ?";
        } else if (user === "viewer") {
          selectQuery = "SELECT * FROM Viewer_Comments WHERE paper_id = ?";
        }

        const comments = await new Promise((resolve, reject) => {
          pool.query(selectQuery, [paper_id], (err, response) => {
            if (err) reject(err);
            else resolve(response);
          });
        });

        // Emit comments to respective namespaces based on user type
        if (user === "user") {
          adminNamespace.emit("user_comments", comments);
          usp.emit("user_comments", comments);
        } else if (user === "viewer") {
          adminNamespace.emit("viewer_comments", comments);
          vsp.emit("viewer_comments", comments);
        }

        if (user === "user") {
          const query =
            "SELECT paper_id, COUNT(*) as count FROM Comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";
          // Fetch the count of new admin comments and emit it
          const userCommentCounts = await new Promise((resolve, reject) => {
            pool.query(query, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          usp.emit("comment_count", userCommentCounts);
        } else if (user === "viewer") {
          const query =
            "SELECT paper_id, COUNT(*) as count FROM viewer_comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";
          // Fetch the count of new admin comments and emit it
          const userCommentCounts = await new Promise((resolve, reject) => {
            pool.query(query, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          vsp.emit("comment_count", userCommentCounts);
        }
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    socket.on("uncount_admin_notification", (data) => {
      const { commentType, CommentID } = data;

      let sqlQuery;
      if (commentType === "user") {
        sqlQuery =
          "UPDATE Comments SET status = 0 WHERE CommentID = ? AND is_admin_comment = 0 AND status = 1";
      } else if (commentType === "viewer") {
        sqlQuery =
          "UPDATE Viewer_Comments SET status = 0 WHERE CommentID = ? AND is_admin_comment = 0 AND status = 1";
      } else {
        console.log("Unknown user type:", commentType);
        return;
      }

      // Execute the SQL query
      pool.query(sqlQuery, [CommentID], (err, result) => {
        if (err) {
          console.error("Error updating comment status:", err);
        } else {
          if (result.affectedRows > 0) {
            console.log("Comment status updated successfully:", result);
          } else {
            console.log("No rows matched the update criteria.");
          }
        }
      });
    });

    socket.on("disconnect", () => {
      console.log("Admin disconnected");
      // clearInterval(interval);
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

// Emit the data to the clients
//   io.of("/admin-namespace").emit("counter", {
//     userCommentCount,
//     viewerCommentCount,
//   });
