const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const bcrypt = require('bcryptjs'); 
const session = require('express-session'); 

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
                partners: [], 
                recruit: [
                    { role_id: "new-lawyer", status: "status-open" },
                    { role_id: "exp-lawyer", status: "status-closed" },
                    { role_id: "mil-lawyer", status: "status-open" },
                    { role_id: "staff", status: "status-closed" }
                ],
                jobs: [],
                inquiries: [],
                heroMedia: [],
                users: [],      
                projects: [],   
                timelogs: []    
            };
            await fs.writeJson(DB_FILE, initialData);
        } else {
            const db = await fs.readJson(DB_FILE);
            let updated = false;
            if (!db.partners) { db.partners = []; updated = true; }
            if (!db.heroMedia) { db.heroMedia = []; updated = true; }
            if (!db.users) { db.users = []; updated = true; } 
            if (!db.projects) { db.projects = []; updated = true; }
            if (!db.timelogs) { db.timelogs = []; updated = true; }
            if (updated) await fs.writeJson(DB_FILE, db);
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

// 세션 설정
app.use(session({
    secret: 'highlaw-secret-key-999',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, uniqueSuffix + '-' + decodedName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } 
});

/* --- 권한 체크 미들웨어 --- */
const authRequired = (req, res, next) => {
    if (req.session.user) next();
    else res.status(401).send("로그인이 필요합니다.");
};

const adminRequired = (req, res, next) => {
    if (req.session.user && req.session.user.isAdmin) next();
    else res.status(403).send("관리자 권한이 없습니다.");
};

/* --- 네이버 SEO: RSS Feed API --- */
app.get('/rss.xml', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const newsItems = db.news || [];
        const siteUrl = 'https://highlaw.co.kr';
        const toRFC822 = (date) => {
            const d = new Date(date);
            return d.toUTCString();
        };
        const items = newsItems.slice(-50).reverse().map(item => {
            const plainContent = (item.content || '').replace(/<[^>]*>?/gm, '').substring(0, 500);
            return `<item><title><![CDATA[${item.title}]]></title><link>${siteUrl}/news-detail.html?id=${item.id}</link><description><![CDATA[${plainContent}]]></description><author>법무법인 하이로</author><pubDate>${toRFC822(item.id)}</pubDate><guid>${siteUrl}/news-detail.html?id=${item.id}</guid></item>`;
        }).join('');
        const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>법무법인 하이로</title><link>${siteUrl}</link><description>법무법인 하이로 공식 뉴스 및 성공사례</description><language>ko-kr</language><pubDate>${toRFC822(new Date())}</pubDate><lastBuildDate>${toRFC822(new Date())}</lastBuildDate><atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />${items}</channel></rss>`;
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(rss);
    } catch (e) { res.status(500).send("RSS error"); }
});

/* --- 공용 API --- */
app.get('/api/public/hero', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.heroMedia || []); } catch (e) { res.status(500).json([]); }
});
app.get('/api/public/news', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json((db.news || []).slice().reverse()); } catch (e) { res.status(500).json([]); }
});
app.get('/api/public/news/:id', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); const item = (db.news || []).find(n => n.id == req.params.id); if (item) res.json(item); else res.status(404).send("Not Found"); } catch (e) { res.status(500).json(null); }
});
app.get('/api/public/partners', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.partners || []); } catch (e) { res.status(500).json([]); }
});
app.get('/api/public/recruit', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.recruit || []); } catch (e) { res.status(500).json([]); }
});
app.get('/api/public/jobs', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.jobs || []); } catch (e) { res.status(500).json([]); }
});
app.get('/api/public/jobs/:id', async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); const item = (db.jobs || []).find(j => j.id == req.params.id); if (item) res.json(item); else res.status(404).send("Not Found"); } catch (e) { res.status(500).json(null); }
});
app.post('/api/inquiry', upload.array('evidence'), async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); const newInquiry = { id: Date.now(), name: req.body.userName, phone: req.body.userPhone, summary: req.body.summary, created_at: new Date().toISOString().split('T')[0], files: req.files ? req.files.map(f => f.filename) : [] }; db.inquiries.push(newInquiry); await fs.writeJson(DB_FILE, db); res.status(200).send("OK"); } catch (e) { res.status(500).send("Error"); }
});

/* --- 로그인 및 회원관리 API --- */
app.post('/api/login', async (req, res) => {
    const { id, pw } = req.body;
    if (id === 'admin' && pw === 'highlaw123!') {
        req.session.user = { id: 'master', name: '최고관리자', isAdmin: true, position: '관리자' };
        return res.status(200).json({ name: '관리자', isAdmin: true, position: '관리자' });
    }
    try {
        const db = await fs.readJson(DB_FILE);
        const user = db.users.find(u => u.loginId === id);
        if (user && await bcrypt.compare(pw, user.password)) {
            if (user.status !== 'active') return res.status(403).send("승인 대기 중인 계정입니다.");
            req.session.user = { id: user.id, name: user.name, isAdmin: user.isAdmin, position: user.position };
            res.status(200).json({ name: user.name, isAdmin: user.isAdmin, position: user.position });
        } else {
            res.status(401).send("아이디 또는 비밀번호가 틀립니다.");
        }
    } catch (e) { res.status(500).send("Login Error"); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.send("Logged Out");
});

app.post('/api/register', async (req, res) => {
    try {
        const { loginId, password, name, position } = req.body;
        const db = await fs.readJson(DB_FILE);
        if (db.users.find(u => u.loginId === loginId)) return res.status(400).send("이미 존재하는 ID입니다.");
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now(), loginId, password: hashedPassword, name, position, status: 'pending', isAdmin: false };
        db.users.push(newUser);
        await fs.writeJson(DB_FILE, db);
        res.send("가입 신청 완료. 관리자 승인 후 이용 가능합니다.");
    } catch (e) { res.status(500).send("Register Error"); }
});

app.get('/api/admin/users', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.users); } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/users/status', adminRequired, async (req, res) => {
    try {
        const { userId, status, isAdmin } = req.body;
        const db = await fs.readJson(DB_FILE);
        const user = db.users.find(u => u.id == userId);
        if (user) {
            if (status) user.status = status;
            if (isAdmin !== undefined) user.isAdmin = isAdmin;
            await fs.writeJson(DB_FILE, db);
            res.send("Updated");
        } else res.status(404).send("Not Found");
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/admin/users/:id', adminRequired, async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        db.users = db.users.filter(u => u.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

/* --- 타임트랙 API --- */
app.get('/api/projects', authRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json(db.projects || []); } catch (e) { res.status(500).json([]); }
});

app.post('/api/projects', authRequired, async (req, res) => {
    try {
        const { name, client } = req.body;
        const db = await fs.readJson(DB_FILE);
        const newProject = { id: Date.now(), name, client, created_by: req.session.user.name };
        db.projects.push(newProject);
        await fs.writeJson(DB_FILE, db);
        res.json(newProject);
    } catch (e) { res.status(500).send("Error"); }
});

app.get('/api/timelogs', authRequired, async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        let logs = db.timelogs || [];
        const user = req.session.user;
        const hasFullAccess = user.isAdmin || user.position === '대표변호사';
        if (!hasFullAccess) { logs = logs.filter(l => l.userId == user.id); }
        res.json(logs);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/timelogs', authRequired, async (req, res) => {
    try {
        const { projectId, date, duration, description } = req.body;
        const db = await fs.readJson(DB_FILE);
        const newLog = {
            id: Date.now(),
            userId: req.session.user.id,
            userName: req.session.user.name,
            projectId: parseInt(projectId),
            date,
            duration: parseInt(duration),
            description
        };
        db.timelogs.push(newLog);
        await fs.writeJson(DB_FILE, db);
        res.json(newLog);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/timelogs/:id', authRequired, async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const log = db.timelogs.find(l => l.id == req.params.id);
        if (!log) return res.status(404).send("Not Found");
        if (log.userId != req.session.user.id && !req.session.user.isAdmin) return res.status(403).send("Forbidden");
        db.timelogs = db.timelogs.filter(l => l.id != req.params.id);
        await fs.writeJson(DB_FILE, db);
        res.send("Deleted");
    } catch (e) { res.status(500).send("Error"); }
});

/* --- 관리자 전용 API --- */

app.post('/api/admin/hero/reorder', adminRequired, async (req, res) => {
    try {
        const { heroMedia } = req.body;
        const db = await fs.readJson(DB_FILE);
        db.heroMedia = heroMedia;
        await fs.writeJson(DB_FILE, db);
        res.send("Reordered");
    } catch (e) { res.status(500).send("Error"); }
});

/**
 * [수정됨] 뉴스 게시글 저장 로직 (SAVE & UPDATE)
 * 이미지, 동영상, 일반 파일 통합 관리 및 Rich Text 대응
 */
app.post('/api/news', adminRequired, upload.array('attachments'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const { id, category, title, content, existingAttachments } = req.body;
        
        // 기존 파일 리스트 안전하게 파싱 (수정 시 유지될 파일들)
        let finalAttachments = [];
        if (existingAttachments && existingAttachments !== "null" && existingAttachments !== "undefined") {
            try {
                finalAttachments = JSON.parse(existingAttachments);
            } catch (err) {
                finalAttachments = [];
            }
        }

        // 새로 업로드된 파일 정보 추출 및 UTF-8 처리
        const newAttachments = req.files ? req.files.map(f => ({ 
            filename: f.filename, 
            originalname: Buffer.from(f.originalname, 'latin1').toString('utf8'), 
            mimetype: f.mimetype 
        })) : [];

        // 기존 파일 + 새 파일 병합
        finalAttachments = [...finalAttachments, ...newAttachments];

        // 1. 기존 게시글 수정 (Update)
        if (id && id !== "null" && id !== "undefined") {
            const index = db.news.findIndex(n => n.id == id);
            if (index > -1) {
                db.news[index].category = category;
                db.news[index].title = title;
                db.news[index].content = content;
                db.news[index].attachments = finalAttachments;
                
                await fs.writeJson(DB_FILE, db);
                return res.json(db.news[index]);
            }
        }

        // 2. 신규 게시글 등록 (Create)
        const newNews = { 
            id: Date.now(), 
            category, 
            title, 
            content, 
            attachments: finalAttachments, 
            created_at: new Date().toISOString().split('T')[0] 
        };
        db.news.push(newNews);
        await fs.writeJson(DB_FILE, db);
        res.json(newNews);
    } catch (e) { 
        console.error("뉴스 저장 에러:", e);
        res.status(500).send("Error saving news"); 
    }
});

/**
 * [추가됨] 뉴스 게시글 순서 변경 API
 */
app.post('/api/admin/news/reorder', adminRequired, async (req, res) => {
    try {
        const { newList } = req.body;
        const db = await fs.readJson(DB_FILE);
        // 클라이언트에서 전달받은 순서대로 저장 (전체 교체)
        db.news = newList;
        await fs.writeJson(DB_FILE, db);
        res.send("Reordered");
    } catch (e) { 
        res.status(500).send("Error reordering news"); 
    }
});

app.delete('/api/news/:id', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); db.news = db.news.filter(n => n.id != req.params.id); await fs.writeJson(DB_FILE, db); res.send("Deleted"); } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/admin/partners', adminRequired, upload.single('photo'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const idBody = req.body.id;
        const isNew = (!idBody || idBody === "null" || idBody === "undefined");
        const id = isNew ? Date.now() : parseInt(idBody);
        const partnerData = { id, name: req.body.name || "", engName: req.body.engName || "", title: req.body.title || "", edu: req.body.edu ? req.body.edu.split('\n').filter(l => l.trim() !== "") : [], exp: req.body.exp ? req.body.exp.split('\n').filter(l => l.trim() !== "") : [], photo: (req.body.existingPhoto && req.body.existingPhoto !== "null") ? req.body.existingPhoto : null };
        if (req.file) { partnerData.photo = req.file.filename; }
        const index = db.partners.findIndex(p => p.id === id);
        if (index > -1) { db.partners[index] = partnerData; } else { db.partners.push(partnerData); }
        await fs.writeJson(DB_FILE, db); res.json(partnerData);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/admin/partners/:id', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); db.partners = db.partners.filter(p => p.id != req.params.id); await fs.writeJson(DB_FILE, db); res.send("Deleted"); } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/admin/hero', adminRequired, upload.single('heroFile'), async (req, res) => {
    try { if (!req.file) return res.status(400).send("No file"); const db = await fs.readJson(DB_FILE); const newMedia = { id: Date.now(), filename: req.file.filename, mimetype: req.file.mimetype, created_at: new Date().toISOString() }; db.heroMedia.push(newMedia); await fs.writeJson(DB_FILE, db); res.json(newMedia); } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/admin/hero/:id', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); db.heroMedia = db.heroMedia.filter(m => m.id != req.params.id); await fs.writeJson(DB_FILE, db); res.send("Deleted"); } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/recruit/status', adminRequired, async (req, res) => {
    try { const { id, status } = req.body; const db = await fs.readJson(DB_FILE); const target = db.recruit.find(r => r.role_id === id); if (target) { target.status = status; await fs.writeJson(DB_FILE, db); res.send("Updated"); } else { res.status(404).send("Not Found"); } } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/admin/jobs', adminRequired, upload.array('jobAttachments'), async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const idBody = req.body.id;
        const isNew = (!idBody || idBody === "null" || idBody === "undefined");
        const id = isNew ? Date.now() : parseInt(idBody);
        const attachments = req.files && req.files.length > 0 ? req.files.map(f => ({ filename: f.filename, originalname: f.originalname, mimetype: f.mimetype })) : null;
        const jobData = { id, category: req.body.category, title: req.body.title, deadline: req.body.deadline, content: req.body.content, created_at: req.body.created_at || new Date().toISOString().split('T')[0] };
        const index = db.jobs.findIndex(j => j.id === id);
        if (index > -1) { jobData.attachments = attachments ? attachments : db.jobs[index].attachments; db.jobs[index] = jobData; } else { jobData.attachments = attachments || []; db.jobs.push(jobData); }
        await fs.writeJson(DB_FILE, db); res.json(jobData);
    } catch (e) { res.status(500).send("Error"); }
});

app.delete('/api/admin/jobs/:id', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); db.jobs = db.jobs.filter(j => j.id != req.params.id); await fs.writeJson(DB_FILE, db); res.send("Deleted"); } catch (e) { res.status(500).send("Error"); }
});

app.get('/api/admin/inquiries', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); res.json((db.inquiries || []).slice().reverse()); } catch (e) { res.status(500).json([]); }
});

app.delete('/api/admin/inquiries/:id', adminRequired, async (req, res) => {
    try { const db = await fs.readJson(DB_FILE); db.inquiries = db.inquiries.filter(i => i.id != req.params.id); await fs.writeJson(DB_FILE, db); res.send("Deleted"); } catch (e) { res.status(500).send("Error"); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`High & Law Integrated Server Running on port ${PORT}`);
});