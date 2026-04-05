const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./highlaw.db');

// --- 1. 미들웨어 설정 ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'highlaw-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1시간
}));

// --- 2. DB 초기화 ---
db.serialize(() => {
    // 상담신청
    db.run(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, date_of_incident TEXT, summary TEXT, status TEXT DEFAULT '대기중', created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);
    // 뉴스
    db.run(`CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, title TEXT, content TEXT, created_at TEXT
    )`);
    // 채용상태
    db.run(`CREATE TABLE IF NOT EXISTS recruit_status (
        role_id TEXT PRIMARY KEY, status TEXT
    )`);

    const roles = ['new-lawyer', 'exp-lawyer', 'mil-lawyer', 'staff'];
    roles.forEach(role => {
        db.run(`INSERT OR IGNORE INTO recruit_status (role_id, status) VALUES (?, 'status-closed')`, [role]);
    });
});

// --- 3. 인증 로직 ---
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === "admin" && pw === "highlaw1234") {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

const auth = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(403).json({ message: "권한 없음" });
};

// --- 4. 관리자 전용 API ---
app.get('/api/admin/inquiries', auth, (req, res) => {
    db.all("SELECT * FROM inquiries ORDER BY created_at DESC", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/news', auth, (req, res) => {
    const { category, title, content, date } = req.body;
    db.run(`INSERT INTO news (category, title, content, created_at) VALUES (?, ?, ?, ?)`,
        [category, title, content, date], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
});

app.post('/api/recruit/status', auth, (req, res) => {
    const { id, status } = req.body;
    db.run(`UPDATE recruit_status SET status = ? WHERE role_id = ?`, [status, id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// --- 5. 공개용 API ---
app.post('/api/inquiry', (req, res) => {
    const { name, date_of_incident, summary } = req.body;
    db.run(`INSERT INTO inquiries (name, date_of_incident, summary) VALUES (?, ?, ?)`,
        [name || '상담신청', date_of_incident, summary], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
});

app.get('/api/public/news', (req, res) => {
    db.all("SELECT * FROM news ORDER BY id DESC LIMIT 3", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/public/recruit', (req, res) => {
    db.all("SELECT * FROM recruit_status", [], (err, rows) => {
        res.json(rows || []);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));