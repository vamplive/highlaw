const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 경로 설정
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

/**
 * [추가 기능] 마감 기한이 지난 채용 공고 자동 삭제 로직
 */
async function cleanExpiredJobs() {
    try {
        const db = await fs.readJson(DB_FILE);
        if (!db.jobs || db.jobs.length === 0) return;

        const today = new Date().toISOString().split('T')[0]; // 현재 날짜 (YYYY-MM-DD)
        const initialCount = db.jobs.length;

        // 마감 기한이 오늘보다 이전인 공고 필터링 (기한이 없거나 오늘 이후인 것만 유지)
        db.jobs = db.jobs.filter(job => {
            if (!job.deadline) return true; // 기한이 없으면 유지
            return job.deadline >= today;   // 기한이 오늘이거나 미래면 유지
        });

        if (db.jobs.length !== initialCount) {
            await fs.writeJson(DB_FILE, db);
            console.log(`[시스템] 마감 기한이 지난 공고 ${initialCount - db.jobs.length}건을 자동 삭제 처리했습니다.`);
        }
    } catch (err) {
        console.error("만료 공고 자동 삭제 중 에러 발생:", err);
    }
}

// [초기화] 폴더 및 파일 생성, 자동 삭제 스케줄러 실행
async function initDB() {
    try {
        await fs.ensureDir(UPLOAD_DIR);
        const exists = await fs.pathExists(DB_FILE);
        if (!exists) {
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
            await fs.writeJson(DB_FILE, initialData);
        }
        
        // 서버 시작 시 1회 자동 삭제 실행
        await cleanExpiredJobs();
        
        // 24시간마다 한 번씩 만료된 공고 자동 삭제 실행
        setInterval(cleanExpiredJobs, 1000 * 60 * 60 * 24);
        
    } catch (err) {
        console.error("DB 초기화 에러:", err);
    }
}
initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Multer 설정 (파일 업로드)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

/* --- API 영역 --- */

// 1. 공용 데이터 조회 (뉴스, 채용상태, 공고목록)
app.get('/api/public/news', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json((db.news || []).slice().reverse());
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/public/recruit', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.recruit || []);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/public/jobs', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.jobs || []);
    } catch (e) { res.status(500).json([]); }
});

// 2. 상담 신청 (파일 첨부 포함)
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

// 3. 관리자 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') { 
        res.status(200).send("OK");
    } else {
        res.status(401).send("Fail");
    }
});

// 4. 관리자 - 뉴스 관리
app.post('/api/news', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newNews = { id: Date.now(), ...req.body, created_at: new Date().toISOString().split('T')[0] };
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

// 5. 관리자 - 상시 채용 상태 관리
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

// 6. 관리자 - 상세 채용 공고 관리 (등록 / 수정 / 삭제)

// [등록]
app.post('/api/admin/jobs', upload.single('jobPdf'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newJob = { 
            id: Date.now(), 
            category: req.body.category,
            title: req.body.title,
            deadline: req.body.deadline,
            content: req.body.content,
            filename: req.file ? req.file.filename : null,
            created_at: new Date().toISOString().split('T')[0] 
        };
        db.jobs.push(newJob);
        await fs.writeJson(DB_FILE, db);
        res.json(newJob);
    } catch (e) { res.status(500).send("Error"); }
});

// [수정] 상세 채용 공고 수정 API 추가
app.put('/api/admin/jobs/:id', upload.single('jobPdf'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const index = db.jobs.findIndex(j => j.id == req.params.id);
        
        if (index !== -1) {
            // 기존 데이터 유지하면서 전달받은 값 업데이트
            db.jobs[index].category = req.body.category;
            db.jobs[index].title = req.body.title;
            db.jobs[index].deadline = req.body.deadline;
            db.jobs[index].content = req.body.content;
            
            // 새 파일이 업로드된 경우 파일명 업데이트
            if (req.file) {
                db.jobs[index].filename = req.file.filename;
            }
            
            await fs.writeJson(DB_FILE, db);
            res.json(db.jobs[index]);
        } else {
            res.status(404).send("Not Found");
        }
    } catch (e) { res.status(500).send("Error"); }
});

// [삭제]
app.delete('/api/admin/jobs/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.jobs = db.jobs.filter(j => j.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

// 7. 관리자 - 상담 신청 목록 관리
app.get('/api/admin/inquiries', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json((db.inquiries || []).slice().reverse());
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

// 메인 페이지 라우팅
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[High & Law] 서버가 포트 ${PORT}에서 작동 중입니다.`);
});