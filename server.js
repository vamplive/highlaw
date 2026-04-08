const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
// Render는 process.env.PORT를 사용합니다.
const PORT = process.env.PORT || 3000;

// 데이터 저장 파일 경로 (루트 폴더의 db.json)
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// 초기 데이터 설정 및 DB 구조 유지
async function initDB() {
    await fs.ensureDir(UPLOAD_DIR);
    const exists = await fs.pathExists(DB_FILE);
    
    const initialData = {
        news: [],
        recruit: [ // 고정된 4개 직군의 상태값
            { role_id: "new-lawyer", status: "status-open" },
            { role_id: "exp-lawyer", status: "status-closed" },
            { role_id: "mil-lawyer", status: "status-open" },
            { role_id: "staff", status: "status-closed" }
        ],
        jobs: [], // 신규: 동적 채용 공고 리스트
        inquiries: []
    };

    if (!exists) {
        await fs.writeJson(DB_FILE, initialData);
    } else {
        // 기존 파일이 있다면 jobs 항목이 없는 경우를 대비해 병합
        const currentData = await fs.readJson(DB_FILE);
        if (!currentData.jobs) {
            currentData.jobs = [];
            await fs.writeJson(DB_FILE, currentData);
        }
    }
}

initDB();

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서비스 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드 설정 (상담 신청용)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

/* --- API 영역 --- */

/** 1. 공용 API (누구나 접근 가능) **/

// 뉴스/성공사례 가져오기
app.get('/api/public/news', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.news.slice().reverse());
    } catch (e) { res.status(500).json([]); }
});

// 고정 채용 상태 가져오기
app.get('/api/public/recruit', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.recruit);
    } catch (e) { res.status(500).json([]); }
});

// 신규: 상세 채용 공고 목록 가져오기
app.get('/api/public/jobs', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.jobs || []);
    } catch (e) { res.status(500).json([]); }
});

// 상담 신청 등록
app.post('/api/inquiry', upload.array('evidence'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newInquiry = {
            id: Date.now(),
            name: req.body.userName,
            phone: req.body.userPhone,
            summary: req.body.summary,
            created_at: new Date().toISOString().split('T')[0],
            files: req.files ? req.files.map(f => f.filename) : []
        };
        db.inquiries.push(newInquiry);
        await fs.writeJson(DB_FILE, db);
        res.status(200).send("OK");
    } catch (e) { res.status(500).send("Error"); }
});

/** 2. 관리자 API (로그인 및 데이터 관리) **/

// 관리자 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') { 
        res.status(200).send("OK");
    } else {
        res.status(401).send("Fail");
    }
});

// 뉴스 등록/삭제
app.post('/api/news', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newNews = {
            id: Date.now(),
            category: req.body.category,
            title: req.body.title,
            content: req.body.content,
            created_at: new Date().toISOString().split('T')[0]
        };
        db.news.push(newNews);
        await fs.writeJson(DB_FILE, db);
        res.json(newNews);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/news/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.news = db.news.filter(n => n.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 고정 채용 상태 변경
app.post('/api/recruit/status', async (req, res) => {
    try {
        const { id, status } = req.body;
        const db = await fs.readJson(DB_FILE);
        const target = db.recruit.find(r => r.role_id === id);
        if (target) {
            target.status = status;
            await fs.writeJson(DB_FILE, db);
            res.send("Updated");
        } else { res.status(404).send("Not Found"); }
    } catch (e) { res.status(500).send("Error"); }
});

// 신규: 상세 채용 공고 등록
app.post('/api/admin/jobs', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newJob = {
            id: Date.now(),
            title: req.body.title,
            category: req.body.category,
            content: req.body.content,
            deadline: req.body.deadline,
            created_at: new Date().toISOString().split('T')[0]
        };
        db.jobs.push(newJob);
        await fs.writeJson(DB_FILE, db);
        res.json(newJob);
    } catch (e) { res.status(500).send("Error"); }
});

// 신규: 상세 채용 공고 삭제
app.delete('/api/admin/jobs/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.jobs = db.jobs.filter(j => j.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 상담 신청 조회/삭제
app.get('/api/admin/inquiries', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.inquiries.slice().reverse());
    } catch (e) { res.status(500).json([]); }
});

app.delete('/api/admin/inquiries/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.inquiries = db.inquiries.filter(i => i.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 모든 경로를 index.html로 (Single Page Application 방식 대응)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});