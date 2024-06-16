var express = require("express");
var router = express.Router();
var pool = require("./pool");
var upload = require("./multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

/*  viewer Register. */
router.post(
  "/viewer_register",
  upload.single("userImage"),
  function (req, res, next) {
    console.log("name", req.body.firstname);
    console.log("last", req.body.lastname);
    console.log("body", req.body.receiveUpdates);

    // Hash the password
    bcrypt.hash(req.body.password, 10, function (err, hash) {
      if (err) {
        console.error("Error hashing password:", err);
        return res.status(500).json({
          status: false,
          message: "Error during registration",
          error: err.message,
        });
      }

      // Insert user data into the database
      pool.query(
        "INSERT INTO viewer_registration (firstname, lastname, email, password, emailupdates, userpic,category) VALUES (?, ?, ?, ?, ?, ?,?)",
        [
          req.body.firstname,
          req.body.lastname,
          req.body.email,
          hash, // Store hashed password
          req.body.receiveUpdates,
          req.file ? req.file.originalname : null,
          req.body.category,
        ],
        (error, result) => {
          if (error) {
            console.log("SQL Error:", error);
            res.status(500).json({
              status: false,
              message: "Error during registration",
              error: error.sqlMessage,
            });
          } else {
            res.status(200).json({
              status: true,
              message: "Registered Successfully",
              result,
            });
          }
        }
      );
    });
  }
);

/* viewer login. */
router.post("/viewer_login", function (req, res) {
  const { email, password } = req.body;
  console.log("frontend", email, password);

  // Query the database for the user with the provided email
  pool.query(
    "SELECT * FROM viewer_registration WHERE email = ?",
    [email],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error during login",
          error: err.sqlMessage,
        });
      }

      if (results.length === 0) {
        // If no user is found with the given email
        return res.status(401).json({
          status: false,
          message: "Invalid email or password",
        });
      }

      const user = results[0];

      // Compare the provided password with the stored hashed password
      bcrypt.compare(password, user.password, (compareErr, isMatch) => {
        if (compareErr) {
          console.error("Error comparing passwords:", compareErr);
          return res.status(500).json({
            status: false,
            message: "Error during login",
            error: compareErr.message,
          });
        }

        if (isMatch) {
          // If passwords match, the user is successfully authenticated
          res.status(200).json({
            status: true,
            message: "Login successful",
            viewer: {
              id: user.id,
              firstname: user.firstname,
              lastname: user.lastname,
              email: user.email,
              emailupdates: user.emailupdates,
              userpic: user.userpic,
            },
          });
        } else {
          // If passwords don't match, send an error response
          res.status(401).json({
            status: false,
            message: "Invalid email or password",
          });
        }
      });
    }
  );
});

/* forgot password*/
router.post("/forgot_password", async (req, res) => {
  const { email } = req.body;

  const user = await pool.query(
    "SELECT * FROM user_registration WHERE email = ?",
    [email]
  );

  if (user.length === 0) {
    return res.status(404).json({
      status: false,
      message: "User not found",
    });
  }

  const resetToken = crypto.randomBytes(20).toString("hex"); // Generate token
  const resetTokenExpires = Date.now() + 300000; // Token expires in 5 minutes

  // Store the reset token and expiration in the database
  await pool.query(
    "UPDATE user_registration SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
    [resetToken, resetTokenExpires, email]
  );

  const resetLink = `http://localhost:3000/UserResetPassword/${resetToken}`; // Link to reset password

  // Set up email transport and send reset email
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: "deepaktomarcse2020@gmail.com",
      pass: "obwn bgma kcua vgck",
    },
  });

  const mailOptions = {
    to: email,
    from: "deepaktomarcse2020@gmail.com",
    subject: "Research Paper Password Reset",
    text: `Click the link to reset your password: ${resetLink}`,
  };

  await transporter.sendMail(mailOptions);

  res.status(200).json({
    status: true,
    message: "Password reset email sent",
  });
});

/* reset password */
router.post("/reset_password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await pool.query(
    "SELECT * FROM user_registration WHERE reset_token = ? AND reset_token_expires > ?",
    [token, Date.now()]
  );

  if (user.length === 0) {
    return res.status(400).json({
      status: false,
      message: "Invalid or expired token",
    });
  }

  const hash = await bcrypt.hash(password, 10); // Hash the new password

  await pool.query(
    "UPDATE user_registration SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = ?",
    [hash, token]
  );

  res.status(200).json({
    status: true,
    message: "Password reset successful",
  });
});

