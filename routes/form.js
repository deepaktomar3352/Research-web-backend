var express = require("express");
var router = express.Router();
var pool = require("./pool");
var upload = require("./multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
router.use(bodyParser.json());
// Handle the file upload and data insertion
router.post("/upload_paper", upload.single("uploadPaper"), (req, res) => {
  const data = req.body; // Form data
  const uploadedFile = req.file; // Uploaded file data
  let authors = [];
  console.log("paper data", data);
  console.log("file", uploadedFile);

  // Try to parse the authors' data
  try {
    authors = JSON.parse(data.authors);
  } catch (error) {
    return res.status(400).json({
      status: false,
      message: "Invalid author data",
      error: error.message,
    });
  }

  // Insert data into `paper_submission`
  pool.query(
    "INSERT INTO paper_submission (paper_title, research_area, paper_uploaded, mimetype, paper_keywords, paper_abstract, category, address_line_one, address_line_two, city, postal_code, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)",
    [
      data.paperTitle,
      data.researchArea,
      uploadedFile.originalname,
      uploadedFile.mimetype,
      data.keywords,
      data.abstract,
      data.category,
      data.addressLine1,
      data.addressLine2,
      data.city,
      data.postalCode,
      data.user_id,
    ],
    (error, result) => {
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during paper submission",
          error: error.sqlMessage,
        });
      }

      const paper_id = result.insertId; // Get the auto-generated paper_id
      const newDate = new Date();

      if (paper_id) {
        pool.query(
          "INSERT INTO admin_paper_relation (user_id, paper_id,sharedat,sharedby) VALUES (?, ?,?,?)",
          [data.user_id, paper_id, newDate, "user"],
          (adminError, adminResult) => {
            if (adminError) {
              console.error(
                "Error inserting into admin_paper_relation:",
                adminError
              );
              return res.status(500).json({
                status: false,
                message: "Error creating admin-paper relation",
                error: adminError.sqlMessage,
              });
            }

            // Array of author insert promises
            const authorPromises = authors.map((author, index) => {
              const authorName = author[`authorName${index}`];
              const designation = author[`designation${index}`];
              const university = author[`university${index}`];
              const contactNumber = author[`contactNumber${index}`];
              const email = author[`email${index}`];

              return new Promise((resolve, reject) => {
                pool.query(
                  "INSERT INTO author (user_id, author_name, author_designation, author_college, author_number, author_email) VALUES (?, ?, ?, ?, ?, ?)",
                  [
                    data.user_id, // Assuming user ID from the rest of the form data
                    authorName,
                    designation,
                    university,
                    contactNumber,
                    email,
                  ],
                  (authorError, authorResult) => {
                    if (authorError) {
                      reject(authorError);
                    } else {
                      resolve(authorResult);
                    }
                  }
                );
              });
            });

            // Process all author insertions
            Promise.all(authorPromises)
              .then((authorResults) => {
                res.status(200).json({
                  status: true,
                  message: "Paper and authors submitted successfully!",
                  paperResult: result,
                  authorResults,
                });
              })
              .catch((authorError) => {
                res.status(500).json({
                  status: false,
                  message: "Error during author data submission",
                  error: authorError.sqlMessage,
                });
              });
          }
        );
      }
    }
  );
});

