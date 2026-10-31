"use strict";

let questions = [];
let sections = [];
let examDuration = 5400;
let totalSeconds = 5400;
let currentEmail = "";
let current = 0;
let submitted = false;
let userAnswers = [];
let markedForReview = [];
let visited = [];
let timerInterval = null;

/* PROCTORING (live camera / microphone / screen share) */
let proctorState = {
    email: "",
    active: false,
    cameraStream: null,
    audioStream: null,
    screenStream: null,
    heartbeatTimer: null,
    afterSetup: null,
    cameraDenied: false,
    audioDenied: false
};

/* Screen capture is started only from the student's explicit Share Screen click. */
let proctoringMode = "mandatory";

/* ========================================= */
/* CONTENT RENDERER - Images & Tables */
/* ========================================= */

function renderQuestionContent(text, images, tables, appendUnplacedAssets = true, assetReferenceText = text){
    if(!text) return "";
    let result = text;
    
    // Replace [table:N] with actual table HTML
    if(tables && tables.length > 0){
        tables.forEach(tbl => {
            const placeholder = `[table:${tbl.id}]`;
            if(result.includes(placeholder)){
                const tableHtml = buildQuizTableHtml(tbl);
                result = result.split(placeholder).join(tableHtml);
            }
        });
    }
    
    // Replace [img:N] with actual image HTML
    if(images && images.length > 0){
        images.forEach(img => {
            const placeholder = `[img:${img.id}]`;
            if(result.includes(placeholder)){
                const imgHtml = `<img src="${img.src}" alt="${img.alt || ''}" class="question-image" loading="lazy" decoding="async" style="${getQuestionImageStyle(img, false)}">`;
                result = result.split(placeholder).join(imgHtml);
            }
        });
    }
    
    // Append unplaced images at the end
    if(appendUnplacedAssets && images && images.length > 0){
        images.forEach(img => {
            const placeholder = `[img:${img.id}]`;
            if(!assetReferenceText.includes(placeholder)){
                result += `<img src="${img.src}" alt="${img.alt || ''}" class="question-image" loading="lazy" decoding="async" style="${getQuestionImageStyle(img, true)}">`;
            }
        });
    }
    
    // Append unplaced tables at the end
    if(appendUnplacedAssets && tables && tables.length > 0){
        tables.forEach(tbl => {
            const placeholder = `[table:${tbl.id}]`;
            if(!assetReferenceText.includes(placeholder)){
                result += buildQuizTableHtml(tbl);
            }
        });
    }
    
    // Convert newlines to <br> tags so multi-line text renders properly in HTML
    result = result.replace(/\n/g, '<br>');
    
    return result;
}

function getQuestionImageStyle(image, forceBlock){
    const width = Number(image && image.width);
    const widthStyle = Number.isFinite(width) ? `${Math.max(20, Math.min(100, width))}%` : 'auto';
    const alignment = image && ['left', 'center', 'right'].includes(image.alignment) ? image.alignment : 'left';
    const margin = alignment === 'center' ? '6px auto' : (alignment === 'right' ? '6px 0 6px auto' : '6px auto 6px 0');
    const display = forceBlock || alignment !== 'left' ? 'block' : 'inline-block';
    return `width:${widthStyle};max-width:100%;height:auto;border-radius:6px;margin:${margin};display:${display};vertical-align:middle`;
}

