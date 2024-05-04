var express = require("express");
var router = express.Router();
var pool = require("./pool");
var upload = require("./multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Handle the file upload and data insertion
router.post("/upload_paper", upload.single("uploadPaper"), (req, res) => {
  const data = req.body; // Form data
  const uploadedFile = req.file; // Uploaded file data
  let authors = [];

  // Try to parse the authors' data
  try {
    authors = JSON.parse(data.authors);
  } catch (error) {
    res.status(400).json({
      status: false,
      message: "Invalid author data",
      error: error.message,
    });
    return;
  }

  // Insert data into `paper_submission`
  pool.query(
    "INSERT INTO paper_submission (paper_title, research_area, paper_uploaded, mimetype, paper_keywords, paper_abstract, address_line_one, address_line_two, city, postal_code, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      data.paperTitle,
      data.researchArea,
      uploadedFile.originalname,
      uploadedFile.mimetype,
      data.keywords,
      data.abstract,
      data.addressLine1,
      data.addressLine2,
      data.city,
      data.postalCode,
      data.user_id,
    ],
    (error, result) => {
      if (error) {
        res.status(500).json({
          status: false,
          message: "Error during paper submission",
          error: error.sqlMessage,
        });
        return;
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
});

// Endpoint to get paper submissions and the associated user info
router.get("/paper_requests", function (req, res) {
  // SQL query to fetch paper submissions along with user info
  const query = `
    SELECT 
      ps.id AS paper_id,
      ps.paper_title,
      ps.research_area,
      ps.paper_uploaded,
      ps.mimetype,
      ps.submission_date,
      u.id AS user_id,
      u.firstname,
      u.lastname,
      u.userpic
    FROM 
      paper_submission ps
    JOIN 
      user_registration u
    ON 
      ps.submitted_by = u.id
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

// Endpoint to fetch papers by user_id
router.get("/user_paper", function (req, res) {
  const userId = req.query.user_id;

  if (!userId) {
    console.error("error");
  }

  const query = `
    SELECT 
      id AS paper_id,
      paper_title,
      research_area,
      paper_uploaded,
      mimetype,
      submission_date,
      paper_status
    FROM 
      paper_submission
    WHERE 
      submitted_by = ?
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
router.post(
  "/submit_article",
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

  const { user_id, is_admin_comment, comment } = req.body;

  const query = `INSERT INTO Comments (UserId, content,is_admin_comment) VALUES (?, ?, ?)  `;

  pool.query(query, [user_id, comment, is_admin_comment], (err, result) => {
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
  });
});

//fetching user comments
router.get("/user_comment", (req, res) => {
  const { user_id } = req.query;

  const query = 'SELECT * FROM Comments WHERE UserId = ?';
  
  pool.query(query, [user_id], (err, results) => {
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

//fetching admin comments
router.get("/admin_comment", (req, res) => {
  const { user_id } = req.query;

  const query = 'SELECT * FROM Comments WHERE UserId = ? OR target_user_id = ?';
  
  pool.query(query, [user_id,user_id], (err, results) => {
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

  const { user_id, is_admin_comment, comment,paper_id } = req.body;

  const query = `INSERT INTO Comments (UserId, content,is_admin_comment,target_user_id,paper_id) VALUES (?, ?, ?,?,?)  `;

  pool.query(query, [user_id, comment, is_admin_comment,user_id,paper_id], (err, result) => {
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
  });
});
module.exports = router;
