const express = require("express");

const fs = require("fs");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json({limit:"50mb"}));
app.use(express.static(PUBLIC_DIR));
app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

const FILE = path.join(__dirname, "emails.txt");
const QUESTIONS_FILE = path.join(__dirname, "questions.json");
const SECTIONS_FILE = path.join(__dirname, "sections.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

/* ======================== */
/* HELPERS */
/* ======================== */

function readJSON(file, defaultData){
    if(!fs.existsSync(file)){
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch(e){
        return defaultData;
    }
}

function writeJSON(file, data){
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ======================== */
/* CONFIG API */
/* ======================== */

const DEFAULT_CONFIG = {
    examDuration: 5400,
    proctoringEnabled: true,
    autoScreenRecord: false
};

app.get("/api/config", (req, res) => {
    const config = readJSON(CONFIG_FILE, DEFAULT_CONFIG);
    res.json(config);
});

app.put("/api/config", (req, res) => {
    const current = readJSON(CONFIG_FILE, DEFAULT_CONFIG);
    const updated = {...current, ...req.body};
    writeJSON(CONFIG_FILE, updated);
    res.json({success: true, config: updated});
});

/* ======================== */
/* SECTIONS API */
/* ======================== */

app.get("/api/sections", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    data.sections.sort((a,b) => a.order - b.order);
    res.json(data.sections);
});

app.post("/api/sections", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const {name} = req.body;
    if(!name || !name.trim()){
        return res.status(400).json({error: "Section name is required"});
    }
    const maxId = data.sections.reduce((m, s) => Math.max(m, s.id), 0);
    const maxOrder = data.sections.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const section = {id: maxId + 1, name: name.trim(), order: maxOrder + 1};
    data.sections.push(section);
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true, section});
});

app.put("/api/sections/reorder", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const {orderedIds} = req.body;
    if(!Array.isArray(orderedIds)) return res.status(400).json({error: "orderedIds array required"});
    data.sections.forEach(s => {
        const idx = orderedIds.indexOf(s.id);
        if(idx !== -1) s.order = idx + 1;
    });
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true});
});

app.put("/api/sections/:id", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const id = parseInt(req.params.id);
    const index = data.sections.findIndex(s => s.id === id);
    if(index === -1) return res.status(404).json({error: "Section not found"});
    data.sections[index] = {...data.sections[index], ...req.body, id};
    writeJSON(SECTIONS_FILE, data);
    res.json({success: true, section: data.sections[index]});
});

app.delete("/api/sections/:id", (req, res) => {
    const data = readJSON(SECTIONS_FILE, {sections: []});
    const id = parseInt(req.params.id);
    data.sections = data.sections.filter(s => s.id !== id);
    writeJSON(SECTIONS_FILE, data);
    const qData = readJSON(QUESTIONS_FILE, {questions: []});
    qData.questions = qData.questions.map(q => 
        q.sectionId === id ? {...q, sectionId: null} : q
    );
    writeJSON(QUESTIONS_FILE, qData);
    res.json({success: true});
});

/* ======================== */
/* QUESTIONS API */
/* ======================== */

app.get("/api/questions", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const {sectionId} = req.query;
    let result = data.questions;
    if(sectionId) {
        result = result.filter(q => q.sectionId === parseInt(sectionId));
    }
    res.json(result);
});

/* ADD QUESTION */app.post("/api/questions", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const q = req.body;
    const maxId = data.questions.reduce((max, item) => Math.max(max, item.id), 0);
    q.id = maxId + 1;
    data.questions.push(q);
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, question: q});
});

app.put("/api/questions/:id", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const id = parseInt(req.params.id);
    const index = data.questions.findIndex(q => q.id === id);
    if(index === -1) return res.status(404).json({error: "Question not found"});
    data.questions[index] = {...req.body, id};
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, question: data.questions[index]});
});

app.delete("/api/questions/:id", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const id = parseInt(req.params.id);
    data.questions = data.questions.filter(q => q.id !== id);
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true});
});

/* BULK IMPORT */

app.post("/api/questions/bulk", (req, res) => {
    const data = readJSON(QUESTIONS_FILE, {questions: []});
    const {questions} = req.body;
    if(!Array.isArray(questions)) return res.status(400).json({error: "questions array required"});
    let maxId = data.questions.reduce((max, item) => Math.max(max, item.id), 0);
    let imported = 0;
    questions.forEach(q => {
        if(!q.question) return;
        maxId++;
        data.questions.push({...q, id: maxId});
        imported++;
    });
    writeJSON(QUESTIONS_FILE, data);
    res.json({success: true, imported});
});

