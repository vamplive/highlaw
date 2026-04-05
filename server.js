const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./highlaw.db');

// --- 1. 미들웨어 설정 (라우트보다 먼저 선언되어야 함) ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'highlaw-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1시간
}));

// --- 2. DB 초기화 (테이블 생성 및 채용 상태 초기값) ---
db.serialize(() => {
    // 상담 신청
    db.run(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, date_of_incident TEXT, summary TEXT, status TEXT DEFAULT '대기중', created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);

    // 뉴스/성공사례
    db.run(`CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, title TEXT, content TEXT, created_at TEXT
    )`);

    // 채용 상태
    db.run(`CREATE TABLE IF NOT EXISTS recruit_status (
        role_id TEXT PRIMARY KEY, status TEXT
    )`);

    const roles = ['new-lawyer', 'exp-lawyer', 'mil-lawyer', 'staff'];
    roles.forEach(role => {
        db.run(`INSERT OR IGNORE INTO recruit_status (role_id, status) VALUES (?, 'status-closed')`, [role]);
    });
});

// --- 3. 인증 관련 API ---
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === "admin" && pw === "highlaw1234") {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "로그인 실패" });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

const authMiddleware = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(403).json({ message: "권한 없음" });
};

// --- 4. 데이터 관리 API (관리자용) ---
app.get('/api/admin/inquiries', authMiddleware, (req, res) => {
    db.all("SELECT * FROM inquiries ORDER BY created_at DESC", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/news', authMiddleware, (req, res) => {
    const { category, title, content, date } = req.body;
    db.run(`INSERT INTO news (category, title, content, created_at) VALUES (?, ?, ?, ?)`,
        [category, title, content, date], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
});

app.post('/api/recruit/status', authMiddleware, (req, res) => {
    const { id, status } = req.body;
    db.run(`UPDATE recruit_status SET status = ? WHERE role_id = ?`, [status, id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// --- 5. 데이터 조회 API (일반 사용자용) ---
app.post('/api/inquiry', (req, res) => {
    const { name, date_of_incident, summary } = req.body;
    db.run(`INSERT INTO inquiries (name, date_of_incident, summary) VALUES (?, ?, ?)`,
        [name, date_of_incident, summary], function(err) {
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

// --- 6. 서버 실행 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});