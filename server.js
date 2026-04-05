const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer'); // 파일 업로드용
const app = express();
const PORT = process.env.PORT || 3000;

// 데이터 저장용 변수 (DB 대용)
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

// 미들웨어 설정
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드 설정 (임시 메모리 저장)
const upload = multer({ dest: 'uploads/' });

/* --- API 경로 --- */

// 1. 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    if (id === 'highlaw1877' && pw === 'gkdlfh1877!') { // 아이디 비밀번호 설정
        res.status(200).send('Login Success');
    } else {
        res.status(401).send('Login Failed');
    }
});

// 2. 상담 신청 접수 (inquiry.html에서 호출)
app.post('/api/inquiry', upload.array('evidence'), (req, res) => {
    const data = req.body;
    const newInquiry = {
        id: Date.now(),
        name: data.name || '익명', // 이름 필드가 HTML에 추가되어야 함
        date_of_incident: data.incidentDate,
        summary: data.summary,
        created_at: new Date().toISOString().split('T')[0],
        details: data // 나머지 상세 정보 저장
    };
    inquiries.unshift(newInquiry); // 최신순 저장
    console.log("새 상담 신청:", newInquiry);
    res.status(200).json({ message: 'Success' });
});

// 3. 상담 신청 내역 가져오기 (admin.html)
app.get('/api/admin/inquiries', (req, res) => {
    res.json(inquiries);
});

// 4. 뉴스/사례 등록 (admin.html)
app.post('/api/news', (req, res) => {
    const item = req.body;
    const newEntry = {
        id: Date.now(),
        ...item,
        created_at: new Date().toISOString().split('T')[0]
    };
    news.unshift(newEntry);
    res.status(200).send('News Saved');
});

// 5. 뉴스 목록 가져오기 (news.html, index.html)
app.get('/api/public/news', (req, res) => {
    res.json(news);
});

// 6. 채용 상태 가져오기
app.get('/api/public/recruit', (req, res) => {
    res.json(recruitStatus);
});

// 7. 채용 상태 업데이트 (admin.html)
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

// 모든 경로에 대해 index.html 반환 (SPA 또는 직접 접근 대응)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});