function buildQuizTableHtml(tbl){
    if(!tbl || !tbl.headers) return "";
    let html = '<div class="question-table-wrap" style="margin:10px 0;overflow-x:auto"><table style="border-collapse:collapse;width:auto;min-width:200px;margin:auto">';
    if(tbl.caption){
        html += `<caption style="font-size:12px;color:#666;font-style:italic;margin-bottom:4px">${escHtml(tbl.caption)}</caption>`;
    }
    html += '<thead><tr>';
    tbl.headers.forEach(h => {
        html += `<th style="border:1px solid #bbb;padding:8px 12px;background:#e3f2fd;font-weight:bold;text-align:center;font-size:13px">${escHtml(h)}</th>`;
    });
    html += '</tr></thead><tbody>';
    if(tbl.rows){
        tbl.rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td style="border:1px solid #bbb;padding:8px 12px;text-align:center;font-size:13px">${escHtml(cell)}</td>`;
            });
            html += '</tr>';
        });
    }
    html += '</tbody></table></div>';
    return html;
}

function escHtml(str){
    if(!str) return "";
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
}

function getInlineResultImageLookup(questionData){
    const bySrc = new Map();
    const byIndex = [];
    (questionData || []).forEach(function(question){
        (question.images || []).forEach(function(image){
            const src = String(image.src || "");
            if(!/^data:image\//i.test(src) || bySrc.has(src)) return;
            bySrc.set(src, byIndex.length);
            byIndex.push(src);
        });
    });
    return {bySrc: bySrc, byIndex: byIndex};
}

function compactReviewHtmlForStorage(reviewHtml, questionData){
    const html = String(reviewHtml || "");
    if(!/src="data:image\//i.test(html)) return reviewHtml;
    const lookup = getInlineResultImageLookup(questionData);
    if(lookup.byIndex.length === 0) return html;
    return html.replace(/src="([^"]+)"/g, function(attribute, src){
        const imageIndex = lookup.bySrc.get(src);
        return imageIndex === undefined ? attribute : 'data-cbt-image="' + imageIndex + '"';
    });
}

function restoreResultReviewImages(review){
    if(!review) return;
    const sources = window.__resultImageSources || [];
    review.querySelectorAll("img[data-cbt-image]").forEach(function(image){
        const src = sources[Number(image.getAttribute("data-cbt-image"))];
        if(!src) return;
        image.setAttribute("src", src);
        image.removeAttribute("data-cbt-image");
    });
}

/* ========================================= */
/* SECTION / SUBSECTION HELPERS */
/* ========================================= */

function getQuestionSection(index){
    const q = questions[index];
    if(!q) return null;
    return sections.find(s => s.id === q.sectionId) || null;
}

function getQuestionSubsection(index){
    const q = questions[index];
    if(!q) return null;
    const sec = getQuestionSection(index);
    if(!sec) return null;
    const subs = getSectionSubsections(sec);
    return subs.find(sub => sub.id === (q.subsection || q.type)) || null;
}

/* LOAD DATA FROM SERVER */

async function loadQuestionsFromServer(){

    document.getElementById("startBtn").disabled = true;
    document.getElementById("startBtn").textContent = "Loading...";

    try{
        const [qRes, sRes, cRes] = await Promise.all([
            fetch("/api/questions"),
            fetch("/api/sections"),
            fetch("/api/config")
        ]);

        if(!qRes.ok) throw new Error("Questions server returned "+qRes.status);
        if(!sRes.ok) throw new Error("Sections server returned "+sRes.status);
        if(!cRes.ok) throw new Error("Config server returned "+cRes.status);

        const qData = await qRes.json();
        const sData = await sRes.json();
        const cData = await cRes.json();

        questions = qData;
        sections = sData;
        examDuration = cData.examDuration || 5400;
        totalSeconds = examDuration;

        proctoringMode = cData.proctoringEnabled === false ? "off" : "mandatory";

        updateTimerDisplay();

        document.getElementById("startBtn").disabled = false;
        document.getElementById("startBtn").textContent = "Start Test";

        initQuiz();
    }

    catch(err){
        console.error("Failed to load data",err);
        document.getElementById("loginPage").innerHTML =
        "<h1>Error loading data.</h1><p>Make sure the server is running.</p>";
    }
}

function saveProgress(){

    if(currentEmail==="")
        return;

    const progressData = {

        answers:userAnswers,

        review:markedForReview,

        time:totalSeconds,

        current:current
    };

    localStorage.setItem(

        "progress_" + currentEmail,

        JSON.stringify(progressData)
    );
}

/* ========================================= */
/* LOGIN SYSTEM */
/* ========================================= */

async function startQuiz(){

    const email =

    document.getElementById(
        "emailInput"
    )
    .value
    .trim()
    .toLowerCase();

    const emailPattern =

/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if(email===""){

        await showModal("Enter Email");

        return;
    }

    if(!emailPattern.test(email)){

        await showModal(
        "Enter Valid Email Address"
        );

        return;
    }

    currentEmail = email;

    fetch("/check-email",{

        method:"POST",

        headers:{
            "Content-Type":
            "application/json"
        },

        body:JSON.stringify({
            email:currentEmail
        })
    })

    .then(res=>res.json())

    .then(async function(data){

        /* ALREADY GAVE TEST */

        if(data.exists){

    exitFullscreen();

    const oldResult =

    localStorage.getItem(
        "quiz_" + email
    );

    if(oldResult){

        showPreviousResult(

            JSON.parse(oldResult)
        );
    }

    else{

        await showModal(
        "This email already gave the test."
        );
    }

    return;
}

        const savedProgress =

        localStorage.getItem(
            "progress_" + email
        );

        /* SHOW INSTRUCTIONS FIRST */

        document.getElementById(
            "loginPage"
        ).style.display="none";

        /* HELP CHAT WITH THE EXAM CONDUCTOR */
        setupStudentChat(currentEmail);

/* CAMERA / MICROPHONE PROCTORING SETUP */
        if(proctoringMode === "off"){
            /* Conductor disabled proctoring — go straight to instructions. */
            showFirstInstructions(savedProgress, function(){});
        } else {
            startProctoringSetup(function(){
                showFirstInstructions(savedProgress, function(){});
            });
        }
    });
}

/* Show the first instructions screen. Used both when proctoring is off and
   after the proctoring setup completes. */
function showFirstInstructions(savedProgress, onDone){
    if(savedProgress){
        const data = JSON.parse(savedProgress);
        userAnswers = data.answers;
        markedForReview = data.review;
        totalSeconds = data.time;
        current = data.current;

        document.getElementById("quizContainer").style.display="flex";

        restoreAnswers();
        gotoQuestion(current);
        for(let i=0; i<questions.length; i++){
            updateNavColor(i);
        }
        updateTimerDisplay();
        startTimer();
        enterFullscreen();

        if(typeof onDone === "function") onDone();
        return;
    }

    /* Keep the general test instructions before starting. Section-specific
       guidance is displayed on every question instead of interrupting the test. */
    buildInstructionsContent();
    document.getElementById("instructionsOverlay").style.display="flex";
    if(typeof onDone === "function") onDone();
}

/* ========================================= */
/* INSTRUCTIONS OVERLAY                      */
/* ========================================= */

function getSectionSubsections(section){
    if(section.subsections && Array.isArray(section.subsections) && section.subsections.length > 0){
        return section.subsections;
    }
    const defaultLabels = {single:"Single Correct (SCQ)", multi:"Multiple Correct Questions", numerical:"Integer / Numerical"};
    const defaultTypes = {single:"single", multi:"multi", numerical:"numerical"};
    const order = section.subsectionOrder || ["single","multi","numerical"];
    return order.map(id => ({
        id: id,
        label: defaultLabels[id] || id,
        type: defaultTypes[id] || id
    }));
}

function getQuestionTotalMarks(q){
    return (q.totalMarks != null ? Number(q.totalMarks) : 4);
}

function getQuestionNegativeMarks(q){
    return (q.negativeMarks != null ? Number(q.negativeMarks) : 1);
}

function generateInstructionsHtml(qData, secData, showNavigation){
    if (!qData || !Array.isArray(qData) || qData.length === 0) return '';
    if (!secData || !Array.isArray(secData)) secData = [];

    let html = "";

    /* Compute aggregate marks from all questions */
    let defaultTotal = 4, defaultNeg = 1;
    let totalMarksSum = 0, negMarksSum = 0, qCount = qData.length;
    if(qCount > 0){
        qData.forEach(q => {
            totalMarksSum += getQuestionTotalMarks(q);
            negMarksSum += getQuestionNegativeMarks(q);
        });
        defaultTotal = Math.round(totalMarksSum / qCount);
        defaultNeg = Math.round(negMarksSum / qCount);
    }

    /* SECTIONS */
    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCC2 Sections</h2>';
    html += '<p>The test has the following sections:</p>';
    html += '<ul class="instruction-list">';
    secData.forEach(section => {
        var subs = getSectionSubsections(section);
        var count = qData.filter(function(q){ return q.sectionId === section.id; }).length;
        var subLabels = subs.map(function(sub){ return sub.label; }).join(", ");
        html += '<li><strong>' + escHtml(section.name) + '</strong> \u2014 ' + count + ' question' + (count !== 1 ? 's' : '') + '<br><span class="instruction-sub">Types: ' + subLabels + '</span></li>';
    });
    html += '</ul></div>';

    /* QUESTION TYPES */
    var seenTypes = {};
    var typeCards = "";
    secData.forEach(section => {
        var subs = getSectionSubsections(section);
        subs.forEach(sub => {
            if(seenTypes[sub.id]) return;
            seenTypes[sub.id] = true;
            var typeInfo = getTypeInfo(sub.type, sub.label);
            if(typeInfo){
                typeCards += '<li><span class="type-badge ' + typeInfo.badgeClass + '">' + typeInfo.shortLabel + '</span><strong>' + escHtml(sub.label) + '</strong> \u2014 ' + typeInfo.description + '</li>';
            }
        });
    });
    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCCB Question Types</h2>';
    html += '<ul class="instruction-list instruction-types">' + typeCards + '</ul></div>';

    /* MARKING SCHEME */
    var totalMarkDisplay = Number.isInteger(Number(defaultTotal)) ? Number(defaultTotal) : defaultTotal;
    var negMarkDisplay = Number.isInteger(Number(defaultNeg)) ? Number(defaultNeg) : defaultNeg;

    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCCA Marking Scheme</h2>';
    html += '<div class="marking-table-wrap"><table class="marking-table"><thead><tr><th>Result</th><th>Marks</th></tr></thead><tbody>';
    html += '<tr><td>\u2705 Correct answer</td><td class="marks-positive">+' + totalMarkDisplay + '</td></tr>';
    html += '<tr><td>\u274C Incorrect answer</td><td class="marks-negative">-' + negMarkDisplay + '</td></tr>';
    html += '<tr><td>\u23ED\uFE0F Not attempted</td><td class="marks-neutral">0</td></tr>';
    html += '<tr><td>\u26A0\uFE0F Multiple Correct \u2014 if any correct option is missed</td><td class="marks-partial">+1</td></tr>';
    html += '<tr><td>\u274C Multiple Correct \u2014 wrong option selected</td><td class="marks-negative">-' + negMarkDisplay + '</td></tr>';
    html += '</tbody></table></div>';
    html += '</div>';

    /* NAVIGATION GUIDE - only in on-screen overlay, not in QP PDF */
    if (showNavigation !== false) {
    html += '<div class="instruction-card">';
    html += '<h2>\uD83E\uDDED Navigation</h2>';
    html += '<ul class="instruction-list">';
    html += '<li><span class="nav-dot green-dot"></span><strong>Green</strong> \u2014 Answered</li>';
    html += '<li><span class="nav-dot red-dot"></span><strong>Red</strong> \u2014 Visited but not answered</li>';
    html += '<li><span class="nav-dot yellow-dot"></span><strong>Yellow</strong> \u2014 Marked for review</li>';
    html += '<li><span class="nav-dot white-dot"></span><strong>White</strong> \u2014 Not visited</li>';
    html += '</ul></div>';
    }

    return html;
}

function buildInstructionsContent(){
    var html = generateInstructionsHtml(questions, sections);
    var body = document.getElementById("instructionsBody");
    if(window.MathJax && typeof MathJax.typesetClear === "function"){
        MathJax.typesetClear([body]);
    }
    body.innerHTML = html;

    if(window.MathJax && typeof MathJax.typesetPromise === "function"){
        MathJax.typesetPromise([body]).catch(function(){});
    }
}

function getTypeInfo(type, label){
    if(type === "single"){
        return {
            shortLabel: "SCQ",
            badgeClass: "type-scq",
            description: "Exactly one option is correct. Select it."
        };
    }
    if(type === "multi"){
        return {
            shortLabel: "MCQ",
            badgeClass: "type-mcq",
            description: "One or more options may be correct. Select every correct option."
        };
    }
    if(type === "numerical"){
        return {
            shortLabel: "NUM",
            badgeClass: "type-num",
            description: "Enter the numerical answer in the answer box."
        };
    }
    return null;
}

function continueToTest(){

    enterFullscreen();

    document.getElementById(
        "instructionsOverlay"
    ).style.display="none";

    document.getElementById(
        "quizContainer"
    ).style.display="flex";

    /* Reset button for potential re-show */
    document.getElementById(
        "continueBtn"
    ).textContent = "▶ Continue Test";

    document.getElementById(
        "continueBtn"
    ).onclick = continueToTest;

    updateTimerDisplay();

    startTimer();

    enterFullscreen();
}

function showInstructionsOverlay(){

    if(submitted)
        return;

    buildInstructionsContent();

    /* Switch to resume mode */
    document.getElementById(
        "continueBtn"
    ).textContent = "◀ Resume Test";

    document.getElementById(
        "continueBtn"
    ).onclick = hideInstructionsOverlay;

    document.getElementById(
        "instructionsOverlay"
    ).style.display="flex";
}

function hideInstructionsOverlay(){

    document.getElementById(
        "instructionsOverlay"
    ).style.display="none";

    /* Reset button */
    document.getElementById(
        "continueBtn"
    ).textContent = "▶ Continue Test";

    document.getElementById(
        "continueBtn"
    ).onclick = continueToTest;
}

/* ========================================= */
/* CUSTOM MODAL (does not trigger fullscreen exit) */
/* ========================================= */

function showModal(message, isConfirm = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box';
        
        const box = document.createElement('div');
        box.className = 'custom-modal';
        box.style.cssText = 'background:white;border-radius:14px;padding:28px 32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:modalFadeIn 0.25s ease-out;text-align:center';
        
        const msgEl = document.createElement('p');
        msgEl.className = 'custom-modal-message';
        msgEl.style.cssText = 'margin:0 0 22px 0;font-size:16px;color:#333;line-height:1.6;font-family:Arial,sans-serif';
        msgEl.textContent = message;
        
        const btnWrap = document.createElement('div');
        btnWrap.className = 'custom-modal-buttons';
        btnWrap.style.cssText = 'display:flex;gap:10px;justify-content:center';
        
        if(isConfirm) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'custom-modal-cancel-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding:10px 24px;border-radius:8px;border:2px solid #ccc;background:#f5f5f5;color:#555;font-size:14px;font-weight:bold;cursor:pointer;transition:0.15s;font-family:Arial,sans-serif';
            cancelBtn.onmouseover = function(){ this.style.borderColor = '#999'; };
            cancelBtn.onmouseout = function(){ this.style.borderColor = '#ccc'; };
            cancelBtn.onclick = function() {
                document.body.removeChild(overlay);
                resolve(false);
            };
            btnWrap.appendChild(cancelBtn);
        }
        
        const okBtn = document.createElement('button');
        okBtn.className = 'custom-modal-ok-btn';
        okBtn.textContent = isConfirm ? 'Submit' : 'OK';
        okBtn.style.cssText = 'padding:10px 24px;border-radius:8px;border:2px solid transparent;background:#1976d2;color:white;font-size:14px;font-weight:bold;cursor:pointer;transition:0.15s;font-family:Arial,sans-serif';
        okBtn.onmouseover = function(){ this.style.borderColor = 'white'; };
        okBtn.onmouseout = function(){ this.style.borderColor = 'transparent'; };
        okBtn.onclick = function() {
            document.body.removeChild(overlay);
            resolve(true);
        };
        btnWrap.appendChild(okBtn);
        
        box.appendChild(msgEl);
        box.appendChild(btnWrap);
        overlay.appendChild(box);
        
        // Handle dark mode
        if(document.body.classList.contains('darkMode')) {
            box.style.background = '#2a2a2a';
            msgEl.style.color = '#e0e0e0';
            const cancel = box.querySelector('.custom-modal-cancel-btn');
            if(cancel) {
                cancel.style.background = '#3a3a3a';
                cancel.style.color = '#ccc';
                cancel.style.borderColor = '#555';
            }
        }
        
        document.body.appendChild(overlay);
        
        // Focus trap - focus the OK button
        setTimeout(function(){ okBtn.focus(); }, 50);
    });
}

/* full screen */

function enterFullscreen(){

    const elem = document.documentElement;
    const request = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen;

    if(!request || document.fullscreenElement) return;

    try{
        const result = request.call(elem);
        if(result && typeof result.catch === "function") result.catch(function(){});
    } catch(err){}
}

/* The exam always runs fullscreen: any click or key while the test is on screen
   and fullscreen is not active asks the browser to re-enter it. */
function ensureExamFullscreen(){
    if(submitted) return;
    const quiz = document.getElementById("quizContainer");
    if(!quiz || quiz.style.display === "none") return;
    if(document.fullscreenElement) return;
    enterFullscreen();
}

function bindFullscreenNudge(){
    if(bindFullscreenNudge.done) return;
    bindFullscreenNudge.done = true;

    ["click", "keydown", "touchstart"].forEach(function(evt){
        document.addEventListener(evt, ensureExamFullscreen, true);
    });
}

function exitFullscreen(){
    let exit = null;
    if(document.exitFullscreen){
        exit = document.exitFullscreen;
    }
    else if(document.webkitExitFullscreen){
        exit = document.webkitExitFullscreen;
    }
    else if(document.msExitFullscreen){
        exit = document.msExitFullscreen;
    }

    if(!exit) return Promise.resolve();
    try{
        return Promise.resolve(exit.call(document)).catch(function(){});
    } catch(err){
        return Promise.resolve();
    }
}

/* ========================================= */
/* RENDER QUESTIONS */
/* ========================================= */

function renderQuestions(){

    let html = "";

    questions.forEach((q,index)=>{

        const sec = getQuestionSection(index);
        const sub = getQuestionSubsection(index);
        let headerHtml = '';
        if(sec) {
            const questionType = (sub && sub.type) || q.type;
            const typeInfo = getTypeInfo(questionType, sub && sub.label);
            const totalMarks = getQuestionTotalMarks(q);
            const negativeMarks = getQuestionNegativeMarks(q);
            const markingText = q.type === "multi"
                ? `+${totalMarks} all correct · +1 if correct options are missed without selecting a wrong option · -${negativeMarks} if any wrong option is selected · 0 unanswered`
                : `+${totalMarks} correct · -${negativeMarks} incorrect · 0 unanswered`;

            headerHtml = `<div class="question-section-header">
                <div class="question-section-title">
                    <span class="q-section-name">${escHtml(sec.name)}</span>`;
            if(sub) {
                headerHtml += ` <span class="q-section-sep">›</span> <span class="q-subsection-name">${escHtml(sub.label)}</span>`;
            }
            headerHtml += `</div>`;
            if(typeInfo) {
                headerHtml += `<div class="question-section-instruction"><strong>Instructions:</strong> ${escHtml(typeInfo.description)}</div>`;
            }
            headerHtml += `<div class="question-section-marking"><strong>Marking:</strong> ${escHtml(markingText)}</div>
            </div>`;
        }

        html += `
        <div
        class="question ${index===0 ? 'active' : ''}"
        id="q${index}">

        <div class="question-content-column">

        ${headerHtml}

        <div class="question-scrollable">

        <h2>Q${index+1}</h2>

        <div class="question-text">

${
renderQuestionContent(
    q.question,
    q.images || [],
    q.tables || [],
    true,
    [q.question].concat(q.options || []).join("\n")
)
}

</div>
        `;

        /* SINGLE */

        if(q.type==="single"){

            q.options.forEach((op,i)=>{

                const renderedOption = renderQuestionContent(op, q.images || [], q.tables || [], false);
                const letter = String.fromCharCode(65 + i);

                html += `
                <div class="option">

                <label>

                <input
                type="radio"
                name="q${index}"
                onchange="saveSingle(${index},${i})">

                <span class="option-letter">${letter}.</span> ${renderedOption}

                </label>

                </div>
                `;
            });
        }

        /* MULTI */

        else if(q.type==="multi"){

            q.options.forEach((op,i)=>{

                const renderedOption = renderQuestionContent(op, q.images || [], q.tables || [], false);
                const letter = String.fromCharCode(65 + i);

                html += `
                <div class="option">

                <label>

                <input
                type="checkbox"
                class="multi${index}"
                value="${i}"
                onchange="saveMulti(${index})">

                <span class="option-letter">${letter}.</span> ${renderedOption}

                </label>

                </div>
                `;
            });
        }

        /* NUMERICAL */

        else{

            html += `
            <input
            type="number"
            placeholder="Answer"
            value="${userAnswers[index] ?? ""}"
            oninput="saveNumerical(${index},this.value)">
            `;
        }

        html += `
            </div>

            <div class="question-action-bar">

                <div class="question-action-row">

                    <button
                    class="clearRespBtn"
                    onclick="clearResponse(${index})">

                    Clear Response

                    </button>

                    <button
                    class="reviewBtn"
                    onclick="markReview(${index})">

                    Mark For Review

                    </button>

                    <button
                    class="clearReviewBtn"
                    onclick="clearReview(${index})">

                    Clear Review

                    </button>

                </div>

                <div class="question-nav-row">

                    <button
                    class="prevBtn"
                    onclick="prevQuestion()">

                    Previous

                    </button>

                    <button
                    class="nextBtn"
                    onclick="nextQuestion()">

                    Save & Next

                    </button>

                </div>

            </div>

        </div>`;
    });

    const questionsContainer = document.getElementById("questions");
    questionsContainer.innerHTML = html;
    questions.forEach((_, index) => {
        const questionElement = document.getElementById(`q${index}`);
        if(questionElement && questionElement.parentElement !== questionsContainer){
            questionsContainer.appendChild(questionElement);
        }
    });
    typesetQuestion(0);
}

function typesetQuestion(index){
    const question = document.getElementById("q" + index);
    if(!question || !window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
    if(!/\\\(/.test(question.textContent || "")) return;
    return window.MathJax.typesetPromise([question]).catch(function(){});
}

/* ========================================= */
/* NAVIGATION */
/* ========================================= */

function renderNav(){

    let html = "";
    let globalIdx = 0;

    sections.forEach(section => {

        const subs = getSectionSubsections(section);
        const sectionQuestions = questions.filter(q => q.sectionId === section.id);
        if(sectionQuestions.length === 0) return;

        html += `<div class="sectionLabel clickable-section" onclick="onSectionClick(${section.id})" title="Jump to the first question in ${escHtml(section.name)}">
            <span class="section-arrow">▶</span>
            ${escHtml(section.name)}
        </div>`;

        subs.forEach(sub => {

            const subQs = sectionQuestions.filter(q => (q.subsection || q.type) === sub.id);
            if(subQs.length === 0) return;

            const firstQIdx = questions.indexOf(subQs[0]);
            html += `<div class="subsectionLabel clickable-subsection" onclick="onSubsectionClick(${section.id},'${sub.id}')" title="Jump to the first ${escHtml(sub.label)} question">
                <span class="subsection-arrow">▸</span>
                ${escHtml(sub.label)}
            </div>`;
            html += `<div class="sectionNavGrid">`;

            subQs.forEach(q => {
                const idx = questions.indexOf(q);
                const isFirst = idx === firstQIdx;
                html += `
                <button
                class="navbtn${isFirst ? ' first-in-subsection' : ''}"
                id="nav${idx}"
                onclick="gotoQuestion(${idx})" 
                title="Go to question ${globalIdx+1}">

                ${globalIdx+1}

                </button>
                `;
                globalIdx++;
            });

            html += `</div>`;
        });
    });

    document.getElementById("allNav").innerHTML = html;
}

function updateProgressBar(){

    let attempted = 0;

    userAnswers.forEach(ans=>{

        if(
            ans!==null &&
            ans!=="" &&
            !(Array.isArray(ans) &&
            ans.length===0)
        ){

            attempted++;
        }
    });

    const percent =

    (attempted/questions.length)*100;

    document.getElementById(
        "progressBar"
    ).style.width =

    percent + "%";

    document.getElementById(
        "progressText"
    ).innerHTML =

    `${attempted} / ${questions.length} Attempted`;
}

function updateNavColor(index){

    const btn =

    document.getElementById(
        "nav"+index
    );

    /* RESET */

    btn.className = "navbtn";

    /* REVIEW */

    if(markedForReview[index]){

        btn.classList.add(
            "yellow"
        );

        return;
    }

    const ans =
    userAnswers[index];

    const attempted =

    ans!==null &&
    ans!=="" &&
    !(Array.isArray(ans) &&
    ans.length===0);

    /* ATTEMPTED */

    if(attempted){

        btn.classList.add(
            "green"
        );
    }

    /* VISITED BUT NOT ANSWERED */

    else if(visited[index]){

        btn.classList.add(
            "red"
        );
    }

    /* NEVER VISITED - no extra color class */
}

function gotoQuestion(index){
    if(submitted) return;
    if(!Number.isInteger(index) || index < 0 || index >= questions.length) return;

    const questionsContainer = document.getElementById("questions");
    const nextQuestion = document.getElementById(`q${index}`);
    if(!questionsContainer || !nextQuestion || !questionsContainer.contains(nextQuestion)) return;

    visited[index]=true;

    questionsContainer.querySelectorAll(".question.active").forEach(question => {
        question.classList.remove("active");
        question.setAttribute("aria-hidden", "true");
    });

    // Keep the selected question as a direct flex child if imported content
    // caused later questions to be nested inside an earlier question.
    if(nextQuestion.parentElement !== questionsContainer){
        questionsContainer.appendChild(nextQuestion);
    }
    nextQuestion.classList.add("active");
    nextQuestion.setAttribute("aria-hidden", "false");

    current=index;
    updateNavColor(index);

    const questionScroll = nextQuestion.querySelector(".question-scrollable");
    const resetQuestionScroll = function(){
        if(!questionScroll) return;
        questionScroll.scrollTop = 0;
        questionScroll.scrollLeft = 0;
    };
    resetQuestionScroll();
    requestAnimationFrame(resetQuestionScroll);

    const typesetPromise = typesetQuestion(index);
    if(typesetPromise && typeof typesetPromise.then === "function"){
        typesetPromise.then(function(){ requestAnimationFrame(resetQuestionScroll); });
    }
}

function    gotoSection(sectionName){

    if(submitted)
        return;

    for(let i=0;i<questions.length;i++){

        const sec = sections.find(s => s.name === sectionName);
        if(sec && questions[i].sectionId === sec.id){
            gotoQuestion(i);
            break;
        }
    }
}

function onSectionClick(sectionId){
    if(submitted) return;
    const firstQuestionIndex = questions.findIndex(q => q.sectionId === sectionId);
    if(firstQuestionIndex >= 0) gotoQuestion(firstQuestionIndex);
}

function onSubsectionClick(sectionId, subId){
    if(submitted) return;
    const firstQuestionIndex = questions.findIndex(q => q.sectionId === sectionId && (q.subsection || q.type) === subId);
    if(firstQuestionIndex >= 0) gotoQuestion(firstQuestionIndex);
}

async function nextQuestion(){

    if(submitted)
        return;

    if(current<questions.length-1){

        gotoQuestion(current+1);
    } else if(current === questions.length - 1) {
        await showModal("This is the last question of test");
    }
}

function prevQuestion(){

    if(submitted)
        return;

    if(current>0){

        gotoQuestion(current-1);
    }
}

/* ========================================= */
/* SAVE ANSWERS */
/* ========================================= */

function saveSingle(index,val){

    if(submitted)
        return;

    userAnswers[index]=val;

    updateNavColor(index);

    updateProgressBar();
}

function saveMulti(index){

    if(submitted)
        return;

    let arr=[];

    document.querySelectorAll(`.multi${index}`)
    .forEach((x,i)=>{

        if(x.checked)
            arr.push(i);
    });

    userAnswers[index]=arr;

    updateNavColor(index);

    updateProgressBar();
    
}

function saveNumerical(index,val){

    if(submitted)
        return;

    userAnswers[index]=val;

    updateNavColor(index);

    updateProgressBar();
}

document.addEventListener(

    "contextmenu",

    e => e.preventDefault()
);

document.addEventListener(

    "keydown",

    function(e){

        if(

            (e.ctrlKey &&
            (e.key==="c" ||
             e.key==="u" ||
             e.key==="s"))

            ||

            e.key==="F12"
        ){

            e.preventDefault();
        }
    }
);

document.addEventListener(

    "selectstart",

    function(e){

        if(

            e.target.tagName !== "INPUT" &&

            e.target.tagName !== "TEXTAREA"
        ){

            e.preventDefault();
        }
    }
);



/* ========================================= */
/* CLEAR */
/* ========================================= */

function clearSingle(index){

    if(submitted)
        return;

    document
    .querySelectorAll(`input[name="q${index}"]`)
    .forEach(x=>x.checked=false);

    userAnswers[index]=null;

    updateNavColor(index);
    updateProgressBar();
}

function clearMulti(index){

    if(submitted)
        return;

    document
    .querySelectorAll(`.multi${index}`)
    .forEach(x=>x.checked=false);

    userAnswers[index]=[];

    updateNavColor(index);
    updateProgressBar();
}

function markReview(index){

    markedForReview[index]=true;

    updateNavColor(index);
}

function clearReview(index){

    markedForReview[index]=false;

    updateNavColor(index);
}

function clearResponse(index){

    if(submitted)
        return;

    const q = questions[index];

    if(!q) return;

    if(q.type==="single"){

        clearSingle(index);
    }

    else if(q.type==="multi"){

        clearMulti(index);
    }

    else if(q.type==="numerical"){

        const input = document.querySelector(`#q${index} input[type="number"]`);

        if(input) input.value="";

        userAnswers[index]=null;

        updateNavColor(index);

        updateProgressBar();
    }
}

