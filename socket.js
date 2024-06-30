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
  //**************** */ User namespace************************************************
  usp.on("connection", (socket) => {
    console.log("User connected");
    

    socket.on("fetch_comments", async ({ user_id, paper_id, user }) => {
      try {
        let query, queryParams;

        // Fetch comments for a specific paper of the user
        query = "SELECT * FROM Comments WHERE paper_id = ? AND userId = ?";
        queryParams = [paper_id, user_id];

        const fetchComments = async () => {
          try {
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
        };

           // Call fetchComments immediately
           await fetchComments();
    
           // Poll for new comments every second
           const interval = setInterval(fetchComments, 100);
       
           // Stop polling if socket disconnects
           socket.on("disconnect", () => {
             clearInterval(interval);
           });

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

        usp.emit("comments", comments);
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });

    // Function to query the database and emit the comment count
    const checkForNewComments = () => {
      const query =
        "SELECT paper_id, COUNT(*) as count FROM Comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";

      pool.query(query, (err, results) => {
        if (err) {
          console.error("Database error:", err);
          socket.emit("error", {
            status: false,
            message: "Error retrieving new admin comments",
            error: err.sqlMessage || err.message,
          });
          return;
        }

        socket.emit("comment_count", results);
      });
    };

    // Immediately check for new comments when the user connects
    checkForNewComments();

    // Set up an interval to check for new comments every second
    const commentCheckInterval = setInterval(checkForNewComments, 1000);

    socket.on("user_reset_comment_count", (data) => {
      console.log("reset comment count id", data);
      const query =
        "UPDATE Comments SET status = 1 WHERE paper_id = ? AND is_admin_comment = 1 AND status = 0";
      const queryParams = [data];

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
        socket.emit("user_comment_count", results);

        // After updating the status, immediately check for new comments and emit the count
        checkForNewComments();
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  //************ */ Viewer namespace***************************************************
  vsp.on("connection", (socket) => {
    console.log("Viewer connected");

    socket.on("fetch_comments", async ({ viewer_id, paper_id, user }) => {
      try {
        let query, queryParams;
        
          query = "SELECT * FROM viewer_comments WHERE viewer_id = ?";
          queryParams = [viewer_id];
     
          const fetchComments = async () => {
            try {
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
          };

            // Call fetchComments immediately
            await fetchComments();
    
            // Poll for new comments every second
            const interval = setInterval(fetchComments, 100);
        
            // Stop polling if socket disconnects
            socket.on("disconnect", () => {
              clearInterval(interval);
            });
      
       
      } catch (error) {
        console.error("Database error:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });


    socket.on("new_comment", async (data) => {
      try {
        const { viewer_id, comment, paper_id, user } = data;
        const query ="INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, paper_id, status) VALUES (?, ?, ?, ?, 1)";
        const params = [viewer_id, comment, 0, paper_id]
           

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
                adminNamespace.emit("new_comments", {
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

    // // You can set up an interval to periodically fetch and emit dat
    const interval = setInterval(fetchAndEmitData, 600); // Every 6 seconds

    socket.on("fetch_comments", async ({ user_id, paper_id, user,viewer_id }) => {
      try {
        let query, queryParams;
    
        if (user === "user") {
          // Admin fetches comments for a specific paper of a specific user
          query = "SELECT * FROM Comments WHERE paper_id = ? AND userId = ?";
        } else if (user === "viewer") {
          // Admin fetches viewer comments for a specific paper
          query = "SELECT * FROM Viewer_Comments WHERE paper_id = ?";
          queryParams = [paper_id,viewer_id || user_id];
        } else {
          throw new Error("Invalid user type specified");
        }
    
        const fetchComments = async () => {
          try {
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
        };
    
        // Call fetchComments immediately
        await fetchComments();
    
        // Poll for new comments every second
        const interval = setInterval(fetchComments, 100);
    
        // Stop polling if socket disconnects
        socket.on("disconnect", () => {
          clearInterval(interval);
        });
    
      } catch (error) {
        console.error("Error fetching comments:", error);
        socket.emit("error", "Failed to retrieve comments");
      }
    });
    
    

    socket.on("new_comment", async (data) => {
      try {
        const { user_id, comment, paper_id, user,viewer_id } = data;
        let query, params;
    
        if (user === "user") {
          // Insert comment into Comments table
          query = "INSERT INTO comments (UserId, content, is_admin_comment, target_user_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
          params = [user_id, comment, 1, user_id, paper_id];
        } else if (user === "viewer") {
          // Insert comment into Viewer_Comments table
          query = "INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, target_viewer_id, paper_id, status) VALUES (?, ?, ?, ?, ?, 0)";
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
    
        adminNamespace.emit("comments", comments);
    
      } catch (error) {
        console.error("Error inserting or retrieving comments:", error);
        socket.emit("error", "Failed to insert or retrieve comments");
      }
    });
    

    socket.on("uncount_admin_notification", (data) => {
      console.log("data", data.CommentID);
    
      // Assuming 'userType' is a variable indicating whether the user is an admin or a viewer
      // Replace 'userType' with your actual logic to determine if the user is an admin or viewer
      let userType = data.commentType; // Assuming you receive this from somewhere
    
      let sqlQuery;
      if (userType === 'user') {
        // Update status for admin comments
        sqlQuery = "UPDATE Comments SET status = 0 WHERE CommentID = ? AND is_admin_comment = 1 AND status = 1";
      } else if (userType === 'viewer') {
        // Update status for viewer comments
        sqlQuery = "UPDATE viewer_comments SET status = 0 WHERE CommentID = ? AND is_admin_comment = 0 AND status = 1";
      } else {
        // Handle other cases if needed
        console.log("Unknown user type:", userType);
        return; // Exit early or handle accordingly
      }
    
      // Execute the SQL query
      pool.query(sqlQuery, [data.CommentID], (err, result) => {
        if (err) {
          console.error("Error updating comment status:", err);
        } else {
          console.log("Comment status updated successfully:", result);
          // Optionally, you can emit a success message or perform other actions
        }
      });
    });
    

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

// Emit the data to the clients
//   io.of("/admin-namespace").emit("counter", {
//     userCommentCount,
//     viewerCommentCount,
//   });
