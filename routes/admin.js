const express = require("express");
const router = express.Router();
const pool = require("./pool");
const { getIo } = require("../socket"); // Ensure this path is correct

// API to set count status in comment table for admin
router.post("/uncount_admin_notification", (req, res) => {
  const { CommentID, commentType } = req.body; // Ensure the property name matches the data you receive
  console.log("req.body:", req.body); // Log the entire req.body to check its structure
  if (commentType === "user") {
    pool.query(
      "UPDATE Comments SET status = 0 WHERE CommentID = ? AND is_admin_comment = 0 AND status = 1",
      [CommentID],
      (err, result) => {
        if (err) {
          console.error("Error updating comment status:", err);
          return;
        } else {
          res.status(200).json({
            status: true,
            message: "status change successfully",
            data: result,
          });
          console.log("counter", result);
        }
      }
    );
  } else if (commentType === "viewer") {
    pool.query(
      "UPDATE viewer_comments SET status = 0 WHERE CommentID = ?",
      [CommentID],
      (err, result) => {
        if (err) {
          console.error("Error updating comment status:", err);
          return;
        } else {
          res.status(200).json({
            status: true,
            message: "status change successfully",
            data: result,
          });
          console.log("counter", result);
        }
      }
    );
  }
});

router.post("/admin_login", function (req, res) {
  const { email, password } = req.body;

  // Query the database for the user with the provided email
  pool.query(
    "SELECT * FROM `admin` WHERE admin_email = ? AND admin_password = ?",
    [email, password],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error during SignIn",
          error: err.sqlMessage,
        });
      } else {
        return res.status(200).json({
          status: true,
          message: "Admin SignIn Succesfully",
          admin: results,
        });
      }
    }
  );
});
router.post("/fetch_admin_profile", function (req, res) {
  pool.query(
    "SELECT * FROM `admin` WHERE id = ?",
    [req.body.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving admin info",
          error: err.sqlMessage,
        });
      }

      // Check if any admin data was found
      if (results.length === 0) {
        return res.status(404).json({
          status: false,
          message: "Admin not found",
        });
      }

      // Return the selected data as JSON
      res.status(200).json({
        status: true,
        message: "Admin info retrieved successfully",
        data: results[0], // Return the first (and should be the only) admin record
      });
    }
  );
});


module.exports = router;