/* ========================================= */
/* HELPERS */
/* ========================================= */

function arraysEqual(a,b){

    if(a.length!==b.length)
        return false;

    a=[...a].sort();

    b=[...b].sort();

    for(let i=0;i<a.length;i++)
        if(a[i]!==b[i])
            return false;

    return true;
}

/* ========================================= */
/* GRADING */
/* ========================================= */

function gradeQuestion(q, user){

    if(
        user===null ||
        user==="" ||
        (Array.isArray(user) && user.length===0)
    )
        return 0;

    const totalMarks = getQuestionTotalMarks(q);
    const negativeMarks = getQuestionNegativeMarks(q);

    /* SINGLE */

    if(q.type==="single"){

        return user===q.answer ? totalMarks : -negativeMarks;
    }

    /* MULTI */

    if(q.type==="multi"){

        for(let x of user){

            if(!q.answer.includes(x))
                return -negativeMarks;
        }

        if(arraysEqual(user,q.answer))
            return totalMarks;

        /* Some correct options missing (and none wrong) -> fixed 1 mark */

        return 1;
    }

    /* NUMERICAL */

    if(q.type==="numerical"){

        return Number(user)===q.answer
        ? totalMarks
        : -negativeMarks;
    }

    return 0;
}

/* ========================================= */
/* SUBMIT */
/* ========================================= */

