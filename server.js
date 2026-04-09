const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 경로 설정
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// [중요] 초기 폴더 및 파일 생성 로직
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
    } catch (err) {
        console.error("DB 초기화 에러:", err);
    }
}
initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

/* --- API 영역 --- */

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

app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') { 
        res.status(200).send("OK");
    } else {
        res.status(401).send("Fail");
    }
});

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

// [수정] 상세 채용 공고 등록 (PDF 파일 업로드 추가)
app.post('/api/admin/jobs', upload.single('jobPdf'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newJob = { 
            id: Date.now(), 
            category: req.body.category,
            title: req.body.title,
            deadline: req.body.deadline,
            content: req.body.content,
            filename: req.file ? req.file.filename : null, // PDF 파일명 저장
            created_at: new Date().toISOString().split('T')[0] 
        };
        db.jobs.push(newJob);
        await fs.writeJson(DB_FILE, db);
        res.json(newJob);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/admin/jobs/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.jobs = db.jobs.filter(j => j.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});