router.post("/Re_upload_paper", (req, res) => {
  const data = req.body; // Form data
  let authors = [];
  console.log("paper data", data);

  // Try to parse the authors' data
  try {
    authors = JSON.parse(data.authors);
  } catch (error) {
    return res.status(400).json({
      status: false,
      message: "Invalid author data",
      error: error.message,
    });
  }

  const paper_id = data.Id; // Assuming 'id' is the paper ID to be updated
  console.log("paper id----", paper_id);
  // Update data in `paper_submission`
  pool.query(
    "UPDATE paper_submission SET paper_title = ?, research_area = ?,paper_keywords = ?, paper_abstract = ?, category = ?, address_line_one = ?, address_line_two = ?, city = ?, postal_code = ?, submitted_by = ? WHERE id = ?",
    [
      data.paperTitle,
      data.researchArea,
      data.keywords,
      data.abstract,
      data.category,
      data.addressLine1,
      data.addressLine2,
      data.city,
      data.postalCode,
      data.user_id,
      paper_id,
    ],
    (error, result) => {
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during paper update",
          error: error.sqlMessage,
        });
      } else {
        const newDate = new Date();

        pool.query(
          `UPDATE admin_paper_relation 
         SET sharedat = ?, sharedby = ? 
         WHERE user_id = ? AND paper_id = ?`,
          [newDate, "user", data.user_id, paper_id],
          (adminError, adminResult) => {
            if (adminError) {
              console.error("Error updating admin_paper_relation:", adminError);
              return res.status(500).json({
                status: false,
                message: "Error updating admin-paper relation",
                error: adminError.sqlMessage,
              });
            } else {
              // Array of author update promises
              const authorPromises = authors.map((author) => {
                const {
                  authorName,
                  designation,
                  university,
                  contactNumber,
                  email,
                  authorId,
                } = author;

                return new Promise((resolve, reject) => {
                  if (authorId) {
                    // Update existing author
                    pool.query(
                      `UPDATE author 
                         SET author_name = ?, author_designation = ?, author_college = ?, 
                             author_number = ?, author_email = ? 
                         WHERE user_id = ? AND idauthor = ?`,
                      [
                        authorName,
                        designation,
                        university,
                        contactNumber,
                        email,
                        data.user_id,
                        authorId,
                      ],
                      (authorError, authorResult) => {
                        if (authorError) {
                          reject(authorError);
                        } else {
                          resolve(authorResult);
                        }
                      }
                    );
                  } else {
                    // Add new author
                    pool.query(
                      `INSERT INTO author (author_name, author_designation, author_college, author_number, author_email, user_id) 
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [
                        authorName,
                        designation,
                        university,
                        contactNumber,
                        email,
                        data.user_id,
                      ],
                      (authorError, authorResult) => {
                        if (authorError) {
                          reject(authorError);
                        } else {
                          resolve(authorResult);
                        }
                      }
                    );
                  }
                });
              });

              // Process all author updates
              Promise.all(authorPromises)
                .then((authorResults) => {
                  res.status(200).json({
                    status: true,
                    message: "Paper and authors updated successfully!",
                    paperResult: result,
                    authorResults,
                  });
                })
                .catch((authorError) => {
                  res.status(500).json({
                    status: false,
                    message: "Error during author data update",
                    error: authorError.sqlMessage,
                  });
                });
            }
          }
        );
      }
    }
  );
});

router.post("/reupload_paper_file", upload.single("file"), (req, res) => {
  const paperId = req.body.paper_id;
  const reuploadedFile = req.file;

  if (!paperId) {
    return res.status(400).json({
      status: false,
      message: "Paper ID is required",
    });
  }

  if (!reuploadedFile) {
    return res.status(400).json({
      status: false,
      message: "File is required",
    });
  }

  // Fetch current reupload_count to determine the status
  pool.query(
    "SELECT reupload_count FROM paper_submission WHERE id = ?",
    [paperId],
    (selectError, selectResult) => {
      if (selectError) {
        console.error("Database error:", selectError);
        return res.status(500).json({
          status: false,
          message: "Error fetching paper data",
          error: selectError.sqlMessage,
        });
      }

      if (selectResult.length === 0) {
        return res.status(404).json({
          status: false,
          message: "Paper not found",
        });
      }

      const reuploadCount = selectResult[0].reupload_count || 0;

      if (reuploadCount >= 3) {
        return res.status(200).json({
          status: false,
          message: "Upload limit exceeded. No more uploads allowed.",
        });
      }

      // Update the paper submission with the new file name, mime type, and increment the reupload count
      pool.query(
        "UPDATE paper_submission SET paper_uploaded = ?, mimetype = ?, reupload_count = ? WHERE id = ?",
        [
          reuploadedFile.originalname,
          reuploadedFile.mimetype,
          reuploadCount + 1,
          paperId,
        ],
        (updateError, updateResult) => {
          if (updateError) {
            console.error("Database error:", updateError);
            return res.status(500).json({
              status: false,
              message: "Error during paper re-upload",
              error: updateError.sqlMessage,
            });
          }

          res.status(200).json({
            status: true,
            message: "Paper re-uploaded successfully!",
            result: updateResult,
          });
        }
      );
    }
  );
});

// Endpoint to get paper submissions and the associated user info
router.get("/paper_requests", function (req, res) {
  // SQL query to fetch paper submissions along with user info based on user_id from admin_paper_relation
  const query = `
    SELECT 
      ps.id AS paper_id,
      ps.paper_title,
      ps.research_area,
      ps.paper_uploaded,
      ps.mimetype,
      ps.category,
      ps.submission_date,
      ps.reupload_count,
      u.id AS user_id,
      u.firstname,
      u.lastname,
      u.userpic,
      apr.sharedat,
      apr.sharedby
    FROM 
      admin_paper_relation apr
    JOIN 
      paper_submission ps
    ON 
      apr.paper_id = ps.id
    JOIN 
      user_registration u
    ON 
      apr.user_id = u.id
  `;

  // Execute the query
  pool.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving paper requests",
        error: err.sqlMessage || err.message,
      });
    }

    // Return the results as JSON
    res.status(200).json({
      status: true,
      message: "Paper requests retrieved successfully",
      papers: results, // The array of results with the selected columns
    });
  });
});

// DELETE endpoint to remove a record from admin_paper_relation by paper_id
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

// Endpoint to fetch papers by user_id
router.get("/user_paper", function (req, res) {
  const userId = req.query.user_id;

  if (!userId) {
    console.error("error");
  }

  const query = `SELECT 
    ps.id AS paper_id,
    ps.paper_title,
    ps.research_area,
    ps.paper_uploaded,
    ps.mimetype,
    ps.paper_keywords,
    ps.paper_abstract,
    ps.address_line_one,
    ps.address_line_two,
    ps.city,
    ps.postal_code,
    ps.submitted_by,
    ps.submission_date,
    ps.updated_at,
    ps.paper_status,
    ps.category,
    ps.reupload_count,
    a.idauthor AS author_id,
    a.user_id,
    a.author_name,
    a.author_designation,
    a.author_college,
    a.author_number,
    a.author_email
FROM
    paper_submission AS ps
JOIN
    author AS a ON ps.submitted_by = a.user_id
WHERE
    ps.submitted_by = ?
GROUP BY
    ps.id, a.user_id;
 `;

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving papers by user_id",
        error: err.sqlMessage || err.message,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        status: false,
        message: `No papers found for user_id: ${userId}`,
      });
    }

    res.status(200).json({
      status: true,
      message: "Papers retrieved successfully",
      papers: results,
    });
  });
});

// Endpoint to delete a paper by ID
router.get("/delete_paper", (req, res) => {
  const paperId = req.query.id; // Get the paper ID from the URL parameter
  console.log("ppp", paperId);
  // SQL query to delete the paper by ID
  const query = "DELETE FROM paper_submission WHERE id = ?";

  // Execute the query with the paperId as the parameter
  pool.query(query, [paperId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Database error while deleting paper",
        error: err.sqlMessage || err.message,
      });
    }

    // If result.affectedRows is 0, the paper was not found
    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: false,
        message: `Paper with ID ${paperId} not found`,
      });
    }

    // Success: Paper deleted
    res.status(200).json({
      status: true,
      message: `Paper with ID ${paperId} deleted successfully`,
    });
  });
});

// Create a new article
router.post(  "/submit_article",
  upload.single("uploaded_article"),
  (req, res) => {
    const file = req.file;
    console.log("file", file);
    console.log("body", req.body);

    const query = `
    INSERT INTO article_submission 
    (manuscript_title, authors_name, subjects,
   reviewers_area, abstract, uploaded_article,
   mimetype, author_name, affiliation, 
   author_email, author_number, submitted_by)
    VALUES 
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    pool.query(
      query,
      [
        req.body.manuscriptTitle,
        req.body.authorName,
        req.body.subject,
        req.body.reviewersArea,
        req.body.abstract,
        req.file.originalname,
        req.file.mimetype,
        req.body.name,
        req.body.affiliation,
        req.body.email,
        req.body.number,
        req.body.user_id,
      ],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Error creating article",
            error: err.sqlMessage || err.message,
          });
        }

        res.status(201).json({
          status: true,
          message: "Article created successfully",
          article_id: result.insertId,
        });
      }
    );
  }
);

// Get article by ID
router.get("/user_articles", (req, res) => {
  const { articleId } = req.query;
  console.log(articleId);
  const query = "SELECT * FROM article_submission WHERE submitted_by = ?";

  pool.query(query, [articleId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error retrieving article",
        error: err.sqlMessage || err.message,
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: `Article with ID ${articleId} not found`,
      });
    }

    res.status(200).json({
      status: true,
      message: "Article retrieved successfully",
      article: result, // The first result, since ID is unique
    });
  });
});

router.get("/delete_article", (req, res) => {
  const articleId = req.query.id;

  const query = "DELETE FROM article_submission WHERE id = ?";

  pool.query(query, [articleId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "Error deleting article",
        error: err.sqlMessage || err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: false,
        message: `Article with ID ${articleId} not found`,
      });
    }

    res.status(200).json({
      status: true,
      message: `Article with ID ${articleId} deleted successfully`,
    });
  });
});