async function submitTest(autoSubmitted = false){

    if(submitted)
        return;

    if(!autoSubmitted){
        const confirmSubmit = await showModal(

        "Are you sure you want to submit the test?",
        true

        );

        if(!confirmSubmit)
            return;
    }

    if(submitted) return;
    submitted = true;
    clearInterval(timerInterval);
    timerInterval = null;
    stopProctoring(true);
    stopStudentChat();
    await exitFullscreen();

    localStorage.removeItem(
    "progress_" + currentEmail
);

    let total = 0;

    let attempted = 0;

    let reviewHTML = "";

    /* For section/subsection breakdown */
    let sectionMarks = {};
    let subsectionMarks = {};

    sections.forEach(sec => {
        sectionMarks[sec.id] = {name: sec.name, total: 0, max: 0};
        const subs = getSectionSubsections(sec);
        subs.forEach(sub => {
            const key = sec.id + "_" + sub.id;
            subsectionMarks[key] = {sectionId: sec.id, sectionName: sec.name, subId: sub.id, subLabel: sub.label, total: 0, max: 0};
        });
    });

    questions.forEach((q,i)=>{

        const user = userAnswers[i];

        const marks = gradeQuestion(q,user);

        total += marks;

        const qTotalMarks = getQuestionTotalMarks(q);

        /* Section-wise */
        if(sectionMarks[q.sectionId]){
            sectionMarks[q.sectionId].total += marks;
            sectionMarks[q.sectionId].max += qTotalMarks;
        }

        /* Subsection-wise */
        const subKey = q.sectionId + "_" + (q.subsection || q.type);
        if(subsectionMarks[subKey]){
            subsectionMarks[subKey].total += marks;
            subsectionMarks[subKey].max += qTotalMarks;
        }
        const subLabel = subsectionMarks[subKey] ? subsectionMarks[subKey].subLabel : '';
        const secName = sectionMarks[q.sectionId] ? sectionMarks[q.sectionId].name : '';


        /* ATTEMPTED */

        if(
            user!==null &&
            user!=="" &&
            !(Array.isArray(user) &&
            user.length===0)
        ){
            attempted++;
        }

        /* STATUS */

        let status = "";

        if(
            user===null ||
            user==="" ||
            (Array.isArray(user) &&
            user.length===0)
        ){

            status = "UNATTEMPTED";
        }

        else if(marks>0){

            if(marks >= getQuestionTotalMarks(q))
                status = "CORRECT";

            else
                status = "PARTIALLY CORRECT";
        }

        else{

            status = "WRONG";
        }

        /* USER ANSWER */

        let userText = "";

        if(q.type==="single"){

            if(user===null){

                userText="Not Answered";
            }

            else{

                userText = String.fromCharCode(65 + user);
            }
        }

        else if(q.type==="multi"){

            if(!user || user.length===0){

                userText="Not Answered";
            }

            else{

                userText = user
                .map(x => String.fromCharCode(65 + x))
                .join(", ");
            }
        }

        else{

            userText =
            user===null || user===""
            ? "Not Answered"
            : `\\( \\displaystyle ${user} \\)`;
        }

        /* CORRECT ANSWER */

        let correctText = "";

        if(q.type==="single"){

            correctText = String.fromCharCode(65 + q.answer);
        }

        else if(q.type==="multi"){

            correctText = q.answer
            .map(x => String.fromCharCode(65 + x))
            .join(", ");
        }

        else{

            correctText = `\\( ${q.answer} \\)`;
        }

        /* OPTIONS HTML for PDF */

        let optsHtml = '';
        if (q.options && q.options.length > 0) {
          optsHtml = '<div class="review-options">';
          q.options.forEach((op, oi) => {
            const renderedOp = renderQuestionContent(op, q.images || [], q.tables || [], false);
            optsHtml += '<div class="review-option">' + String.fromCharCode(65 + oi) + '. ' + renderedOp + '</div>';
          });
          optsHtml += '</div>';
        }

        /* REVIEW BLOCK */

        reviewHTML += `

        <div class="review">

        <h3>
        Q${i+1}
        </h3>

        ${secName ? '<div class="review-section-info">Section: ' + secName + '</div>' : ''}
        ${subLabel ? '<div class="review-subsection-info">Subsection: ' + subLabel + '</div>' : ''}

        <div class="review-question-text">

${
renderQuestionContent(
    q.question,
    q.images || [],
    q.tables || [],
    true,
    [q.question].concat(q.options || []).join("\n")
)
}

</div>

        ${optsHtml}

        <div class="review-details">

        <p>
        <b>Status:</b>
        ${status}
        </p>

        <p>
        <b>Your Answer:</b>
        ${userText}
        </p>

        <p>
        <b>Correct Answer:</b>
        ${correctText}
        </p>

        <p>
        <b>Marks:</b>
        ${Math.round(marks)}
        </p>

        </div>

        </div>
        `;
    });

    /* DISABLE */

    document
    .querySelectorAll("input, button")
    .forEach(el=>{

        el.disabled = true;
    });

    /* TOTAL */

    let maxMarks = 0;
    questions.forEach(q => {
        maxMarks += getQuestionTotalMarks(q);
    });

    let percentage =
    Math.round(((total/maxMarks)*100)*100)/100;

    const timeTaken =

examDuration - totalSeconds;

const hours =
Math.floor(timeTaken/3600);

const minutes =
Math.floor((timeTaken%3600)/60);

const seconds =
timeTaken%60;

const timeTakenText =

hours + " hr " +

minutes + " min " +

seconds + " sec";

    /* Build section/subsection marks HTML */
    let breakdownHTML = '';
    sections.forEach(sec => {
        const sm = sectionMarks[sec.id];
        if(!sm) return;
        const secPct = sm.max > 0 ? Math.round(((sm.total / sm.max) * 100) * 100) / 100 : 0;
        breakdownHTML += `<div class="sec-breakdown">
            <div class="sec-breakdown-header">
                <span class="sec-name">${sec.name}</span>
                <span class="sec-score">${Math.round(sm.total)} / ${Math.round(sm.max)} (${secPct}%)</span>
            </div>`;
        const subs = getSectionSubsections(sec);
        subs.forEach(sub => {
            const sk = sec.id + "_" + sub.id;
            const sbm = subsectionMarks[sk];
            if(!sbm || sbm.max === 0) return;
            const subPct = Math.round(((sbm.total / sbm.max) * 100) * 100) / 100;
            breakdownHTML += `<div class="subsec-breakdown">
                <span class="subsec-name">${sub.label}</span>
                <span class="subsec-score">${Math.round(sbm.total)} / ${Math.round(sbm.max)} (${subPct}%)</span>
            </div>`;
        });
        breakdownHTML += `</div>`;
    });

    const compactedReviewHTML = compactReviewHtmlForStorage(reviewHTML, questions);

    /* SAVE RESULT */

    const resultData = {

    email:currentEmail,

    score:total,

    timeTaken:timeTakenText,

    percentage:percentage,

    attempted:attempted,

    totalQuestions:questions.length,

    maxMarks:maxMarks,
    answers:userAnswers,
    sectionMarks:sectionMarks,
    subsectionMarks:subsectionMarks,
    sectionsData:sections,
    reviewHTML:compactedReviewHTML,
    breakdownHTML:breakdownHTML,
    questions:questions
};

    try{
        localStorage.setItem("quiz_" + currentEmail, JSON.stringify(resultData));
    } catch(err){
        console.warn("Could not cache the full result on this device.", err);
    }
    fetch("/save-result",{

    method:"POST",

    headers:{
        "Content-Type":
        "application/json"
    },

    body:JSON.stringify({

        email:currentEmail,

        score:total,

        percentage:percentage,

        timeTaken:timeTakenText
    })
});

    /* RESULT PAGE */

    openResultPage(

        "Test Submitted",

        currentEmail,

        questions.length,

        attempted,

        total,

        maxMarks,

        percentage,

        timeTakenText,

        compactedReviewHTML,
        breakdownHTML,
        questions,
        sections
    );
}
/* ========================================= */
/* SHOW OLD RESULT */
/* ========================================= */

/* ========================================= */
/* RESULT PAGE */
/* ========================================= */

let resultMathJaxReadyPromise = null;
let resultMathJaxQueue = Promise.resolve();
let resultMathObserver = null;
let resultMathScrollHandler = null;

function ensureResultMathJax(){
    if(window.MathJax && typeof window.MathJax.typesetPromise === "function"){
        const startup = window.MathJax.startup && window.MathJax.startup.promise;
        return Promise.resolve(startup).then(function(){ return window.MathJax; });
    }
    if(resultMathJaxReadyPromise) return resultMathJaxReadyPromise;

    let script = document.querySelector('script[src*="mathjax@3"]');
    if(!script){
        script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        script.async = true;
        document.head.appendChild(script);
    }

    resultMathJaxReadyPromise = new Promise(function(resolve){
        let timeout = setTimeout(function(){ resolve(null); }, 15000);
        function finish(){
            clearTimeout(timeout);
            const mathJax = window.MathJax;
            const startup = mathJax && mathJax.startup && mathJax.startup.promise;
            Promise.resolve(startup).then(function(){
                resolve(mathJax && typeof mathJax.typesetPromise === "function" ? mathJax : null);
            }).catch(function(){ resolve(null); });
        }
        script.addEventListener("load", finish, {once: true});
        script.addEventListener("error", function(){
            clearTimeout(timeout);
            resolve(null);
        }, {once: true});
    });
    return resultMathJaxReadyPromise;
}

