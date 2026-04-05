const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

// 데이터 저장 파일 경로
const DB_PATH = path.join(__dirname, 'db.json');

// 초기 데이터 로드 함수
function loadData() {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            inquiries: [],
            news: [{ id: 1, category: 'H&L News', title: '법무법인 하이로 홈페이지 개소', content: '새로운 시작을 알립니다.', created_at: '2024-01-01' }],
            recruitStatus: [
                { role_id: 'new-lawyer', status: 'status-open' },
                { role_id: 'exp-lawyer', status: 'status-open' },
                { role_id: 'mil-lawyer', status: 'status-closed' },
                { role_id: 'staff', status: 'status-open' }
            ]
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// 데이터 저장 함수
function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let db = loadData();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ dest: 'uploads/' });

// --- API 경로 ---

// 1. 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'highlaw1877' && pw === 'gkdlfh1877!') {
        res.status(200).send('OK');
    } else {
        res.status(401).send('FAIL');
    }
});

// 2. 상담 신청 (inquiry.html)
app.post('/api/inquiry', upload.array('evidence'), (req, res) => {
    const data = req.body;
    const newInquiry = {
        id: Date.now(),
        name: data.userName,
        phone: data.userPhone,
        date_of_incident: data.incidentDate,
        summary: data.summary,
        created_at: new Date().toISOString().split('T')[0]
    };
    db.inquiries.unshift(newInquiry);
    saveData(db);
    res.json({ success: true });
});

// 3. 상담 신청 조회 및 삭제
app.get('/api/admin/inquiries', (req, res) => res.json(db.inquiries));
app.delete('/api/admin/inquiries/:id', (req, res) => {
    db.inquiries = db.inquiries.filter(i => i.id != req.params.id);
    saveData(db);
    res.send('deleted');
});

// 4. 뉴스 관리 (조회, 등록, 삭제)
app.get('/api/public/news', (req, res) => res.json(db.news));
app.post('/api/news', (req, res) => {
    const newEntry = { id: Date.now(), ...req.body, created_at: new Date().toISOString().split('T')[0] };
    db.news.unshift(newEntry);
    saveData(db);
    res.send('ok');
});
app.delete('/api/news/:id', (req, res) => {
    db.news = db.news.filter(n => n.id != req.params.id);
    saveData(db);
    res.send('deleted');
});

// 5. 채용 관리
app.get('/api/public/recruit', (req, res) => res.json(db.recruitStatus));
app.post('/api/recruit/status', (req, res) => {
    const { id, status } = req.body;
    const target = db.recruitStatus.find(r => r.role_id === id);
    if (target) target.status = status;
    saveData(db);
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));