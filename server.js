const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs'); // 폴더 생성을 위해 추가
const app = express();
const PORT = process.env.PORT || 3000;

// 업로드 폴더가 없으면 자동 생성 (Render 오류 방지)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 데이터 저장용 변수
let inquiries = [];
let news = [
    { id: 1, category: 'H&L News', title: '법무법인 하이로 강남 본사 개소', content: '하이로가 역삼KR타워에서 새롭게 시작합니다.', created_at: '2024-01-20' }
];
let recruitStatus = [
    { role_id: 'new-lawyer', status: 'status-open' },
    { role_id: 'exp-lawyer', status: 'status-open' },
    { role_id: 'mil-lawyer', status: 'status-closed' },
    { role_id: 'staff', status: 'status-open' }
];

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드 설정
const upload = multer({ dest: 'uploads/' });

/* --- API 경로 --- */

// 1. 로그인 (아이디: highlaw1877 / 비번: gkdlfh1877!)
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'highlaw1877' && pw === 'gkdlfh1877!') {
        res.status(200).send('Login Success');
    } else {
        res.status(401).send('Login Failed');
    }
});

// 2. 상담 신청 접수 (inquiry.html에서 전송)
app.post('/api/inquiry', upload.array('evidence'), (req, res) => {
    try {
        const data = req.body;
        const newInquiry = {
            id: Date.now(),
            name: data.userName || '익명 고객', // HTML에 name="userName" 추가 권장
            phone: data.userPhone || '연락처 미기재',
            date_of_incident: data.incidentDate || '미정',
            summary: data.summary || '내용 없음',
            created_at: new Date().toISOString().split('T')[0]
        };
        inquiries.unshift(newInquiry);
        console.log("새 상담 신청 접수됨:", newInquiry);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Inquiry Error:", err);
        res.status(500).json({ success: false });
    }
});

app.get('/api/admin/inquiries', (req, res) => res.json(inquiries));

app.post('/api/news', (req, res) => {
    const item = req.body;
    news.unshift({ id: Date.now(), ...item, created_at: new Date().toISOString().split('T')[0] });
    res.status(200).send('Saved');
});

app.get('/api/public/news', (req, res) => res.json(news));
app.get('/api/public/recruit', (req, res) => res.json(recruitStatus));

app.post('/api/recruit/status', (req, res) => {
    const { id, status } = req.body;
    const target = recruitStatus.find(r => r.role_id === id);
    if (target) {
        target.status = status;
        res.status(200).send('Updated');
    } else {
        res.status(404).send('Not Found');
    }
});

// index.html로 리다이렉트
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));