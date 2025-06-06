const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;
const cron = require('node-cron');

const uploadDir = path.join(__dirname, 'images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `post-${timestamp}${ext}`);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/images', express.static('images'));

const db = new sqlite3.Database('./posts.db', err => {
  if (err) console.error('DB error:', err);
  else console.log('DB connected');
});

// Create table if not exists (with isPosted)
db.run(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imagePath TEXT,
  description TEXT,
  hashtags TEXT,
  scheduledDateTime TEXT,
  isPosted BOOLEAN DEFAULT 0
)`);

// Try to add 'isPosted' column if it doesn't exist
db.run(`ALTER TABLE posts ADD COLUMN isPosted BOOLEAN DEFAULT 0`, err => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to alter posts table:', err.message);
  }
});

app.post('/upload', upload.single('image'), (req, res) => {
  const { description = '', hashtags = '[]', scheduledDateTime = null } = req.body;
  const imagePath = req.file ? path.join('images', req.file.filename) : null;

  console.log(scheduledDateTime);

  db.run(
    `INSERT INTO posts (imagePath, description, hashtags, scheduledDateTime, isPosted)
     VALUES (?, ?, ?, ?, ?)`,
    [imagePath, description, hashtags, scheduledDateTime, 0],
    err => {
      if (err) return res.status(500).send('Insert failed');
      res.sendStatus(200);
    }
  );
});

app.post('/update/:id', upload.single('image'), (req, res) => {
  const id = req.params.id;
  const {
    description = '',
    hashtags = '[]',
    scheduledDateTime = null,
    isPosted = 0
  } = req.body;
  const imagePath = req.file ? path.join('images', req.file.filename) : null;

  const updateQuery = imagePath
    ? `UPDATE posts SET imagePath = ?, description = ?, hashtags = ?, scheduledDateTime = ?, isPosted = ? WHERE id = ?`
    : `UPDATE posts SET description = ?, hashtags = ?, scheduledDateTime = ?, isPosted = ? WHERE id = ?`;

  const params = imagePath
    ? [imagePath, description, hashtags, scheduledDateTime, isPosted, id]
    : [description, hashtags, scheduledDateTime, isPosted, id];

  db.run(updateQuery, params, err => {
    if (err) return res.status(500).send('Update failed');
    res.sendStatus(200);
  });
});

app.get('/events', (req, res) => {
  const { start, end } = req.query;
  db.all(
    `SELECT id, description, scheduledDateTime FROM posts WHERE scheduledDateTime BETWEEN ? AND ?`,
    [start, end],
    (err, rows) => {
      if (err) return res.status(500).send('DB error');
      const events = rows.map(row => ({
        id: row.id,
        title: row.description || 'Scheduled Post',
        start: row.scheduledDateTime,
        color: '#E1306C'
      }));
      res.json(events);
    }
  );
});

app.get('/post/:id', (req, res) => {
  db.get(`SELECT * FROM posts WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).send('DB error');
    if (!row) return res.status(404).send('Not found');
    res.json(row);
  });
});


// This cron job runs every minute
cron.schedule('* * * * *', () => {
  const now = new Date();
  // Format to 'YYYY-MM-DDTHH:00:00' (hourly precision, ISO format)
  const currentHour = now.toISOString().slice(0, 13) + ':00:00';

  // console.log(getCurrentSingaporeMinute());

  // db.get('SELECT * FROM posts ORDER BY ROWID ASC LIMIT 1', (err, row) => {
  //   if (err) {
  //     return console.error(err.message);
  //   }
  //   console.log(row);
  // });

  // // Select posts scheduled for this hour and not yet posted
  // db.all(
  //   `SELECT * FROM posts WHERE scheduledDateTime = ? AND isPosted = 0`,
  //   getCurrentSingaporeMinute(),
  //   (err, rows) => {
  //     if (err) return console.error('Scheduler DB error:', err);

  //     rows.forEach(row => {
       
  //       console.log(`Scheduled post ID ${row.id} is being processed at ${currentHour}`);

  //       // // Mark as posted
  //       // db.run(
  //       //   `UPDATE posts SET isPosted = 1 WHERE id = ?`,
  //       //   [row.id],
  //       //   err => {
  //       //     if (err) console.error(`Failed to mark post ${row.id} as posted`);
  //       //   }
  //       // );
  //     });
  //   }
  // );
});

function getCurrentSingaporeMinute() {
  const now = new Date();
  // Convert to Singapore time (UTC+8)
  const sgOffset = 8 * 60; // minutes
  const localOffset = now.getTimezoneOffset(); // in minutes
  const sgTime = new Date(now.getTime() + (sgOffset + localOffset) * 60000);

  // Format as 'YYYY-MM-DDTHH:MM'
  const yyyy = sgTime.getFullYear();
  const mm = String(sgTime.getMonth() + 1).padStart(2, '0');
  const dd = String(sgTime.getDate()).padStart(2, '0');
  const hh = String(sgTime.getHours()).padStart(2, '0');
  const min = String(sgTime.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

app.get('/test', (req, res) => {
  createPost();

  res.json(1)
});

function createPost() {
  console.log('test');
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