// save comments in table
router.post("/send_comment", (req, res) => {
  console.log("Body:", req.body);

  const { user_id, is_admin_comment, comment, paper_id } = req.body;

  const query = `INSERT INTO Comments (UserId, content,is_admin_comment,paper_id) VALUES (?, ?, ?,?)  `;

  pool.query(
    query,
    [user_id, comment, is_admin_comment, paper_id],
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
router.get("/user_comment", (req, res) => {
  const { user_id, paper_id } = req.query;

  let query;
  let queryParams;

  if (paper_id) {
    // If paper_id is provided, fetch comments by paper_id
    query = "SELECT * FROM Comments WHERE paper_id = ?";
    queryParams = [paper_id];
  } else if (user_id) {
    // If paper_id is not provided, fetch all comments by user_id
    query = "SELECT * FROM Comments WHERE userId = ?";
    queryParams = [user_id];
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
    "SELECT paper_id, COUNT(*) as count FROM Comments WHERE is_admin_comment = 1 AND status = 0 GROUP BY paper_id";

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
  const query = "UPDATE Comments SET status = 1 WHERE paper_id = ? AND is_admin_comment = 1 AND status = 0";
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
router.get("/admin_comment", (req, res) => {
  const { paper_id } = req.query;

  const query = "SELECT * FROM Comments WHERE paper_id = ?";

  pool.query(query, [paper_id], (err, results) => {
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

// admin sending comments
router.post("/send_admin_comment", (req, res) => {
  console.log("Body:", req.body);

  const { user_id, is_admin_comment, comment, paper_id } = req.body;

  const query = `INSERT INTO Comments (UserId, content,is_admin_comment,target_user_id,paper_id,status) VALUES (?, ?, ?,?,?,0)  `;

  pool.query(
    query,
    [user_id, comment, is_admin_comment, user_id, paper_id],
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

module.exports = router;
