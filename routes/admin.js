var express = require("express");
var router = express.Router();
var pool = require("./pool");
var upload = require("./multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");




// API to fetch messages for admin
router.get('/admin_messages_count', (req, res) => {
    const sqlUserComments = `
    SELECT c.CommentID,c.paper_id,u.id, u.firstname, u.lastname,u.userpic, c.content, c.created_at, 'user' AS commentType
    FROM comments c
    JOIN user_registration u ON c.UserId = u.id
    WHERE c.is_admin_comment = 0
`;

const sqlViewerComments = `
    SELECT vc.CommentID,vc.paper_id,v.id, v.firstname AS viewerName, v.lastname AS lastName,v.userpic, vc.content, vc.created_at, 'viewer' AS commentType
    FROM viewer_comments vc
    JOIN viewer_registration v ON vc.viewer_id = v.id
    WHERE vc.is_admin_comment = 0
`;


    const sqlUserCommentCount = `
        SELECT COUNT(*) AS userCommentCount 
        FROM comments 
        WHERE is_admin_comment = 0
    `;

    const sqlViewerCommentCount = `
        SELECT COUNT(*) AS viewerCommentCount 
        FROM viewer_comments 
        WHERE is_admin_comment = 0
    `;

    pool.query(sqlUserComments, (err, userComments) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        pool.query(sqlViewerComments, (err, viewerComments) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            pool.query(sqlUserCommentCount, (err, userCommentCountResult) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                pool.query(sqlViewerCommentCount, (err, viewerCommentCountResult) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    const userCommentCount = userCommentCountResult[0].userCommentCount;
                    const viewerCommentCount = viewerCommentCountResult[0].viewerCommentCount;

                    res.json({
                        userComments,
                        viewerComments,
                        userCommentCount,
                        viewerCommentCount
                    });
                });
            });
        });
    });
});

module.exports = router;