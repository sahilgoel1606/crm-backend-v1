// File: server.js (Express Backend)
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Pool } = require('pg');
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json())
app.get('/', (req, res) => {
  res.send('🎯 CRM Backend is Live!');
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/crm'
});

// Database table creation (run once or via migration)
const createTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      location TEXT,
      source TEXT,
	owner TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};
createTable();

// Upload CSV
app.post('/api/upload', upload.single('file'), (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      const client = await pool.connect();
      try {
        for (let row of results) {
          if (!row.name || !(row.email || row.phone)) continue;
      await client.query(
  'INSERT INTO leads (name, email, phone, location, source, status, owner) VALUES ($1, $2, $3, $4, $5, $6, $7)',
  [row.name, row.email, row.phone, row.location, row.source, row.status || 'New', row.owner || 'Unassigned']
);

        }
        res.status(200).json({ message: 'Upload complete', count: results.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      } finally {
        client.release();
        fs.unlinkSync(req.file.path);
      }
    });
});

// Get all leads
app.get('/api/leads', async (req, res) => {
  const { owner, status, location, search } = req.query;
  const values = [];
  const conditions = [];

  if (owner) {
    conditions.push(`owner ILIKE $${values.length + 1}`);
    values.push(`%${owner}%`);
  }

  if (status) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(status);
  }

  if (location) {
    conditions.push(`location ILIKE $${values.length + 1}`);
    values.push(`%${location}%`);
  }

  if (search) {
    conditions.push(`(name ILIKE $${values.length + 1} OR phone ILIKE $${values.length + 1})`);
    values.push(`%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(`SELECT * FROM leads ${whereClause} ORDER BY created_at DESC`, values);

  res.json(result.rows);
});


// Update lead status
app.put('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE leads SET status = $1 WHERE id = $2', [status, id]);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
