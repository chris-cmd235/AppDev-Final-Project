const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs'); // Moved fs import to top

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

// Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Database initialization
const db = new sqlite3.Database('./contacts.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Contacts table
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    icon TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Default admin creation
  db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      bcrypt.hash('admin123', SALT_ROUNDS, (err, hash) => {
        if (!err) {
          db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
            [uuidv4(), 'admin', hash, 'admin'],
            (err) => { if (!err) console.log('Default admin created (user: admin, pass: admin123)'); }
          );
        }
      });
    }
  });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Serve Uploads (Images)
app.use('/uploads', express.static(UPLOAD_DIR));

// 2. Serve Static Frontend Files (HTML, CSS, JS)
app.use(express.static(PUBLIC_DIR));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Increased to 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function validateContact(req, res, next) {
  const { name, email, phone } = req.body;
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Name is required' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  next();
}

// ==================== API ROUTES ====================

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    
    bcrypt.compare(password, user.password, (err, match) => {
      if (err || !match) return res.status(401).json({ error: 'Invalid credentials' });
      
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });
  });
});

// Register (Admin only)
app.post('/api/auth/register', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (username.length < 3 || password.length < 6) return res.status(400).json({ error: 'Invalid length' });

  bcrypt.hash(password, SALT_ROUNDS, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Error' });
    const userId = uuidv4();
    db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', 
      [userId, username, hash, role], 
      (err) => {
        if (err) return res.status(409).json({ error: 'Username exists' });
        res.status(201).json({ message: 'User created' });
      }
    );
  });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => res.json({ user: req.user }));

// Users Management
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, username, role, created_at FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error' });
    res.json(rows);
  });
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete self' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Error' });
    res.json({ success: true });
  });
});

// Contacts CRUD
app.get('/api/contacts', authenticateToken, (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : '%';
  db.all('SELECT * FROM contacts WHERE name LIKE ? ORDER BY created_at DESC', [search], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error' });
    res.json(rows);
  });
});

app.post('/api/contacts', authenticateToken, upload.single('icon'), validateContact, (req, res) => {
  const { name, email, phone, notes } = req.body;
  const contactId = uuidv4();
  const icon = req.file ? `/uploads/${path.basename(req.file.path)}` : null;

  db.run(`INSERT INTO contacts (id, name, email, phone, notes, icon, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contactId, name, email, phone, notes, icon, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error' });
      res.status(201).json({ id: contactId, name, icon });
    }
  );
});

app.put('/api/contacts/:id', authenticateToken, upload.single('icon'), validateContact, (req, res) => {
  const { name, email, phone, notes } = req.body;
  const updates = [name, email, phone, notes];
  let query = `UPDATE contacts SET name = ?, email = ?, phone = ?, notes = ?, updated_at = CURRENT_TIMESTAMP`;
  
  if (req.file) {
    query += `, icon = ?`;
    updates.push(`/uploads/${path.basename(req.file.path)}`);
  }
  
  query += ` WHERE id = ?`;
  updates.push(req.params.id);

  db.run(query, updates, function(err) {
    if (err) return res.status(500).json({ error: 'Error' });
    res.json({ success: true });
  });
});

app.delete('/api/contacts/:id', authenticateToken, (req, res) => {
  db.get('SELECT icon FROM contacts WHERE id = ?', [req.params.id], (err, contact) => {
    if (err || !contact) return res.status(404).json({ error: 'Not found' });

    db.run('DELETE FROM contacts WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: 'Error' });

      // FIX: Correctly resolve file path for deletion
      if (contact.icon) {
        // contact.icon is like "/uploads/filename.jpg"
        // We need to extract "filename.jpg" and join with UPLOAD_DIR
        const filename = path.basename(contact.icon);
        const filePath = path.join(UPLOAD_DIR, filename);
        
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') console.error('Error deleting file:', err);
        });
      }
      res.json({ success: true });
    });
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database closed');
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});