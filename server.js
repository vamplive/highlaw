const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
// Render 환경의 포트 설정을 우선적으로 사용합니다.
const PORT = process.env.PORT || 3000;

/**
 * [주의] 현재 폴더에 있는 highlaw.db 파일의 이름을 db.json으로 변경해서 배포하세요.
 * 코드상에서는 db.json이라는 이름을 사용하도록 작성되어 있습니다.
 */
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// 초기 데이터 설정 및 DB 구조 유지
async function initDB() {
    await fs.ensureDir(UPLOAD_DIR);
    const exists = await fs.pathExists(DB_FILE);
    
    const initialData = {
        news: [],
        recruit: [
            { role_id: "new-lawyer", status: "status-open" },
            { role_id: "exp-lawyer", status: "status-closed" },
            { role_id: "mil-lawyer", status: "status-open" },
            { role_id: "staff", status: "status-closed" }
        ],
        jobs: [],
        inquiries: []
    };

    if (!exists) {
        await fs.writeJson(DB_FILE, initialData);
    } else {
        const currentData = await fs.readJson(DB_FILE);
        // 기존 DB에 jobs 필드가 없는 경우 대비
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

/**
 * 정적 파일 서비스 설정 수정
 * extensions: ['html'] 설정을 통해 /partners 접속 시 partners.html을 자동으로 보여줍니다.
 */
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html']
}));

// 파일 업로드 설정 (상담 신청용)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

/* --- API 영역 (기존 로직 100% 유지) --- */

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

// 상세 채용 공고 목록 가져오기
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

// 관리자 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') { 
        res.status(200).send("OK");
    } else {
        res.status(401).send("Fail");
    }
});

// 뉴스 등록
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

// 뉴스 삭제
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

// 상세 채용 공고 등록
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

// 상세 채용 공고 삭제
app.delete('/api/admin/jobs/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.jobs = db.jobs.filter(j => j.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 상담 신청 조회
app.get('/api/admin/inquiries', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.inquiries.slice().reverse());
    } catch (e) { res.status(500).json([]); }
});

// 상담 신청 삭제
app.delete('/api/admin/inquiries/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.inquiries = db.inquiries.filter(i => i.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 메인 경로 처리 (SPA 대응 제거: 멀티 페이지 접속을 원활하게 함)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});