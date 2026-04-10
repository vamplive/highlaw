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
 * [기능] 채용 공고 자동 삭제 로직
 */
async function cleanExpiredJobs() {
    try {
        const db = await fs.readJson(DB_FILE);
        if (!db.jobs || db.jobs.length === 0) return;

        const today = new Date().toISOString().split('T')[0]; 
        const initialCount = db.jobs.length;

        db.jobs = db.jobs.filter(job => {
            if (!job.deadline) return true; 
            return job.deadline >= today;
        });

        if (db.jobs.length !== initialCount) {
            await fs.writeJson(DB_FILE, db);
            console.log(`[시스템] 기간 만료된 공고 ${initialCount - db.jobs.length}건 자동 삭제 완료.`);
        }
    } catch (err) {
        console.error("자동 삭제 로직 에러:", err);
    }
}

// 초기화: 폴더 및 DB 파일 생성
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
        await cleanExpiredJobs();
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
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

/* --- 네이버 SEO: RSS Feed API --- */
app.get('/rss.xml', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newsItems = db.news || [];
        const siteUrl = 'https://highlaw.co.kr';
        const toRFC822 = (date) => new Date(date).toUTCString();
        const items = newsItems.slice(-50).reverse().map(item => {
            return `
        <item>
            <title><![CDATA[${item.title}]]></title>
            <link>${siteUrl}/news-detail.html?id=${item.id}</link>
            <description><![CDATA[${(item.content || '').replace(/<[^>]*>?/gm, '').substring(0, 300)}]]></description>
            <pubDate>${toRFC822(item.id || Date.now())}</pubDate>
            <guid isPermaLink="false">${siteUrl}/news/${item.id}</guid>
        </item>`;
        }).join('');
        const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>법무법인 하이로</title><link>${siteUrl}</link><description>공식 뉴스 및 성공사례</description><language>ko-kr</language><pubDate>${toRFC822(new Date())}</pubDate><lastBuildDate>${toRFC822(new Date())}</lastBuildDate><atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />${items}</channel></rss>`;
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(rss);
    } catch (e) { res.status(500).send("RSS error"); }
});

/* --- 공용 API --- */

app.get('/api/public/news', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json((db.news || []).slice().reverse());
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/public/news/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const item = (db.news || []).find(n => n.id == req.params.id);
        if (item) res.json(item);
        else res.status(404).send("Not Found");
    } catch (e) { res.status(500).json(null); }
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

// [신규] 개별 채용 공고 상세 데이터 가져오기 API
app.get('/api/public/jobs/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const item = (db.jobs || []).find(j => j.id == req.params.id);
        if (item) res.json(item);
        else res.status(404).send("Not Found");
    } catch (e) { res.status(500).json(null); }
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
    if (id === 'admin' && pw === 'highlaw123!') res.status(200).send("OK");
    else res.status(401).send("Fail");
});

/* --- 관리자 전용: 뉴스 관리 --- */

app.post('/api/news', upload.array('attachments'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const attachments = req.files ? req.files.map(f => ({
            filename: f.filename, originalname: f.originalname, mimetype: f.mimetype
        })) : [];
        const newNews = { 
            id: Date.now(), category: req.body.category, title: req.body.title,
            content: req.body.content, attachments: attachments,
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

/* --- 관리자 전용: 채용 관리 --- */

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

// [수정] 상세 채용 공고 (다중 파일 및 에디터 본문 지원)
app.post('/api/admin/jobs', upload.array('jobAttachments'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const attachments = req.files ? req.files.map(f => ({
            filename: f.filename, originalname: f.originalname, mimetype: f.mimetype
        })) : [];
        const newJob = { 
            id: Date.now(), 
            category: req.body.category,
            title: req.body.title,
            deadline: req.body.deadline,
            content: req.body.content, // HTML 에디터 데이터
            attachments: attachments,
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

app.listen(PORT, () => {
    console.log(`High & Law Server Running on port ${PORT}`);
});