const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./highlaw.db');

// DB 초기화
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        date_of_incident TEXT,
        summary TEXT,
        status TEXT DEFAULT '대기중',
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'highlaw-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }
}));

// 로그인 API
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === "admin" && pw === "highlaw1234") {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// 상담 신청 API
app.post('/api/inquiry', (req, res) => {
    const { name, date_of_incident, summary } = req.body;
    db.run(`INSERT INTO inquiries (name, date_of_incident, summary) VALUES (?, ?, ?)`, 
        [name, date_of_incident, summary], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// 관리자 내역 확인 API
app.get('/api/admin/inquiries', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("권한 없음");
    db.all("SELECT * FROM inquiries ORDER BY created_at DESC", [], (err, rows) => {
        res.json(rows);
    });
});

app.listen(3000, () => console.log('서버가 http://localhost:3000 에서 실행 중입니다.'));