/* fetching Viewers details */
router.get("/fetchViewers", function (req, res) {
  pool.query("SELECT * FROM viewer_registration", (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving user info",
        error: err.sqlMessage,
      });
    }
    res.status(200).json({
      status: true,
      message: "Viewers data fetched successfully",
      data: results,
    });
  });
});
router.post("/viewerData_update", function (req, res) {
  const { id, updatedData } = req.body;

  if (!updatedData) {
    return res.status(400).json({
      status: false,
      message: "No data provided for update",
    });
  }
  const { firstname, lastname, email, category, userpic } = updatedData;

  if (!firstname || !lastname || !email || !category || !userpic) {
    return res.status(400).json({
      status: false,
      message: "Incomplete data provided for update",
    });
  }

  pool.query(
    "UPDATE viewer_registration SET firstname = ?, lastname = ?, email = ?, category = ?, userpic = ? WHERE id = ?",
    [firstname, lastname, email, category, userpic, id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error updating user info",
          error: err.sqlMessage,
        });
      }
      res.status(200).json({
        status: true,
        message: "User info updated successfully",
        data: results,
      });
    }
  );
});

router.post("/deleteViewer_Data", function (req, res) {
  const id = req.body.id;
  console.log("id", id);

  if (!id) {
    return res.status(400).json({
      status: false,
      message: "No ID provided for deletion",
    });
  }

  pool.query(
    "DELETE FROM viewer_registration WHERE id = ?",
    [id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error deleting viewer",
          error: err.sqlMessage,
        });
      }
      res.status(200).json({
        status: true,
        message: "Viewer deleted successfully",
        data: results,
      });
    }
  );
});

router.get("/viewer_info", function (req, res) {
  const category = req.query.category;

  console.log("Category:", category);

  pool.query(
    "SELECT id, firstname, lastname, userpic FROM viewer_registration WHERE category = ?",
    [category],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving user info",
          error: err.sqlMessage,
        });
      }

      // Return the selected data as JSON
      res.status(200).json({
        status: true,
        message: "Viewer info retrieved successfully",
        viewer: results, // The array of results with the selected columns
      });
    }
  );
});
// fetch viewers details from sharedviewers table
router.post("/selectedviewer_info", function (req, res) {
  const paperId = req.body.paperId; // Access paperId from request body

  console.log("Paper ID:", paperId);

  pool.query(
    `SELECT 
       viewers_id
     FROM 
       sharedpaper_viewers 
     WHERE 
       paper_id = ?`,
    [paperId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving shared paper info",
          error: err.sqlMessage,
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          status: false,
          message: "No viewers found for this paper",
        });
      }

      const viewersIdString = results[0].viewers_id;
      const viewersIds = viewersIdString
        .split(",")
        .map((id) => parseInt(id, 10));

      pool.query(
        `SELECT 
           id AS viewer_id, 
           firstname, 
           lastname, 
           userpic
         FROM 
           viewer_registration 
         WHERE 
           id IN (?)`,
        [viewersIds],
        (err, viewerResults) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              message: "Error retrieving viewer info",
              error: err.sqlMessage,
            });
          }

          res.status(200).json({
            status: true,
            message: "Viewer info retrieved successfully",
            data: viewerResults, // The array of viewer results with the selected columns
          });
        }
      );
    }
  );
});
// insert viewers and paper id in sharedviewers table
router.post("/sharedPaper_viewers", (req, res) => {
  const { paper_id, viewer_id, sharedat, sharedby } = req.body;

  if (
    !paper_id ||
    !Array.isArray(viewer_id) ||
    viewer_id.length === 0 ||
    !sharedat ||
    !sharedby
  ) {
    return res.status(400).json({
      status: false,
      message:
        "All fields are required and viewer_id must be a non-empty array",
    });
  }

  // Convert the viewer_id array to a comma-separated string
  const viewers_id_str = viewer_id.join(",");

  // Insert or update the database
  pool.query(
    `INSERT INTO sharedpaper_viewers (paper_id, viewers_id, sharedat, sharedby)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     viewers_id = VALUES(viewers_id),
     sharedat = VALUES(sharedat), sharedby = VALUES(sharedby)`,
    [paper_id, viewers_id_str, sharedat, sharedby],
    (error, result) => {
      if (error) {
        console.error("SQL Error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during registration",
          error: error.sqlMessage,
        });
      } else {
        return res.status(200).json({
          status: true,
          message: "Shared viewers saved successfully",
          result: result,
        });
      }
    }
  );
});

