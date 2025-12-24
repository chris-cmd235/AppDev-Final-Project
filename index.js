// existing index.js

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, UPLOAD_DIR),
	filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 200000 } }); // ~200KB max

async function readDB() {
	try {
		const raw = await fs.readFile(DATA_FILE, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		return { contacts: [] };
	}
}

async function writeDB(db) {
	await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

async function ensureUploadDir() {
	try {
		await fs.mkdir(UPLOAD_DIR);
	} catch (err) {
		// ignore if exists
	}
}

// API: list contacts, optional search
app.get('/api/contacts', async (req, res) => {
	const q = (req.query.search || '').toLowerCase();
	const db = await readDB();
	let items = db.contacts || [];
	if (q) items = items.filter(c => (c.name || '').toLowerCase().includes(q));
	res.json(items);
});

app.get('/api/contacts/:id', async (req, res) => {
	const db = await readDB();
	const contact = (db.contacts || []).find(c => c.id === req.params.id);
	if (!contact) return res.status(404).json({ error: 'Not found' });
	res.json(contact);
});

app.post('/api/contacts', upload.single('icon'), async (req, res) => {
	const db = await readDB();
	const { name, email, phone, notes } = req.body;
	const contact = { id: uuidv4(), name, email, phone, notes, icon: null };
	if (req.file) contact.icon = `/uploads/${path.basename(req.file.path)}`;
	db.contacts = db.contacts || [];
	db.contacts.unshift(contact);
	await writeDB(db);
	res.status(201).json(contact);
});

app.put('/api/contacts/:id', upload.single('icon'), async (req, res) => {
	const db = await readDB();
	const idx = (db.contacts || []).findIndex(c => c.id === req.params.id);
	if (idx === -1) return res.status(404).json({ error: 'Not found' });
	const updated = Object.assign({}, db.contacts[idx], req.body);
	if (req.file) updated.icon = `/uploads/${path.basename(req.file.path)}`;
	db.contacts[idx] = updated;
	await writeDB(db);
	res.json(updated);
});

app.delete('/api/contacts/:id', async (req, res) => {
	const db = await readDB();
	const idx = (db.contacts || []).findIndex(c => c.id === req.params.id);
	if (idx === -1) return res.status(404).json({ error: 'Not found' });
	const removed = db.contacts.splice(idx, 1)[0];
	await writeDB(db);
	res.json({ success: true, removed });
});

// fallback to index.html for single page
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
	await ensureUploadDir();
	// ensure db file exists
	const db = await readDB();
	if (!db.contacts) db.contacts = [];
	await writeDB(db);
	app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
})();