function typesetResultReview(review){
    if(!review) return Promise.resolve(false);
    if(review.dataset.mathTypeset === "done") return Promise.resolve(true);
    if(review._mathTypesetPromise) return review._mathTypesetPromise;
    if(!/\\\(/.test(review.textContent || "")){
        review.dataset.mathTypeset = "done";
        return Promise.resolve(true);
    }

    review.dataset.mathTypeset = "pending";
    const work = resultMathJaxQueue.then(function(){
        return ensureResultMathJax();
    }).then(function(mathJax){
        if(!mathJax || typeof mathJax.typesetPromise !== "function") return false;
        return mathJax.typesetPromise([review]).then(function(){ return true; }, function(){ return false; });
    }).catch(function(){ return false; });

    resultMathJaxQueue = work.then(function(){}, function(){});
    review._mathTypesetPromise = work.then(function(success){
        if(success) review.dataset.mathTypeset = "done";
        else delete review.dataset.mathTypeset;
        return success;
    }).finally(function(){
        delete review._mathTypesetPromise;
    });
    return review._mathTypesetPromise;
}

function clearResultMathObserver(){
    if(resultMathObserver){
        resultMathObserver.disconnect();
        resultMathObserver = null;
    }
    if(resultMathScrollHandler){
        window.removeEventListener("scroll", resultMathScrollHandler);
        window.removeEventListener("resize", resultMathScrollHandler);
        resultMathScrollHandler = null;
    }
}

function setupLazyResultMathTypesetting(){
    clearResultMathObserver();
    const reviews = Array.prototype.slice.call(document.querySelectorAll("#reviewArea .review"));
    if(reviews.length === 0) return;

    if("IntersectionObserver" in window){
        resultMathObserver = new IntersectionObserver(function(entries){
            entries.forEach(function(entry){
                if(entry.isIntersecting){
                    resultMathObserver.unobserve(entry.target);
                    restoreResultReviewImages(entry.target);
                    typesetResultReview(entry.target);
                }
            });
        }, {rootMargin: "450px 0px"});
        reviews.forEach(function(review){ resultMathObserver.observe(review); });
        return;
    }

    let scanPending = false;
    resultMathScrollHandler = function(){
        if(scanPending) return;
        scanPending = true;
        window.requestAnimationFrame(function(){
            scanPending = false;
            const viewBottom = window.innerHeight + 450;
            reviews.forEach(function(review){
                if(review.dataset.mathTypeset === "done") return;
                const rect = review.getBoundingClientRect();
                if(rect.top < viewBottom && rect.bottom > -450){
                    restoreResultReviewImages(review);
                    typesetResultReview(review);
                }
            });
        });
    };
    window.addEventListener("scroll", resultMathScrollHandler, {passive: true});
    window.addEventListener("resize", resultMathScrollHandler, {passive: true});
    resultMathScrollHandler();
}

async function typesetAllResultReviews(){
    clearResultMathObserver();
    const reviews = Array.prototype.slice.call(document.querySelectorAll("#reviewArea .review"));
    for(let i = 0; i < reviews.length; i++){
        restoreResultReviewImages(reviews[i]);
        await typesetResultReview(reviews[i]);
        if(i % 2 === 1) await new Promise(function(resolve){ setTimeout(resolve, 0); });
    }
}

function openResultPage(
    title,email,totalQ,attempted,
    score,maxMarks,percentage,timeTaken,reviewHTML,
    breakdownHTML,questionsData,
    sectionsData
){

    if(!breakdownHTML) breakdownHTML = "";
    if(!questionsData) questionsData = [];
    if(!sectionsData) sectionsData = [];
    reviewHTML = compactReviewHtmlForStorage(reviewHTML, questionsData);
    window.__resultImageSources = /data-cbt-image="\d+"/.test(reviewHTML)
        ? getInlineResultImageLookup(questionsData).byIndex
        : [];

    const isDark = localStorage.getItem("theme") === "dark";

    const themeIcon = isDark ? "☀️" : "🌙";

    /* BUILD RESULT PAGE INLINE — no document.write, no Blob URL, no embedded <script> tags */
    
    try {
      document.title = title;

      // --- CSS ---
      var oldStyle = document.getElementById('resultInlineStyle');
      if (oldStyle) oldStyle.remove();

      var resultCSS = (
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:Arial,sans-serif;background:#f0f2f5;padding:20px;transition:background 0.3s,color 0.3s}' +
        '.resultDark body,.resultDark{background:#121212 !important;color:#e0e0e0 !important}' +
        '#resultHeader{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}' +
        '#resultHeaderLeft{display:flex;flex-direction:column;gap:6px}' +
        '#resultHeader h1{margin:0;font-size:24px}' +
        '#resultEmailBadge{font-size:14px;color:#555;background:#e8eaf6;padding:6px 14px;border-radius:20px;display:inline-block}' +
        '.resultDark #resultEmailBadge{color:#ccc;background:#2a2a2a}' +
        '#resultThemeBtn{background:#333;color:white;border:2px solid transparent;border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;transition:0.2s;display:flex;align-items:center;justify-content:center}' +
        '#resultThemeBtn:hover{border-color:white}' +
        '#resultHeaderRight{display:flex;align-items:center;gap:10px}' +
        '.resultDark #resultThemeBtn{background:#555}' +
        '.scoreBox{background:white;padding:24px;border-radius:12px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);transition:background 0.3s}' +
        '.resultDark .scoreBox{background:#1e1e1e !important;box-shadow:0 2px 8px rgba(0,0,0,0.3)}' +
        '.scoreGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:16px}' +
        '.scoreItem{text-align:center;padding:14px 10px;border-radius:10px;background:#f8f9fa;transition:background 0.3s}' +
        '.resultDark .scoreItem{background:#2a2a2a !important}' +
        '.scoreItem .label{font-size:13px;color:#666;margin-bottom:4px}' +
        '.resultDark .scoreItem .label{color:#aaa}' +
        '.scoreItem .value{font-size:22px;font-weight:bold;color:#222}' +
        '.resultDark .scoreItem .value{color:#fff}' +
        '.scoreItem .value.greenText{color:#2e7d32}' +
        '.scoreItem .value.orangeText{color:#e65100}' +
        '.scoreItem .value.blueText{color:#1565c0}' +
        '.scoreItem .value.purpleText{color:#6a1b9a}' +
        '.review{border:1px solid #e0e0e0;padding:18px;margin-bottom:18px;border-radius:12px;background:white;line-height:1.8;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .review{background:#1e1e1e !important;border-color:#333 !important}' +
        '.review p{line-height:1.8}' +
        '.review h3{color:#1565c0;margin-bottom:8px}' +
        '.resultDark .review h3{color:#64b5f6}' +
        '#reviewHeading{font-size:20px;margin-bottom:16px;margin-top:8px}' +
        '.review img{max-width:100%;border-radius:4px;margin:4px 0}' +
        '.review .question-table-wrap{margin:8px 0;overflow-x:auto}' +
        '.review .question-table-wrap table{border-collapse:collapse;width:auto;min-width:200px}' +
        '.review .question-table-wrap td,.review .question-table-wrap th{border:1px solid #bbb;padding:6px 10px;font-size:12px;text-align:center}' +
        '.review .question-table-wrap th{background:#e3f2fd;font-weight:bold}' +
        '.review .review-options{padding-left:8px;margin:8px 0 6px 0}' +
        '.review .review-option{font-size:13px;color:#444;padding:2px 0;line-height:1.6}' +
        '.review .review-option.correctOption{color:#2e7d32;font-weight:bold}' +
        '.correct-badge{display:inline-block;background:#2e7d32;color:#fff;font-size:10px;font-weight:bold;padding:1px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}' +
        '.review-section-info{font-size:13px;color:#1565c0;font-weight:bold;margin:2px 0 1px 0;padding:0;line-height:1.5}' +
        '.review-subsection-info{font-size:12.5px;color:#555;margin:0 0 4px 0;padding:0;line-height:1.5}' +
        '.resultDark .review-section-info{color:#64b5f6}' +
        '.resultDark .review-subsection-info{color:#aaa}' +
        '.resultDark .review .review-option{color:#ccc !important}' +
        '.resultDark .review .review-option.correctOption{color:#66bb6a !important}' +
        '.resultDark .review-question-text{color:#e0e0e0 !important}' +
        '.resultDark .review-details{color:#ccc !important}' +
        '.resultDark .review-details b{color:#ddd !important}' +
        '.question img.question-image{max-width:100%;border-radius:6px;margin:6px 0;display:inline-block;vertical-align:middle}' +
        '.question .question-table-wrap table{border-collapse:collapse;width:auto;min-width:200px;margin:10px 0}' +
        '.question .question-table-wrap td,.question .question-table-wrap th{border:1px solid #bbb;padding:8px 12px;text-align:center;font-size:13px}' +
        '.question .question-table-wrap th{background:#e3f2fd;font-weight:bold}' +
        '.question .question-table-wrap caption{font-size:12px;color:#666;font-style:italic;margin-bottom:4px}' +
        '.question .question-text{line-height:1.8}' +
        '.resultDark .question-table-wrap td,.resultDark .question-table-wrap th{border-color:#555}' +
        '.resultDark .question-table-wrap th{background:#1a237e !important;color:#e0e0e0}' +
        '.resultDark .question-table-wrap td{background:#1e1e1e;color:#e0e0e0}' +
        '.resultDark .review .question-table-wrap td,.resultDark .review .question-table-wrap th{border-color:#555}' +
        '.resultDark .review .question-table-wrap th{background:#1a237e;color:#e0e0e0}' +
        '.sec-breakdown{border:1px solid #e0e0e0;border-radius:10px;padding:14px 18px;margin-bottom:12px;background:#fafafa;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .sec-breakdown{background:#252525 !important;border-color:#444 !important}' +
        '.sec-breakdown-header{display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:15px;margin-bottom:8px}' +
        '.sec-name{color:#1976d2}' +
        '.resultDark .sec-name{color:#64b5f6}' +
        '.sec-score{color:#333}' +
        '.resultDark .sec-score{color:#ccc}' +
        '.subsec-breakdown{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;margin:4px 0 4px 20px;background:white;border-radius:6px;font-size:13px;border:1px solid #eee;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .subsec-breakdown{background:#1e1e1e !important;border-color:#3a3a3a !important}' +
        '.subsec-name{color:#555;font-weight:normal}' +
        '.resultDark .subsec-name{color:#bbb}' +
        '.subsec-score{font-weight:bold;color:#2e7d32}' +
        '.resultDark .subsec-score{color:#66bb6a}' +
        '@media print{' +
          'body{background:white !important;padding:15px !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
          '.resultDark body,.resultDark{background:white !important;color:#222 !important}' +
          '#resultHeaderRight{display:none !important}' +
          '#reviewHeading{margin-top:0;margin-bottom:10px;page-break-before:always}' +
          '.scoreBox{box-shadow:none !important;break-inside:avoid;background:#f8f9fa !important;border:1px solid #ddd}' +
          '.resultDark .scoreBox{background:#f8f9fa !important;border-color:#ddd !important}' +
          '.resultDark .scoreItem{background:#f0f0f0 !important}' +
          '.scoreItem .label{color:#555 !important}' +
          '.scoreItem .value{color:#222 !important}' +
          '.resultDark .review{background:white !important;border-color:#ddd !important}' +
          '.resultDark .review h3{color:#1565c0 !important}' +
          '.review{break-inside:avoid;border:1px solid #ddd;box-shadow:none !important;padding:12px 14px}' +
          '.review .review-option.correctOption{color:#2e7d32 !important}' +
          '.resultDark .review .review-option.correctOption{color:#2e7d32 !important}' +
          '.resultDark .review-options .review-option{color:#444 !important}' +
          '.resultDark .question-table-wrap td,.resultDark .question-table-wrap th{border-color:#bbb !important;background:white !important;color:#222 !important}' +
          '.resultDark .question-table-wrap th{background:#e3f2fd !important;color:#222 !important}' +
          '.sec-breakdown{break-inside:avoid;border:1px solid #ddd;background:#fafafa !important}' +
          '.resultDark .sec-breakdown{background:#fafafa !important;border-color:#ddd !important}' +
          '.resultDark .subsec-breakdown{background:white !important;border-color:#eee !important}' +
          '.resultDark .subsec-name{color:#555 !important}' +
          '.resultDark .sec-name{color:#1976d2 !important}' +
          '.resultDark .sec-score{color:#333 !important}' +
          '.resultDark .subsec-score{color:#2e7d32 !important}' +
          '.review-section-info{color:#1565c0 !important}' +
          '.review-subsection-info{color:#555 !important}' +
          '.resultDark .review-section-info{color:#1565c0 !important}' +
          '.resultDark .review-subsection-info{color:#555 !important}' +
          '#resultEmailBadge{border:1px solid #ccc;color:#555 !important;background:#e8eaf6 !important}' +
          '.resultDark #resultEmailBadge{color:#555 !important;background:#e8eaf6 !important}' +
          'h2#reviewHeading{color:#222 !important}' +
          '.resultDark h2#reviewHeading{color:#222 !important}' +
          '#resultHeaderLeft h1{color:#222 !important}' +
          '.resultDark #resultHeaderLeft h1{color:#222 !important}' +
          '.scoreItem .value.greenText{color:#2e7d32 !important}' +
          '.scoreItem .value.blueText{color:#1565c0 !important}' +
          '.scoreItem .value.orangeText{color:#e65100 !important}' +
          '.scoreItem .value.purpleText{color:#6a1b9a !important}' +
          'img{max-width:100% !important}' +
          '.review img{border:1px solid #eee}' +
          '.review-question-text{line-height:1.7;color:#222 !important}' +
          '.resultDark .review-question-text{color:#222 !important}' +
          '.resultDark .review-details{color:#333 !important}' +
          '.resultDark .review-details b{color:#222 !important}' +
          '.review-options{border-left:3px solid #1976d2;padding:6px 8px 6px 14px;margin:6px 0 8px 0;background:#f8f9fa !important}' +
          '.resultDark .review-options{background:#f0f0f0 !important}' +
          '.review-option{font-size:12.5px !important;padding:4px 0 !important;letter-spacing:0.2px;line-height:1.6 !important;color:#333 !important}' +
          '.review-option.correctOption{color:#2e7d32 !important;font-weight:bold !important}' +
          '.review-option::before{content:\"\";margin-right:0}' +
          '.review-details{display:block !important}' +
          '.review > p{display:block !important}' +
          '.correct-badge{display:inline-block;background:#2e7d32;color:#fff !important;font-size:10px;font-weight:bold;padding:1px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}' +
          '#breakdownArea,.sec-breakdown{margin-bottom:8px}' +
          '@page{margin:15mm 12mm}' +
        '}'
      );

      var styleEl = document.createElement('style');
      styleEl.id = 'resultInlineStyle';
      styleEl.textContent = resultCSS;
      document.head.appendChild(styleEl);

      // --- MathJax config ---
      window.MathJax = window.MathJax || {};
      window.MathJax.tex = window.MathJax.tex || {};
      window.MathJax.tex.inlineMath = [['\\(','\\)']];

      // --- Theme toggle (global function for onclick attribute) ---
      window.toggleResultTheme = function(){
        var html = document.documentElement;
        html.classList.toggle('resultDark');
        var isDark = html.classList.contains('resultDark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        var btn = document.getElementById('resultThemeBtn');
        if (btn) btn.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
      };

      // --- Set window data ---
      window.__questionsData = questionsData || [];
      window.__sectionsData = sectionsData || [];

      // --- Build body HTML (no <script> tags, purely structural) ---
      var bodyHTML = '';

      // Header
      bodyHTML += '<div id="resultHeader">';
      bodyHTML += '<div id="resultHeaderLeft">';
      bodyHTML += '<h1>' + title + '</h1>';
      bodyHTML += '<div id="resultEmailBadge">' + email + '</div>';
      bodyHTML += '</div>';
      bodyHTML += '<div id="resultHeaderRight">';
      bodyHTML += '<button id="resultThemeBtn" onclick="toggleResultTheme()">' + themeIcon + '</button>';
      bodyHTML += '<button id="qpDownloadBtn" style="background:#1565c0;color:white;border:2px solid transparent;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;white-space:nowrap" onmouseover="this.style.borderColor=\'white\'" onmouseout="this.style.borderColor=\'transparent\'" title="Download a clean question paper with sections & questions (no answers)">\uD83D\uDCC4 Download Question Paper</button>';
      bodyHTML += '<button id="pdfDownloadBtn" style="background:#2e7d32;color:white;border:2px solid transparent;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;white-space:nowrap" onmouseover="this.style.borderColor=\'white\'" onmouseout="this.style.borderColor=\'transparent\'" title="View a printer-friendly version of your result">\uD83D\uDCC4 View Result in Printable Format</button>';
      bodyHTML += '</div>';
      bodyHTML += '</div>';

      // Score box
      bodyHTML += '<div class="scoreBox"><div class="scoreGrid">';
      bodyHTML += '<div class="scoreItem"><div class="label">Total Questions</div><div class="value blueText">' + totalQ + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Attempted</div><div class="value orangeText">' + attempted + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Score</div><div class="value greenText">' + Math.round(score) + '/' + Math.round(maxMarks) + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Percentage</div><div class="value purpleText">' + percentage + '%</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Time Taken</div><div class="value blueText">' + timeTaken + '</div></div>';
      bodyHTML += '</div></div>';

      // Breakdown
      if (breakdownHTML) {
        bodyHTML += '<div class="scoreBox"><h2 style="font-size:18px;margin-bottom:12px">\uD83D\uDCCA Section-wise Marks</h2><div id="breakdownArea">' + breakdownHTML + '</div></div>';
      }

      // Review
      bodyHTML += '<h2 id="reviewHeading">Question Review</h2>';
      bodyHTML += '<div id="reviewArea">' + reviewHTML + '</div>';

      // Release MathJax references to the exam before replacing its DOM.
      clearResultMathObserver();
      if (window.MathJax && typeof window.MathJax.typesetClear === 'function') {
        window.MathJax.typesetClear();
      }

      // Render body
      document.body.innerHTML = bodyHTML;

      // Remove test-page darkMode class so it doesn't interfere with result page's own theme
      document.body.classList.remove('darkMode');

      // Apply dark class if needed
      if (isDark) {
        document.documentElement.classList.add('resultDark');
      } else {
        document.documentElement.classList.remove('resultDark');
      }

      // --- Set up event listeners ---

      // Build review options HTML helper
      window.buildReviewOptionsHtml = function(q){
        var letters = ['A','B','C','D','E','F','G','H'];
        var h = '<div class="review-options">';
        if (q.options && q.options.length > 0) {
          for (var oi = 0; oi < q.options.length; oi++) {
            var op = q.options[oi];
            var renderedOp = (typeof renderQuestionContent === 'function')
              ? renderQuestionContent(op, q.images || [], q.tables || [], false)
              : op;
            var letter = oi < letters.length ? letters[oi] : ('Option ' + (oi+1));
            h += '<div class="review-option">' + letter + '. ' + renderedOp + '</div>';
          }
        }
        h += '</div>';
        return h;
      };

      // EscHtml helper
      window.escHtml = function(str){
        if(!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      };

      // Generate question paper HTML
      window.generateQuestionPaperHtml = function(qData, secData) {
        if (!qData || !Array.isArray(qData) || qData.length === 0) return '<p>No questions available.</p>';

        function getSecName(id) {
          if (!secData || !Array.isArray(secData)) return 'Section ' + id;
          var sec = secData.find(function(s){ return s.id === id; });
          return sec ? sec.name : 'Section ' + id;
        }

        function getTypeLabel(q) {
          var typeMap = {single:'Single Correct', multi:'Multiple Correct', numerical:'Numerical Answer'};
          return typeMap[q.type] || q.type || '';
        }

        var letters = ['A','B','C','D','E','F','G','H'];

        var sectionsMap = {};
        for (var qi = 0; qi < qData.length; qi++) {
          var q = qData[qi];
          var sid = q.sectionId || 0;
          if (!sectionsMap[sid]) sectionsMap[sid] = {name: getSecName(sid), questions: []};
          sectionsMap[sid].questions.push(q);
        }

        var sortedSecIds = [];
        if (secData && Array.isArray(secData)) {
          for (var si = 0; si < secData.length; si++) {
            if (sectionsMap[secData[si].id]) sortedSecIds.push(secData[si].id);
          }
          for (var key in sectionsMap) {
            var kid = parseInt(key);
            if (sortedSecIds.indexOf(kid) === -1) sortedSecIds.push(kid);
          }
        } else {
          sortedSecIds = Object.keys(sectionsMap).map(Number);
        }

        var globalQNum = 0;
        var h = '<div class="qp-container">';

        for (var si = 0; si < sortedSecIds.length; si++) {
          var sid = sortedSecIds[si];
          var sec = sectionsMap[sid];
          if (!sec) continue;

          h += '<div class="qp-section">';
          h += '<h2 class="qp-section-title">' + window.escHtml(sec.name) + '</h2>';

          var subMap = {};
          for (var qi = 0; qi < sec.questions.length; qi++) {
            var q = sec.questions[qi];
            var subKey = q.subsection || q.type || 'other';
            if (!subMap[subKey]) subMap[subKey] = [];
            subMap[subKey].push(q);
          }

          var subKeys = Object.keys(subMap);
          for (var ski = 0; ski < subKeys.length; ski++) {
            var subQs = subMap[subKeys[ski]];
            if (subQs.length === 0) continue;

            var typeLabel = getTypeLabel(subQs[0]);
            h += '<div class="qp-subsection">';
            h += '<h3 class="qp-subsection-title">' + window.escHtml(typeLabel) + '</h3>';

            for (var qi = 0; qi < subQs.length; qi++) {
              var q = subQs[qi];
              globalQNum++;

              h += '<div class="qp-question">';
              h += '<div class="qp-q-header"><strong>Q' + globalQNum + '.</strong></div>';
              var qText = (q.question || '');
              if (typeof renderQuestionContent === 'function') {
                qText = renderQuestionContent(
                  q.question || '',
                  q.images || [],
                  q.tables || [],
                  true,
                  [q.question || ''].concat(q.options || []).join('\n')
                );
              }
              h += '<div class="qp-q-text">' + qText + '</div>';

              if (q.options && q.options.length > 0) {
                h += '<div class="qp-options">';
                for (var oi = 0; oi < q.options.length; oi++) {
                  var letter = oi < letters.length ? letters[oi] : ('Option ' + (oi + 1));
                  var isCorrect = q.type === 'multi' ? q.answer.indexOf(oi) !== -1 : q.answer === oi;
                  var correctTag = isCorrect ? ' <span class="qpc-badge">\u2714 Correct</span>' : '';
                  h += '<div class="qp-option' + (isCorrect ? ' qp-option-correct' : '') + '">' + letter + '. ' + (q.options[oi] || '') + correctTag + '</div>';
                }
                h += '</div>';
              }

              if (q.type === 'numerical') {
                h += '<div class="qp-numerical-answer">Answer: ' + window.escHtml(String(q.answer)) + '</div>';
              }

              h += '</div>';
            }
            h += '</div>';
          }

          h += '</div>';
        }

        h += '</div>';
        return h;
      };

      // QP download button
      var qpBtn = document.getElementById('qpDownloadBtn');
      if (qpBtn) {
        qpBtn.addEventListener('click', function(){
          var btn = this;
          btn.disabled = true;
          btn.textContent = 'Preparing...';

          var qData = window.__questionsData || [];
          var secData = window.__sectionsData || [];
          var qpHTML = window.generateQuestionPaperHtml(qData, secData);

          var qpPage = window.open('', '_blank');
          if (!qpPage) {
            alert('Please allow pop-ups to download the question paper.');
            btn.disabled = false;
            btn.textContent = '\uD83D\uDCC4 Download Question Paper';
            return;
          }

          qpPage.document.write('<!DOCTYPE html><html><head><title>Question Paper</title>');
          qpPage.document.write('<style>*{box-sizing:border-box;margin:0;padding:0}');
          qpPage.document.write('body{font-family:Arial,sans-serif;padding:30px 40px;background:white;color:#222;line-height:1.7}');
          qpPage.document.write('h1.qp-main-title{font-size:24px;text-align:center;margin-bottom:6px;color:#222}');
          qpPage.document.write('.qp-subtitle{text-align:center;font-size:14px;color:#666;margin-bottom:24px}');
          qpPage.document.write('.qp-section{margin-bottom:28px}');
          qpPage.document.write('.qp-section + .qp-section{page-break-before:always}');
          qpPage.document.write('.qp-section-title{font-size:18px;color:#1565c0;border-bottom:2px solid #1565c0;padding-bottom:4px;margin-bottom:14px;page-break-after:avoid}');
          qpPage.document.write('.qp-subsection-title{font-size:14px;color:#555;margin:12px 0 8px 0;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;page-break-after:avoid}');
          qpPage.document.write('.qp-subsection{margin-bottom:14px}');
          qpPage.document.write('.qp-question{margin-bottom:18px;padding-left:4px;page-break-inside:avoid}');
          qpPage.document.write('.qp-q-header{font-size:14px;margin-bottom:4px;color:#333}');
          qpPage.document.write('.qp-q-text{font-size:14px;margin-bottom:8px;line-height:1.8}');
          qpPage.document.write('.qp-options{padding-left:20px;margin:4px 0}');
          qpPage.document.write('.qp-option{font-size:13.5px;padding:2px 0;color:#444;line-height:1.6}');
          qpPage.document.write('.qp-option-correct{font-weight:bold;color:#2e7d32}');
          qpPage.document.write('.qpc-badge{display:inline-block;background:#2e7d32;color:#fff;font-size:10px;font-weight:bold;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle}');
          qpPage.document.write('.qp-numerical-answer{font-size:13.5px;color:#2e7d32;padding-left:20px;margin-top:4px;font-weight:bold}');
          qpPage.document.write('.qp-container img{max-width:100%;border-radius:4px;margin:4px 0}');
          qpPage.document.write('.qp-container table{border-collapse:collapse;margin:8px 0;width:auto;min-width:200px}');
          qpPage.document.write('.qp-container td,.qp-container th{border:1px solid #bbb;padding:6px 10px;font-size:12px;text-align:center}');
          qpPage.document.write('.qp-container th{background:#e3f2fd;font-weight:bold}');
          qpPage.document.write('.instruction-card{border:1px solid #ddd;border-radius:8px;padding:8px 14px;margin-bottom:8px;background:#fafafa}');
          qpPage.document.write('.instruction-card h2{margin:0 0 5px 0;font-size:14px;color:#333}');
          qpPage.document.write('.instruction-card p{margin:3px 0;font-size:12.5px;color:#555;line-height:1.5}');
          qpPage.document.write('.instruction-list{margin:2px 0 0 0;padding:0;list-style:none}');
          qpPage.document.write('.instruction-list li{padding:4px 0 4px 16px;position:relative;font-size:12.5px;color:#444;line-height:1.5;border-bottom:1px solid #eee}');
          qpPage.document.write('.instruction-list li:last-child{border-bottom:none}');
          qpPage.document.write('.instruction-list li::before{content:\"\";position:absolute;left:2px;top:7px;width:6px;height:6px;border-radius:50%;background:#4a90d9}');
          qpPage.document.write('.instruction-sub{font-size:11px;color:#888;display:block;margin-top:1px}');
          qpPage.document.write('.instruction-types li{padding-left:0}');
          qpPage.document.write('.instruction-types li::before{display:none}');
          qpPage.document.write('.type-badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:bold;margin-right:6px;vertical-align:middle}');
          qpPage.document.write('.type-scq{background:#e3f2fd;color:#1565c0}');
          qpPage.document.write('.type-mcq{background:#fce4ec;color:#c62828}');
          qpPage.document.write('.type-num{background:#e8f5e9;color:#2e7d32}');
          qpPage.document.write('.marking-table-wrap{overflow-x:auto;margin:4px 0}');
          qpPage.document.write('.marking-table{width:100%;border-collapse:collapse;font-size:12.5px}');
          qpPage.document.write('.marking-table th{background:#e3f2fd;padding:5px 10px;text-align:left;font-size:12px;font-weight:bold;color:#333;border:1px solid #d0d0d0}');
          qpPage.document.write('.marking-table td{padding:4px 10px;border:1px solid #d0d0d0;color:#444}');
          qpPage.document.write('.marks-positive{font-weight:bold;color:#2e7d32;text-align:center}');
          qpPage.document.write('.marks-negative{font-weight:bold;color:#d32f2f;text-align:center}');
          qpPage.document.write('.marks-neutral{font-weight:bold;color:#888;text-align:center}');
          qpPage.document.write('.marks-partial{font-weight:bold;color:#e65100;text-align:center;font-size:11px}');
          qpPage.document.write('.instruction-note{font-size:11.5px;color:#888;font-style:italic;margin-top:4px}');
          qpPage.document.write('.nav-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle;border:1px solid rgba(0,0,0,0.12)}');
          qpPage.document.write('.green-dot{background:green}');
          qpPage.document.write('.red-dot{background:#ff4d4d}');
          qpPage.document.write('.yellow-dot{background:gold}');
          qpPage.document.write('.white-dot{background:white;border:1px solid #ccc}');
          qpPage.document.write('@media print{body{padding:20px 30px}}');
          qpPage.document.write('@page{margin:15mm 12mm}');
          qpPage.document.write('</style>');
          qpPage.document.write('<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script>');
          qpPage.document.write('</head><body>');
          qpPage.document.write('<h1 class="qp-main-title">Question Paper</h1>');
          var instrHtml = (typeof generateInstructionsHtml === 'function') ? generateInstructionsHtml(qData, secData, false) : '';
          if (instrHtml) {
            qpPage.document.write('<div class="qp-instructions" style="page-break-after:always;margin-bottom:12px">');
            qpPage.document.write('<h2 style="font-size:16px;margin-bottom:8px;color:#333">Instructions</h2>');
            qpPage.document.write(instrHtml);
            qpPage.document.write('</div>');
          }
          qpPage.document.write(qpHTML);
          qpPage.document.write('<\/body><\/html>');
          qpPage.document.close();

          var mathJaxWaits = 0;
          function finishQuestionPaper(){
            if(qpPage.closed){
              btn.disabled = false;
              btn.textContent = '\uD83D\uDCC4 Download Question Paper';
              return;
            }

            var mathJax = qpPage.MathJax;
            if(!mathJax || typeof mathJax.typesetPromise !== 'function'){
              if(mathJaxWaits++ < 100){
                setTimeout(finishQuestionPaper, 100);
                return;
              }
              qpPage.print();
              btn.disabled = false;
              btn.textContent = '\uD83D\uDCC4 Download Question Paper';
              return;
            }

            var blocks = Array.prototype.slice.call(qpPage.document.querySelectorAll('.qp-instructions,.qp-question'));
            var renderQueue = Promise.resolve();
            blocks.forEach(function(block){
              renderQueue = renderQueue.then(function(){
                return mathJax.typesetPromise([block]);
              }).then(function(){
                return new Promise(function(resolve){ setTimeout(resolve, 0); });
              });
            });
            renderQueue.then(function(){ qpPage.print(); }).catch(function(){ qpPage.print(); }).finally(function(){
              btn.disabled = false;
              btn.textContent = '\uD83D\uDCC4 Download Question Paper';
            });
          }
          finishQuestionPaper();
        });
      }

      // PDF download button
      var pdfBtn = document.getElementById('pdfDownloadBtn');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', async function(){
          var btn = this;
          btn.disabled = true;
          btn.textContent = 'Preparing...';

          var currentReviews = Array.prototype.slice.call(document.querySelectorAll('#reviewArea .review'));
          clearResultMathObserver();
          await Promise.all(currentReviews.map(function(review){
            return review._mathTypesetPromise || Promise.resolve();
          }));

          var qData = window.__questionsData;
          if (qData && Array.isArray(qData) && qData.length > 0) {
            var reviews = document.querySelectorAll('#reviewArea .review');
            for (var ri = 0; ri < reviews.length && ri < qData.length; ri++) {
              var review = reviews[ri];
              var q = qData[ri];
              if (window.MathJax && typeof window.MathJax.typesetClear === 'function') {
                window.MathJax.typesetClear([review]);
              }
              delete review.dataset.mathTypeset;
              var existingOpts = review.querySelector('.review-options');
              var newOptsHtml = window.buildReviewOptionsHtml(q);
              if (existingOpts) {
                existingOpts.outerHTML = newOptsHtml;
              } else {
                var details = review.querySelector('.review-details');
                var questionText = review.querySelector('.review-question-text');
                var insertAfter = questionText || review.querySelector('h3');
                if (insertAfter && newOptsHtml) {
                  var temp = document.createElement('div');
                  temp.innerHTML = newOptsHtml;
                  var firstChild = temp.firstChild;
                  if (firstChild) {
                    insertAfter.parentNode.insertBefore(firstChild, details || null);
                  }
                }
              }
            }
          }

          function doPrint(){
            window.print();
            setTimeout(function(){ btn.disabled = false; btn.textContent = '\uD83D\uDCC4 View Result in Printable Format'; }, 1000);
          }
          await typesetAllResultReviews();
          doPrint();
        });
      }

      // Typeset review cards only as they approach the viewport.
      setupLazyResultMathTypesetting();

    } catch(e) {
      console.error('Error rendering result page:', e);
      document.body.innerHTML = '<h1>Error rendering result</h1><pre>' + e.message + '</pre>';
    }
  }

