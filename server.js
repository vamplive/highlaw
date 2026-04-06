const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const app = express();
const PORT = 3000;

// 데이터 저장 파일 경로
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// 기본 폴더 및 데이터 생성
fs.ensureDirSync(UPLOAD_DIR);
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        news: [],
        recruit: [
            { id: "new-lawyer", role_id: "new-lawyer", status: "status-open" },
            { id: "exp-lawyer", role_id: "exp-lawyer", status: "status-closed" },
            { id: "mil-lawyer", role_id: "mil-lawyer", status: "status-open" },
            { id: "staff", role_id: "staff", status: "status-closed" }
        ],
        inquiries: []
    };
    fs.writeJsonSync(DB_FILE, initialData);
}

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// [중요] 정적 파일 서버 설정 (public 폴더 안의 logo.png 등을 찾게 해줌)
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드 설정 (상담 신청용)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- API 영역 ---

// 1. 뉴스 데이터 가져오기 (공개)
app.get('/api/public/news', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.news.reverse()); // 최신순
});

// 2. 채용 상태 가져오기 (공개 - index.html의 Checking 해결 핵심)
app.get('/api/public/recruit', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.recruit);
});

// 3. 상담 신청 등록 (공개)
app.post('/api/inquiry', upload.array('evidence'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newInquiry = {
            id: Date.now(),
            name: req.body.userName,
            phone: req.body.userPhone,
            type: req.body.cType,
            summary: req.body.summary,
            created_at: new Date().toISOString().split('T')[0],
            files: req.files ? req.files.map(f => f.filename) : []
        };
        db.inquiries.push(newInquiry);
        await fs.writeJson(DB_FILE, db);
        res.status(200).send("Success");
    } catch (e) {
        res.status(500).send("Error");
    }
});

// 4. 관리자 로그인 (임시)
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') { // 아이디 비번 설정
        res.status(200).send("OK");
    } else {
        res.status(401).send("Fail");
    }
});

// 5. 관리자 전용 API (뉴스 등록)
app.post('/api/news', async (req, res) => {
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
});

// 6. 관리자 전용 API (채용 상태 변경)
app.post('/api/recruit/status', async (req, res) => {
    const { id, status } = req.body;
    const db = await fs.readJson(DB_FILE);
    const role = db.recruit.find(r => r.role_id === id);
    if (role) {
        role.status = status;
        await fs.writeJson(DB_FILE, db);
        res.send("Updated");
    } else {
        res.status(404).send("Not Found");
    }
});

// 7. 관리자 전용 API (상담 내역 조회/삭제)
app.get('/api/admin/inquiries', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.inquiries.reverse());
});

app.delete('/api/admin/inquiries/:id', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    db.inquiries = db.inquiries.filter(i => i.id != req.params.id);
    await fs.writeJson(DB_FILE, db);
    res.send("Deleted");
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`
    =========================================
    법무법인 하이로 서버가 가동되었습니다.
    - 홈 페이지: http://localhost:${PORT}
    - 관리자 로그인: http://localhost:${PORT}/login.html
    - 로고 이미지 경로: http://localhost:${PORT}/logo.png
    =========================================
    `);
});