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

router.post("/fetchAccording_To_Paper_Status_for_admin", async (req, res) => {
  const paper_status = req.body.paper_status;
  // Input validation
  if (!paper_status) {
    return res.status(400).json({
      status: false,
      message: "Paper status is required",
    });
  }

  try {
    // Fetch papers with the specified status
    const paperQuery = "SELECT * FROM paper_submission WHERE paper_status = ?";
    pool.query(paperQuery, [paper_status], async (err, paperResult) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving articles",
          error: err.sqlMessage || err.message,
        });
      }


      if (paperResult.length === 0) {
        return res.status(404).json({
          status: false,
          message: `No papers found with status '${paper_status}'`,
        });
      }

      const userIds = [
        ...new Set(paperResult.map((paper) => paper.submitted_by)),
      ];

      // Fetch user data for the extracted user IDs
      const userQuery = "SELECT * FROM user_registration WHERE id IN (?)";
      pool.query(userQuery, [userIds], (err, userResult) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Error retrieving user data",
            error: err.sqlMessage || err.message,
          });
        }

        // Return the retrieved data
        res.status(200).json({
          status: true,
          message: "Papers and user data retrieved successfully",
          papers: paperResult,
          users: userResult,
        });
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      status: false,
      message: "Unexpected error retrieving paper",
      error: error.message,
    });
  }
});

router.post("/updateAdminPaperStatus", (req, res) => {
  const paper_id = req.body.paper_id;
  const status = req.body.status;

  console.log("paperid", paper_id);
  console.log("staus", status);

  if (!paper_id || !status) {
    return res.status(400).json({
      status: false,
      message: "Both paper_id and status are required",
    });
  }

  // Update the database
  pool.query(
    `UPDATE paper_submission SET paper_status = ? WHERE id = ?`,
    [status, paper_id],
    (error, result) => {
      if (error) {
        console.error("SQL Error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during status update",
          error: error.sqlMessage,
        });
      } else {
        if (result.affectedRows > 0) {
          return res.status(200).json({
            status: true,
            message: "Paper status updated successfully",
            result: result,
          });
        } else {
          return res.status(404).json({
            status: false,
            message: "Paper not found",
          });
        }
      }
    }
  );
});

router.post("/deleteAdmin_paper", (req, res) => {
  const paper_id = req.body.paper_id;

  const deleteCommentsQuery = "DELETE FROM comments WHERE paper_id = ?";
  const deleteViewersCommentsQuery =
    "DELETE FROM viewer_comments WHERE paper_id = ?";
  const deleteAdminPaperQuery = "DELETE FROM paper_submission WHERE id = ?";
  const deletePaperFrom_AdminRelationTableQuery =
    "DELETE FROM admin_paper_relation WHERE paper_id = ?";

  // Deleting comments
  pool.query(deleteCommentsQuery, [paper_id], (error, results) => {
    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({
        status: false,
        message: "Error deleting comments",
        error: error.sqlMessage || error.message,
      });
    }

    // Deleting viewers comments
    pool.query(deleteViewersCommentsQuery, [paper_id], (error, results) => {
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({
          status: false,
          message: "Error deleting viewers comments",
          error: error.sqlMessage || error.message,
        });
      }

      // Deleting admin-paper relation
      pool.query(deleteAdminPaperQuery, [paper_id], (error, results) => {
        if (error) {
          console.error("Database error:", error);
          return res.status(500).json({
            status: false,
            message: "Error deleting admin-paper relation",
            error: error.sqlMessage || error.message,
          });
        }
        pool.query(
          deletePaperFrom_AdminRelationTableQuery,
          [paper_id],
          (error, results) => {
            if (error) {
              console.error("Database error:", error);
              return res.status(500).json({
                status: false,
                message: "Error deleting admin-paper relation",
                error: error.sqlMessage || error.message,
              });
            }

            if (results.affectedRows === 0) {
              // If no rows were deleted, the paper_id was not found
              return res.status(404).json({
                status: false,
                message:
                  "No admin-paper relation found with the given paper_id",
              });
            }

            res.status(200).json({
              status: true,
              message:
                "Admin-paper relation and associated comments deleted successfully",
            });
          }
        );
      });
    });
  });
});


module.exports = router;