function showPreviousResult(data){

    const maxMarks = data.maxMarks || (data.totalQuestions * 4);
    const savedQuestions = data.questions || [];
    const savedReviewHTML = data.reviewHTML || "";

    openResultPage(

        "Already Attempted",

        data.email,

        data.totalQuestions,

        data.attempted,

        data.score,

        maxMarks,

        data.percentage,

        data.timeTaken,

        savedReviewHTML,
        data.breakdownHTML || "",
        savedQuestions,
        data.sectionsData || []
    );
}

/* ========================================= */
/* TIMER */
/* ========================================= */

function updateTimerDisplay(){

    let h=Math.floor(totalSeconds/3600);

    let m=Math.floor((totalSeconds%3600)/60);

    let s=totalSeconds%60;

    document.getElementById("timer").innerHTML=

    `${String(h).padStart(2,'0')}:${
        String(m).padStart(2,'0')
    }:${
        String(s).padStart(2,'0')
    }`;
}

function startTimer(){

    /* PREVENT MULTIPLE TIMERS */

    if(timerInterval!==null)
        return;

    updateTimerDisplay();

    timerInterval = setInterval(()=>{

        if(submitted)
            return;

        totalSeconds--;

        updateTimerDisplay();

        saveProgress();

        if(totalSeconds<=0){

            clearInterval(timerInterval);

            timerInterval=null;

            submitTest(true);
        }

    },1000);
}