// sending paper details from admin to viewer
router.post("/send_paper", (req, res) => {
  console.log("Request body:", req.body);

  // Extract paper_id from the request body
  const { paper_id } = req.body;

  // If viewer_id is an array, insert each viewer_id separately
  if (Array.isArray(req.body.viewer_id)) {
    req.body.viewer_id.forEach((viewer_id) => {
      const sql =
        "INSERT INTO viewer_paper_relationship (viewer_id, paper_id) VALUES (?, ?)";
      const values = [viewer_id, paper_id];

      pool.query(sql, values, (err, result) => {
        if (err) {
          console.error("Error inserting data: ", err);
          return res.status(500).send("Error inserting data");
        }
        console.log("Data inserted successfully for viewer_id:", viewer_id);
      });
    });
    // Respond with success message after all insertions are completed
    res.status(200).send("Data inserted successfully for all viewer_ids");
  } else {
    // If viewer_id is not an array, insert it directly
    const sql =
      "INSERT INTO viewer_paper_relationship (viewer_id, paper_id) VALUES (?, ?)";
    const values = [req.body.viewer_id, paper_id];

    // Execute the query
    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error inserting data: ", err);
        return res.status(500).send("Error inserting data");
      }
      console.log(
        "Data inserted successfully for viewer_id:",
        req.body.viewer_id
      );

      // Respond with success message
      res.status(200).send("Data inserted successfully");
    });
  }
});

// retreiving data for viewer dashboard
router.get("/viewer_paper_data", (req, res) => {
  const sql = `
    SELECT p.*
    FROM viewer_paper_relationship AS vpr
    INNER JOIN paper_submission AS p ON vpr.paper_id = p.id
    WHERE vpr.viewer_id = ?
  `;

  // Execute the query with the viewer_id as a parameter
  pool.query(sql, [viewer_id], (err, result) => {
    if (err) {
      console.error("Error fetching data: ", err);
      return res.status(500).send("Error fetching data");
    }

    // If data is fetched successfully, send the data in the response
    res.status(200).json(result);
  });
});

router.post("/remove_viewer_id_from_sharedviewer_table", (req, res) => {
  const viewer_id = req.body.viewers_id;
  const paper_id = req.body.paper_id;
  console.log("viewer id",viewer_id)
  console.log("paper id",paper_id)

  if (!viewer_id || !paper_id) {
    return res.status(400).json({
      status: false,
      message: "viewers_id and paper_id are required",
    });
  }

  // Update the viewers_id field to remove the specified viewer_id
  pool.query(
    `UPDATE sharedpaper_viewers 
     SET viewers_id = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', viewers_id, ','), CONCAT(',', ?, ','), ','))
     WHERE FIND_IN_SET(?, viewers_id) > 0 AND paper_id = ?`,
    [viewer_id, viewer_id, paper_id],
    (updateErr, updateResults) => {
      if (updateErr) {
        console.error("SQL Error:", updateErr);
        return res.status(500).json({
          status: false,
          message: "Error updating viewers_id",
          error: updateErr.sqlMessage,
        });
      }

      if (updateResults.affectedRows > 0) {
        // Select the updated row to check if viewers_id is empty
        pool.query(
          `SELECT viewers_id FROM sharedpaper_viewers WHERE paper_id = ?`,
          [paper_id],
          (selectErr, selectResults) => {
            if (selectErr) {
              console.error("SQL Error:", selectErr);
              return res.status(500).json({
                status: false,
                message: "Error selecting updated row",
                error: selectErr.sqlMessage,
              });
            }

            if (
              selectResults.length > 0 &&
              selectResults[0].viewers_id === ""
            ) {
              // Delete the row if viewers_id is empty
              pool.query(
                `DELETE FROM sharedpaper_viewers WHERE paper_id = ?`,
                [paper_id],
                (deleteErr, deleteResults) => {
                  if (deleteErr) {
                    console.error("SQL Error:", deleteErr);
                    return res.status(500).json({
                      status: false,
                      message: "Error deleting row",
                      error: deleteErr.sqlMessage,
                    });
                  }

                  // Successfully deleted the row
                  return res.status(200).json({
                    status: true,
                    message: "Row deleted successfully as viewers_id is empty",
                  });
                }
              );
            } else {
              // Successfully updated the viewers_id
              return res.status(200).json({
                status: true,
                message: `Viewer ID ${viewer_id} removed successfully from shared papers`,
                affectedRows: updateResults.affectedRows,
              });
            }
          }
        );
      } else {
        // No rows were affected by the update
        return res.status(200).json({
          status: true,
          message: "No matching viewers_id found for update",
        });
      }
    }
  );
});