/* CHECK EMAIL */

app.post("/check-email", (req, res) => {
    const email = req.body.email;
    if(!fs.existsSync(FILE)) fs.writeFileSync(FILE, "");
    const data = fs.readFileSync(FILE, "utf8");
    const exists = data.includes(email);
    res.json({exists});
});

app.post("/save-result", (req, res) => {
    const result = req.body;
    const line = `\nEMAIL : ${result.email}\nSCORE : ${result.score}\nPERCENTAGE : ${result.percentage}%\nTIME : ${result.timeTaken}\n--------------------------------\n`;
    fs.appendFileSync(FILE, line);
    console.log("NEW SUBMISSION:\n" + line);
    res.json({success: true});
});

/* GET /api/results — parse emails.txt into structured JSON */

app.get("/api/results", (req, res) => {
    if(!fs.existsSync(FILE)){
        return res.json([]);
    }
    const data = fs.readFileSync(FILE, "utf8");
    const blocks = data.split("--------------------------------").filter(b => b.trim());
    const results = blocks.map(block => {
        const lines = block.trim().split("\n").map(l => l.trim());
        const emailLine = lines.find(l => l.startsWith("EMAIL :"));
        const scoreLine = lines.find(l => l.startsWith("SCORE :"));
        const pctLine = lines.find(l => l.startsWith("PERCENTAGE :"));
        const timeLine = lines.find(l => l.startsWith("TIME :"));
        if(!emailLine) return null;
        return {
            email: emailLine.replace("EMAIL :", "").trim(),
            score: scoreLine ? scoreLine.replace("SCORE :", "").trim() : "",
            percentage: pctLine ? pctLine.replace("PERCENTAGE :", "").trim() : "",
            time: timeLine ? timeLine.replace("TIME :", "").trim() : ""
        };
    }).filter(r => r !== null);
    res.json(results);
});

/* DELETE /api/results/:email — remove all submissions for a given email */

app.delete("/api/results/:email", (req, res) => {
    const emailToRemove = req.params.email.toLowerCase().trim();
    if(!fs.existsSync(FILE)){
        return res.json({success: true, removed: 0});
    }
    const data = fs.readFileSync(FILE, "utf8");
    const blocks = data.split("--------------------------------").filter(b => b.trim());
    const remaining = blocks.filter(block => {
        const emailLine = block.split("\n").find(l => l.trim().toLowerCase().startsWith("email :"));
        if(!emailLine) return true;
        const email = emailLine.replace(/EMAIL :/i, "").trim().toLowerCase();
        return email !== emailToRemove;
    });
    const removedCount = blocks.length - remaining.length;
    if(remaining.length > 0){
        fs.writeFileSync(FILE, "\n\n" + remaining.join("\n\n--------------------------------\n\n") + "\n\n--------------------------------\n");
    } else {
        fs.writeFileSync(FILE, "");
    }
    res.json({success: true, removed: removedCount});
});

/* ======================== */
/* PROCTORING (CAMERA / MICROPHONE / SCREEN SHARE) */
/* ======================== */

const PROCTOR_ONLINE_MS = 15000;
const PROCTOR_MAX_EVENTS = 60;
const proctorSessions = new Map();

function createLiveState(){
    return {
        requestAt: 0,
        camera: {offer: null, offerAt: 0, answer: null, answerAt: 0},
        screen: {offer: null, offerAt: 0, answer: null, answerAt: 0}
    };
}

function getProctorSession(email, create){
    const key = String(email || "").trim().toLowerCase();
    if(!key) return null;
    let session = proctorSessions.get(key);
    if(!session && create){
        session = {
            email: key,
            startedAt: Date.now(),
            lastSeen: Date.now(),
            stopped: false,
            sources: {camera: false, screen: false, audio: false},
            live: createLiveState(),
            events: []
        };
        proctorSessions.set(key, session);
    }
    return session || null;
}

function addProctorEvent(session, type, message){
    session.events.push({
        at: Date.now(),
        type: String(type || "event").slice(0, 40),
        message: String(message || "").slice(0, 200)
    });
    if(session.events.length > PROCTOR_MAX_EVENTS){
        session.events = session.events.slice(-PROCTOR_MAX_EVENTS);
    }
}

