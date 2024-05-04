const multer = require('multer');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images'); // Change this to the desired upload directory
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Ensure unique filenames
  },
});

const upload = multer({ storage: storage });


module.exports=upload;