router.post("/shared_paper_details", (req, res) => {
  const viewer_id = req.body.viewers_id;
  console.log("viewers id", viewer_id);

  if (!viewer_id) {
    return res.status(400).json({
      status: false,
      message: "viewers_id is required",
    });
  }

  // First query to get the distinct paper_ids based on viewer_id
  pool.query(
    `SELECT DISTINCT paper_id FROM sharedpaper_viewers WHERE FIND_IN_SET(?, viewers_id) > 0`,
    [viewer_id],
    (err, sharedResults) => {
      if (err) {
        console.error("SQL Error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving paper IDs",
          error: err.sqlMessage,
        });
      }

      if (sharedResults.length === 0) {
        return res.status(404).json({
          status: false,
          message: "No shared papers found for the provided viewer_id",
        });
      }

      const paperIds = sharedResults.map((row) => row.paper_id);

      // Second query to get paper details from the papersubmission table based on the paper_ids
      pool.query(
        `SELECT 
          id, paper_title, research_area, paper_uploaded, mimetype, paper_keywords, paper_abstract, address_line_one, address_line_two, city, postal_code, submitted_by, submission_date, updated_at, paper_status, category, status
         FROM 
          paper_submission 
         WHERE 
          id IN (?)`,
        [paperIds],
        (error, paperResults) => {
          if (error) {
            console.error("SQL Error:", error);
            return res.status(500).json({
              status: false,
              message: "Error retrieving paper details",
              error: error.sqlMessage,
            });
          }

          return res.status(200).json({
            status: true,
            message: "Paper details retrieved successfully",
            data: paperResults,
          });
        }
      );
    }
  );
});

// save comments in table
router.post("/send_comment", (req, res) => {
  const {
    viewer_id: viewer_id,
    is_admin_comment,
    comment,
    paper_id,
  } = req.body;

  const query = `INSERT INTO viewer_comments (viewer_id, content,is_admin_comment,paper_id) VALUES (?, ?, ?,?)  `;

  pool.query(
    query,
    [viewer_id, comment, is_admin_comment, paper_id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error submitting comment",
          error: err.sqlMessage || err.message,
        });
      }

      res.status(200).json({
        status: true,
        message: "Comment submitted successfully",
        data: result,
      });
    }
  );
});

//fetching user comments
router.post("/viewer_comment", (req, res) => {
  const viewer_id = req.body.viewer_id;
  const paper_id = req.body.paper_id;

  let query;
  let queryParams;

  if (viewer_id && paper_id) {
    // If paper_id is provided, fetch comments by paper_id
    query =
      "SELECT * FROM viewer_comments WHERE (target_viewer_id = ? OR viewer_id = ?) AND paper_id = ?";
    queryParams = [viewer_id, viewer_id, paper_id];
  }

  pool.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving comments",
        error: err.sqlMessage || err.message,
      });
    }

    res.status(200).json({
      status: true,
      message: "Comments retrieved successfully",
      data: results,
    });
  });
});

// Endpoint to get the count of new comments for a given paper since the last seen timestamp
router.get("/new_count", (req, res) => {
  const query =
    "SELECT paper_id, COUNT(*) as count FROM viewer_comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving new admin comments",
        error: err.sqlMessage || err.message,
      });
    }

    res.status(200).json({ counts: results });
  });
});

router.post("/reset_count", (req, res) => {
  const { paperid } = req.body;
  console.log("resetid", paperid);
  // Update the status for the given paper_id
  const query = "UPDATE viewer_comments SET status = 1 WHERE paper_id = ?";
  const queryParams = [paperid];

  pool.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error updating comment status",
        error: err.sqlMessage || err.message,
      });
    }

    res.status(200).json({ message: "Comment status updated successfully" });
  });
});

//fetching admin comments

router.post("/admin_comment", (req, res) => {
  const viewer_id = req.body.viewer_id;
  const paper_id = req.body.paper_id;

  // Validate input
  if (!viewer_id || !paper_id) {
    return res.status(400).json({
      status: false,
      message: "viewer_id and paper_id are required",
    });
  }

  const query =
    "SELECT * FROM viewer_comments WHERE viewer_id = ? AND paper_id = ?";

  pool.query(query, [viewer_id, paper_id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving comments",
        error: err.sqlMessage || err.message,
      });
    }

    res.status(200).json({
      status: true,
      message: "Comments retrieved successfully",
      data: results,
    });
  });
});

router.post("/send_admin_comment", (req, res) => {
  const { viewer_id, is_admin_comment, comment, paper_id } = req.body;
  console.log("body messages", req.body);

  const query = `INSERT INTO viewer_comments (viewer_id, content, is_admin_comment, target_viewer_id,paper_id, status) VALUES (?, ?, ?, ?,?, 0)`;

  pool.query(
    query,
    [viewer_id, comment, is_admin_comment, viewer_id, paper_id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error submitting comment",
          error: err.sqlMessage || err.message,
        });
      }

      res.status(200).json({
        status: true,
        message: "Comment submitted successfully",
        data: result,
      });
    }
  );
});
``;

module.exports = router;