app.post("/api/proctoring/register", (req, res) => {
    const {email, camera, screen, audio} = req.body || {};
    const session = getProctorSession(email, true);
    if(!session) return res.status(400).json({error: "email required"});
    const nextSources = {camera: !!camera, screen: !!screen, audio: !!audio};
    if(session.sources.screen && !nextSources.screen){
        session.live.screen = {offer: null, offerAt: 0, answer: null, answerAt: 0};
    }
    session.sources = nextSources;
    session.lastSeen = Date.now();
    session.stopped = false;
    if(!session.events.some(e => e.type === "started")){
        addProctorEvent(session, "started", "Started the test with proctoring");
    }
    res.json({success: true});
});

app.post("/api/proctoring/heartbeat", (req, res) => {
    const session = getProctorSession((req.body || {}).email, false);
    if(!session) return res.json({success: true});
    session.lastSeen = Date.now();
    res.json({success: true});
});

app.post("/api/proctoring/event", (req, res) => {
    const {email, type, message} = req.body || {};
    const session = getProctorSession(email, true);
    if(!session) return res.status(400).json({error: "email required"});
    addProctorEvent(session, type, message);
    session.lastSeen = Date.now();
    res.json({success: true});
});

app.post("/api/proctoring/stop", (req, res) => {
    const session = getProctorSession((req.body || {}).email, false);
    if(!session) return res.json({success: true});
    session.stopped = true;
    session.lastSeen = Date.now();
    session.live = createLiveState();
    addProctorEvent(session, "stopped", "Proctoring stopped");
    res.json({success: true});
});

app.get("/api/proctoring/students", (req, res) => {
    const now = Date.now();
    const list = Array.from(proctorSessions.values()).map(session => ({
        email: session.email,
        startedAt: session.startedAt,
        lastSeen: session.lastSeen,
        lastSeenAgo: Math.max(0, Math.round((now - session.lastSeen) / 1000)),
        online: !session.stopped && (now - session.lastSeen) < PROCTOR_ONLINE_MS,
        stopped: session.stopped,
        sources: session.sources,
        live: {
            camera: {offerAt: session.live.camera.offerAt, answered: !!session.live.camera.answer},
            screen: {offerAt: session.live.screen.offerAt, answered: !!session.live.screen.answer}
        },
        events: session.events.slice(-10)
    }));
    list.sort((a, b) => (Number(b.online) - Number(a.online)) || (b.lastSeen - a.lastSeen));
    res.json(list);
});

app.delete("/api/proctoring/students/:email", (req, res) => {
    const key = String(req.params.email || "").trim().toLowerCase();
    proctorSessions.delete(key);
    res.json({success: true});
});

/* ======================== */
/* HELP CHAT */
/* ======================== */

const CHAT_MAX_MESSAGES = 200;
const CHAT_MAX_LENGTH = 1000;
const chatThreads = new Map();

function getChatThread(email, create){
    const key = String(email || "").trim().toLowerCase();
    if(!key) return null;
    let thread = chatThreads.get(key);
    if(!thread && create){
        thread = {email: key, messages: [], updatedAt: Date.now(), nextId: 1};
        chatThreads.set(key, thread);
    }
    return thread || null;
}

app.post("/api/chat/send", (req, res) => {
    const {email, from, message} = req.body || {};
    const thread = getChatThread(email, true);
    if(!thread) return res.status(400).json({error: "email required"});

    const sender = from === "admin" ? "admin" : "student";
    const text = String(message || "").trim().slice(0, CHAT_MAX_LENGTH);
    if(!text) return res.status(400).json({error: "message required"});

    const entry = {
        id: thread.nextId++,
        from: sender,
        message: text,
        at: Date.now(),
        readByStudent: sender === "student",
        readByAdmin: sender === "admin"
    };
    thread.messages.push(entry);
    if(thread.messages.length > CHAT_MAX_MESSAGES){
        thread.messages = thread.messages.slice(-CHAT_MAX_MESSAGES);
    }
    thread.updatedAt = entry.at;

    if(sender === "student"){
        const session = getProctorSession(email, false);
        if(session){
            addProctorEvent(session, "chat", "Student asked for help: " + text.slice(0, 120));
        }
    }

    res.json({success: true, message: entry});
});