/* ========================================= */
/* START */
/* ========================================= */

/* document.addEventListener(

    "fullscreenchange",

    ()=>{

        if(submitted)
            return;

        if(!document.fullscreenElement){

            alert(
                "Fullscreen exited. Exam submitted."
            );

            submitTest();
        }
    }
); */

function restoreAnswers(){

    questions.forEach((q,index)=>{

        const ans =
        userAnswers[index];

        if(ans===null)
            return;

        /* SINGLE */

        if(q.type==="single"){

            const radios =
            document.querySelectorAll(
                `input[name="q${index}"]`
            );

            if(radios[ans]){

                radios[ans].checked=true;
            }
        }

        /* MULTI */

        else if(q.type==="multi"){

            ans.forEach(x=>{

                const checks =
                document.querySelectorAll(
                    `.multi${index}`
                );

                if(checks[x]){

                    checks[x].checked=true;
                }
            });
        }

        /* NUMERICAL */

        else{

            const input =
            document.querySelector(
                `#q${index} input`
            );

            if(input){

                input.value=ans;
            }
        }
    });
}

function initQuiz(){

    userAnswers = new Array(questions.length).fill(null);
    markedForReview = new Array(questions.length).fill(false);
    visited = new Array(questions.length).fill(false);
    visited[0] = true;
    renderQuestions();

    renderNav();

    for(let i=0;i<questions.length;i++){

        updateNavColor(i);
    }

    updateProgressBar();

    saveProgress();
}

function toggleTheme(){

    document.body.classList.toggle(
        "darkMode"
    );

    const dark =

    document.body.classList.contains(
        "darkMode"
    );

    localStorage.setItem(
        "theme",
        dark ? "dark" : "light"
    );

    updateThemeButtons();
}

function updateThemeButtons(){

    const dark =

    document.body.classList.contains(
        "darkMode"
    );

    const btns =

    document.querySelectorAll(
        "#themeBtn,#loginThemeBtn,#instructionsThemeBtn"
    );

    btns.forEach(btn=>{

        btn.innerHTML = dark ?

        "☀️"

        :

        "🌙";
    });
}

function applySavedTheme(){

    const savedTheme =

    localStorage.getItem(
        "theme"
    );

    if(savedTheme==="dark"){

        document.body.classList.add(
            "darkMode"
        );
    }

    else{

        document.body.classList.remove(
            "darkMode"
        );
    }

    updateThemeButtons();
}

window.onload = function(){

    applySavedTheme();

    bindFullscreenNudge();

    loadQuestionsFromServer();
};

/* ========================================= */
/* PROCTORING — CAMERA, MICROPHONE & SCREEN  */
/* ========================================= */

const LIVE_ICE_CONFIG = {
    iceServers: [{urls: "stun:stun.l.google.com:19302"}]
};
const LIVE_SYNC_INTERVAL = 1500;
const LIVE_ICE_TIMEOUT = 3000;

let livePeer = {
    camera: {pc: null, offerAt: 0, appliedAnswerAt: 0, offerSdp: ""},
    screen: {pc: null, offerAt: 0, appliedAnswerAt: 0, offerSdp: ""},
    requestAt: 0,
    syncTimer: null,
    busy: false
};

function proctoringReady(){
    return !!(proctorState.cameraStream && proctorState.audioStream && proctorState.screenStream);
}

function startProctoringSetup(afterSetup){
    proctorState.afterSetup = typeof afterSetup === "function" ? afterSetup : function(){};
    proctorState.email = currentEmail;

    document.getElementById("proctorCameraStep").style.display = "flex";
    document.getElementById("proctorAudioStep").style.display = "flex";
    document.getElementById("proctorScreenStep").style.display = "flex";
    document.getElementById("proctorIntro").textContent =
        proctorState.active
            ? "Screen sharing stopped, so the test timer is paused. Start sharing again to resume. Choose what to share in your browser’s screen-sharing dialog."
            : "This test is monitored live. Camera, microphone, and screen sharing are required. Choose what to share in your browser’s screen-sharing dialog.";

    updateProctorSetupState();
    document.getElementById("proctorOverlay").style.display = "flex";
}

function updateProctorSetupState(){
    const btn = document.getElementById("proctorContinueBtn");
    const warning = document.getElementById("proctorWarning");
    if(!btn || !warning) return;

    const camOk = !!proctorState.cameraStream;
    const audioOk = !!proctorState.audioStream;
    const screenOk = !!proctorState.screenStream;

    if(camOk && audioOk && screenOk){
        warning.textContent = "✅ Camera, microphone, and screen sharing are active.";
        warning.className = "proctor-warning ok";
        btn.textContent = proctorState.active ? "▶ Resume Test" : "▶ Continue to Instructions";
        btn.disabled = false;
    } else {
        const missing = [];
        if(!camOk) missing.push("camera");
        if(!audioOk) missing.push("microphone");
        if(!screenOk) missing.push("screen sharing");
        warning.textContent = "⚠️ " + missing.join(", ") +
            " required — the test will not start until all are enabled.";
        warning.className = "proctor-warning pending";
        btn.textContent = proctorState.active ? "🔒 Complete setup to resume" : "🔒 Complete proctoring setup to continue";
        btn.disabled = true;
    }
}

async function enableCamera(){
    const statusEl = document.getElementById("cameraStatus");
    statusEl.textContent = "Requesting permission...";
    statusEl.className = "proctor-status";

    try{
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
            throw new Error("Camera is not supported in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30}},
            audio: false
        });
        proctorState.cameraStream = stream;
        proctorState.cameraDenied = false;

        stream.getVideoTracks().forEach(function(track){
            try{ track.contentHint = "motion"; } catch(err){}
        });

        const video = document.getElementById("proctorVideo");
        video.srcObject = stream;
        video.style.display = "block";
        video.play().catch(function(){});

        statusEl.textContent = "✅ Camera enabled";
        statusEl.className = "proctor-status ok";

        stream.getVideoTracks().forEach(function(track){
            track.addEventListener("ended", function(){
                proctorState.cameraStream = null;
                const el = document.getElementById("cameraStatus");
                if(el){
                    el.textContent = "⚠️ Camera stopped";
                    el.className = "proctor-status bad";
                }
                proctorEvent("camera-stopped", "Camera was turned off");
                closeLivePeer("camera");
                refreshProctorBadge();
            });
        });
    } catch(err){
        proctorState.cameraDenied = true;
        statusEl.textContent = "⚠️ Camera blocked (" + (err && err.name ? err.name : "error") + ")";
        statusEl.className = "proctor-status bad";
        proctorEvent("camera-denied", "Student did not allow the camera");
    }

    updateProctorSetupState();
}

async function enableMicrophone(){
    const statusEl = document.getElementById("audioStatus");
    statusEl.textContent = "Requesting permission...";
    statusEl.className = "proctor-status";

    try{
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
            throw new Error("Microphone is not supported in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
        proctorState.audioStream = stream;
        proctorState.audioDenied = false;

        statusEl.textContent = "✅ Microphone enabled";
        statusEl.className = "proctor-status ok";

        stream.getAudioTracks().forEach(function(track){
            track.addEventListener("ended", function(){
                proctorState.audioStream = null;
                const el = document.getElementById("audioStatus");
                if(el){
                    el.textContent = "⚠️ Microphone stopped";
                    el.className = "proctor-status bad";
                }
                proctorEvent("audio-stopped", "Microphone was turned off");
                refreshProctorBadge();
            });
        });
    } catch(err){
        proctorState.audioDenied = true;
        statusEl.textContent = "⚠️ Microphone blocked (" + (err && err.name ? err.name : "error") + ")";
        statusEl.className = "proctor-status bad";
        proctorEvent("audio-denied", "Student did not allow the microphone");
    }

    updateProctorSetupState();
}

async function enableScreenShare(){
    const statusEl = document.getElementById("screenStatus");
    statusEl.textContent = "Choose what to share in the browser dialog…";
    statusEl.className = "proctor-status";

    try{
        if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
            throw new Error("Screen sharing is not supported in this browser");
        }

        /* Called directly from the button click so the browser can show its native
           screen, window, or tab picker. Do not constrain which surface is shared. */
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {frameRate: {ideal: 10, max: 15}},
            audio: false
        });
        const previousStream = proctorState.screenStream;
        proctorState.screenStream = stream;
        stream.getVideoTracks().forEach(function(track){
            try{ track.contentHint = "detail"; } catch(err){}
            track.addEventListener("ended", function(){ onScreenShareEnded(stream); });
        });
        if(previousStream && previousStream !== stream){
            previousStream.getTracks().forEach(function(track){ track.stop(); });
        }

        statusEl.textContent = "✅ Screen sharing active";
        statusEl.className = "proctor-status ok";
        refreshProctorBadge();
    } catch(err){
        if(proctorState.screenStream){
            statusEl.textContent = "✅ Existing screen share is still active";
            statusEl.className = "proctor-status ok";
        } else {
            statusEl.textContent = err && err.name === "NotAllowedError"
                ? "Screen sharing was cancelled or blocked"
                : "⚠️ Screen sharing unavailable";
            statusEl.className = "proctor-status bad";
            proctorEvent("screen-share-denied", "Student did not start screen sharing");
        }
    }

    updateProctorSetupState();
}

