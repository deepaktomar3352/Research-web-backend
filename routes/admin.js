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
      "UPDATE comments SET status = 0 WHERE CommentID = ?",
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
    "SELECT * FROM admin WHERE admin_email = ? AND admin_password = ?",
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

module.exports = router;