app.get("/api/chat/messages/:email", (req, res) => {
    const thread = getChatThread(req.params.email, false);
    const viewer = req.query.viewer === "admin" ? "admin" : "student";
    const markRead = req.query.markRead === "1";
    if(!thread) return res.json({messages: [], unread: 0});

    if(markRead){
        thread.messages.forEach(m => {
            if(viewer === "admin" && m.from === "student") m.readByAdmin = true;
            if(viewer === "student" && m.from === "admin") m.readByStudent = true;
        });
    }

    const unread = thread.messages.filter(m => viewer === "admin"
        ? (m.from === "student" && !m.readByAdmin)
        : (m.from === "admin" && !m.readByStudent)
    ).length;

    res.json({messages: thread.messages.slice(-100), unread});
});

app.get("/api/chat/threads", (req, res) => {
    const list = Array.from(chatThreads.values()).map(thread => {
        const last = thread.messages[thread.messages.length - 1];
        return {
            email: thread.email,
            updatedAt: thread.updatedAt,
            unread: thread.messages.filter(m => m.from === "student" && !m.readByAdmin).length,
            lastMessage: last ? last.message : "",
            lastFrom: last ? last.from : null
        };
    });
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(list);
});

/* ======================== */
/* LIVE VIDEO / AUDIO SIGNALING */
/* ======================== */

app.post("/api/live/offer", (req, res) => {
    const {email, kind, sdp} = req.body || {};
    if(kind !== "camera" && kind !== "screen"){
        return res.status(400).json({error: "kind must be camera or screen"});
    }
    if(typeof sdp !== "string" || sdp.length < 20){
        return res.status(400).json({error: "sdp required"});
    }
    const session = getProctorSession(email, true);
    if(!session) return res.status(400).json({error: "email required"});
    if(!session.live) session.live = createLiveState();

    session.live[kind] = {offer: sdp, offerAt: Date.now(), answer: null, answerAt: 0};
    session.lastSeen = Date.now();
    res.json({success: true, offerAt: session.live[kind].offerAt});
});

app.get("/api/live/pending", (req, res) => {
    const list = [];
    proctorSessions.forEach(session => {
        if(session.stopped || !session.live) return;
        ["camera", "screen"].forEach(kind => {
            const state = session.live[kind];
            if(state && state.offer){
                list.push({email: session.email, kind, offerAt: state.offerAt, answered: !!state.answer});
            }
        });
    });
    res.json(list);
});

app.get("/api/live/offer/:email/:kind", (req, res) => {
    const session = getProctorSession(req.params.email, false);
    const kind = req.params.kind;
    const state = session && session.live ? session.live[kind] : null;
    if(!state || !state.offer) return res.status(404).json({error: "no offer"});
    res.json({email: session.email, kind, offerAt: state.offerAt, sdp: state.offer});
});

app.post("/api/live/answer", (req, res) => {
    const {email, kind, sdp, offerAt} = req.body || {};
    if(kind !== "camera" && kind !== "screen"){
        return res.status(400).json({error: "kind must be camera or screen"});
    }
    if(typeof sdp !== "string" || sdp.length < 20){
        return res.status(400).json({error: "sdp required"});
    }
    const session = getProctorSession(email, false);
    const state = session && session.live ? session.live[kind] : null;
    if(!state || !state.offer) return res.status(409).json({error: "no active offer"});
    if(offerAt && offerAt !== state.offerAt){
        return res.status(409).json({error: "stale offer"});
    }
    state.answer = sdp;
    state.answerAt = Date.now();
    res.json({success: true, answerAt: state.answerAt});
});

app.get("/api/live/sync/:email", (req, res) => {
    const session = getProctorSession(req.params.email, false);
    if(!session || !session.live){
        return res.json({requestAt: 0, answers: {camera: null, screen: null}});
    }
    session.lastSeen = Date.now();

    const answerFor = state => state.answer
        ? {sdp: state.answer, at: state.answerAt, offerAt: state.offerAt}
        : null;

    res.json({
        requestAt: session.live.requestAt,
        answers: {
            camera: answerFor(session.live.camera),
            screen: answerFor(session.live.screen)
        }
    });
});

app.post("/api/live/request", (req, res) => {
    const session = getProctorSession((req.body || {}).email, true);
    if(!session) return res.status(400).json({error: "email required"});
    if(!session.live) session.live = createLiveState();
    session.live.requestAt = Date.now();
    session.lastSeen = Date.now();
    res.json({success: true, requestAt: session.live.requestAt});
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
});