function onScreenShareEnded(endedStream){
    if(!proctorState.screenStream || proctorState.screenStream !== endedStream) return;
    proctorState.screenStream = null;
    closeLivePeer("screen");

    const statusEl = document.getElementById("screenStatus");
    if(statusEl){
        statusEl.textContent = "⚠️ Screen sharing stopped";
        statusEl.className = "proctor-status bad";
    }
    proctorEvent("screen-share-stopped", "Student stopped screen sharing");
    refreshProctorBadge();
    updateProctorSetupState();

    /* Pause the exam clock until the student starts sharing again. */
    if(proctorState.active && !submitted){
        registerProctorSession();
        if(timerInterval !== null){
            clearInterval(timerInterval);
            timerInterval = null;
        }
        startProctoringSetup(function(){ startTimer(); });
    }
}

function finishProctorSetup(){
    console.log("finishProctorSetup called. Ready:", proctoringReady());
    updateProctorSetupState();
    if(!proctoringReady()){
        console.log("Not ready yet");
        return;
    }

    document.getElementById("proctorOverlay").style.display = "none";
    console.log("Proctor overlay hidden");

    if(!proctorState.active){
        startProctoringCapture();
    } else {
        registerProctorSession();
        publishLiveOffer("screen");
        refreshProctorBadge();
    }

    const callback = proctorState.afterSetup;
    proctorState.afterSetup = null;
    if(typeof callback === "function") {
        console.log("Executing callback");
        callback();
    } else {
        console.log("No callback to execute!");
    }
}

function startProctoringCapture(){
    if(proctorState.active) return;
    proctorState.active = true;
    proctorState.email = currentEmail;

    registerProctorSession();
    refreshProctorBadge();
    startLiveStreaming();

    proctorState.heartbeatTimer = setInterval(proctorHeartbeat, 5000);

    document.addEventListener("visibilitychange", onProctorVisibilityChange);
    document.addEventListener("fullscreenchange", onProctorFullscreenChange);
}

function registerProctorSession(){
    if(!proctorState.email) return;
    fetch("/api/proctoring/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: proctorState.email,
            camera: !!proctorState.cameraStream,
            screen: !!proctorState.screenStream,
            audio: !!proctorState.audioStream
        })
    }).catch(function(){});
}

/* ========================================= */
/* LIVE STREAM (WebRTC)                      */
/* ========================================= */

function waitForIceGathering(pc, timeout){
    return new Promise(function(resolve){
        if(pc.iceGatheringState === "complete"){
            resolve();
            return;
        }

        let finished = false;
        const finish = function(){
            if(finished) return;
            finished = true;
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
        };
        const onChange = function(){
            if(pc.iceGatheringState === "complete") finish();
        };

        pc.addEventListener("icegatheringstatechange", onChange);
        setTimeout(finish, timeout);
    });
}

function createLivePeer(kind){
    closeLivePeer(kind);

    const stream = kind === "camera" ? proctorState.cameraStream
        : kind === "screen" ? proctorState.screenStream : null;
    if(!stream || typeof RTCPeerConnection === "undefined") return null;

    const pc = new RTCPeerConnection(LIVE_ICE_CONFIG);
    stream.getVideoTracks().forEach(function(track){ pc.addTrack(track, stream); });

    if(kind === "camera" && proctorState.audioStream){
        proctorState.audioStream.getAudioTracks().forEach(function(track){
            pc.addTrack(track, proctorState.audioStream);
        });
    }

    livePeer[kind].pc = pc;
    return pc;
}

async function publishLiveOffer(kind){
    if(!proctorState.active) return;

    const state = livePeer[kind];
    const pc = createLivePeer(kind);
    if(!pc || !state) return;

    try{
        await pc.setLocalDescription(await pc.createOffer());
        await waitForIceGathering(pc, LIVE_ICE_TIMEOUT);

        state.offerSdp = pc.localDescription.sdp;

        const res = await fetch("/api/live/offer", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email: proctorState.email, kind: kind, sdp: state.offerSdp})
        });
        const data = await res.json();
        state.offerAt = data.offerAt || Date.now();
    } catch(err){
        state.offerAt = 0;
    }
}

function startLiveStreaming(){
    if(livePeer.syncTimer) clearInterval(livePeer.syncTimer);

    publishLiveOffer("camera");
    publishLiveOffer("screen");

    livePeer.syncTimer = setInterval(syncLiveSignals, LIVE_SYNC_INTERVAL);
}

async function syncLiveSignals(){
    if(!proctorState.active || livePeer.busy) return;
    livePeer.busy = true;

    try{
        const res = await fetch("/api/live/sync/" + encodeURIComponent(proctorState.email));
        const data = await res.json();

        if(data.requestAt && data.requestAt > livePeer.requestAt){
            livePeer.requestAt = data.requestAt;
            await publishLiveOffer("camera");
            await publishLiveOffer("screen");
        }

        if(data.answers){
            for(const kind of ["camera", "screen"]){
                const answer = data.answers[kind];
                if(!answer || !answer.sdp) continue;

                const state = livePeer[kind];
                if(!state || !state.pc || state.offerAt !== answer.offerAt) continue;

                /* One viewer per offer: ignore repeat answers so extra admin panels
                   cannot make the stream restart in a loop. A reloaded panel asks
                   for a fresh offer through /api/live/request instead. */
                if(state.appliedAnswerAt) continue;

                try{
                    await state.pc.setRemoteDescription({type: "answer", sdp: answer.sdp});
                    state.appliedAnswerAt = answer.at;
                } catch(err){}
            }
        }
    } catch(err){
    } finally {
        livePeer.busy = false;
    }
}

function closeLivePeer(kind){
    const state = livePeer[kind];
    if(!state) return;

    if(state.pc){
        try{ state.pc.close(); } catch(err){}
    }
    state.pc = null;
    state.appliedAnswerAt = 0;
}

function stopLiveStreaming(){
    if(livePeer.syncTimer){
        clearInterval(livePeer.syncTimer);
        livePeer.syncTimer = null;
    }

    closeLivePeer("camera");
    closeLivePeer("screen");

    livePeer.requestAt = 0;
    livePeer.busy = false;
}

function proctorHeartbeat(){
    if(!proctorState.email) return;
    fetch("/api/proctoring/heartbeat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: proctorState.email})
    }).catch(function(){});
}

function proctorEvent(type, message){
    if(!proctorState.email) return;
    fetch("/api/proctoring/event", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: proctorState.email, type: type, message: message})
    }).catch(function(){});
}

function onProctorVisibilityChange(){
    if(!proctorState.active) return;
    if(document.hidden){
        proctorEvent("tab-switch", "Student left the exam tab");
    } else {
        proctorEvent("tab-return", "Student returned to the exam tab");
    }
}

function onProctorFullscreenChange(){
    if(!proctorState.active) return;
    if(!document.fullscreenElement){
        proctorEvent("fullscreen-exit", "Student exited fullscreen mode");
    }
}

function refreshProctorBadge(){
    const badge = document.getElementById("proctorBadge");
    if(!badge) return;
    const parts = [];
    if(proctorState.cameraStream) parts.push("📷");
    if(proctorState.audioStream) parts.push("🎤");
    if(proctorState.screenStream) parts.push("🖥️");
    if(proctorState.active && parts.length > 0){
        badge.textContent = "🔴 Proctoring active " + parts.join(" ");
        badge.style.display = "block";
    } else {
        badge.style.display = "none";
    }
}

function stopProctoring(notifyServer){
    /* Set inactive before stopping tracks, since stopping fires their ended events. */
    proctorState.active = false;
    if(proctorState.heartbeatTimer){
        clearInterval(proctorState.heartbeatTimer);
        proctorState.heartbeatTimer = null;
    }

    stopLiveStreaming();

    document.removeEventListener("visibilitychange", onProctorVisibilityChange);
    document.removeEventListener("fullscreenchange", onProctorFullscreenChange);

    const streamsToStop = [proctorState.cameraStream, proctorState.audioStream, proctorState.screenStream];
    proctorState.cameraStream = null;
    proctorState.audioStream = null;
    proctorState.screenStream = null;
    streamsToStop.forEach(function(stream){
        if(stream && stream.getTracks){
            stream.getTracks().forEach(function(track){ track.stop(); });
        }
    });
    const screenStatus = document.getElementById("screenStatus");
    if(screenStatus){
        screenStatus.textContent = "Not enabled";
        screenStatus.className = "proctor-status";
    }

    const cameraVideo = document.getElementById("proctorVideo");
    if(cameraVideo) cameraVideo.srcObject = null;
    refreshProctorBadge();

    if(notifyServer && proctorState.email){
        fetch("/api/proctoring/stop", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email: proctorState.email})
        }).catch(function(){});
    }
}

/* ========================================= */
/* HELP CHAT (STUDENT)                       */
/* ========================================= */

let chatState = {
    email: "",
    open: false,
    unread: 0,
    timer: null,
    lastSignature: ""
};

function setupStudentChat(email){
    chatState.email = email || currentEmail || "";
    const widget = document.getElementById("chatWidget");
    if(!widget || !chatState.email) return;

    widget.style.display = "block";

    if(chatState.timer) clearInterval(chatState.timer);
    chatState.timer = setInterval(refreshStudentChat, 4000);
    refreshStudentChat();
}

function toggleChatPanel(){
    chatState.open = !chatState.open;
    const panel = document.getElementById("chatPanel");
    if(panel) panel.style.display = chatState.open ? "flex" : "none";

    if(chatState.open){
        chatState.unread = 0;
        renderChatUnread();
        refreshStudentChat();
        setTimeout(function(){
            const input = document.getElementById("chatPanelInput");
            if(input) input.focus();
        }, 60);
    }
}

function refreshStudentChat(){
    if(!chatState.email) return;

    const url = "/api/chat/messages/" + encodeURIComponent(chatState.email) +
        "?viewer=student" + (chatState.open ? "&markRead=1" : "");

    fetch(url).then(function(r){ return r.json(); }).then(function(data){
        renderStudentChatMessages(data.messages || []);
        chatState.unread = chatState.open ? 0 : (data.unread || 0);
        renderChatUnread();
    }).catch(function(){});
}

function renderStudentChatMessages(messages){
    const box = document.getElementById("chatPanelMessages");
    if(!box) return;

    const signature = messages.map(function(m){ return m.id + ":" + m.at; }).join("|");
    if(signature === chatState.lastSignature) return;
    chatState.lastSignature = signature;

    if(messages.length === 0){
        box.innerHTML = '<div class="chat-empty">No messages yet. Ask the exam conductor if you need help.</div>';
        return;
    }

    box.innerHTML = messages.map(function(m){
        const mine = m.from === "student";
        return '<div class="chat-msg ' + (mine ? "chat-msg-student" : "chat-msg-admin") + '">' +
            '<div class="chat-msg-text">' + escHtml(m.message) + '</div>' +
            '<div class="chat-msg-time">' + (mine ? "You" : "Conductor") + " · " +
            new Date(m.at).toLocaleTimeString() + '</div>' +
            '</div>';
    }).join("");

    box.scrollTop = box.scrollHeight;
}

function sendStudentChat(){
    const input = document.getElementById("chatPanelInput");
    if(!input || !chatState.email) return;

    const text = input.value.trim();
    if(!text) return;
    input.value = "";

    fetch("/api/chat/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: chatState.email, from: "student", message: text})
    }).then(function(){ refreshStudentChat(); }).catch(function(){});
}

function renderChatUnread(){
    const badge = document.getElementById("chatUnreadBadge");
    if(!badge) return;

    if(chatState.unread > 0){
        badge.textContent = chatState.unread > 9 ? "9+" : String(chatState.unread);
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
}

function stopStudentChat(){
    if(chatState.timer){
        clearInterval(chatState.timer);
        chatState.timer = null;
    }
    chatState.open = false;
    chatState.unread = 0;
    chatState.lastSignature = "";

    const widget = document.getElementById("chatWidget");
    if(widget) widget.style.display = "none";
    const panel = document.getElementById("chatPanel");
    if(panel) panel.style.display = "none";
}
