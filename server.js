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
 * 1. 채용 공고 자동 삭제 로직
 * 마감 기한(deadline)이 오늘 날짜보다 이전인 공고를 db.json에서 필터링합니다.
 */
async function cleanExpiredJobs() {
    try {
        const db = await fs.readJson(DB_FILE);
        if (!db.jobs || db.jobs.length === 0) return;

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
        const initialCount = db.jobs.length;

        // 마감 기한이 없거나, 오늘 이후인 공고만 남김
        db.jobs = db.jobs.filter(job => {
            if (!job.deadline) return true; 
            return job.deadline >= today;
        });

        if (db.jobs.length !== initialCount) {
            await fs.writeJson(DB_FILE, db);
            console.log(`[시스템] 기간 만료된 공고 ${initialCount - db.jobs.length}건을 자동 삭제했습니다.`);
        }
    } catch (err) {
        console.error("자동 삭제 로직 에러:", err);
    }
}

// 초기화: 폴더 및 DB 파일 생성, 스케줄러 실행
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
        // 서버 시작 시 만료 공고 정리
        await cleanExpiredJobs();
        // 24시간마다 반복 실행
        setInterval(cleanExpiredJobs, 1000 * 60 * 60 * 24);
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

/* --- 네이버 SEO 전용 RSS API --- */

app.get('/rss.xml', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newsItems = db.news || [];
        const siteUrl = 'https://highlaw.co.kr';

        // 최신 뉴스 50개를 RSS 아이템으로 변환
        const items = newsItems.slice(-50).reverse().map(item => {
            return `
        <item>
            <title><![CDATA[${item.title}]]></title>
            <link>${siteUrl}/news.html</link>
            <description><![CDATA[${item.content.substring(0, 200)}...]]></description>
            <pubDate>${new Date(item.id).toUTCString()}</pubDate>
            <guid isPermaLink="false">${siteUrl}/news/${item.id}</guid>
        </item>`;
        }).join('');

        const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2000/svg">
    <channel>
        <title>법무법인 하이로 - 최신 뉴스 및 성공사례</title>
        <link>${siteUrl}</link>
        <description>법무법인 하이로(High & Law)의 공식 소식과 법률 가이드를 제공합니다.</description>
        <language>ko-kr</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items}
    </channel>
</rss>`;

        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.send(rss);
    } catch (e) {
        res.status(500).send("RSS 생성 오류");
    }
});

/* --- 공용 API --- */

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

/* --- 관리자 전용 API --- */

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

// [등록] 상세 채용 공고
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

// [수정] 상세 채용 공고 (PUT)
app.put('/api/admin/jobs/:id', upload.single('jobPdf'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const index = db.jobs.findIndex(j => j.id == req.params.id);
        if (index !== -1) {
            db.jobs[index] = {
                ...db.jobs[index],
                category: req.body.category,
                title: req.body.title,
                deadline: req.body.deadline,
                content: req.body.content,
                filename: req.file ? req.file.filename : db.jobs[index].filename // 새 파일 없으면 기존 유지
            };
            await fs.writeJson(DB_FILE, db);
            res.json(db.jobs[index]);
        } else { res.status(404).send("Not Found"); }
    } catch (e) { res.status(500).send("Error"); }
});

// [삭제] 상세 채용 공고 (DELETE)
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});