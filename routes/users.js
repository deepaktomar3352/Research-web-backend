var express = require("express");
var router = express.Router();
var pool = require("./pool");
var upload = require("./multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { error } = require("console");

/*  users Register. */
router.post(
  "/user_register",
  upload.single("userImage"),
  function (req, res, next) {
    console.log("name", req.body.firstName);
    console.log("last", req.body.lastName);
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

      pool.query(
        "SELECT * FROM user_registration WHERE email = ?",
        [req.body.email],
        (error, result) => {
          if (result.length > 0) {
            return res.status(220).json({
              status: 1,
              message: "User already registered",
              result,
            });
          } else {
            pool.query(
              "INSERT INTO user_registration (firstname, lastname, email, password, emailupdates, userpic) VALUES (?, ?, ?, ?, ?, ?)",
              [
                req.body.firstName,
                req.body.lastName,
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
                    message: "server error",
                    error: error.sqlMessage,
                  });
                } else {
                  res.status(200).json({
                    status: 2,
                    message: "Registered Successfully",
                    result,
                  });
                }
              }
            );
          }
        }
      );
      // Insert user data into the database
    });
  }
);

/* user login. */
router.post("/user_login", function (req, res) {
  const { email, password } = req.body;
  console.log("frontend", email, password);

  // Query the database for the user with the provided email
  pool.query(
    "SELECT * FROM user_registration WHERE email = ?",
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
            user: {
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
router.post("/forgot_password", function (req, res, next) {
  const { email } = req.body;

  pool.query(
    "SELECT * FROM user_registration WHERE email = ?",
    [email],
    async (error, results) => {
      if (error) {
        console.error("SQL Error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during forgot password",
          error: error.sqlMessage,
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          status: false,
          message: "User not found",
        });
      }

      const resetToken = crypto.randomBytes(20).toString("hex"); // Generate token
      const resetTokenExpiry = new Date(Date.now() + 1800000); // Token expiry set to 30 minutes from now

      pool.query(
        "UPDATE user_registration SET reset_token = ?, reset_token_expiry = ? WHERE email = ?",
        [resetToken, resetTokenExpiry, email],
        async (updateError) => {
          if (updateError) {
            console.error("SQL Error:", updateError);
            return res.status(500).json({
              status: false,
              message: "Error during forgot password",
              error: updateError.sqlMessage,
            });
          }

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

          try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({
              status: true,
              message: "Password reset email sent",
            });
          } catch (emailError) {
            console.error("Email Error:", emailError);
            res.status(500).json({
              status: false,
              message: "Error sending reset email",
              error: emailError.message,
            });
          }
        }
      );
    }
  );
});

/* reset password */
router.post("/reset_password/:token", function (req, res, next) {
  const { token } = req.params;
  const password = req.body.password;
  console.log("password", password);

  pool.query(
    "SELECT * FROM user_registration WHERE reset_token = ? AND reset_token_expiry > NOW()",
    [token],
    async (error, results) => {
      if (error) {
        console.error("SQL Error:", error);
        return res.status(500).json({
          status: false,
          message: "Error during reset password",
          error: error.sqlMessage,
        });
      }

      if (results.length === 0) {
        return res.status(400).json({
          status: false,
          message: "Invalid or expired token",
        });
      }

      bcrypt.hash(password, 10, function (err, hash) {
        if (err) {
          console.error("Error hashing password:", err);
          return res.status(500).json({
            status: false,
            message: "Error during password reset",
            error: err.message,
          });
        }

        pool.query(
          "UPDATE user_registration SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?",
          [hash, token],
          (updateError, result) => {
            if (updateError) {
              console.error("SQL Error:", updateError);
              return res.status(500).json({
                status: false,
                message: "Error during password reset",
                error: updateError.sqlMessage,
              });
            }

            res.status(200).json({
              status: true,
              message: "Password reset successful",
            });
          }
        );
      });
    }
  );
});

/* fetching user details */
router.get("/user_info", function (req, res) {
  pool.query(
    "SELECT id, firstname,lastname,email, userpic FROM user_registration",
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
        message: "User info retrieved successfully",
        users: results, // The array of results with the selected columns
      });
    }
  );
});

/* fetch user profile */
router.post("/fetch_user_profile", function (req, res) {
  pool.query(
    "SELECT id, firstname,lastname,email, userpic FROM user_registration WHERE id =?",
    [req.body.id],
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
        message: "User info retrieved successfully",
        data: results, // The array of results with the selected columns
      });
    }
  );
});

/* user profile updation */
router.post("/user_profile_update", upload.single("userpic"), (req, res) => {
  const { id, firstName, lastName, email } = req.body;
  const userpic = req.file ? req.file.filename : null;

  console.log("Updating user profile with ID:", id);
  console.log("Received values:", { id, firstName, lastName, email, userpic });

  if (!id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  const updateFields = [];
  const updateValues = [];

  if (firstName) {
    updateFields.push("firstname = ?");
    updateValues.push(firstName);
  }

  if (lastName) {
    updateFields.push("lastname = ?");
    updateValues.push(lastName);
  }

  if (email) {
    updateFields.push("email = ?");
    updateValues.push(email);
  }

  if (userpic) {
    updateFields.push("userpic = ?");
    updateValues.push(userpic);
  }

  updateValues.push(id);

  if (updateFields.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  const query = `UPDATE user_registration SET ${updateFields.join(
    ", "
  )} WHERE id = ?`;

  console.log("Executing query:", query);
  console.log("With values:", updateValues);

  pool.query(query, updateValues, (err, result) => {
    if (err) {
      console.error("Error updating user profile:", err);
      return res.status(500).json({ message: "Error updating user profile" });
    }

    console.log("Query result:", result);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User profile updated successfully" });
  });
});

router.get("/user_paper_details", function(req, res) {
  pool.query("SELECT * FROM paper_submission AS ps INNER JOIN author AS a ON ps.submitted_by=a.user_id",function(err,result) {
    if (err) {
      console.log(err);
    }
    else{
      res.status(200).json({status:true,result:result, message:"paper details fetched successfully" });
    }
  })
})

module.exports = router;
