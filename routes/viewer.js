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
        "INSERT INTO viewer_registration (firstname, lastname, email, password, emailupdates, userpic) VALUES (?, ?, ?, ?, ?, ?)",
        [
          req.body.firstname,
          req.body.lastname,
          req.body.email,
          hash, // Store hashed password
          req.body.receiveUpdates,
          req.file ? req.file.originalname : null,
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

/* fetching user details */
router.get("/viewer_info", function (req, res) {
  pool.query(
    "SELECT id, firstname,lastname, userpic FROM viewer_registration",
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
        message: "viewer info retrieved successfully",
        viewer: results, // The array of results with the selected columns
      });
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
  // Extract viewer_id from the request parameters
  const { viewer_id } = req.query;

  // Define SQL query to select paper data based on viewer_id
  const sql = `
    SELECT p.*
    FROM viewer_paper_relationship AS vpr
    INNER JOIN paper_submission AS p ON vpr.paper_id = p.id
    WHERE vpr.viewer_id = ?
  `;
  
  // Execute the query with the viewer_id as a parameter
  pool.query(sql, [viewer_id], (err, result) => {
    if (err) {
      console.error('Error fetching data: ', err);
      return res.status(500).send('Error fetching data');
    }
    
    // If data is fetched successfully, send the data in the response
    res.status(200).json(result);
  });
});




module.exports = router;
