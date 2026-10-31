/* ========================================= */
/* ADMIN PANEL - FULL MANAGEMENT             */
/* ========================================= */

/* ========================================= */
/* PASSWORD PROTECTION                       */
/* ========================================= */

var ADMIN_EMAIL = "admin@ammocktest.in";
var ADMIN_PASSWORD = "agni@8261#";

function checkPassword() {
    var emailInput = document.getElementById("emailInput");
    var passInput = document.getElementById("passwordInput");
    var error = document.getElementById("loginError");
    if (emailInput.value.trim().toLowerCase() === ADMIN_EMAIL && passInput.value === ADMIN_PASSWORD) {
        sessionStorage.setItem("adminLoggedIn", "true");
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminContainer").style.display = "block";
        error.textContent = "";
        initAdmin();
    } else {
        error.textContent = "❌ Invalid email or password. Try again.";
        passInput.value = "";
        emailInput.focus();
    }
}

let sections = [];
let questions = [];
let mathPreviewOn = false;
let currentQuestionImages = [];
let currentQuestionTables = [];
let nextImageId = 0;
let nextTableId = 0;
let livePreviewMathTimer = null;
let adminMathObserver = null;
let adminMathScrollHandler = null;
let adminMathQueue = Promise.resolve();
let activeVisualEditor = null;
let visualEditorRange = null;
let draggedVisualOption = null;
let draggedVisualOptionAnswerRows = [];
let questionPreviewQuestions = [];
let questionPreviewIndex = 0;
let visualEquationRange = null;

var SUBSECTION_TYPE_OPTIONS = [
  {value: "single", label: "Single Correct (SCQ)"},
  {value: "multi", label: "Multiple Correct (MCQ)"},
  {value: "numerical", label: "Numerical / Integer"}
];

function getSubsections(section) {
  if (section.subsections && Array.isArray(section.subsections) && section.subsections.length > 0) {
    return section.subsections;
  }
  var order = section.subsectionOrder || ["single", "multi", "numerical"];
  var defaultLabels = {single: "Single Correct (SCQ)", multi: "Multiple Correct Questions", numerical: "Integer / Numerical"};
  var defaultTypes = {single: "single", multi: "multi", numerical: "numerical"};
  return order.map(function(id) {
    return {id: id, label: defaultLabels[id] || id, type: defaultTypes[id] || id};
  });
}

function getSubsectionTypeLabel(type) {
  var found = SUBSECTION_TYPE_OPTIONS.find(function(o) { return o.value === type; });
  return found ? found.label : type;
}

function generateSubsectionId() {
  return "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
}

/* ========================================= */
/* SECTIONS                                  */
/* ========================================= */

function loadSections() {
    fetch("/api/sections").then(function(r) { return r.json(); }).then(function(data) {
        sections = data;
        renderSections();
        populateSectionDropdowns();
    });
}

function renderSections() {
    var container = document.getElementById("sectionsContainer");
    if (sections.length === 0) {
        container.innerHTML = '<div class="no-data">No sections yet. Create one above!</div>';
        return;
    }
    var html = "";
    sections.forEach(function(s, idx) {
        var qCount = questions.filter(function(q) { return q.sectionId === s.id; }).length;
        var subs = getSubsections(s);
        
        var subHtml = subs.map(function(sub, si) {
            var leftArrow = "";
            var rightArrow = "";
            if (si > 0) {
                leftArrow = '<span class="sub-move" onclick="moveSubsection(' + s.id + ",'" + sub.id + "','up'" + ')" title="Move left">\u25C0</span>';
            }
            if (si < subs.length - 1) {
                rightArrow = '<span class="sub-move" onclick="moveSubsection(' + s.id + ",'" + sub.id + "','down'" + ')" title="Move right">\u25B6</span>';
            }
            var typeOptsHtml = SUBSECTION_TYPE_OPTIONS.map(function(o) {
                var sel = (o.value === sub.type) ? ' selected' : '';
                return '<option value="' + o.value + '"' + sel + '>' + o.label + '</option>';
            }).join('');
            return '<div class="subsection-edit-item">'
                + '<input class="sub-label-input" type="text" value="' + escHtml(sub.label) + '" '
                + 'onchange="updateSubsectionLabel(' + s.id + ',\'' + sub.id + '\',this.value)" '
                + 'placeholder="Display label">'
                + '<select class="sub-type-select" onchange="updateSubsectionType(' + s.id + ',\'' + sub.id + '\',this.value)">'
                + typeOptsHtml + '</select>'
                + '<span class="sub-move-group">' + leftArrow + rightArrow + '</span>'
                + '<button class="btn-danger" onclick="removeSubsection(' + s.id + ',\'' + sub.id + '\')" title="Remove subsection">\u2715</button>'
                + '</div>';
        }).join("");

        var isFirst = (idx === 0);
        var isLast = (idx === sections.length - 1);
        var escName = s.name.replace(/'/g, "\\'");

        html += '<div class="section-card" data-id="' + s.id + '">';
        html += '<span class="drag" title="Drag to reorder">\u28BF</span>';
        html += '<input class="name" value="' + escHtml(s.name) + '" onchange="renameSection(' + s.id + ', this.value)" style="flex:1;font-weight:bold;font-size:15px;border:1px solid transparent;padding:6px 8px;border-radius:6px;background:transparent" onfocus="this.style.borderColor=\'#bbb\';this.style.background=\'white\'" onblur="this.style.borderColor=\'transparent\';this.style.background=\'transparent\'">';
        html += '<span class="q-count">' + qCount + ' question' + (qCount !== 1 ? 's' : '') + '</span>';
        html += '<div class="actions">';
        html += '<button class="btn-edit" onclick="moveSection(' + s.id + ",'up'" + ')" ' + (isFirst ? 'disabled style="opacity:0.4"' : '') + ' title="Move up">\u2191</button>';
        html += '<button class="btn-edit" onclick="moveSection(' + s.id + ",'down'" + ')" ' + (isLast ? 'disabled style="opacity:0.4"' : '') + ' title="Move down">\u2193</button>';
        html += '<button class="btn-danger" onclick="deleteSection(' + s.id + ",'" + escName + "')" + '" title="Delete">\u2715</button>';
        html += '</div></div>';

        html += '<div class="subsection-order-area">';
        html += '<div class="sub-header-row"><span class="sub-label">Subsections:</span>';
        html += '<button class="btn-info btn-sm" onclick="addSubsection(' + s.id + ')">+ Add Subsection</button></div>';
        html += subHtml;
        html += '</div>';
    });
    container.innerHTML = html;
    setupDragReorder();
}

function moveSubsection(sectionId, subId, dir) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var idx = subs.findIndex(function(s) { return s.id === subId; });
    if (idx === -1) return;
    if (dir === "up" && idx > 0) {
        var tmp = subs[idx];
        subs[idx] = subs[idx - 1];
        subs[idx - 1] = tmp;
    } else if (dir === "down" && idx < subs.length - 1) {
        var tmp = subs[idx];
        subs[idx] = subs[idx + 1];
        subs[idx + 1] = tmp;
    } else {
        return;
    }
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function addSubsection(sectionId) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var newId = generateSubsectionId();
    var count = subs.length + 1;
    subs.push({id: newId, label: "New Subsection " + count, type: "single"});
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function removeSubsection(sectionId, subId) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    if (subs.length <= 1) {
        alert("A section must have at least one subsection.");
        return;
    }
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    if (!confirm('Remove subsection "' + sub.label + '"? Questions with this subsection will have their subsection set to the first available subsection.')) return;
    var remainingSubs = subs.filter(function(s) { return s.id !== subId; });
    section.subsections = remainingSubs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: remainingSubs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function updateSubsectionLabel(sectionId, subId, label) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section || !label.trim()) return;
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    sub.label = label.trim();
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        populateSectionDropdowns();
    });
}

function updateSubsectionType(sectionId, subId, type) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    sub.type = type;
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        populateSectionDropdowns();
    });
}

function setupDragReorder() {
    var cards = document.querySelectorAll(".section-card");
    var dragSrc = null;
    cards.forEach(function(card) {
        card.draggable = false;
        var dragHandle = card.querySelector(".drag");
        dragHandle.addEventListener("mousedown", function() { card.draggable = true; });
        dragHandle.addEventListener("mouseup", function() { card.draggable = false; });
        card.addEventListener("dragstart", function(e) {
            dragSrc = card;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(function() { card.style.opacity = "0.4"; }, 0);
        });
        card.addEventListener("dragend", function() {
            card.style.opacity = "1";
            card.draggable = false;
        });
        card.addEventListener("dragover", function(e) { e.preventDefault(); });
        card.addEventListener("drop", function(e) {
            e.preventDefault();
            if (dragSrc && dragSrc !== card) {
                var container = document.getElementById("sectionsContainer");
                container.insertBefore(dragSrc, card);
                saveSectionOrder();
            }
            dragSrc = null;
        });
    });
}

function saveSectionOrder() {
    var cards = document.querySelectorAll(".section-card");
    var orderedIds = Array.from(cards).map(function(c) { return parseInt(c.dataset.id); });
    fetch("/api/sections/reorder", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({orderedIds: orderedIds})
    }).then(function(r) { return r.json(); }).then(function() {
        loadSections();
    });
}

function moveSection(id, dir) {
    var idx = sections.findIndex(function(s) { return s.id === id; });
    if (idx === -1) return;
    if (dir === "up" && idx > 0) {
        var tmp = sections[idx];
        sections[idx] = sections[idx - 1];
        sections[idx - 1] = tmp;
    } else if (dir === "down" && idx < sections.length - 1) {
        var tmp = sections[idx];
        sections[idx] = sections[idx + 1];
        sections[idx + 1] = tmp;
    } else {
        return;
    }
    var orderedIds = sections.map(function(s) { return s.id; });
    fetch("/api/sections/reorder", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({orderedIds: orderedIds})
    }).then(function(r) { return r.json(); }).then(function() {
        loadSections();
    });
}

function addSection() {
    var input = document.getElementById("newSectionName");
    var name = input.value.trim();
    if (!name) { alert("Enter a section name"); return; }
    fetch("/api/sections", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: name})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            input.value = "";
            loadSections();
        } else {
            alert(data.error || "Error creating section");
        }
    });
}

function renameSection(id, newName) {
    var name = newName.trim();
    if (!name) return;
    fetch("/api/sections/" + id, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: name})
    });
}

function deleteSection(id, name) {
    if (!confirm('Delete section "' + name + '"?\nQuestions in this section will become unassigned.')) return;
    fetch("/api/sections/" + id, {method: "DELETE"})
    .then(function(r) { return r.json(); }).then(function() {
        loadSections();
        loadQuestions();
    });
}

/* ========================================= */
/* IMAGE MANAGEMENT                          */
/* ========================================= */

function setActiveVisualEditor(editor) {
    if (!editor || !editor.matches(".visual-editable")) return;
    activeVisualEditor = editor;
    rememberVisualEditorRange();
}

function rememberVisualEditorRange() {
    var selection = window.getSelection();
    if (!activeVisualEditor || !selection || selection.rangeCount === 0) return;
    var range = selection.getRangeAt(0);
    if (activeVisualEditor.contains(range.commonAncestorContainer)) {
        visualEditorRange = range.cloneRange();
    }
}

document.addEventListener("selectionchange", rememberVisualEditorRange);

function restoreVisualEditorRange() {
    if (!activeVisualEditor || !activeVisualEditor.isConnected) {
        activeVisualEditor = document.getElementById("questionEditor");
    }
    if (!activeVisualEditor) return null;
    activeVisualEditor.focus();

    var selection = window.getSelection();
    var range = visualEditorRange;
    if (!range || !activeVisualEditor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(activeVisualEditor);
        range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    visualEditorRange = range.cloneRange();
    return range;
}

function formatVisualText(command) {
    if (!restoreVisualEditorRange()) return;
    document.execCommand(command, false, null);
    updateLivePreview();
}

function insertAtVisualCaret(node, block) {
    var range = restoreVisualEditorRange();
    if (!range) return;
    range.deleteContents();
    range.insertNode(node);
    if (block) {
        var spacer = document.createElement("div");
        spacer.innerHTML = "<br>";
        node.parentNode.insertBefore(spacer, node.nextSibling);
        range.setStart(spacer, 0);
        range.collapse(true);
    } else {
        var spacerText = document.createTextNode("\u200B");
        node.parentNode.insertBefore(spacerText, node.nextSibling);
        range.setStart(spacerText, 1);
        range.collapse(true);
    }
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    visualEditorRange = range.cloneRange();
    updateLivePreview();
}

function removeVisualAsset(button) {
    var asset = button.closest(".visual-image-asset,.visual-equation-asset,.visual-table-block");
    if (asset) asset.remove();
    updateLivePreview();
}

function createImageAssetNode(image) {
    var wrapper = document.createElement("div");
    wrapper.className = "visual-image-asset";
    wrapper.dataset.cbtImageId = String(image.id);
    wrapper.contentEditable = "false";
    var savedWidth = Number(image.width);
    var hasCustomWidth = image.width !== undefined && image.width !== null && Number.isFinite(savedWidth);
    var width = hasCustomWidth ? Math.max(20, Math.min(100, savedWidth)) : 100;
    var alignment = ["left", "center", "right"].indexOf(image.alignment) !== -1 ? image.alignment : "left";
    if (hasCustomWidth) wrapper.dataset.imageWidth = String(width);
    wrapper.dataset.imageAlignment = alignment;
    wrapper.style.textAlign = alignment;

    var img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt || "Question image";
    img.className = "visual-inline-image";
    if (hasCustomWidth) img.style.width = width + "%";
    wrapper.appendChild(img);

    var controls = document.createElement("div");
    controls.className = "visual-image-controls";
    controls.dataset.visualUi = "true";
    var sizeLabel = document.createElement("label");
    sizeLabel.textContent = "Size ";
    var size = document.createElement("input");
    size.type = "range";
    size.min = "20";
    size.max = "100";
    size.step = "5";
    size.value = String(width);
    size.setAttribute("aria-label", "Image width");
    var sizeValue = document.createElement("span");
    sizeValue.className = "visual-image-size-value";
    sizeValue.textContent = hasCustomWidth ? width + "%" : "Auto";
    size.oninput = function() {
        var nextWidth = Math.max(20, Math.min(100, Number(size.value) || 70));
        wrapper.dataset.imageWidth = String(nextWidth);
        img.style.width = nextWidth + "%";
        sizeValue.textContent = nextWidth + "%";
        updateLivePreview();
    };
    sizeLabel.appendChild(size);
    sizeLabel.appendChild(sizeValue);
    controls.appendChild(sizeLabel);
    ["left", "center", "right"].forEach(function(position) {
        var alignButton = document.createElement("button");
        alignButton.type = "button";
        alignButton.className = "visual-image-align" + (position === alignment ? " active" : "");
        alignButton.textContent = position === "left" ? "Left" : (position === "center" ? "Center" : "Right");
        alignButton.title = "Align image " + position;
        alignButton.onclick = function(event) {
            event.preventDefault();
            event.stopPropagation();
            wrapper.dataset.imageAlignment = position;
            wrapper.style.textAlign = position;
            controls.querySelectorAll(".visual-image-align").forEach(function(button) {
                button.classList.toggle("active", button === alignButton);
            });
            updateLivePreview();
        };
        controls.appendChild(alignButton);
    });
    wrapper.appendChild(controls);

    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "visual-asset-remove";
    removeButton.dataset.visualUi = "true";
    removeButton.textContent = "×";
    removeButton.title = "Remove image";
    removeButton.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeVisualAsset(removeButton);
    };
    wrapper.appendChild(removeButton);
    return wrapper;
}

function createEquationAssetNode(latex) {
    var wrapper = document.createElement("span");
    wrapper.className = "visual-equation-asset";
    wrapper.dataset.cbtEquation = "true";
    wrapper.dataset.latex = latex;
    wrapper.contentEditable = "false";

    var math = document.createElement("span");
    math.className = "visual-equation-render";
    math.textContent = "\\(" + latex + "\\)";
    wrapper.appendChild(math);
    wrapper.title = "Click to edit this equation";
    wrapper.onclick = function(event) {
        if (event.target.closest("[data-visual-ui]")) return;
        var editor = wrapper.closest(".visual-editable");
        if (editor) setActiveVisualEditor(editor);
        openEquationEditor(latex, wrapper);
    };

    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "visual-asset-remove";
    removeButton.dataset.visualUi = "true";
    removeButton.textContent = "×";
    removeButton.title = "Remove equation";
    removeButton.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeVisualAsset(removeButton);
    };
    wrapper.appendChild(removeButton);
    typesetVisualEquation(math);
    return wrapper;
}

function typesetVisualEquation(node) {
    if (!node || node.dataset.mathTypeset === "done") return;
    if (!window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
    node.dataset.mathTypeset = "pending";
    var work = adminMathQueue.then(function() {
        return window.MathJax.typesetPromise([node]);
    });
    adminMathQueue = work.then(function() {}, function() {});
    work.then(function() { node.dataset.mathTypeset = "done"; })
        .catch(function() { delete node.dataset.mathTypeset; });
}

function createTableAssetNode(tableData) {
    var wrapper = document.createElement("div");
    wrapper.className = "visual-table-block";
    wrapper.dataset.cbtTableId = String(tableData.id);

    var controls = document.createElement("div");
    controls.className = "visual-table-controls";
    controls.dataset.visualUi = "true";
    controls.contentEditable = "false";
    [
        ["+ Row", "Add row", "add-row"],
        ["− Row", "Remove row", "remove-row"],
        ["+ Column", "Add column", "add-column"],
        ["− Column", "Remove column", "remove-column"]
    ].forEach(function(item) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = item[0];
        button.title = item[1];
        button.dataset.tableAction = item[2];
        button.onclick = function(event) {
            event.preventDefault();
            event.stopPropagation();
            changeVisualTable(wrapper, item[2]);
        };
        controls.appendChild(button);
    });
    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "visual-table-remove";
    removeButton.textContent = "Remove table";
    removeButton.title = "Remove this table";
    removeButton.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeVisualAsset(removeButton);
    };
    controls.appendChild(removeButton);
    wrapper.appendChild(controls);

    var table = document.createElement("table");
    table.className = "visual-inline-table";
    if (tableData.caption) {
        var caption = document.createElement("caption");
        caption.contentEditable = "true";
        caption.textContent = tableData.caption;
        table.appendChild(caption);
    }
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    (tableData.headers || []).forEach(function(value) {
        var cell = document.createElement("th");
        cell.contentEditable = "true";
        cell.textContent = value;
        headRow.appendChild(cell);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    (tableData.rows || []).forEach(function(row) {
        var tr = document.createElement("tr");
        row.forEach(function(value) {
            var cell = document.createElement("td");
            cell.contentEditable = "true";
            cell.textContent = value;
            tr.appendChild(cell);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
}

function changeVisualTable(wrapper, action) {
    var table = readVisualTable(wrapper);
    if (!table) return;
    var columnCount = table.headers.length;
    if (action === "add-row") {
        table.rows.push(Array(columnCount).fill(""));
    } else if (action === "remove-row") {
        if (table.rows.length <= 1) return;
        table.rows.pop();
    } else if (action === "add-column") {
        if (columnCount >= 8) return;
        table.headers.push("Column " + (columnCount + 1));
        table.rows.forEach(function(row) { row.push(""); });
    } else if (action === "remove-column") {
        if (columnCount <= 1) return;
        table.headers.pop();
        table.rows.forEach(function(row) { row.pop(); });
    }
    var replacement = createTableAssetNode(table);
    wrapper.replaceWith(replacement);
    updateLivePreview();
}

function createVisualEquationSlot(name, placeholder, className) {
    var slot = document.createElement("span");
    slot.className = "visual-equation-slot" + (className ? " " + className : "");
    slot.dataset.equationSlot = name;
    slot.dataset.placeholder = placeholder || "type here";
    slot.contentEditable = "true";
    slot.tabIndex = 0;
    slot.setAttribute("role", "textbox");
    slot.setAttribute("aria-label", placeholder || name);
    return slot;
}

function getDirectVisualEquationSlot(parent, name) {
    if (!parent) return null;
    return Array.from(parent.children).find(function(child) {
        return child.dataset && child.dataset.equationSlot === name;
    }) || null;
}

function createVisualEquationToken(label, latex) {
    var token = document.createElement("span");
    token.className = "visual-equation-token";
    token.dataset.latex = latex;
    token.textContent = label;
    token.contentEditable = "false";
    return token;
}

function createVisualEquationMatrix(rows, columns, vector, environment) {
    rows = Math.max(1, Math.min(8, Number(rows) || 2));
    columns = Math.max(1, Math.min(8, Number(columns) || (vector ? 1 : 2)));
    environment = environment || (vector ? "pmatrix" : "bmatrix");
    var kind = environment === "cases" || environment === "aligned" ? environment : (vector ? "vector" : "matrix");
    var matrix = document.createElement("span");
    matrix.className = "visual-equation-structure visual-equation-matrix visual-equation-" + kind;
    matrix.dataset.equationKind = kind;
    matrix.dataset.matrixRows = String(rows);
    matrix.dataset.matrixColumns = String(columns);
    matrix.dataset.matrixEnvironment = environment;
    matrix.contentEditable = "false";
    var tools = document.createElement("span");
    tools.className = "visual-equation-matrix-tools";
    [
        ["remove-row", "− row", "Remove last row"], ["add-row", "+ row", "Add a row"],
        ["remove-column", "− col", "Remove last column"], ["add-column", "+ col", "Add a column"]
    ].forEach(function(action) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.matrixAction = action[0];
        button.textContent = action[1];
        button.title = action[2];
        button.setAttribute("aria-label", action[2]);
        tools.appendChild(button);
    });
    matrix.appendChild(tools);
    matrix.appendChild(createVisualEquationMatrixGrid(rows, columns));
    updateVisualEquationMatrixTools(matrix);
    return matrix;
}

function updateVisualEquationMatrixTools(matrix) {
    if (!matrix) return;
    var rows = Number(matrix.dataset.matrixRows) || 2;
    var columns = Number(matrix.dataset.matrixColumns) || 2;
    matrix.querySelectorAll("[data-matrix-action]").forEach(function(button) {
        var action = button.dataset.matrixAction;
        button.disabled = ((action === "remove-row" && rows <= 1) || (action === "add-row" && rows >= 8) ||
            (action === "remove-column" && columns <= 1) || (action === "add-column" && columns >= 8));
    });
}

function createVisualEquationMatrixGrid(rows, columns) {
    var grid = document.createElement("span");
    grid.className = "visual-equation-matrix-grid";
    grid.style.gridTemplateColumns = "repeat(" + columns + ", minmax(34px, auto))";
    for (var row = 0; row < rows; row++) {
        for (var column = 0; column < columns; column++) {
            grid.appendChild(createVisualEquationSlot("cell-" + row + "-" + column, "□", "visual-equation-matrix-cell"));
        }
    }
    return grid;
}

function resizeVisualEquationMatrix(matrix, action) {
    if (!matrix) return false;
    var oldGrid = matrix.querySelector(".visual-equation-matrix-grid");
    if (!oldGrid) return false;
    var rows = Number(matrix.dataset.matrixRows) || 2;
    var columns = Number(matrix.dataset.matrixColumns) || 2;
    if (action === "add-row" && rows < 8) rows++;
    else if (action === "remove-row" && rows > 1) rows--;
    else if (action === "add-column" && columns < 8) columns++;
    else if (action === "remove-column" && columns > 1) columns--;
    else return false;

    var existing = {};
    oldGrid.querySelectorAll("[data-equation-slot]").forEach(function(slot) {
        var match = slot.dataset.equationSlot.match(/^cell-(\d+)-(\d+)$/);
        if (match) existing[match[1] + "-" + match[2]] = slot;
    });
    var newGrid = document.createElement("span");
    newGrid.className = "visual-equation-matrix-grid";
    newGrid.style.gridTemplateColumns = "repeat(" + columns + ", minmax(34px, auto))";
    for (var row = 0; row < rows; row++) {
        for (var column = 0; column < columns; column++) {
            newGrid.appendChild(existing[row + "-" + column] || createVisualEquationSlot("cell-" + row + "-" + column, "□", "visual-equation-matrix-cell"));
        }
    }
    matrix.dataset.matrixRows = String(rows);
    matrix.dataset.matrixColumns = String(columns);
    oldGrid.replaceWith(newGrid);
    updateVisualEquationMatrixTools(matrix);
    return true;
}

function createVisualEquationStructure(kind) {
    if (kind === "matrix") return createVisualEquationMatrix(2, 2, false);
    if (kind === "matrix3") return createVisualEquationMatrix(3, 3, false);
    if (kind === "matrix2x1") return createVisualEquationMatrix(2, 1, false);
    if (kind === "matrix1x2") return createVisualEquationMatrix(1, 2, false);
    if (kind === "vector") return createVisualEquationMatrix(3, 1, true);
    if (kind === "cases") return createVisualEquationMatrix(2, 2, false, "cases");
    if (kind === "aligned") return createVisualEquationMatrix(2, 2, false, "aligned");
    var structure = document.createElement("span");
    structure.className = "visual-equation-structure visual-equation-" + kind;
    structure.dataset.equationKind = kind;
    structure.contentEditable = "false";
    if (kind === "fraction") {
        structure.appendChild(createVisualEquationSlot("numerator", "□", "visual-equation-numerator"));
        var bar = document.createElement("span");
        bar.className = "visual-equation-fraction-bar";
        structure.appendChild(bar);
        structure.appendChild(createVisualEquationSlot("denominator", "□", "visual-equation-denominator"));
    } else if (kind === "root") {
        structure.appendChild(document.createTextNode("√"));
        structure.appendChild(createVisualEquationSlot("radicand", "□", "visual-equation-radicand"));
    } else if (kind === "power") {
        structure.appendChild(createVisualEquationSlot("base", "□", "visual-equation-base"));
        structure.appendChild(createVisualEquationSlot("exponent", "□", "visual-equation-exponent"));
    } else if (kind === "subscript") {
        structure.appendChild(createVisualEquationSlot("base", "□", "visual-equation-base"));
        structure.appendChild(createVisualEquationSlot("subscript", "□", "visual-equation-subscript"));
    } else if (kind === "subSup") {
        structure.appendChild(createVisualEquationSlot("base", "□", "visual-equation-base"));
        structure.appendChild(createVisualEquationSlot("subscript", "□", "visual-equation-subscript"));
        structure.appendChild(createVisualEquationSlot("exponent", "□", "visual-equation-exponent"));
    } else if (kind === "limit") {
        structure.appendChild(createVisualEquationToken("lim", "\\lim "));
        structure.appendChild(createVisualEquationSlot("lower", "x → a", "visual-equation-lower"));
    } else if (kind === "limitArrow") {
        structure.appendChild(createVisualEquationToken("lim", "\\lim "));
        structure.appendChild(createVisualEquationSlot("approach-variable", "x", "visual-equation-lower-variable"));
        structure.appendChild(createVisualEquationToken("→", "\\to "));
        structure.appendChild(createVisualEquationSlot("approach-target", "a", "visual-equation-lower-target"));
    } else if (kind === "sum" || kind === "definiteIntegral") {
        structure.appendChild(createVisualEquationSlot("upper", "upper", "visual-equation-upper"));
        structure.appendChild(createVisualEquationToken(kind === "sum" ? "∑" : "∫", kind === "sum" ? "\\sum " : "\\int "));
        structure.appendChild(createVisualEquationSlot("lower", "lower", "visual-equation-lower"));
        structure.appendChild(createVisualEquationSlot("body", "term", "visual-equation-body"));
    } else if (kind === "integral") {
        structure.appendChild(createVisualEquationToken("∫", "\\int "));
        structure.appendChild(createVisualEquationSlot("body", "integrand", "visual-equation-body"));
    } else if (kind === "text") {
        structure.appendChild(createVisualEquationSlot("body", "text", "visual-equation-text-slot"));
    } else if (kind === "vectorArrow") {
        structure.appendChild(createVisualEquationSlot("body", "v", "visual-equation-vector-arrow-slot"));
    } else if (kind === "power-tail" || kind === "subscript-tail") {
        var tail = createVisualEquationSlot(kind === "power-tail" ? "exponent" : "subscript", "□", kind === "power-tail" ? "visual-equation-exponent" : "visual-equation-subscript");
        structure.appendChild(tail);
    }
    return structure;
}

function createVisualEquationBracket(left, right) {
    var bracket = document.createElement("span");
    bracket.className = "visual-equation-structure visual-equation-bracket";
    bracket.dataset.equationKind = "bracket";
    bracket.dataset.leftDelimiter = left || "none";
    bracket.dataset.rightDelimiter = right || "none";
    bracket.contentEditable = "false";
    bracket.appendChild(createVisualEquationToken(visualDelimiterGlyph(left), ""));
    bracket.appendChild(createVisualEquationSlot("body", "expression", "visual-equation-bracket-body"));
    bracket.appendChild(createVisualEquationToken(visualDelimiterGlyph(right), ""));
    return bracket;
}

function visualDelimiterGlyph(delimiter) {
    var glyphs = {none: "", "(": "(", ")": ")", "[": "[", "]": "]", "{": "{", "}": "}",
        "<": "⟨", ">": "⟩", "|": "|", "||": "‖", floorLeft: "⌊", floorRight: "⌋", ceilingLeft: "⌈", ceilingRight: "⌉"};
    return glyphs[delimiter] || "";
}

function visualDelimiterLatex(delimiter, side) {
    if (!delimiter || delimiter === "none") return side === "left" ? "\\left." : "\\right.";
    var latex = {"(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}",
        "<": "\\langle", ">": "\\rangle", "|": "|", "||": "\\Vert", floorLeft: "\\lfloor", floorRight: "\\rfloor",
        ceilingLeft: "\\lceil", ceilingRight: "\\rceil"};
    return (side === "left" ? "\\left" : "\\right") + (latex[delimiter] || ".");
}

function getVisualEquationToken(template) {
    var map = {
        alpha: ["α", "\\alpha "], beta: ["β", "\\beta "], gamma: ["γ", "\\gamma "], delta: ["δ", "\\delta "],
        epsilon: ["ε", "\\epsilon "], zeta: ["ζ", "\\zeta "], eta: ["η", "\\eta "], theta: ["θ", "\\theta "],
        iota: ["ι", "\\iota "], kappa: ["κ", "\\kappa "], lambda: ["λ", "\\lambda "], mu: ["μ", "\\mu "],
        nu: ["ν", "\\nu "], xi: ["ξ", "\\xi "], pi: ["π", "\\pi "], rho: ["ρ", "\\rho "], sigma: ["σ", "\\sigma "],
        tau: ["τ", "\\tau "], phi: ["φ", "\\phi "], chi: ["χ", "\\chi "], psi: ["ψ", "\\psi "], omega: ["ω", "\\omega "],
        Gamma: ["Γ", "\\Gamma "], Delta: ["Δ", "\\Delta "], Theta: ["Θ", "\\Theta "], Lambda: ["Λ", "\\Lambda "],
        Pi: ["Π", "\\Pi "], Sigma: ["Σ", "\\Sigma "], Phi: ["Φ", "\\Phi "], Omega: ["Ω", "\\Omega "],
        le: ["≤", "\\leq "], leq: ["≤", "\\leq "], ge: ["≥", "\\geq "], geq: ["≥", "\\geq "],
        ne: ["≠", "\\ne "], neq: ["≠", "\\ne "], approx: ["≈", "\\approx "],
        in: ["∈", "\\in "], notin: ["∉", "\\notin "], subset: ["⊆", "\\subseteq "], subseteq: ["⊆", "\\subseteq "],
        infinity: ["∞", "\\infty "], infty: ["∞", "\\infty "], lim: ["lim", "\\lim "], sum: ["∑", "\\sum "], int: ["∫", "\\int "],
        emptyset: ["∅", "\\emptyset "], cup: ["∪", "\\cup "], cap: ["∩", "\\cap "], forall: ["∀", "\\forall "],
        exists: ["∃", "\\exists "], therefore: ["∴", "\\therefore "], pm: ["±", "\\pm "], times: ["×", "\\times "],
        cdot: ["·", "\\cdot "], rightarrow: ["→", "\\rightarrow "], to: ["→", "\\to "], angle: ["∠", "\\angle "], degree: ["°", "^{\\circ}"],
        parallel: ["∥", "\\parallel "], perpendicular: ["⊥", "\\perp "], triangle: ["△", "\\triangle "], congruent: ["≅", "\\cong "],
        circ: ["°", "\\circ "],
        derivative: ["d/dx", "\\frac{d}{dx}"], partialDerivative: ["∂/∂x", "\\frac{\\partial}{\\partial x}"],
        mean: ["x̄", "\\bar{x}"], variance: ["s²", "s^2"], standardDeviation: ["σ", "\\sigma "], probability: ["P(A)", "P(A)"],
        sin: ["sin", "\\sin "], cos: ["cos", "\\cos "], tan: ["tan", "\\tan "], sec: ["sec", "\\sec "],
        cot: ["cot", "\\cot "], arcsin: ["arcsin", "\\arcsin "], arccos: ["arccos", "\\arccos "],
        arctan: ["arctan", "\\arctan "], ln: ["ln", "\\ln "], log: ["log", "\\log "], exp: ["exp", "\\exp "],
        min: ["min", "\\min "], max: ["max", "\\max "], gcd: ["gcd", "\\gcd "], mod: ["mod", "\\bmod "],
        cosec: ["cosec", "\\operatorname{cosec} "]
    };
    return map[template] || null;
}

function createVisualEquationTemplate(template) {
    var bracketTemplates = {
        floor: ["floorLeft", "floorRight"],
        ceiling: ["ceilingLeft", "ceilingRight"],
        modulus: ["|", "|"],
        norm: ["||", "||"]
    };
    if (bracketTemplates[template]) {
        return createVisualEquationBracket(bracketTemplates[template][0], bracketTemplates[template][1]);
    }
    if (template === "text") return createVisualEquationStructure("text");
    if (["fraction", "root", "power", "subscript", "subSup", "limit", "limitArrow", "sum", "integral", "definiteIntegral", "matrix", "matrix3", "matrix2x1", "matrix1x2", "vector", "cases", "aligned", "vectorArrow"].indexOf(template) !== -1) {
        return createVisualEquationStructure(template);
    }
    var token = getVisualEquationToken(template);
    return token ? createVisualEquationToken(token[0], token[1]) : document.createTextNode("");
}

function serializeVisualEquation(node) {
    function readSlot(structure, name) {
        var slot = getDirectVisualEquationSlot(structure, name);
        return slot ? Array.from(slot.childNodes).map(serializeNode).join("") : "";
    }
    function serializeNode(child) {
        if (child.nodeType === Node.TEXT_NODE) return (child.nodeValue || "").replace(/\u200B/g, "");
        if (child.nodeType !== Node.ELEMENT_NODE) return "";
        if (child.classList.contains("visual-equation-token")) return child.dataset.latex || "";
        var kind = child.dataset.equationKind;
        if (kind === "fraction") return "\\frac{" + readSlot(child, "numerator") + "}{" + readSlot(child, "denominator") + "}";
        if (kind === "root") return "\\sqrt{" + readSlot(child, "radicand") + "}";
        if (kind === "power") return "{" + readSlot(child, "base") + "}^{" + readSlot(child, "exponent") + "}";
        if (kind === "subscript") return "{" + readSlot(child, "base") + "}_{" + readSlot(child, "subscript") + "}";
        if (kind === "subSup") return "{" + readSlot(child, "base") + "}_{" + readSlot(child, "subscript") + "}^{" + readSlot(child, "exponent") + "}";
        if (kind === "power-tail") return "^{" + readSlot(child, "exponent") + "}";
        if (kind === "subscript-tail") return "_{" + readSlot(child, "subscript") + "}";
        if (kind === "limit") return "\\lim_{" + readSlot(child, "lower") + "}";
        if (kind === "limitArrow") return "\\lim_{" + readSlot(child, "approach-variable") + "\\to " + readSlot(child, "approach-target") + "}";
        if (kind === "vectorArrow") return "\\vec{" + readSlot(child, "body") + "}";
        if (kind === "sum" || kind === "definiteIntegral") {
            var command = kind === "sum" ? "\\sum" : "\\int";
            var body = readSlot(child, "body");
            return command + "_{" + readSlot(child, "lower") + "}^{" + readSlot(child, "upper") + "}" + (body ? " " + body : "");
        }
        if (kind === "integral") {
            var integrand = readSlot(child, "body");
            return "\\int " + integrand;
        }
        if (kind === "bracket") {
            return visualDelimiterLatex(child.dataset.leftDelimiter, "left") + "{" + readSlot(child, "body") + "}" +
                visualDelimiterLatex(child.dataset.rightDelimiter, "right");
        }
        if (kind === "text") return "\\text{" + escapeVisualEquationText(readSlot(child, "body")) + "}";
        if (kind === "matrix" || kind === "vector" || kind === "cases" || kind === "aligned") {
            var rowCount = Number(child.dataset.matrixRows) || 2;
            var columnCount = Number(child.dataset.matrixColumns) || 2;
            var matrixRows = [];
            var matrixGrid = child.querySelector(".visual-equation-matrix-grid");
            for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                var matrixCells = [];
                for (var columnIndex = 0; columnIndex < columnCount; columnIndex++) {
                    matrixCells.push(readSlot(matrixGrid, "cell-" + rowIndex + "-" + columnIndex));
                }
                matrixRows.push(matrixCells.join(" & "));
            }
            var environment = child.dataset.matrixEnvironment || (kind === "vector" ? "pmatrix" : "bmatrix");
            return "\\begin{" + environment + "}" + matrixRows.join(" \\\\ ") + "\\end{" + environment + "}";
        }
        if (child.tagName === "BR") return " ";
        return Array.from(child.childNodes).map(serializeNode).join("");
    }
    return node ? Array.from(node.childNodes).map(serializeNode).join("").replace(/\u200B/g, "") : "";
}

function escapeVisualEquationText(value) {
    var escaped = {"\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "&": "\\&",
        "#": "\\#", "_": "\\_", "$": "\\$", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}"};
    return String(value || "").replace(/[\\{}%&#_$~^]/g, function(character) { return escaped[character]; });
}

function rememberVisualEquationRange(composer) {
    var selection = window.getSelection();
    if (!composer || !selection || selection.rangeCount === 0) return;
    var range = selection.getRangeAt(0);
    if (composer.contains(range.commonAncestorContainer)) visualEquationRange = range.cloneRange();
}

function insertVisualEquationTemplate(composer, template, options) {
    var node;
    if (template === "customMatrix") {
        node = createVisualEquationMatrix(options && options.rows, options && options.columns, false);
    } else if (template === "customBracket") {
        node = createVisualEquationBracket(options && options.left, options && options.right);
    } else {
        node = createVisualEquationTemplate(template);
    }
    var selection = window.getSelection();
    var range = null;
    if (selection && selection.rangeCount) {
        var selectedRange = selection.getRangeAt(0);
        if (composer.contains(selectedRange.commonAncestorContainer)) range = selectedRange.cloneRange();
    }
    if (!range && visualEquationRange && composer.contains(visualEquationRange.commonAncestorContainer)) range = visualEquationRange.cloneRange();
    if (!range) {
        range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(node);
    var spacer = document.createTextNode("\u200B");
    node.parentNode.insertBefore(spacer, node.nextSibling);
    var focusSlot = node.nodeType === Node.ELEMENT_NODE ? node.querySelector(".visual-equation-slot") : null;
    if (focusSlot) {
        focusSlot.focus();
        range = document.createRange();
        range.selectNodeContents(focusSlot);
        range.collapse(false);
    } else {
        range = document.createRange();
        range.setStart(spacer, 1);
        range.collapse(true);
        composer.focus({preventScroll: true});
    }
    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    visualEquationRange = range.cloneRange();
    composer.dispatchEvent(new Event("input", {bubbles: true}));
}

function autoConvertVisualMathFunction(composer, force) {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    var activeRange = selection.getRangeAt(0);
    var textNode = activeRange.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE || !composer.contains(textNode)) return false;
    var textBeforeCaret = (textNode.nodeValue || "").slice(0, activeRange.startOffset);
    var delimiterMatch = textBeforeCaret.match(/[\s,;:=+\-*/()]+$/);
    var typedEnd = delimiterMatch ? textBeforeCaret.length - delimiterMatch[0].length : textBeforeCaret.length;
    var functionText = textBeforeCaret.slice(0, typedEnd);
    var match = functionText.match(/(arcsin|arccos|arctan|cosec|min|max|gcd|sin|cos|tan|sec|cot|ln|log|exp)$/i);
    if (!match) return false;
    if (match[0].toLowerCase() === "cos" && !delimiterMatch && !force) return false;
    if (["min", "max", "gcd"].indexOf(match[0].toLowerCase()) !== -1 && !delimiterMatch && !force) return false;
    var wordStart = activeRange.startOffset - (delimiterMatch ? delimiterMatch[0].length : 0) - match[0].length;
    var previousCharacter = functionText.slice(0, -match[0].length).slice(-1);
    if (/[A-Za-z\\]/.test(previousCharacter)) return false;
    var tokenInfo = getVisualEquationToken(match[0].toLowerCase());
    if (!tokenInfo) return false;
    var range = document.createRange();
    range.setStart(textNode, wordStart);
    range.setEnd(textNode, activeRange.startOffset);
    range.deleteContents();
    var token = createVisualEquationToken(tokenInfo[0], tokenInfo[1]);
    range.insertNode(token);
    var spacer = document.createTextNode("\u200B");
    token.parentNode.insertBefore(spacer, token.nextSibling);
    range = document.createRange();
    range.setStart(spacer, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    visualEquationRange = range.cloneRange();
    return true;
}

function readVisualLatexGroup(source, start) {
    var cursor = start;
    while (/\s/.test(source[cursor] || "") && cursor < source.length) cursor++;
    if (source[cursor] !== "{") {
        if (source[cursor] === "\\") {
            var command = source.slice(cursor).match(/^\\([A-Za-z]+|.)/);
            if (command) return {value: command[0], next: cursor + command[0].length};
        }
        return {value: source[cursor] || "", next: Math.min(source.length, cursor + 1)};
    }
    var depth = 0;
    for (var index = cursor; index < source.length; index++) {
        if (source[index] === "\\") {
            var escapedToken = source.slice(index).match(/^\\([A-Za-z]+|.)/);
            if (escapedToken) {
                index += escapedToken[0].length - 1;
                continue;
            }
        }
        if (source[index] === "{") depth++;
        else if (source[index] === "}") {
            depth--;
            if (depth === 0) return {value: source.slice(cursor + 1, index), next: index + 1};
        }
    }
    return {value: source.slice(cursor + 1), next: source.length};
}

function appendVisualEquationText(parent, text) {
    if (!text) return;
    var last = parent.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) last.nodeValue += text;
    else parent.appendChild(document.createTextNode(text));
}

function appendLatexToVisualEquation(parent, source) {
    var index = 0;
    while (index < source.length) {
        var character = source[index];
        if (character === "^") {
            var powerGroup = readVisualLatexGroup(source, index + 1);
            var powerNode = createVisualEquationStructure("power-tail");
            appendLatexToVisualEquation(getDirectVisualEquationSlot(powerNode, "exponent"), powerGroup.value);
            parent.appendChild(powerNode);
            index = powerGroup.next;
            continue;
        }
        if (character === "_") {
            var subscriptGroup = readVisualLatexGroup(source, index + 1);
            var subscriptNode = createVisualEquationStructure("subscript-tail");
            appendLatexToVisualEquation(getDirectVisualEquationSlot(subscriptNode, "subscript"), subscriptGroup.value);
            parent.appendChild(subscriptNode);
            index = subscriptGroup.next;
            continue;
        }
        if (character === "{") {
            var rawGroup = readVisualLatexGroup(source, index);
            appendLatexToVisualEquation(parent, rawGroup.value);
            index = rawGroup.next;
            continue;
        }
        if (character !== "\\") {
            if (character !== "}") appendVisualEquationText(parent, character);
            index++;
            continue;
        }
        if (source.slice(index, index + 2) === "\\\\") {
            appendVisualEquationText(parent, " ");
            index += 2;
            continue;
        }
        var commandMatch = source.slice(index).match(/^\\([A-Za-z]+|.)/);
        if (!commandMatch) {
            appendVisualEquationText(parent, character);
            index++;
            continue;
        }
        var command = commandMatch[1];
        var nextIndex = index + commandMatch[0].length;
        if (command === "frac" || command === "dfrac" || command === "tfrac") {
            var numerator = readVisualLatexGroup(source, nextIndex);
            var denominator = readVisualLatexGroup(source, numerator.next);
            var fractionNode = createVisualEquationStructure("fraction");
            appendLatexToVisualEquation(getDirectVisualEquationSlot(fractionNode, "numerator"), numerator.value);
            appendLatexToVisualEquation(getDirectVisualEquationSlot(fractionNode, "denominator"), denominator.value);
            parent.appendChild(fractionNode);
            index = denominator.next;
            continue;
        }
        if (command === "sqrt") {
            var radicand = readVisualLatexGroup(source, nextIndex);
            var rootNode = createVisualEquationStructure("root");
            appendLatexToVisualEquation(getDirectVisualEquationSlot(rootNode, "radicand"), radicand.value);
            parent.appendChild(rootNode);
            index = radicand.next;
            continue;
        }
        if (command === "vec") {
            var vectorGroup = readVisualLatexGroup(source, nextIndex);
            var vectorArrow = createVisualEquationStructure("vectorArrow");
            appendLatexToVisualEquation(getDirectVisualEquationSlot(vectorArrow, "body"), vectorGroup.value);
            parent.appendChild(vectorArrow);
            index = vectorGroup.next;
            continue;
        }
        if (command === "begin") {
            var environmentGroup = readVisualLatexGroup(source, nextIndex);
            var environment = environmentGroup.value.trim();
            var endMarker = "\\end{" + environment + "}";
            var endIndex = source.indexOf(endMarker, environmentGroup.next);
            if (endIndex !== -1 && ["bmatrix", "pmatrix", "matrix", "cases", "aligned"].indexOf(environment) !== -1) {
                var matrixSource = source.slice(environmentGroup.next, endIndex);
                var rows = matrixSource.split(/\\\\/g);
                var cells = rows.map(function(row) { return row.split("&"); });
                var rowCount = Math.min(8, cells.length);
                var columnCount = Math.min(8, Math.max.apply(null, cells.map(function(row) { return row.length; })));
                var matrixNode = createVisualEquationMatrix(rowCount, columnCount, environment === "pmatrix", environment);
                cells.slice(0, rowCount).forEach(function(row, rowIndex) {
                    row.slice(0, columnCount).forEach(function(cell, columnIndex) {
                        var slot = getDirectVisualEquationSlot(matrixNode.querySelector(".visual-equation-matrix-grid"), "cell-" + rowIndex + "-" + columnIndex);
                        appendLatexToVisualEquation(slot, cell.trim());
                    });
                });
                parent.appendChild(matrixNode);
                index = endIndex + endMarker.length;
                continue;
            }
            appendVisualEquationText(parent, "\\begin{" + environment + "}");
            index = environmentGroup.next;
            continue;
        }
        if (command === "operatorname") {
            var operatorGroup = readVisualLatexGroup(source, nextIndex);
            var operatorName = operatorGroup.value.trim();
            var operatorToken = operatorName === "cosec"
                ? createVisualEquationToken("cosec", "\\operatorname{cosec} ")
                : null;
            if (operatorToken) parent.appendChild(operatorToken);
            else appendVisualEquationText(parent, operatorName);
            index = operatorGroup.next;
            continue;
        }
        if (["displaystyle", "left", "right"].indexOf(command) !== -1) {
            index = nextIndex;
            continue;
        }
        if ([",", ";", "!", "quad", "qquad"].indexOf(command) !== -1) {
            appendVisualEquationText(parent, command === "!" ? "" : " ");
            index = nextIndex;
            continue;
        }
        if (command === "text") {
            var textGroup = readVisualLatexGroup(source, nextIndex);
            var textNode = createVisualEquationStructure("text");
            getDirectVisualEquationSlot(textNode, "body").textContent = decodeVisualEquationText(textGroup.value);
            parent.appendChild(textNode);
            index = textGroup.next;
            continue;
        }
        var visualToken = getVisualEquationToken(command);
        if (visualToken) parent.appendChild(createVisualEquationToken(visualToken[0], visualToken[1]));
        else appendVisualEquationText(parent, "\\" + command);
        index = nextIndex;
    }
}

function decodeVisualEquationText(value) {
    return String(value || "")
        .replace(/\\textbackslash\{\}/g, "\u0000")
        .replace(/\\textasciitilde\{\}/g, "~")
        .replace(/\\textasciicircum\{\}/g, "^")
        .replace(/\\([{}%&#_$])/g, "$1")
        .replace(/\u0000/g, "\\");
}

function loadVisualEquationComposer(composer, latex) {
    composer.innerHTML = "";
    if (latex) appendLatexToVisualEquation(composer, String(latex).replace(/^\\displaystyle\s*/, ""));
}

function openEquationEditor(initialLatex, existingNode) {
    var latex = initialLatex || "";
    var dialogTitle = existingNode ? "Edit equation" : "Insert equation";
    var confirmLabel = existingNode ? "Update equation" : "Insert equation";
    var displayStyle = /^\\displaystyle\s*/.test(latex);
    latex = latex.replace(/^\\displaystyle\s*/, "");
    openVisualDialog(dialogTitle, [
        '<div class="visual-equation-category-tabs" role="tablist" aria-label="Equation template categories">',
        '<button type="button" role="tab" data-equation-category-tab="structure">Algebra</button>',
        '<button type="button" role="tab" data-equation-category-tab="brackets">Brackets</button>',
        '<button type="button" role="tab" data-equation-category-tab="calculus">Derivatives</button>',
        '<button type="button" role="tab" data-equation-category-tab="statistics">Statistics</button>',
        '<button type="button" role="tab" data-equation-category-tab="matrices">Matrices</button>',
        '<button type="button" role="tab" data-equation-category-tab="greek">Greek</button>',
        '<button type="button" role="tab" data-equation-category-tab="symbols">Sets &amp; symbols</button>',
        '<button type="button" role="tab" data-equation-category-tab="functions">Trig</button>',
        '<button type="button" role="tab" data-equation-category-tab="geometry">Geometry</button>',
        '</div><div class="visual-equation-template-groups">',
        '<div class="visual-equation-template-group" data-equation-category="structure"><div class="visual-equation-templates" aria-label="Equation structure templates">',
        '<button type="button" data-equation-template="fraction" title="Insert a fraction">a⁄b Fraction</button>',
        '<button type="button" data-equation-template="root" title="Insert a square root">√ Root</button>',
        '<button type="button" data-equation-template="power" title="Insert a power">xⁿ Power</button>',
        '<button type="button" data-equation-template="subscript" title="Insert a subscript">xₙ Subscript</button>',
        '<button type="button" data-equation-template="subSup" title="Insert a base with both subscript and superscript">xᵢⁿ Sub + Sup</button>',
        '<button type="button" data-equation-template="cases" title="Insert piecewise cases">{ } Cases</button>',
        '<button type="button" data-equation-template="aligned" title="Insert aligned equations">Aligned</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="brackets"><div class="visual-equation-bracket-picker">',
        '<label>Left bracket<select id="visualBracketLeft"><option value="none">None</option><option value="(">(</option><option value=")">)</option><option value="[">[</option><option value="]">]</option><option value="{">{</option><option value="}">}</option><option value="<">⟨</option><option value=">">⟩</option><option value="|">|</option><option value="||">‖</option><option value="floorLeft">⌊</option><option value="floorRight">⌋</option><option value="ceilingLeft">⌈</option><option value="ceilingRight">⌉</option></select></label>',
        '<label>Right bracket<select id="visualBracketRight"><option value="none">None</option><option value="(">(</option><option value=")">)</option><option value="[">[</option><option value="]">]</option><option value="{">{</option><option value="}">}</option><option value="<">⟨</option><option value=">">⟩</option><option value="|">|</option><option value="||">‖</option><option value="floorLeft">⌊</option><option value="floorRight">⌋</option><option value="ceilingLeft">⌈</option><option value="ceilingRight">⌉</option></select></label>',
        '<button type="button" data-equation-template="customBracket">Insert bracketed expression</button></div>',
        '<div class="visual-equation-bracket-presets">',
        '<button type="button" data-bracket-preset="paren">( )</button><button type="button" data-bracket-preset="square">[ ]</button>',
        '<button type="button" data-bracket-preset="curly">{ }</button><button type="button" data-bracket-preset="angle">⟨ ⟩</button>',
        '<button type="button" data-bracket-preset="mixed1">( }</button><button type="button" data-bracket-preset="mixed2">{ )</button>',
        '<button type="button" data-bracket-preset="leftOnly">{ only</button><button type="button" data-bracket-preset="rightOnly">only }</button>',
        '<button type="button" data-bracket-preset="floor" title="Insert floor brackets">⌊x⌋ Floor</button><button type="button" data-bracket-preset="ceiling" title="Insert ceiling brackets">⌈x⌉ Ceiling</button>',
        '<button type="button" data-bracket-preset="modulus" title="Insert absolute value or modulus bars">|x| Modulus</button><button type="button" data-bracket-preset="norm" title="Insert double bars">‖x‖ Norm</button>',
        '<button type="button" data-bracket-preset="parenModRight">(|</button><button type="button" data-bracket-preset="modParenRight">|)</button>',
        '<button type="button" data-bracket-preset="squareModRight">[|</button><button type="button" data-bracket-preset="modSquareRight">|]</button>',
        '<button type="button" data-bracket-preset="curlyModRight">{|</button><button type="button" data-bracket-preset="modCurlyRight">|}</button>',
        '<button type="button" data-bracket-preset="angleModRight">⟨|</button><button type="button" data-bracket-preset="modAngleRight">|⟩</button>',
        '<button type="button" data-bracket-preset="leftModOnly">| only</button><button type="button" data-bracket-preset="rightModOnly">only |</button>',
        '<button type="button" data-equation-template="mod" title="Insert the modulo operator">mod</button>',
        '<button type="button" data-equation-template="text" title="Insert upright text within the equation">T Text</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="calculus"><div class="visual-equation-templates" aria-label="Derivative and calculus templates">',
        '<button type="button" data-equation-template="derivative">d/dx</button>',
        '<button type="button" data-equation-template="partialDerivative">∂/∂x</button>',
        '<button type="button" data-equation-template="limit">lim</button>',
        '<button type="button" data-equation-template="limitArrow" title="Insert a limit with x approaching a value">lim x→a</button>',
        '<button type="button" data-equation-template="sum">∑ Sum</button>',
        '<button type="button" data-equation-template="integral">∫ Integral</button>',
        '<button type="button" data-equation-template="definiteIntegral">∫ Definite</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="statistics"><div class="visual-equation-templates" aria-label="Statistics templates">',
        '<button type="button" data-equation-template="mean">x̄ Mean</button>',
        '<button type="button" data-equation-template="variance">s² Variance</button>',
        '<button type="button" data-equation-template="standardDeviation">σ Std dev</button>',
        '<button type="button" data-equation-template="probability">P(A)</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="matrices"><div class="visual-equation-templates" aria-label="Matrix templates">',
        '<button type="button" data-equation-template="matrix">2×2</button>',
        '<button type="button" data-equation-template="matrix3">3×3</button>',
        '<button type="button" data-equation-template="matrix2x1">2×1</button>',
        '<button type="button" data-equation-template="matrix1x2">1×2</button>',
        '<button type="button" data-equation-template="vector">→ Vector</button>',
        '<button type="button" data-equation-template="vectorArrow" title="Insert a vector symbol with an arrow above it">v⃗</button>',
        '</div><div class="visual-equation-matrix-customizer"><label>Rows <input id="visualMatrixRows" type="number" min="1" max="8" value="3"></label>',
        '<label>Columns <input id="visualMatrixColumns" type="number" min="1" max="8" value="3"></label>',
        '<button type="button" data-equation-template="customMatrix">Insert custom matrix</button></div></div>',
        '<div class="visual-equation-template-group" data-equation-category="greek"><div class="visual-equation-templates" aria-label="Greek letter templates">',
        '<button type="button" data-equation-template="alpha">α</button>',
        '<button type="button" data-equation-template="beta">β</button>',
        '<button type="button" data-equation-template="gamma">γ</button>',
        '<button type="button" data-equation-template="delta">δ</button>',
        '<button type="button" data-equation-template="epsilon">ε</button>',
        '<button type="button" data-equation-template="zeta">ζ</button>',
        '<button type="button" data-equation-template="eta">η</button>',
        '<button type="button" data-equation-template="iota">ι</button>',
        '<button type="button" data-equation-template="kappa">κ</button>',
        '<button type="button" data-equation-template="theta">θ</button>',
        '<button type="button" data-equation-template="lambda">λ</button>',
        '<button type="button" data-equation-template="mu">μ</button>',
        '<button type="button" data-equation-template="nu">ν</button>',
        '<button type="button" data-equation-template="xi">ξ</button>',
        '<button type="button" data-equation-template="pi">π</button>',
        '<button type="button" data-equation-template="rho">ρ</button>',
        '<button type="button" data-equation-template="sigma">σ</button>',
        '<button type="button" data-equation-template="tau">τ</button>',
        '<button type="button" data-equation-template="phi">φ</button>',
        '<button type="button" data-equation-template="chi">χ</button>',
        '<button type="button" data-equation-template="psi">ψ</button>',
        '<button type="button" data-equation-template="omega">ω</button>',
        '<button type="button" data-equation-template="Gamma">Γ</button>',
        '<button type="button" data-equation-template="Delta">Δ</button>',
        '<button type="button" data-equation-template="Theta">Θ</button>',
        '<button type="button" data-equation-template="Lambda">Λ</button>',
        '<button type="button" data-equation-template="Pi">Π</button>',
        '<button type="button" data-equation-template="Sigma">Σ</button>',
        '<button type="button" data-equation-template="Phi">Φ</button>',
        '<button type="button" data-equation-template="Omega">Ω</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="symbols"><div class="visual-equation-templates" aria-label="Inequality templates">',
        '<button type="button" data-equation-template="le">≤</button>',
        '<button type="button" data-equation-template="ge">≥</button>',
        '<button type="button" data-equation-template="ne">≠</button>',
        '<button type="button" data-equation-template="approx">≈</button>',
        '<button type="button" data-equation-template="in">∈</button>',
        '<button type="button" data-equation-template="subset">⊆</button>',
        '<button type="button" data-equation-template="infinity">∞</button>',
        '<button type="button" data-equation-template="emptyset">∅</button>',
        '<button type="button" data-equation-template="cup">∪</button>',
        '<button type="button" data-equation-template="cap">∩</button>',
        '<button type="button" data-equation-template="notin">∉</button>',
        '<button type="button" data-equation-template="forall">∀</button>',
        '<button type="button" data-equation-template="exists">∃</button>',
        '<button type="button" data-equation-template="therefore">∴</button>',
        '<button type="button" data-equation-template="pm">±</button>',
        '<button type="button" data-equation-template="times">×</button>',
        '<button type="button" data-equation-template="cdot">·</button>',
        '<button type="button" data-equation-template="rightarrow">→</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="functions"><div class="visual-equation-templates" aria-label="Trigonometry and function templates">',
        '<button type="button" data-equation-template="sin">sin</button>',
        '<button type="button" data-equation-template="cos">cos</button>',
        '<button type="button" data-equation-template="tan">tan</button>',
        '<button type="button" data-equation-template="cosec">cosec</button>',
        '<button type="button" data-equation-template="sec">sec</button>',
        '<button type="button" data-equation-template="cot">cot</button>',
        '<button type="button" data-equation-template="arcsin">arcsin</button>',
        '<button type="button" data-equation-template="arccos">arccos</button>',
        '<button type="button" data-equation-template="arctan">arctan</button>',
        '<button type="button" data-equation-template="ln">ln</button>',
        '<button type="button" data-equation-template="log">log</button>',
        '<button type="button" data-equation-template="exp">exp</button>',
        '<button type="button" data-equation-template="min">min</button>',
        '<button type="button" data-equation-template="max">max</button>',
        '<button type="button" data-equation-template="gcd">gcd</button>',
        '</div></div>',
        '<div class="visual-equation-template-group" data-equation-category="geometry"><div class="visual-equation-templates" aria-label="Geometry templates">',
        '<button type="button" data-equation-template="angle">∠ Angle</button>',
        '<button type="button" data-equation-template="degree">° Degree</button>',
        '<button type="button" data-equation-template="parallel">∥ Parallel</button>',
        '<button type="button" data-equation-template="perpendicular">⊥ Perpendicular</button>',
        '<button type="button" data-equation-template="triangle">△ Triangle</button>',
        '<button type="button" data-equation-template="congruent">≅ Congruent</button>',
        '</div></div></div>',
        '<div class="visual-equation-canvas-wrap"><div class="visual-equation-canvas-heading"><strong>Visual equation</strong><span>Type or insert a template. Ctrl+Alt+F fraction · R root · P power · A/B/G Greek.</span>',
        '<div class="visual-equation-history-controls"><button type="button" data-equation-history="undo" disabled title="Undo (Ctrl+Z)">↶</button><button type="button" data-equation-history="redo" disabled title="Redo (Ctrl+Y)">↷</button></div></div>',
        '<div id="visualEquationComposer" class="visual-equation-composer" contenteditable="true" role="textbox" aria-label="Visual equation editor" aria-multiline="true" data-placeholder="Start typing, or choose a structure above…"></div></div>',
        '<details id="visualEquationLatexDetails" class="visual-equation-latex-details"><summary>Edit LaTeX source</summary>',
        '<textarea id="visualEquationInput" class="visual-dialog-input visual-equation-input" rows="2" autocomplete="off" placeholder="LaTeX source"></textarea>',
        '<p class="visual-dialog-help">The visual canvas and LaTeX source stay in sync for common structures.</p></details>',
        '<label class="visual-displaystyle-toggle"><input id="visualDisplayStyle" type="checkbox"> Display this equation in larger display style</label>',
        '<div class="visual-equation-preview-label">Preview</div>',
        '<div id="visualEquationPreview" class="visual-equation-preview">Your equation preview will appear here.</div>'
    ].join(""), confirmLabel, function(dialog) {
        var value = dialog.querySelector("#visualEquationInput").value.trim();
        if (!value) {
            dialog.querySelector("#visualEquationComposer").focus();
            return false;
        }
        if (dialog.querySelector("#visualDisplayStyle").checked && !/^\\displaystyle\s*/.test(value)) {
            value = "\\displaystyle " + value;
        }
        if (existingNode && existingNode.isConnected) {
            existingNode.replaceWith(createEquationAssetNode(value));
            updateLivePreview();
        } else {
            insertAtVisualCaret(createEquationAssetNode(value), false);
        }
        return true;
    });
    var dialog = document.getElementById("visualEditorDialog");
    var equationPanel = dialog.querySelector(".visual-editor-dialog");
    if (equationPanel) equationPanel.classList.add("visual-equation-dialog");
    var categoryTabs = dialog.querySelectorAll("[data-equation-category-tab]");
    var categoryGroups = dialog.querySelectorAll("[data-equation-category]");
    var composer = dialog.querySelector("#visualEquationComposer");
    var latexDetails = dialog.querySelector("#visualEquationLatexDetails");
    function setEquationCategory(category) {
        categoryTabs.forEach(function(tab) {
            var selected = tab.dataset.equationCategoryTab === category;
            tab.classList.toggle("active", selected);
            tab.setAttribute("aria-selected", selected ? "true" : "false");
        });
        categoryGroups.forEach(function(group) {
            group.hidden = group.dataset.equationCategory !== category;
        });
    }
    categoryTabs.forEach(function(tab) {
        tab.onmousedown = function(event) { event.preventDefault(); };
        tab.onclick = function() { setEquationCategory(tab.dataset.equationCategoryTab); };
    });
    setEquationCategory("structure");
    var input = dialog.querySelector("#visualEquationInput");
    input.value = latex;
    var latexSourceDirty = false;
    visualEquationRange = null;
    loadVisualEquationComposer(composer, latex);
    dialog.querySelector("#visualDisplayStyle").checked = displayStyle;
    var preview = dialog.querySelector("#visualEquationPreview");
    var previewTimer;
    function getPreviewLatex() {
        var value = input.value.trim();
        if (dialog.querySelector("#visualDisplayStyle").checked && value && !/^\\displaystyle\s*/.test(value)) {
            value = "\\displaystyle " + value;
        }
        return value;
    }
    function renderEquationPreview() {
        if (previewTimer) clearTimeout(previewTimer);
        if (window.MathJax && typeof window.MathJax.typesetClear === "function") {
            window.MathJax.typesetClear([preview]);
        }
        var previewLatex = getPreviewLatex();
        preview.textContent = previewLatex ? "\\(" + previewLatex + "\\)" : "Your equation preview will appear here.";
        if (!previewLatex || !window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
        previewTimer = setTimeout(function() {
            window.MathJax.typesetPromise([preview]).catch(function() {});
        }, 120);
    }
    var equationHistory = [];
    var equationHistoryIndex = -1;
    var restoringEquationHistory = false;
    function pathFromComposer(node) {
        var path = [];
        while (node && node !== composer) {
            var parent = node.parentNode;
            if (!parent) return null;
            path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
            node = parent;
        }
        return node === composer ? path : null;
    }
    function nodeAtComposerPath(path) {
        var node = composer;
        (path || []).forEach(function(index) {
            if (node && node.childNodes[index]) node = node.childNodes[index];
        });
        return node;
    }
    function captureEquationSelection() {
        var selection = window.getSelection();
        if (!selection || !selection.rangeCount) return null;
        var range = selection.getRangeAt(0);
        var startPath = pathFromComposer(range.startContainer);
        var endPath = pathFromComposer(range.endContainer);
        if (!startPath || !endPath) return null;
        return {startPath: startPath, startOffset: range.startOffset, endPath: endPath, endOffset: range.endOffset};
    }
    function restoreEquationSelection(saved) {
        var selection = window.getSelection();
        if (!selection) return;
        var range = document.createRange();
        try {
            var start = saved ? nodeAtComposerPath(saved.startPath) : composer;
            var end = saved ? nodeAtComposerPath(saved.endPath) : composer;
            var startMax = start.nodeType === Node.TEXT_NODE ? start.nodeValue.length : start.childNodes.length;
            var endMax = end.nodeType === Node.TEXT_NODE ? end.nodeValue.length : end.childNodes.length;
            range.setStart(start, Math.min(saved ? saved.startOffset : composer.childNodes.length, startMax));
            range.setEnd(end, Math.min(saved ? saved.endOffset : composer.childNodes.length, endMax));
        } catch (error) {
            range.selectNodeContents(composer);
            range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
    }
    function updateEquationHistoryButtons() {
        var undo = dialog.querySelector('[data-equation-history="undo"]');
        var redo = dialog.querySelector('[data-equation-history="redo"]');
        if (undo) undo.disabled = equationHistoryIndex <= 0;
        if (redo) redo.disabled = equationHistoryIndex < 0 || equationHistoryIndex >= equationHistory.length - 1;
    }
    function resetEquationHistory() {
        equationHistory = [{html: composer.innerHTML, selection: captureEquationSelection()}];
        equationHistoryIndex = 0;
        updateEquationHistoryButtons();
    }
    function recordEquationHistory() {
        if (restoringEquationHistory) return;
        var html = composer.innerHTML;
        if (equationHistoryIndex >= 0 && equationHistory[equationHistoryIndex].html === html) return;
        equationHistory = equationHistory.slice(0, equationHistoryIndex + 1);
        equationHistory.push({html: html, selection: captureEquationSelection()});
        if (equationHistory.length > 100) equationHistory.shift();
        equationHistoryIndex = equationHistory.length - 1;
        updateEquationHistoryButtons();
    }
    function moveEquationHistory(offset) {
        var next = equationHistoryIndex + offset;
        if (next < 0 || next >= equationHistory.length) return false;
        equationHistoryIndex = next;
        restoringEquationHistory = true;
        var state = equationHistory[equationHistoryIndex];
        composer.innerHTML = state.html;
        composer.focus({preventScroll: true});
        restoreEquationSelection(state.selection);
        visualEquationRange = null;
        rememberVisualEquationRange(composer);
        input.value = serializeVisualEquation(composer);
        latexSourceDirty = false;
        renderEquationPreview();
        restoringEquationHistory = false;
        updateEquationHistoryButtons();
        return true;
    }
    resetEquationHistory();
    composer.addEventListener("input", function() {
        autoConvertVisualMathFunction(composer);
        input.value = serializeVisualEquation(composer);
        latexSourceDirty = false;
        rememberVisualEquationRange(composer);
        renderEquationPreview();
        recordEquationHistory();
    });
    composer.addEventListener("keydown", function(event) {
        var commandKey = event.ctrlKey || event.metaKey;
        if (commandKey && !event.altKey && event.key.toLowerCase() === "z") {
            var moved = moveEquationHistory(event.shiftKey ? 1 : -1);
            if (moved) event.preventDefault();
            return;
        }
        if (commandKey && !event.altKey && event.key.toLowerCase() === "y") {
            if (moveEquationHistory(1)) event.preventDefault();
            return;
        }
        if (!commandKey || !event.altKey || event.shiftKey) return;
        var shortcuts = {f: "fraction", r: "root", p: "power", a: "alpha", b: "beta", g: "gamma"};
        var template = shortcuts[event.key.toLowerCase()];
        if (!template) return;
        event.preventDefault();
        insertVisualEquationTemplate(composer, template);
    });
    ["keyup", "mouseup", "click"].forEach(function(eventName) {
        composer.addEventListener(eventName, function() { rememberVisualEquationRange(composer); });
    });
    composer.addEventListener("blur", function() {
        if (!autoConvertVisualMathFunction(composer, true)) return;
        input.value = serializeVisualEquation(composer);
        renderEquationPreview();
    });
    composer.addEventListener("focus", function() {
        if (latexSourceDirty) {
            loadVisualEquationComposer(composer, input.value);
            latexSourceDirty = false;
            resetEquationHistory();
        }
    });
    input.addEventListener("input", function() {
        latexSourceDirty = true;
        renderEquationPreview();
    });
    latexDetails.addEventListener("toggle", function() {
        if (latexDetails.open && !latexSourceDirty) input.value = serializeVisualEquation(composer);
        if (!latexDetails.open && latexSourceDirty) {
            loadVisualEquationComposer(composer, input.value);
            latexSourceDirty = false;
            visualEquationRange = null;
            resetEquationHistory();
        }
    });
    dialog.querySelector("#visualDisplayStyle").addEventListener("change", renderEquationPreview);
    dialog.querySelectorAll("[data-equation-history]").forEach(function(button) {
        button.onmousedown = function(event) { event.preventDefault(); };
        button.onclick = function() {
            moveEquationHistory(button.dataset.equationHistory === "undo" ? -1 : 1);
        };
    });
    dialog.addEventListener("mousedown", function(event) {
        if (event.target.closest("[data-matrix-action]")) event.preventDefault();
    });
    dialog.addEventListener("click", function(event) {
        var actionButton = event.target.closest("[data-matrix-action]");
        if (!actionButton) return;
        var matrix = actionButton.closest(".visual-equation-matrix");
        if (resizeVisualEquationMatrix(matrix, actionButton.dataset.matrixAction)) {
            var activeSlot = document.activeElement;
            var focusSlot = matrix.contains(activeSlot) && activeSlot.classList.contains("visual-equation-slot")
                ? activeSlot
                : matrix.querySelector(".visual-equation-matrix-cell");
            if (focusSlot) {
                focusSlot.focus();
                var focusRange = document.createRange();
                focusRange.selectNodeContents(focusSlot);
                focusRange.collapse(false);
                var selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(focusRange);
                rememberVisualEquationRange(composer);
            }
            composer.dispatchEvent(new Event("input", {bubbles: true}));
        }
    });
    dialog.querySelectorAll("[data-equation-template]").forEach(function(button) {
        button.onmousedown = function(event) { event.preventDefault(); };
        button.onclick = function() {
            if (latexSourceDirty) {
                loadVisualEquationComposer(composer, input.value);
                latexSourceDirty = false;
                resetEquationHistory();
            }
            var template = button.dataset.equationTemplate;
            var options = null;
            if (template === "customMatrix") {
                options = {
                    rows: parseInt(dialog.querySelector("#visualMatrixRows").value, 10) || 1,
                    columns: parseInt(dialog.querySelector("#visualMatrixColumns").value, 10) || 1
                };
            } else if (template === "customBracket") {
                options = {
                    left: dialog.querySelector("#visualBracketLeft").value,
                    right: dialog.querySelector("#visualBracketRight").value
                };
            }
            insertVisualEquationTemplate(composer, template, options);
        };
    });
    dialog.querySelectorAll("[data-bracket-preset]").forEach(function(button) {
        button.onmousedown = function(event) { event.preventDefault(); };
        button.onclick = function() {
            var presets = {
                paren: ["(", ")"], square: ["[", "]"], curly: ["{", "}"], angle: ["<", ">"],
                mixed1: ["(", "}"], mixed2: ["{", ")"], leftOnly: ["{", "none"], rightOnly: ["none", "}"],
                floor: ["floorLeft", "floorRight"], ceiling: ["ceilingLeft", "ceilingRight"],
                modulus: ["|", "|"], norm: ["||", "||"],
                parenModRight: ["(", "|"], modParenRight: ["|", ")"],
                squareModRight: ["[", "|"], modSquareRight: ["|", "]"],
                curlyModRight: ["{", "|"], modCurlyRight: ["|", "}"],
                angleModRight: ["<", "|"], modAngleRight: ["|", ">"],
                leftModOnly: ["|", "none"], rightModOnly: ["none", "|"]
            };
            var selected = presets[button.dataset.bracketPreset];
            if (!selected) return;
            dialog.querySelector("#visualBracketLeft").value = selected[0];
            dialog.querySelector("#visualBracketRight").value = selected[1];
            if (latexSourceDirty) {
                loadVisualEquationComposer(composer, input.value);
                latexSourceDirty = false;
                resetEquationHistory();
            }
            insertVisualEquationTemplate(composer, "customBracket", {left: selected[0], right: selected[1]});
        };
    });
    renderEquationPreview();
    composer.focus({preventScroll: true});
}

function insertEquationTemplate(input, template) {
    var start = input.selectionStart == null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd == null ? start : input.selectionEnd;
    var marker = template.indexOf("|");
    var cursorOffset = marker === -1 ? template.length : marker;
    template = template.replace("|", "");
    input.setRangeText(template, start, end, "end");
    var caret = start + cursorOffset;
    input.setSelectionRange(caret, caret);
    input.focus();
    input.dispatchEvent(new Event("input", {bubbles: true}));
}

function openVisualTableEditor() {
    openVisualDialog("Insert table", [
        '<div class="visual-dialog-grid">',
        '<label class="visual-dialog-label">Rows <input id="visualTableRows" class="visual-dialog-input" type="number" min="1" max="12" value="2"></label>',
        '<label class="visual-dialog-label">Columns <input id="visualTableColumns" class="visual-dialog-input" type="number" min="1" max="8" value="2"></label>',
        '</div>',
        '<label class="visual-dialog-label" for="visualTableCaption">Caption <span>(optional)</span></label>',
        '<input id="visualTableCaption" class="visual-dialog-input" type="text" placeholder="Table caption">'
    ].join(""), "Insert table", function(dialog) {
        var rowCount = Math.max(1, Math.min(12, parseInt(dialog.querySelector("#visualTableRows").value, 10) || 1));
        var colCount = Math.max(1, Math.min(8, parseInt(dialog.querySelector("#visualTableColumns").value, 10) || 1));
        var table = {
            id: nextTableId++,
            caption: dialog.querySelector("#visualTableCaption").value.trim(),
            headers: [],
            rows: []
        };
        for (var col = 0; col < colCount; col++) table.headers.push("Column " + (col + 1));
        for (var row = 0; row < rowCount; row++) {
            table.rows.push(Array(colCount).fill(""));
        }
        currentQuestionTables.push(table);
        insertAtVisualCaret(createTableAssetNode(table), true);
        return true;
    });
}

function openVisualDialog(title, bodyHtml, confirmLabel, onConfirm) {
    var overlay = document.getElementById("visualEditorDialog");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "visualEditorDialog";
        overlay.className = "visual-editor-dialog-overlay";
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<div class="visual-editor-dialog" role="dialog" aria-modal="true">' +
        '<div class="visual-editor-dialog-header"><strong>' + escHtml(title) + '</strong>' +
        '<button type="button" class="visual-dialog-close" aria-label="Close">×</button></div>' +
        '<div class="visual-editor-dialog-body">' + bodyHtml + '</div>' +
        '<div class="visual-editor-dialog-actions"><button type="button" class="btn-secondary visual-dialog-cancel">Cancel</button>' +
        '<button type="button" class="btn-primary visual-dialog-confirm">' + escHtml(confirmLabel) + '</button></div></div>';
    overlay.style.display = "flex";
    var close = function() { overlay.style.display = "none"; };
    overlay.querySelector(".visual-dialog-close").onclick = close;
    overlay.querySelector(".visual-dialog-cancel").onclick = close;
    overlay.querySelector(".visual-dialog-confirm").onclick = function() {
        if (onConfirm(overlay) !== false) close();
    };
    overlay.onclick = function(event) {
        if (event.target === overlay) close();
    };
    overlay.onkeydown = function(event) {
        if (event.key === "Escape") close();
        if (event.key === "Enter" && event.target.tagName === "INPUT" && event.target.type !== "text") {
            event.preventDefault();
            overlay.querySelector(".visual-dialog-confirm").click();
        }
    };
}

function handleImageUpload(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var image = {
                id: nextImageId,
                src: e.target.result,
                alt: file.name || "Image",
                width: 70,
                alignment: "left"
            };
            currentQuestionImages.push(image);
            nextImageId++;
            insertAtVisualCaret(createImageAssetNode(image), false);
        };
        reader.readAsDataURL(file);
    });
    event.target.value = "";
}

function appendTextWithVisualTokens(parent, value) {
    var tokenPattern = /(\\\(([\s\S]*?)\\\)|\[img:(\d+)\]|\[table:(\d+)\]|\r?\n)/g;
    var cursor = 0;
    var match;
    while ((match = tokenPattern.exec(value)) !== null) {
        if (match.index > cursor) parent.appendChild(document.createTextNode(value.slice(cursor, match.index)));
        if (match[2] !== undefined) {
            parent.appendChild(createEquationAssetNode(match[2]));
        } else if (match[3] !== undefined) {
            var image = currentQuestionImages.find(function(item) { return String(item.id) === match[3]; });
            parent.appendChild(image ? createImageAssetNode(image) : document.createTextNode(match[0]));
        } else if (match[4] !== undefined) {
            var table = currentQuestionTables.find(function(item) { return String(item.id) === match[4]; });
            parent.appendChild(table ? createTableAssetNode(table) : document.createTextNode(match[0]));
        } else {
            parent.appendChild(document.createElement("br"));
        }
        cursor = match.index + match[0].length;
    }
    if (cursor < value.length) parent.appendChild(document.createTextNode(value.slice(cursor)));
}

function convertInlineMathInVisualEditor(editor) {
    if (!editor) return;
    var textEntries = [];
    var source = "";
    var blockTags = {BR: true, DIV: true, P: true, LI: true, UL: true, OL: true, BLOCKQUOTE: true};
    function appendBoundary() {
        if (source && source.charAt(source.length - 1) !== "\u0000") source += "\u0000";
    }
    function collectText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            var value = node.nodeValue || "";
            if (!value) return;
            textEntries.push({node: node, start: source.length, end: source.length + value.length});
            source += value;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node !== editor && node.matches(".visual-equation-asset, .visual-image-asset, .visual-table-block, [contenteditable='false']")) {
            appendBoundary();
            return;
        }
        var isBlock = node !== editor && blockTags[node.tagName];
        if (isBlock) appendBoundary();
        Array.from(node.childNodes).forEach(collectText);
        if (isBlock) appendBoundary();
    }
    collectText(editor);
    if (!textEntries.length) return;
    var selection = window.getSelection();
    var activeRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    var caretEntry = activeRange && activeRange.collapsed && activeRange.startContainer.nodeType === Node.TEXT_NODE
        ? textEntries.find(function(entry) { return entry.node === activeRange.startContainer; }) : null;
    var caretPosition = caretEntry ? caretEntry.start + activeRange.startOffset : null;
    var matches = [];
    var pattern = /\\\(([\s\S]+?)\\\)/g;
    var segmentStart = 0;
    while (segmentStart < source.length) {
        var separator = source.indexOf("\u0000", segmentStart);
        var segmentEnd = separator === -1 ? source.length : separator;
        var segment = source.slice(segmentStart, segmentEnd);
        pattern.lastIndex = 0;
        var match;
        while ((match = pattern.exec(segment)) !== null) {
            matches.push({start: segmentStart + match.index, end: segmentStart + pattern.lastIndex, latex: match[1]});
        }
        segmentStart = segmentEnd + 1;
    }
    if (!matches.length) return;

    function entryAt(position) {
        return textEntries.find(function(entry) { return position >= entry.start && position < entry.end; });
    }
    var caretEquation = null;
    matches.slice().reverse().forEach(function(equationMatch) {
        var startEntry = entryAt(equationMatch.start);
        var endEntry = entryAt(equationMatch.end - 1);
        if (!startEntry || !endEntry || !startEntry.node.parentNode || !endEntry.node.parentNode) return;
        var range = document.createRange();
        range.setStart(startEntry.node, equationMatch.start - startEntry.start);
        range.setEnd(endEntry.node, equationMatch.end - endEntry.start);
        range.deleteContents();
        var equation = createEquationAssetNode(equationMatch.latex);
        range.insertNode(equation);
        if (caretPosition !== null && caretPosition >= equationMatch.start && caretPosition <= equationMatch.end) {
            caretEquation = equation;
        }
    });
    if (caretEquation && caretEquation.parentNode && selection) {
        var spacer = document.createTextNode("\u200B");
        caretEquation.parentNode.insertBefore(spacer, caretEquation.nextSibling);
        var caret = document.createRange();
        caret.setStart(spacer, spacer.nodeValue.length);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
        visualEditorRange = caret.cloneRange();
    }
}

function handleVisualEditorInput(editor) {
    convertInlineMathInVisualEditor(editor);
    updateLivePreview();
}

function appendSafeVisualNodes(sourceNode, targetNode) {
    if (sourceNode.nodeType === Node.TEXT_NODE) {
        appendTextWithVisualTokens(targetNode, sourceNode.nodeValue || "");
        return;
    }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;
    var tag = sourceNode.tagName.toLowerCase();
    var allowed = ["p", "div", "br", "b", "strong", "i", "em", "u", "s", "sup", "sub", "ul", "ol", "li", "blockquote", "span"];
    if (allowed.indexOf(tag) === -1) {
        Array.from(sourceNode.childNodes).forEach(function(child) {
            appendSafeVisualNodes(child, targetNode);
        });
        return;
    }
    var safeNode = document.createElement(tag);
    if (tag === "span") safeNode.style.cssText = safeVisualStyle(sourceNode);
    targetNode.appendChild(safeNode);
    Array.from(sourceNode.childNodes).forEach(function(child) {
        appendSafeVisualNodes(child, safeNode);
    });
}

function loadVisualEditorContent(editor, value) {
    editor.innerHTML = "";
    value = String(value || "");
    var hasSupportedMarkup = /<\/?(?:p|div|br|b|strong|i|em|u|s|sup|sub|ul|ol|li|blockquote|span)\b/i.test(value);
    if (!hasSupportedMarkup) {
        appendTextWithVisualTokens(editor, value);
        return;
    }
    var parsed = new DOMParser().parseFromString(value, "text/html");
    Array.from(parsed.body.childNodes).forEach(function(node) {
        appendSafeVisualNodes(node, editor);
    });
}

function appendVisualAssetAtEnd(editor, asset) {
    if (editor.childNodes.length > 0) editor.appendChild(document.createElement("br"));
    editor.appendChild(asset);
    editor.appendChild(document.createElement("br"));
}

function getVisualEditorRoots() {
    var roots = [];
    var questionEditor = document.getElementById("questionEditor");
    var optionsContainer = document.getElementById("optionsContainer");
    if (questionEditor) roots.push(questionEditor);
    if (optionsContainer) roots.push.apply(roots, optionsContainer.querySelectorAll(".option-input"));
    return roots;
}

function readVisualTable(block) {
    var tableElement = block.querySelector("table");
    if (!tableElement) return null;
    var headerCells = tableElement.querySelectorAll("thead th");
    var headers = Array.from(headerCells).map(function(cell) { return cell.textContent.trim(); });
    if (headers.length === 0) return null;
    var rows = Array.from(tableElement.querySelectorAll("tbody tr")).map(function(row) {
        return Array.from(row.querySelectorAll("td")).map(function(cell) { return cell.textContent.trim(); });
    });
    return {
        id: Number(block.dataset.cbtTableId),
        caption: tableElement.querySelector("caption") ? tableElement.querySelector("caption").textContent.trim() : "",
        headers: headers,
        rows: rows.length ? rows : [headers.map(function() { return ""; })]
    };
}

function syncVisualAssetsFromEditor(rootsOverride) {
    var roots = rootsOverride || getVisualEditorRoots();
    var usedImages = new Set();
    var tables = [];
    roots.forEach(function(root) {
        root.querySelectorAll(".visual-image-asset[data-cbt-image-id]").forEach(function(node) {
            var imageId = String(node.dataset.cbtImageId);
            usedImages.add(imageId);
            var image = currentQuestionImages.find(function(item) { return String(item.id) === imageId; });
            if (image) {
            if (node.dataset.imageWidth !== undefined) {
                var width = Number(node.dataset.imageWidth);
                if (Number.isFinite(width)) image.width = Math.max(20, Math.min(100, width));
            }
                image.alignment = ["left", "center", "right"].indexOf(node.dataset.imageAlignment) !== -1
                    ? node.dataset.imageAlignment : "left";
            }
        });
        root.querySelectorAll(".visual-table-block[data-cbt-table-id]").forEach(function(node) {
            var table = readVisualTable(node);
            if (table && !tables.some(function(item) { return item.id === table.id; })) tables.push(table);
        });
    });
    currentQuestionImages = currentQuestionImages.filter(function(image) {
        return usedImages.has(String(image.id));
    });
    currentQuestionTables = tables;
}

function appendUnplacedVisualAssets() {
    var editor = document.getElementById("questionEditor");
    if (!editor) return;
    currentQuestionImages.forEach(function(image) {
        var exists = document.querySelector('#visualWritingArea .visual-image-asset[data-cbt-image-id="' + image.id + '"]');
        if (!exists) appendVisualAssetAtEnd(editor, createImageAssetNode(image));
    });
    currentQuestionTables.forEach(function(table) {
        var exists = document.querySelector('#visualWritingArea .visual-table-block[data-cbt-table-id="' + table.id + '"]');
        if (!exists) appendVisualAssetAtEnd(editor, createTableAssetNode(table));
    });
}

function escapeVisualText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeVisualStyle(element) {
    var style = element.style || {};
    var declarations = [];
    if (/^(bold|normal|[1-9]00)$/.test(style.fontWeight || "")) declarations.push("font-weight:" + style.fontWeight);
    if (/^(italic|oblique|normal)$/.test(style.fontStyle || "")) declarations.push("font-style:" + style.fontStyle);
    if (/^(underline|line-through|underline line-through)$/.test(style.textDecoration || style.textDecorationLine || "")) {
        declarations.push("text-decoration:" + (style.textDecoration || style.textDecorationLine));
    }
    if (/^(super|sub|baseline)$/.test(style.verticalAlign || "")) declarations.push("vertical-align:" + style.verticalAlign);
    return declarations.join(";");
}

function serializeSafeVisualNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeVisualText(node.nodeValue || "").replace(/\u200B/g, "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    var tag = node.tagName.toLowerCase();
    if (tag === "button" || node.hasAttribute("data-visual-ui")) return "";
    var allowed = ["p", "div", "br", "b", "strong", "i", "em", "u", "s", "sup", "sub", "ul", "ol", "li", "blockquote", "span"];
    var children = Array.from(node.childNodes).map(serializeSafeVisualNode).join("");
    if (allowed.indexOf(tag) === -1) return children;
    if (tag === "br") return "<br>";
    if (tag === "span") {
        var style = safeVisualStyle(node);
        return "<span" + (style ? ' style="' + style + '"' : "") + ">" + children + "</span>";
    }
    return "<" + tag + ">" + children + "</" + tag + ">";
}

function serializeVisualEditor(editor) {
    if (!editor) return "";
    var clone = editor.cloneNode(true);
    clone.querySelectorAll(".visual-image-asset[data-cbt-image-id]").forEach(function(node) {
        node.replaceWith(document.createTextNode("[img:" + node.dataset.cbtImageId + "]"));
    });
    clone.querySelectorAll(".visual-equation-asset[data-latex]").forEach(function(node) {
        node.replaceWith(document.createTextNode("\\(" + node.dataset.latex + "\\)"));
    });
    clone.querySelectorAll(".visual-table-block[data-cbt-table-id]").forEach(function(node) {
        node.replaceWith(document.createTextNode("[table:" + node.dataset.cbtTableId + "]"));
    });
    return Array.from(clone.childNodes).map(serializeSafeVisualNode).join("").trim();
}

/* ========================================= */
/* LIVE PREVIEW                              */
/* ========================================= */

function clearAdminMathObserver(){
    if(adminMathObserver){
        adminMathObserver.disconnect();
        adminMathObserver = null;
    }
    if(adminMathScrollHandler){
        window.removeEventListener("scroll", adminMathScrollHandler);
        window.removeEventListener("resize", adminMathScrollHandler);
        adminMathScrollHandler = null;
    }
}

function typesetAdminMathNode(node){
    if(!node || node.dataset.mathTypeset === "done" || node.dataset.mathTypeset === "pending") return;
    if(!/\\\(/.test(node.textContent || "")){
        node.dataset.mathTypeset = "done";
        return;
    }
    if(!window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
    node.dataset.mathTypeset = "pending";
    var work = adminMathQueue.then(function(){ return window.MathJax.typesetPromise([node]); });
    adminMathQueue = work.then(function(){}, function(){});
    work.then(function(){ node.dataset.mathTypeset = "done"; }).catch(function(){ delete node.dataset.mathTypeset; });
}

function setupLazyAdminMath(container, selector){
    clearAdminMathObserver();
    if(!window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
    var nodes = Array.prototype.slice.call(container.querySelectorAll(selector));
    if(nodes.length === 0) return;

    if("IntersectionObserver" in window){
        var observer = new IntersectionObserver(function(entries){
            entries.forEach(function(entry){
                if(entry.isIntersecting){
                    observer.unobserve(entry.target);
                    typesetAdminMathNode(entry.target);
                }
            });
        }, {rootMargin: "350px 0px"});
        adminMathObserver = observer;
        nodes.forEach(function(node){ observer.observe(node); });
        return;
    }

    var scanPending = false;
    adminMathScrollHandler = function(){
        if(scanPending) return;
        scanPending = true;
        window.requestAnimationFrame(function(){
            scanPending = false;
            var viewBottom = window.innerHeight + 350;
            nodes.forEach(function(node){
                if(node.dataset.mathTypeset === "done") return;
                var rect = node.getBoundingClientRect();
                if(rect.top < viewBottom && rect.bottom > -350) typesetAdminMathNode(node);
            });
        });
    };
    window.addEventListener("scroll", adminMathScrollHandler, {passive: true});
    window.addEventListener("resize", adminMathScrollHandler, {passive: true});
    adminMathScrollHandler();
}

function updateLivePreview() {
    syncVisualAssetsFromEditor();
    var hiddenQuestion = document.getElementById("qText");
    var questionEditor = document.getElementById("questionEditor");
    if (hiddenQuestion) hiddenQuestion.value = serializeVisualEditor(questionEditor);
}

function closeQuestionPreview() {
    var overlay = document.getElementById("questionPreviewOverlay");
    if (overlay && window.MathJax && typeof window.MathJax.typesetClear === "function") {
        window.MathJax.typesetClear([overlay]);
    }
    if (overlay) overlay.remove();
    if (activeVisualEditor && activeVisualEditor.isConnected) restoreVisualEditorRange();
}

function previewCurrentQuestion() {
    updateLivePreview();
    var questionText = serializeVisualEditor(document.getElementById("questionEditor"));
    var options = getOptions();
    var type = getSelectedSubsectionType();
    var editId = document.getElementById("editId").value;
    var sectionId = parseInt(document.getElementById("qSection").value);
    var totalMarks = parseFloat(document.getElementById("qTotalMarks").value);
    var negativeMarks = parseFloat(document.getElementById("qNegativeMarks").value);
    if (!Number.isFinite(totalMarks)) totalMarks = 4;
    if (!Number.isFinite(negativeMarks)) negativeMarks = 1;
    var draft = {
        id: editId || "draft-preview",
        question: questionText,
        type: type,
        options: options,
        sectionId: Number.isFinite(sectionId) ? sectionId : null,
        subsection: document.getElementById("qSubsection").value,
        totalMarks: totalMarks,
        negativeMarks: negativeMarks,
        images: currentQuestionImages.map(function(image) { return Object.assign({}, image); }),
        tables: currentQuestionTables.map(function(table) { return JSON.parse(JSON.stringify(table)); })
    };
    var hasDraft = !isVisualContentBlank(questionText) || options.some(function(option) { return !isVisualContentBlank(option); });
    questionPreviewQuestions = questions.slice();
    var existingIndex = editId ? questionPreviewQuestions.findIndex(function(question) {
        return String(question.id) === String(editId);
    }) : -1;
    if (existingIndex >= 0) {
        questionPreviewQuestions[existingIndex] = draft;
        questionPreviewIndex = existingIndex;
    } else if (hasDraft) {
        questionPreviewQuestions.push(draft);
        questionPreviewIndex = questionPreviewQuestions.length - 1;
    } else {
        questionPreviewIndex = 0;
    }

    var overlay = document.createElement("div");
    overlay.id = "questionPreviewOverlay";
    overlay.className = "question-preview-overlay";
    overlay.tabIndex = -1;
    var darkClass = document.body.classList.contains("darkMode") ? " question-preview-dark" : "";
    overlay.innerHTML = '<div class="question-preview-panel' + darkClass + '" role="dialog" aria-modal="true" aria-label="Full exam preview">' +
        '<header class="question-preview-topbar"><strong>Full exam preview</strong><div class="question-preview-topbar-actions">' +
        '<span>Preview only · ' + questionPreviewQuestions.length + ' questions</span>' +
        '<button class="question-preview-theme-toggle" type="button" onclick="toggleQuestionPreviewTheme()">' +
        (darkClass ? "☀ Light" : "☾ Dark") + '</button>' +
        '<button class="question-preview-exit" type="button" onclick="closeQuestionPreview()">Exit preview</button></div></header>' +
        '<div class="question-preview-layout"><aside class="question-preview-sidebar"><div class="question-preview-progress"><span class="question-preview-progress-fill"></span></div>' +
        '<small id="questionPreviewAttempted">0 / ' + questionPreviewQuestions.length + ' Attempted</small><h3>Questions</h3>' +
        '<div class="question-preview-section-name" id="questionPreviewSectionName"></div>' +
        '<div class="question-preview-nav" id="questionPreviewNav"></div></aside>' +
        '<main class="question-preview-main"><div class="question-preview-testbar"><span class="question-preview-timer">02:00:00</span>' +
        '<button class="question-preview-submit" type="button" disabled>Submit</button></div>' +
        '<div class="question-preview-scroll" id="questionPreviewScroll"></div>' +
        '<div class="question-preview-actions"><button type="button" disabled>Clear Response</button>' +
        '<button class="review" type="button" disabled>Mark For Review</button><span class="spacer"></span>' +
        '<button type="button" data-preview-action="previous">Previous</button>' +
        '<button class="next" type="button" data-preview-action="next">Save &amp; Next</button></div></main></div></div>';
    overlay.onclick = function(event) {
        if (event.target === overlay) closeQuestionPreview();
    };
    overlay.onkeydown = function(event) {
        if (event.key === "Escape") closeQuestionPreview();
        if (event.key === "ArrowLeft") renderQuestionPreviewAt(questionPreviewIndex - 1);
        if (event.key === "ArrowRight") renderQuestionPreviewAt(questionPreviewIndex + 1);
    };
    overlay.querySelectorAll("[data-preview-action]").forEach(function(button) {
        button.onclick = function() {
            renderQuestionPreviewAt(questionPreviewIndex + (button.dataset.previewAction === "next" ? 1 : -1));
        };
    });
    document.body.appendChild(overlay);
    if (questionPreviewQuestions.length) {
        renderQuestionPreviewAt(questionPreviewIndex);
    } else {
        overlay.querySelector("#questionPreviewSectionName").textContent = "No questions yet";
        overlay.querySelector("#questionPreviewAttempted").textContent = "0 / 0 Attempted";
        overlay.querySelector("#questionPreviewScroll").innerHTML = '<p class="question-preview-empty">Add or save a question to see the full exam here.</p>';
        overlay.querySelector("#questionPreviewNav").hidden = true;
        overlay.querySelector("[data-preview-action=previous]").disabled = true;
        overlay.querySelector("[data-preview-action=next]").disabled = true;
    }
    overlay.focus();
}

function toggleQuestionPreviewTheme() {
    var panel = document.querySelector("#questionPreviewOverlay .question-preview-panel");
    var button = document.querySelector("#questionPreviewOverlay .question-preview-theme-toggle");
    if (!panel || !button) return;
    var dark = panel.classList.toggle("question-preview-dark");
    button.textContent = dark ? "☀ Light" : "☾ Dark";
}

function getPreviewQuestionInfo(question) {
    var section = sections.find(function(item) { return String(item.id) === String(question.sectionId); });
    var subsection = section ? getSubsections(section).find(function(item) {
        return String(item.id) === String(question.subsection || question.type);
    }) : null;
    var type = subsection && subsection.type ? subsection.type : (question.type || "single");
    var instruction = type === "multi"
        ? "One or more options may be correct. Select every correct option."
        : (type === "numerical" ? "Enter the numerical answer in the answer box." : "Exactly one option is correct. Select it.");
    var totalMarks = Number.isFinite(Number(question.totalMarks)) ? Number(question.totalMarks) : 4;
    var negativeMarks = Number.isFinite(Number(question.negativeMarks)) ? Number(question.negativeMarks) : 1;
    var marking = type === "multi"
        ? "+" + totalMarks + " all correct · +1 if correct options are missed without selecting a wrong option · -" + negativeMarks + " if any wrong option is selected · 0 unanswered"
        : "+" + totalMarks + " correct · -" + negativeMarks + " incorrect · 0 unanswered";
    return {
        sectionName: section ? section.name : "Unassigned",
        subsectionName: subsection ? subsection.label : "",
        type: type,
        instruction: instruction,
        marking: marking
    };
}

function renderQuestionPreviewAt(index) {
    var overlay = document.getElementById("questionPreviewOverlay");
    if (!overlay || questionPreviewQuestions.length === 0) return;
    questionPreviewIndex = Math.max(0, Math.min(questionPreviewQuestions.length - 1, index));
    var question = questionPreviewQuestions[questionPreviewIndex];
    var info = getPreviewQuestionInfo(question);
    var images = Array.isArray(question.images) ? question.images : [];
    var tables = Array.isArray(question.tables) ? question.tables : [];
    var options = Array.isArray(question.options) ? question.options : [];
    var questionText = question.question || "";
    var type = info.type;
    var allContent = [questionText].concat(options).join("\n");
    var renderedQuestion = questionText
        ? renderContent(questionText, images, tables, true, allContent)
        : '<span class="question-preview-empty">Question text is empty.</span>';
    var optionsHtml = type === "numerical"
        ? '<input class="question-preview-numerical" type="text" placeholder="Enter your answer" disabled>'
        : '<div class="question-preview-options">' + options.map(function(option, optionIndex) {
            return '<div class="question-preview-option"><span class="question-preview-option-mark' +
                (type === "multi" ? " multi" : "") + '"></span><span>' + String.fromCharCode(65 + optionIndex) + '. ' +
                (renderContent(option, images, tables, false) || '<span class="question-preview-empty">Empty choice</span>') +
                '</span></div>';
        }).join("") + '</div>';
    var nav = overlay.querySelector("#questionPreviewNav");
    nav.innerHTML = questionPreviewQuestions.map(function(item, navIndex) {
        var itemInfo = getPreviewQuestionInfo(item);
        return '<button type="button" data-preview-index="' + navIndex + '"' + (navIndex === questionPreviewIndex ? ' class="current" aria-current="step"' : "") +
            ' aria-label="Question ' + (navIndex + 1) + ': ' + escHtml(itemInfo.sectionName) + '">' + (navIndex + 1) + '</button>';
    }).join("");
    nav.querySelectorAll("[data-preview-index]").forEach(function(button) {
        button.onclick = function() { renderQuestionPreviewAt(Number(button.dataset.previewIndex)); };
    });
    overlay.querySelector("#questionPreviewSectionName").textContent = info.sectionName + (info.subsectionName ? " › " + info.subsectionName : "");
    overlay.querySelector("#questionPreviewAttempted").textContent = "0 / " + questionPreviewQuestions.length + " Attempted";
    overlay.querySelector(".question-preview-progress-fill").style.width = "0%";
    overlay.querySelector("[data-preview-action=previous]").disabled = questionPreviewIndex === 0;
    overlay.querySelector("[data-preview-action=next]").disabled = questionPreviewIndex >= questionPreviewQuestions.length - 1;
    var scroll = overlay.querySelector("#questionPreviewScroll");
    if (window.MathJax && typeof window.MathJax.typesetClear === "function") {
        window.MathJax.typesetClear([scroll]);
    }
    scroll.innerHTML = '<div class="question-preview-guidance"><div class="question-preview-breadcrumb">' + escHtml(info.sectionName) +
        (info.subsectionName ? ' › ' + escHtml(info.subsectionName) : '') + '</div><div><strong>Instructions:</strong> ' + escHtml(info.instruction) +
        '</div><div><strong>Marking:</strong> ' + escHtml(info.marking) + '</div></div><h2>Q' + (questionPreviewIndex + 1) + '</h2>' +
        '<div class="question-preview-question">' + renderedQuestion + '</div>' + optionsHtml;
    scroll.scrollTop = 0;
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
        var startup = window.MathJax.startup && window.MathJax.startup.promise;
        Promise.resolve(startup).then(function() {
            if (scroll.isConnected) return window.MathJax.typesetPromise([scroll]);
        }).catch(function() {});
    }
}

function renderContent(text, images, tables, appendUnplacedAssets, assetReferenceText) {
    if (!text) return "";
    if (appendUnplacedAssets === undefined) appendUnplacedAssets = true;
    if (assetReferenceText === undefined) assetReferenceText = text;
    var result = text;

    if (tables && tables.length > 0) {
        tables.forEach(function(tbl) {
            var placeholder = "[table:" + tbl.id + "]";
            if (result.indexOf(placeholder) !== -1) {
                var tableHtml = buildTableHtml(tbl);
                result = result.split(placeholder).join(tableHtml);
            }
        });
    }

    if (images && images.length > 0) {
        images.forEach(function(img) {
            var placeholder = "[img:" + img.id + "]";
            if (result.indexOf(placeholder) !== -1) {
                var imgHtml = '<img src="' + img.src + '" alt="' + escHtml(img.alt) + '" class="preview-img" loading="lazy" decoding="async" style="' + getImageDisplayStyle(img, false) + '">';
                result = result.split(placeholder).join(imgHtml);
            }
        });
    }

    if (appendUnplacedAssets && images && images.length > 0) {
        images.forEach(function(img) {
            var placeholder = "[img:" + img.id + "]";
            if (assetReferenceText.indexOf(placeholder) === -1) {
                result += '<img src="' + img.src + '" alt="' + escHtml(img.alt) + '" class="preview-img" loading="lazy" decoding="async" style="' + getImageDisplayStyle(img, true) + '">';
            }
        });
    }

    if (appendUnplacedAssets && tables && tables.length > 0) {
        tables.forEach(function(tbl) {
            var placeholder = "[table:" + tbl.id + "]";
            if (assetReferenceText.indexOf(placeholder) === -1) {
                result += buildTableHtml(tbl);
            }
        });
    }

    // Convert newlines to <br> tags so multi-line text renders properly in HTML
    result = result.replace(/\n/g, '<br>');

    return result;
}

function getImageDisplayStyle(image, forceBlock) {
    var width = Number(image && image.width);
    var widthStyle = Number.isFinite(width) ? Math.max(20, Math.min(100, width)) + "%" : "auto";
    var alignment = image && ["left", "center", "right"].indexOf(image.alignment) !== -1 ? image.alignment : "left";
    var margin = alignment === "center" ? "6px auto" : (alignment === "right" ? "6px 0 6px auto" : "6px auto 6px 0");
    return "width:" + widthStyle + ";max-width:100%;height:auto;border-radius:4px;margin:" + margin + ";display:" + (forceBlock || alignment !== "left" ? "block" : "inline-block") + ";vertical-align:middle";
}

function buildTableHtml(tbl) {
    var html = '<div class="preview-table-wrap"><table>';
    if (tbl.caption) {
        html += '<caption class="tbl-caption">' + escHtml(tbl.caption) + '</caption>';
    }
    html += '<thead><tr>';
    tbl.headers.forEach(function(h) {
        html += '<th>' + escHtml(h) + '</th>';
    });
    html += '</tr></thead><tbody>';
    tbl.rows.forEach(function(row) {
        html += '<tr>';
        row.forEach(function(cell) {
            html += '<td>' + escHtml(cell) + '</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function escHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ========================================= */
/* HELPERS - Index/Letter Conversion         */
/* ========================================= */

function indexToLetter(idx) {
    return String.fromCharCode(65 + idx);
}

function letterToIndex(letter) {
    if (!letter || typeof letter !== "string") return NaN;
    return letter.toUpperCase().charCodeAt(0) - 65;
}

/* ========================================= */
/* QUESTIONS                                 */
/* ========================================= */

function toggleOptions() {
    var type = getSelectedSubsectionType();
    var area = document.getElementById("optionsArea");
    var answerLabel = document.querySelector("#answerGroup label");
    var answerInput = document.getElementById("qAnswer");
    if (type === "numerical") {
        area.style.display = "none";
        answerLabel.textContent = "Correct Answer (number)";
        answerInput.placeholder = "Enter the numerical answer";
    } else {
        area.style.display = "block";
        answerLabel.textContent = "Correct Answer";
        if (type === "single") {
            answerInput.placeholder = "Letter of correct option (e.g. A, B, C, D)";
        } else {
            answerInput.placeholder = "Comma-separated letters (e.g. A, C, D)";
        }
    }
    var optContainer = document.getElementById("optionsContainer");
    if (!optContainer.children.length) {
        addOption("", false);
        if (type === "single") addOption("", false);
    }
}

function getSelectedSubsectionType() {
    var subId = document.getElementById("qSubsection")?.value;
    if (!subId) return "single";
    var sectionId = parseInt(document.getElementById("qSection")?.value);
    if (!sectionId) return "single";
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return "single";
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    return sub ? sub.type : "single";
}

function addOption(value, focusAfterAdd, suppressUpdate) {
    if (value === undefined) value = "";
    if (focusAfterAdd === undefined) focusAfterAdd = value === "";
    var container = document.getElementById("optionsContainer");
    var row = document.createElement("div");
    row.className = "option-row";
    var dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.draggable = true;
    dragHandle.className = "visual-option-drag";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "Drag to reorder this choice";
    dragHandle.setAttribute("aria-label", "Drag to reorder choice");
    var label = document.createElement("div");
    label.className = "visual-option-label";
    var editor = document.createElement("div");
    editor.className = "option-input visual-editable visual-option-editable";
    editor.contentEditable = "true";
    editor.dataset.placeholder = "Write this answer choice…";
    editor.onfocus = function() { setActiveVisualEditor(editor); };
    editor.oninput = function() { handleVisualEditorInput(editor); };
    loadVisualEditorContent(editor, value);
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "visual-choice-remove";
    delBtn.textContent = "×";
    delBtn.title = "Remove this answer choice";
    delBtn.onclick = function() { row.remove(); renumberVisualOptions(); updateLivePreview(); };
    row.ondragstart = function(event) {
        if (!event.target.closest(".visual-option-drag")) {
            event.preventDefault();
            return;
        }
        draggedVisualOption = row;
        var answerInput = document.getElementById("qAnswer");
        var answerType = getSelectedSubsectionType();
        var answerLetters = answerType === "multi" && answerInput.value.trim()
            ? answerInput.value.split(",").map(function(value) { return value.trim(); })
            : (answerType === "single" && answerInput.value.trim() ? [answerInput.value.trim()] : []);
        draggedVisualOptionAnswerRows = answerLetters.map(function(letter) {
            var answerIndex = letterToIndex(letter);
            return Array.from(container.children)[answerIndex] || null;
        }).filter(Boolean);
        row.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "answer-choice");
    };
    row.ondragover = function(event) {
        if (!draggedVisualOption || draggedVisualOption === row) return;
        event.preventDefault();
        var bounds = row.getBoundingClientRect();
        var insertAfter = event.clientY > bounds.top + bounds.height / 2;
        container.insertBefore(draggedVisualOption, insertAfter ? row.nextSibling : row);
    };
    row.ondrop = function(event) {
        if (draggedVisualOption) event.preventDefault();
    };
    row.ondragend = function() {
        if (draggedVisualOption) draggedVisualOption.classList.remove("is-dragging");
        draggedVisualOption = null;
        renumberVisualOptions();
        var answerInput = document.getElementById("qAnswer");
        if (draggedVisualOptionAnswerRows.length && answerInput) {
            var updatedAnswer = draggedVisualOptionAnswerRows.map(function(answerRow) {
                return Array.prototype.indexOf.call(container.children, answerRow);
            }).filter(function(answerIndex) { return answerIndex >= 0; });
            answerInput.value = updatedAnswer.map(indexToLetter).join(",");
        }
        draggedVisualOptionAnswerRows = [];
        updateLivePreview();
    };
    row.appendChild(dragHandle);
    row.appendChild(label);
    row.appendChild(editor);
    row.appendChild(delBtn);
    container.appendChild(row);
    renumberVisualOptions();
    if (focusAfterAdd) {
        setActiveVisualEditor(editor);
        editor.focus();
        var range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        visualEditorRange = range.cloneRange();
    }
    if (!suppressUpdate) updateLivePreview();
}

function renumberVisualOptions() {
    document.querySelectorAll("#optionsContainer .visual-option-label").forEach(function(label, index) {
        label.textContent = String.fromCharCode(65 + index);
    });
}

function getOptions() {
    return Array.from(document.querySelectorAll("#optionsContainer .option-input"))
        .map(function(editor) { return serializeVisualEditor(editor); });
}

function isVisualContentBlank(value) {
    return String(value || "")
        .replace(/<br\s*\/?\s*>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/\u200B/g, "")
        .trim() === "";
}

function getAnswerForType(type) {
    var val = document.getElementById("qAnswer").value.trim();
    if (type === "single") return letterToIndex(val);
    if (type === "multi") {
        return val.split(",").map(function(s) { return letterToIndex(s.trim()); }).filter(function(n) { return !isNaN(n); });
    }
    if (type === "numerical") return parseFloat(val);
    return val;
}

function saveQuestion() {
    updateLivePreview();
    var subId = document.getElementById("qSubsection").value;
    var sectionId = parseInt(document.getElementById("qSection").value);
    var qText = serializeVisualEditor(document.getElementById("questionEditor"));
    var editId = document.getElementById("editId").value;
    var totalMarks = parseFloat(document.getElementById("qTotalMarks").value);
    var negativeMarks = parseFloat(document.getElementById("qNegativeMarks").value);
    if (!Number.isFinite(totalMarks)) totalMarks = 4;
    if (!Number.isFinite(negativeMarks)) negativeMarks = 1;
    var type = getSelectedSubsectionType();
    if (type === "numerical") {
        syncVisualAssetsFromEditor([document.getElementById("questionEditor")]);
    }

    if (!sectionId) { alert("Please select a section."); return; }
    if (isVisualContentBlank(qText)) { alert("Please enter the question text."); return; }
    if (!subId) { alert("Please select a subsection."); return; }

    var questionData = {
        sectionId: sectionId,
        subsection: subId,
        type: type,
        question: qText,
        options: type === "numerical" ? [] : getOptions(),
        answer: getAnswerForType(type),
        totalMarks: totalMarks,
        negativeMarks: negativeMarks,
        images: currentQuestionImages,
        tables: currentQuestionTables
    };

    if (type !== "numerical" && questionData.options.filter(function(option) { return !isVisualContentBlank(option); }).length < 2) {
        alert("Please add at least 2 options.");
        return;
    }
    if (type !== "numerical" && questionData.options.some(isVisualContentBlank)) {
        alert("Fill in or remove each empty answer choice before saving.");
        return;
    }

    var answerIsEmpty = (questionData.answer === undefined || questionData.answer === null || questionData.answer === "");
    var answerIsEmptyArray = (Array.isArray(questionData.answer) && questionData.answer.length === 0);
    if (answerIsEmpty || answerIsEmptyArray) {
        alert("Please enter the correct answer.");
        return;
    }

    var url = editId ? "/api/questions/" + editId : "/api/questions";
    var method = editId ? "PUT" : "POST";

    fetch(url, {
        method: method,
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(questionData)
    }).then(function(res) {
        if (!res.ok) throw new Error("Server error: " + res.status);
        return res.json();
    }).then(function() {
        loadQuestions();
        resetForm();
    }).catch(function(err) {
        console.error("Save error:", err);
        alert("Error saving question: " + err.message);
    });
}

function editQuestion(id) {
    var q = questions.find(function(item) { return item.id === id; });
    if (!q) { alert("Question not found"); return; }
    document.getElementById("formTitle").textContent = "Edit Question";
    document.getElementById("editId").value = q.id;
    document.getElementById("qSection").value = q.sectionId || "";
    populateSubsectionDropdown();
    document.getElementById("qSubsection").value = q.subsection || q.type || "";
    document.getElementById("qTotalMarks").value = q.totalMarks != null ? q.totalMarks : 4;
    document.getElementById("qNegativeMarks").value = q.negativeMarks != null ? q.negativeMarks : 1;
    toggleOptions();

    currentQuestionImages = (Array.isArray(q.images) ? q.images : []).map(function(image, index) {
        var id = Number(image.id);
        return {
            id: Number.isFinite(id) ? id : index,
            src: image.src,
            alt: image.alt || "Image",
            width: image.width !== undefined && image.width !== null && Number.isFinite(Number(image.width)) ? Number(image.width) : undefined,
            alignment: ["left", "center", "right"].indexOf(image.alignment) !== -1 ? image.alignment : "left"
        };
    });
    currentQuestionTables = (Array.isArray(q.tables) ? q.tables : []).map(function(table, index) {
        var id = Number(table.id);
        return {
            id: Number.isFinite(id) ? id : index,
            caption: table.caption || "",
            headers: Array.isArray(table.headers) && table.headers.length ? table.headers.slice() : ["Column 1", "Column 2"],
            rows: Array.isArray(table.rows) && table.rows.length ? table.rows.map(function(row) { return row.slice(); }) : [["", ""]]
        };
    });
    nextImageId = currentQuestionImages.reduce(function(max, image) { return Math.max(max, image.id + 1); }, 0);
    nextTableId = currentQuestionTables.reduce(function(max, table) { return Math.max(max, table.id + 1); }, 0);

    var questionEditor = document.getElementById("questionEditor");
    loadVisualEditorContent(questionEditor, q.question || "");
    var container = document.getElementById("optionsContainer");
    container.innerHTML = "";
    if (q.type !== "numerical" && Array.isArray(q.options)) {
        q.options.forEach(function(option) { addOption(option, false, true); });
    }
    appendUnplacedVisualAssets();
    activeVisualEditor = questionEditor;

    if (q.type === "single") {
        document.getElementById("qAnswer").value = indexToLetter(q.answer);
    } else if (q.type === "multi") {
        document.getElementById("qAnswer").value = q.answer.map(function(a) { return indexToLetter(a); }).join(",");
    } else {
        document.getElementById("qAnswer").value = q.answer;
    }

    document.getElementById("cancelBtn").style.display = "inline-block";
    window.scrollTo({top: 0, behavior: "smooth"});
    updateLivePreview();
}

function deleteQuestion(id) {
    if (!confirm("Delete this question?")) return;
    fetch("/api/questions/" + id, {method: "DELETE"})
    .then(function(r) { return r.json(); }).then(function() { loadQuestions(); });
}

function cancelEdit() { resetForm(); }

function resetForm() {
    document.getElementById("formTitle").textContent = "Add New Question";
    document.getElementById("editId").value = "";
    document.getElementById("qText").value = "";
    document.getElementById("questionEditor").innerHTML = "";
    document.getElementById("qAnswer").value = "";
    document.getElementById("qTotalMarks").value = "4";
    document.getElementById("qNegativeMarks").value = "1";
    document.getElementById("cancelBtn").style.display = "none";
    if (sections.length > 0) {
        document.getElementById("qSection").value = sections[0].id;
        populateSubsectionDropdown();
    }
    document.getElementById("optionsContainer").innerHTML = "";

    currentQuestionImages = [];
    currentQuestionTables = [];
    nextImageId = 0;
    nextTableId = 0;
    activeVisualEditor = document.getElementById("questionEditor");
    visualEditorRange = null;

    toggleOptions();
    updateLivePreview();
}

function populateSectionDropdowns() {
    var selSection = document.getElementById("qSection");
    var selFilter = document.getElementById("filterSection");
    if (selSection) {
        var currentVal = selSection.value;
        selSection.innerHTML = '<option value="">Select section...</option>';
        sections.forEach(function(s) {
            selSection.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
        });
        if (currentVal) selSection.value = currentVal;
        else if (sections.length > 0) selSection.value = sections[0].id;
    }
    if (selFilter) {
        var currentFilter = selFilter.value;
        selFilter.innerHTML = '<option value="">All Sections</option>';
        sections.forEach(function(s) {
            selFilter.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
        });
        if (currentFilter) selFilter.value = currentFilter;
    }
    populateSubsectionDropdown();
}

function populateSubsectionDropdown() {
    var selSub = document.getElementById("qSubsection");
    var selSection = document.getElementById("qSection");
    if (!selSub || !selSection) return;
    var sectionId = parseInt(selSection.value);
    var currentVal = selSub.value;
    selSub.innerHTML = '';
    if (!sectionId) {
        selSub.innerHTML = '<option value="">Select a section first</option>';
        return;
    }
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    subs.forEach(function(sub) {
        var sel = (sub.id === currentVal) ? ' selected' : '';
        selSub.innerHTML += '<option value="' + sub.id + '"' + sel + '>' + escHtml(sub.label) + '</option>';
    });
    if (!currentVal && subs.length > 0) {
        selSub.value = subs[0].id;
    }
    toggleOptions();
}

function onSectionChange() {
    populateSubsectionDropdown();
    updateLivePreview();
}

function loadQuestions() {
    fetch("/api/questions").then(function(r) { return r.json(); }).then(function(data) {
        questions = data;
        renderQuestions();
        var tabSections = document.getElementById("tab-sections");
        if (tabSections && tabSections.classList.contains("active")) renderSections();
    });
}

function renderQuestions() {
    var container = document.getElementById("questionsContainer");
    clearAdminMathObserver();
    if (window.MathJax && typeof window.MathJax.typesetClear === "function") {
        window.MathJax.typesetClear([container]);
    }
    var filterSection = document.getElementById("filterSection").value;
    var filtered = questions;
    if (filterSection) {
        filtered = filtered.filter(function(q) { return q.sectionId === parseInt(filterSection); });
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-data">No questions found.</div>';
        return;
    }
    var html = "";
    filtered.forEach(function(q, index) {
        var sectionName = "Unassigned";
        var sec = sections.find(function(s) { return s.id === q.sectionId; });
        if (sec) {
            sectionName = sec.name;
            var subs = getSubsections(sec);
            var sub = subs.find(function(s) { return s.id === (q.subsection || q.type); });
            if (sub) sectionName += ' \u2192 ' + sub.label;
        }
        
        var typeLabels = {single: "SCQ", multi: "MCQ", numerical: "Numerical"};
        var typeClass = {single: "q-badge-scq", multi: "q-badge-mcq", numerical: "q-badge-numerical"};
        var hasImages = q.images && q.images.length > 0;
        var hasTables = q.tables && q.tables.length > 0;

        var answerDisplay = "";
        if (q.type === "single") {
            answerDisplay = "Answer: Option " + indexToLetter(q.answer) + " (" + (q.options[q.answer] || "") + ")";
        } else if (q.type === "multi") {
            var ansText = q.answer.map(function(a) { return "Option " + indexToLetter(a) + " (" + (q.options[a] || "") + ")"; }).join(", ");
            answerDisplay = "Answer: " + ansText;
        } else {
            answerDisplay = "Answer: " + q.answer;
        }

        var marksInfo = 'Marks: +' + (q.totalMarks || 4) + ' / -' + (q.negativeMarks || 1);

        var displayText = createQuestionCardExcerpt(q.question, 200);

        html += '<div class="question-card">';
        html += '<div class="q-header">';
        html += '<div class="q-title">Q' + (index + 1) + ' (ID: ' + q.id + ')</div>';
        html += '<div class="q-badges">';
        html += '<span class="q-badge q-badge-section">' + sectionName + '</span>';
        html += '<span class="q-badge ' + (typeClass[q.type] || "") + '">' + (typeLabels[q.type] || q.type) + '</span>';
        html += '<span class="q-badge q-badge-marks">' + marksInfo + '</span>';
        if (hasImages) html += '<span class="q-badge q-badge-image">\uD83D\uDDBC\uFE0F ' + q.images.length + '</span>';
        if (hasTables) html += '<span class="q-badge q-badge-image">\uD83D\uDCCA ' + q.tables.length + '</span>';
        html += '</div></div>';
        html += '<div class="q-text">';
        if (mathPreviewOn) {
            html += displayText;
        } else {
            html += displayText.replace(/\\\\\(/g, "[").replace(/\\\\\)/g, "]");
        }
        html += '</div>';
        html += '<div class="q-answer">' + answerDisplay + '</div>';
        html += '<div class="q-actions">';
        html += '<button class="btn-edit" onclick="editQuestion(' + q.id + ')">Edit</button>';
        html += '<button class="btn-danger" onclick="deleteQuestion(' + q.id + ')">Delete</button>';
        html += '</div></div>';
    });
    container.innerHTML = html;
    if (mathPreviewOn) setupLazyAdminMath(container, ".question-card");
}

function createQuestionCardExcerpt(questionHtml, maxCharacters) {
    var parsed = new DOMParser().parseFromString(String(questionHtml || ""), "text/html");
    var body = parsed.body;
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    var node;
    while ((node = walker.nextNode())) textNodes.push(node);
    var remaining = Math.max(1, Number(maxCharacters) || 200);
    for (var index = 0; index < textNodes.length; index++) {
        node = textNodes[index];
        var text = node.nodeValue || "";
        if (text.length <= remaining) {
            remaining -= text.length;
            continue;
        }
        node.nodeValue = text.slice(0, remaining).replace(/[\s\u200B]+$/, "") + "…";
        var current = node;
        while (current && current !== body) {
            var sibling = current.nextSibling;
            while (sibling) {
                var nextSibling = sibling.nextSibling;
                sibling.parentNode.removeChild(sibling);
                sibling = nextSibling;
            }
            current = current.parentNode;
        }
        break;
    }
    return body.innerHTML;
}

function toggleMathPreview() {
    mathPreviewOn = !mathPreviewOn;
    renderQuestions();
}

/* ========================================= */
/* BULK IMPORT                               */
/* ========================================= */

function showBulkImport() {
    document.getElementById("bulkImportArea").style.display = "block";
    document.getElementById("bulkResult").textContent = "";
}

function bulkImport() {
    var raw = document.getElementById("bulkData").value.trim();
    if (!raw) { alert("Paste some question data first."); return; }
    var parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        alert("Invalid JSON: " + e.message);
        return;
    }
    if (!Array.isArray(parsed)) { alert("Data must be a JSON array."); return; }
    fetch("/api/questions/bulk", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({questions: parsed})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            document.getElementById("bulkResult").innerHTML = '<span style="color:#2e7d32">\u2705 Imported ' + data.imported + ' question(s) successfully!</span>';
            loadQuestions();
            document.getElementById("bulkData").value = "";
        } else {
            document.getElementById("bulkResult").innerHTML = '<span style="color:#d32f2f">Error: ' + data.error + '</span>';
        }
    });
}

/* ========================================= */
/* SETTINGS                                  */
/* ========================================= */

function loadConfig() {
    fetch("/api/config").then(function(r) { return r.json(); }).then(function(config) {
        var totalSecs = config.examDuration || 5400;
        document.getElementById("timerHours").value = Math.floor(totalSecs / 3600);
        document.getElementById("timerMinutes").value = Math.floor((totalSecs % 3600) / 60);
        document.getElementById("configStatus").textContent = "";
    });
}

function saveConfig() {
    var hours = parseInt(document.getElementById("timerHours").value) || 0;
    var minutes = parseInt(document.getElementById("timerMinutes").value) || 0;
    var totalSeconds = hours * 3600 + minutes * 60;
    if (totalSeconds < 60) { alert("Timer must be at least 1 minute."); return; }
    fetch("/api/config", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({examDuration: totalSeconds})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            document.getElementById("configStatus").textContent = "\u2705 Timer saved! (" + hours + "h " + minutes + "m)";
        }
    });
}

function viewResults() {
    fetch("/api/results").then(function(r) { return r.json(); }).then(function(results) {
        var container = document.getElementById("resultsContainer");
        if (!results || results.length === 0) {
            container.innerHTML = '<span style="color:#888">No results saved yet.</span>';
            return;
        }
        var html = '<div style="margin-bottom:8px;font-size:12px;color:#888">' + results.length + ' submission(s). Click 🗑 to delete an entry — the email can then retake the test.</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
        html += '<thead><tr style="background:#e3f2fd">';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Email</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Score</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">%</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Time</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Action</th>';
        html += '</tr></thead><tbody>';
        results.forEach(function(r) {
            html += '<tr style="border-bottom:1px solid #eee">';
            html += '<td style="padding:6px 10px;border:1px solid #ddd">' + escHtml(r.email) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.score) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.percentage) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.time) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center"><button class="btn-danger" onclick="deleteResult(\'' + escHtml(r.email) + '\')" style="font-size:11px;padding:3px 8px">🗑</button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '<div id="deleteStatus" style="margin-top:8px;font-size:12px"></div>';
        container.innerHTML = html;
    }).catch(function() {
        document.getElementById("resultsContainer").innerHTML = '<span style="color:#888">Failed to load results.</span>';
    });
}

function deleteResult(email) {
    if (!confirm('Delete all submissions for "' + email + '"?\nThey will be able to retake the test.')) return;
    fetch("/api/results/" + encodeURIComponent(email), {
        method: "DELETE"
    }).then(function(r) { return r.json(); }).then(function(data) {
        var status = document.getElementById("deleteStatus");
        if (data.success && data.removed > 0) {
            status.innerHTML = '<span style="color:#2e7d32">✅ Removed ' + data.removed + ' submission(s) for ' + escHtml(email) + '. They can now retake the test.</span>';
            viewResults();
        } else if (data.success && data.removed === 0) {
            status.innerHTML = '<span style="color:#888">No submissions found for ' + escHtml(email) + '.</span>';
        } else {
            status.innerHTML = '<span style="color:#d32f2f">Error deleting submission.</span>';
        }
    }).catch(function() {
        document.getElementById("deleteStatus").innerHTML = '<span style="color:#d32f2f">Error deleting submission.</span>';
    });
}

/* ========================================= */
/* PREVIEW                                   */
/* ========================================= */

function loadPreview() {
    var container = document.getElementById("previewContainer");
    clearAdminMathObserver();
    if (window.MathJax && typeof window.MathJax.typesetClear === "function") {
        window.MathJax.typesetClear([container]);
    }
    if (sections.length === 0) {
        container.innerHTML = '<div class="no-data">No sections created yet. Go to the Sections tab to add some.</div>';
        return;
    }
    if (questions.length === 0) {
        container.innerHTML = '<div class="no-data">No questions added yet.</div>';
        return;
    }
    var html = "";
    var globalQNum = 1;
    sections.forEach(function(s) {
        var subs = getSubsections(s);
        var secQuestions = questions.filter(function(q) { return q.sectionId === s.id; });
        if (secQuestions.length === 0) return;
        html += '<div class="preview-section"><h2>\uD83D\uDCC2 ' + s.name + '</h2>';
        subs.forEach(function(sub) {
            var subQs = secQuestions.filter(function(q) { return (q.subsection || q.type) === sub.id; });
            if (subQs.length === 0) return;
            html += '<div class="preview-subsection"><h3>' + escHtml(sub.label) + ' (' + subQs.length + ')</h3>';
            subQs.forEach(function(q) {
                var marksInfo = ' (Marks: +' + (q.totalMarks || 4) + ' / -' + (q.negativeMarks || 1) + ')';
                var qHtml = '<span class="pq-num">Q' + globalQNum + '.</span> ';
                qHtml += renderContent(
                    q.question,
                    q.images || [],
                    q.tables || [],
                    true,
                    [q.question].concat(q.options || []).join("\n")
                );
                html += '<div class="preview-q">' + qHtml + '<span class="preview-marks">' + marksInfo + '</span></div>';
                globalQNum++;
            });
            html += '</div>';
        });
        html += '</div>';
    });
    if (html === "") {
        html = '<div class="no-data">No questions assigned to any section.</div>';
    }
    container.innerHTML = html;
    setupLazyAdminMath(container, ".preview-q");
}

/* ========================================= */
/* INIT                                      */
/* ========================================= */

function initAdmin() {
    initChatPolling();
    fetch("/api/sections").then(function(r) { return r.json(); }).then(function(data) {
        sections = data;
        populateSectionDropdowns();
        return fetch("/api/questions").then(function(r) { return r.json(); });
    }).then(function(data) {
        questions = data;
        renderQuestions();
        toggleOptions();
        if (sections.length > 0) document.getElementById("qSection").value = sections[0].id;
        updateLivePreview();
    }).catch(function(err) {
        console.error("Init error:", err);
    });
}

document.addEventListener("DOMContentLoaded", function() {
    if (sessionStorage.getItem("adminLoggedIn") === "true") {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminContainer").style.display = "block";
        initAdmin();
    }
});

/* ========================================= */
/* PROCTORING MONITOR                        */
/* ========================================= */

var proctorPollTimer = null;
var proctorCards = {};
var proctorFetching = false;

function loadProctoring() {
    fetchProctoringStudents();
    recoverLiveStreams();
    startLivePendingPolling();
    loadChatPanel();

    if (proctorPollTimer) clearInterval(proctorPollTimer);
    proctorPollTimer = setInterval(function() {
        var tab = document.getElementById("tab-proctoring");
        if (!tab || !tab.classList.contains("active")) {
            clearInterval(proctorPollTimer);
            proctorPollTimer = null;
            return;
        }
        fetchProctoringStudents();
    }, 2000);
}

function fetchProctoringStudents() {
    if (proctorFetching) return;
    proctorFetching = true;
    fetch("/api/proctoring/students").then(function(r) { return r.json(); }).then(function(students) {
        proctorFetching = false;
        renderProctoringStudents(students);
        var stamp = document.getElementById("proctorLastRefresh");
        if (stamp) stamp.textContent = "Updated " + new Date().toLocaleTimeString();
    }).catch(function() {
        proctorFetching = false;
    });
}

function renderProctoringStudents(students) {
    var grid = document.getElementById("proctorGrid");
    if (!grid) return;

    if (!students || students.length === 0) {
        proctorCards = {};
        grid.innerHTML = '<div class="no-data">No students are being monitored yet. Students appear here once they enable their camera and microphone.</div>';
        return;
    }

    if (Object.keys(proctorCards).length === 0) grid.innerHTML = "";

    students.forEach(function(s) {
        var card = proctorCards[s.email];
        if (!card || !card.parentNode) {
            card = buildProctorCard(s);
            proctorCards[s.email] = card;
            grid.appendChild(card);
        }
        updateProctorCard(card, s);
    });

    Object.keys(proctorCards).forEach(function(email) {
        var stillListed = students.some(function(s) { return s.email === email; });
        if (!stillListed) {
            if (proctorCards[email].parentNode) proctorCards[email].parentNode.removeChild(proctorCards[email]);
            delete proctorCards[email];
            closeEmailLivePeers(email);
        }
    });
}

function buildProctorCard(s) {
    var card = document.createElement("div");
    card.className = "proctor-card";
    card.setAttribute("data-email", s.email);
    card.innerHTML =
        '<div class="proctor-card-head">' +
            '<span class="proctor-name"></span>' +
            '<span class="proctor-state"></span>' +
        '</div>' +
        '<div class="proctor-meta"></div>' +
        '<div class="proctor-frames">' +
            '<div class="proctor-frame">' +
                '<div class="proctor-frame-label">\uD83D\uDCF7 Camera <span class="proctor-live-status waiting proctor-camera-status">\u25CF Waiting</span></div>' +
                '<video class="proctor-live-video proctor-camera-video" autoplay playsinline muted></video>' +
                '<div class="proctor-empty proctor-camera-empty">Waiting for live camera\u2026</div>' +
            '</div>' +
            '<div class="proctor-frame">' +
                '<div class="proctor-frame-label">\uD83D\uDDA5 Screen share <span class="proctor-live-status waiting proctor-screen-status">\u25CF Waiting</span></div>' +
                '<video class="proctor-live-video proctor-screen-video" autoplay playsinline muted></video>' +
                '<div class="proctor-empty proctor-screen-empty">Waiting for the student to share a screen\u2026</div>' +
            '</div>' +
        '</div>' +
        '<div class="proctor-live-audio-row">' +
            '<span class="proctor-audio-label">\uD83C\uDFA4 Live audio</span>' +
            '<span class="proctor-live-status waiting proctor-audio-status">\u25CF Waiting</span>' +
            '<button class="btn-info proctor-audio-btn" type="button">\uD83D\uDD0A Listen</button>' +
            '<audio class="proctor-live-audio"></audio>' +
        '</div>' +
        '<div class="proctor-events"></div>' +
        '<div class="proctor-actions">' +
            '<button class="btn-info proctor-open-btn" type="button">\uD83D\uDD0D Focus</button>' +
            '<button class="btn-info proctor-reconnect-btn" type="button">\uD83D\uDD04 Reconnect</button>' +
            '<button class="btn-danger proctor-clear-btn" type="button">\uD83D\uDDD1 Clear session</button>' +
        '</div>';

    card.querySelector(".proctor-name").textContent = s.email;

    card.querySelector(".proctor-open-btn").addEventListener("click", function() {
        openStudentFocus(s.email);
    });

    Array.prototype.forEach.call(card.querySelectorAll(".proctor-live-video"), function(video) {
        video.title = "Open large live view with chat";
        video.addEventListener("click", function() {
            openStudentFocus(s.email);
        });
    });

    card.querySelector(".proctor-clear-btn").addEventListener("click", function() {
        clearProctorSession(s.email);
    });

    card.querySelector(".proctor-reconnect-btn").addEventListener("click", function() {
        requestLiveReconnect(s.email);
    });

    card.querySelector(".proctor-audio-btn").addEventListener("click", function() {
        var audio = card.querySelector(".proctor-live-audio");
        if (!audio || !audio.srcObject) {
            setLiveStatus(card, "audio", "waiting");
            return;
        }
        audio.muted = false;
        audio.play().catch(function() {});

        var focusAudio = document.getElementById("focusAudio");
        if (focusAudio) focusAudio.pause();
        updateFocusAudioButton();
    });

    return card;
}

function updateProctorCard(card, s) {
    var online = !!s.online && !s.stopped;
    var state = card.querySelector(".proctor-state");
    state.textContent = s.stopped ? "\u26AB Submitted" : (online ? "\uD83D\uDFE2 Live" : "\u26AA Offline");
    state.className = "proctor-state " + (s.stopped ? "submitted" : (online ? "online" : "offline"));

    var sources = s.sources || {};
    card.querySelector(".proctor-meta").innerHTML =
        "Last seen: <b>" + formatProctorAgo(s.lastSeenAgo) + "</b> \u00B7 Camera: " + (sources.camera ? "on" : "off") +
        " \u00B7 Mic: " + (sources.audio ? "on" : "off") +
        " \u00B7 Screen: " + (sources.screen ? "shared" : "off") +
        " \u00B7 Started: " + new Date(s.startedAt).toLocaleTimeString();

    var live = s.live || {};
    if (!live.camera || !live.camera.offerAt) setLiveStatus(card, "camera", "waiting");
    if (!sources.screen || !live.screen || !live.screen.offerAt) {
        setLiveStatus(card, "screen", "waiting");
        var screenVideo = card.querySelector(".proctor-screen-video");
        var screenEmpty = card.querySelector(".proctor-screen-empty");
        if (screenVideo) screenVideo.srcObject = null;
        if (screenEmpty) screenEmpty.style.display = "flex";
    }

    var eventsEl = card.querySelector(".proctor-events");
    var events = (s.events || []).slice(-5).reverse();
    if (events.length === 0) {
        eventsEl.innerHTML = '<div class="proctor-event-empty">No alerts</div>';
    } else {
        eventsEl.innerHTML = events.map(function(e) {
            return '<div class="proctor-event"><span class="proctor-event-time">' +
                new Date(e.at).toLocaleTimeString() + '</span> ' + escHtml(e.message || e.type) + '</div>';
        }).join("");
    }
}

/* ========================================= */
/* LIVE STREAM VIEWERS (WebRTC)              */
/* ========================================= */

const LIVE_ICE_CONFIG = {iceServers: [{urls: "stun:stun.l.google.com:19302"}]};

var livePeers = {};
var liveAnswered = {};
var liveRecoveryRequested = {};
var livePendingTimer = null;
var livePendingBusy = false;

/* After a page reload the old viewer connection is gone. Ask each student whose
   offer was already consumed (but whom we are not viewing) to publish a new one. */
function recoverLiveStreams() {
    fetch("/api/proctoring/students").then(function(r) { return r.json(); }).then(function(list) {
        (list || []).forEach(function(s) {
            if (!s.online || s.stopped) return;
            if (livePeers[s.email + "|camera"] || livePeers[s.email + "|screen"]) return;

            var live = s.live || {};
            var answered = (live.camera && live.camera.answered) || (live.screen && live.screen.answered);
            if (!answered) return;

            var now = Date.now();
            if (liveRecoveryRequested[s.email] && now - liveRecoveryRequested[s.email] < 15000) return;
            liveRecoveryRequested[s.email] = now;
            requestLiveReconnect(s.email);
        });
    }).catch(function() {});
}

function waitForIceGathering(pc, timeout) {
    return new Promise(function(resolve) {
        if (pc.iceGatheringState === "complete") {
            resolve();
            return;
        }

        var finished = false;
        var finish = function() {
            if (finished) return;
            finished = true;
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
        };
        var onChange = function() {
            if (pc.iceGatheringState === "complete") finish();
        };

        pc.addEventListener("icegatheringstatechange", onChange);
        setTimeout(finish, timeout);
    });
}

function startLivePendingPolling() {
    if (livePendingTimer) clearInterval(livePendingTimer);
    syncLiveOffers();

    livePendingTimer = setInterval(function() {
        var tab = document.getElementById("tab-proctoring");
        if (!tab || !tab.classList.contains("active")) {
            clearInterval(livePendingTimer);
            livePendingTimer = null;
            return;
        }
        syncLiveOffers();
    }, 1500);
}

function syncLiveOffers() {
    if (livePendingBusy) return;
    livePendingBusy = true;

    fetch("/api/live/pending").then(function(r) { return r.json(); }).then(function(list) {
        livePendingBusy = false;
        (list || []).forEach(function(item) {
            var key = item.email + "|" + item.kind;
            if (liveAnswered[key] === item.offerAt) return;
            if (livePeers[key] && livePeers[key].offerAt === item.offerAt) return;
            answerLiveOffer(item);
        });
    }).catch(function() {
        livePendingBusy = false;
    });
}

async function answerLiveOffer(item) {
    var key = item.email + "|" + item.kind;
    var card = proctorCards[item.email];
    if (!card) return;

    liveAnswered[key] = item.offerAt;
    closeLivePeer(key);

    var pc = new RTCPeerConnection(LIVE_ICE_CONFIG);
    var peer = {
        pc: pc,
        email: item.email,
        kind: item.kind,
        offerAt: item.offerAt,
        cameraStream: null,
        screenStream: null,
        audioStream: null
    };
    livePeers[key] = peer;

    pc.ontrack = function(e) {
        var currentCard = proctorCards[item.email];
        var stream = e.streams[0] || new MediaStream([e.track]);

        if (e.track.kind === "audio") {
            peer.audioStream = stream;
            e.track.addEventListener("ended", function() {
                if (peer.audioStream !== stream) return;
                peer.audioStream = null;
                if (currentCard) {
                    var endedAudio = currentCard.querySelector(".proctor-live-audio");
                    if (endedAudio && endedAudio.srcObject === stream) {
                        endedAudio.pause();
                        endedAudio.srcObject = null;
                    }
                    setLiveStatus(currentCard, "audio", "offline");
                }
                if (focusedEmail === item.email) attachFocusMedia();
            });
            if (currentCard) {
                var audio = currentCard.querySelector(".proctor-live-audio");
                if (audio) {
                    audio.srcObject = stream;
                    setLiveStatus(currentCard, "audio", "live");
                }
            }
            if (focusedEmail === item.email) attachFocusMedia();
            return;
        }

        if (item.kind === "camera") peer.cameraStream = stream;
        else peer.screenStream = stream;

        if (item.kind === "screen") {
            e.track.addEventListener("ended", function() {
                if (peer.screenStream !== stream) return;
                peer.screenStream = null;
                var activeCard = proctorCards[item.email];
                if (activeCard) {
                    setLiveStatus(activeCard, "screen", "waiting");
                    var screenVideo = activeCard.querySelector(".proctor-screen-video");
                    if (screenVideo) screenVideo.srcObject = null;
                }
                if (focusedEmail === item.email) attachFocusMedia();
            });
        }

        if (currentCard) {
            var video = currentCard.querySelector(item.kind === "camera" ? ".proctor-camera-video" : ".proctor-screen-video");
            if (video) {
                video.srcObject = stream;
                video.play().catch(function() {});
            }
            setLiveStatus(currentCard, item.kind, "live");
        }

        if (focusedEmail === item.email) attachFocusMedia();
    };

    pc.onconnectionstatechange = function() {
        var state = pc.connectionState;
        var currentCard = proctorCards[item.email];

        if (currentCard) {
            if (state === "connected") {
                setLiveStatus(currentCard, item.kind, "live");
            } else if (state === "failed" || state === "disconnected" || state === "closed") {
                setLiveStatus(currentCard, item.kind, "offline");
                if (item.kind === "camera") setLiveStatus(currentCard, "audio", "offline");
            }
        }

        if (focusedEmail !== item.email) return;

        if (state === "connected") {
            setFocusStatus(item.kind === "camera" ? "focusCameraStatus" : "focusScreenStatus", "live");
            if (item.kind === "camera") setFocusStatus("focusAudioStatus", "live");
        } else if (state === "failed" || state === "disconnected" || state === "closed") {
            setFocusStatus(item.kind === "camera" ? "focusCameraStatus" : "focusScreenStatus", "offline");
            if (item.kind === "camera") setFocusStatus("focusAudioStatus", "offline");
        }
    };

    try {
        var offerRes = await fetch("/api/live/offer/" + encodeURIComponent(item.email) + "/" + item.kind);
        if (!offerRes.ok) return;
        var offerData = await offerRes.json();

        await pc.setRemoteDescription({type: "offer", sdp: offerData.sdp});
        await pc.setLocalDescription(await pc.createAnswer());
        await waitForIceGathering(pc, 3000);

        await fetch("/api/live/answer", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                email: item.email,
                kind: item.kind,
                sdp: pc.localDescription.sdp,
                offerAt: item.offerAt
            })
        });
    } catch (err) {
        setLiveStatus(card, item.kind, "offline");
    }
}

function closeLivePeer(key) {
    var peer = livePeers[key];
    if (!peer) return;
    try { peer.pc.close(); } catch (err) {}
    delete livePeers[key];
}

function closeEmailLivePeers(email) {
    if (focusedEmail === email) closeStudentFocus();

    ["camera", "screen"].forEach(function(kind) {
        var key = email + "|" + kind;
        closeLivePeer(key);
        delete liveAnswered[key];
    });
}

function requestLiveReconnect(email) {
    fetch("/api/live/request", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: email})
    }).catch(function() {});
}

function setLiveStatus(card, kind, state) {
    if (!card) return;

    var label = card.querySelector(kind === "camera" ? ".proctor-camera-status"
        : kind === "screen" ? ".proctor-screen-status" : ".proctor-audio-status");
    if (!label) return;

    label.className = "proctor-live-status " + state + " proctor-" + kind + "-status";
    label.textContent = state === "live" ? "\u25CF Live" : state === "offline" ? "\u25CF Offline" : "\u25CF Waiting";

    if (kind !== "audio") {
        var empty = card.querySelector(".proctor-" + kind + "-empty");
        if (empty) empty.style.display = state === "live" ? "none" : "flex";
    }
}

/* ========================================= */
/* FOCUSED STUDENT VIEW                      */
/* ========================================= */

var focusedEmail = null;
var focusChatTimer = null;
var focusChatSignature = "";
var focusAudioMeter = {context: null, source: null, analyser: null, silentGain: null, stream: null, frame: null};

function expandFocusMedia(kind) {
    var media = document.getElementById("focusMedia");
    if (!media || (kind !== "camera" && kind !== "screen")) return;

    var selectedClass = "focus-expanded-" + kind;
    if (media.classList.contains(selectedClass)) {
        exitExpandedFocusMedia();
        return;
    }

    media.classList.remove("focus-expanded-camera", "focus-expanded-screen");
    media.classList.add(selectedClass);
    var backButton = document.getElementById("focusNormalViewBtn");
    if (backButton) backButton.hidden = false;
}

function exitExpandedFocusMedia() {
    var media = document.getElementById("focusMedia");
    if (media) media.classList.remove("focus-expanded-camera", "focus-expanded-screen");
    var backButton = document.getElementById("focusNormalViewBtn");
    if (backButton) backButton.hidden = true;
}

function openStudentFocus(email) {
    if (!email) return;

    exitExpandedFocusMedia();
    focusedEmail = email;
    focusChatSignature = "";

    document.getElementById("focusTitle").textContent = email;
    document.getElementById("focusOverlay").style.display = "flex";
    document.getElementById("focusChatMessages").innerHTML = '<div class="chat-empty">Loading chat\u2026</div>';

    var input = document.getElementById("focusChatInput");
    if (input) {
        input.value = "";
        input.placeholder = "Message " + email + "...";
    }

    /* silence the small card players so only the focused student's audio is heard */
    Array.prototype.forEach.call(document.querySelectorAll(".proctor-live-audio"), function(el) {
        el.pause();
    });

    attachFocusMedia();

    var audio = document.getElementById("focusAudio");
    if (audio && audio.srcObject) {
        audio.muted = false;
        audio.play().then(updateFocusAudioButton).catch(updateFocusAudioButton);
        startFocusAudioMeter(audio.srcObject);
    }

    refreshFocusChat();

    if (focusChatTimer) clearInterval(focusChatTimer);
    focusChatTimer = setInterval(refreshFocusChat, 2000);
}

function closeStudentFocus() {
    exitExpandedFocusMedia();
    focusedEmail = null;

    if (focusChatTimer) {
        clearInterval(focusChatTimer);
        focusChatTimer = null;
    }

    var overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "none";

    var audio = document.getElementById("focusAudio");
    if (audio) {
        audio.pause();
        audio.srcObject = null;
    }
    stopFocusAudioMeter();
    updateFocusAudioButton();

    ["focusCameraVideo", "focusScreenVideo"].forEach(function(id) {
        var video = document.getElementById(id);
        if (video) video.srcObject = null;
    });

    var screenEmpty = document.getElementById("focusScreenEmpty");
    if (screenEmpty) {
        screenEmpty.textContent = "Waiting for the student to share a screen…";
        screenEmpty.style.display = "flex";
    }

    setFocusStatus("focusCameraStatus", "waiting");
    setFocusStatus("focusScreenStatus", "waiting");
    setFocusStatus("focusAudioStatus", "waiting");
}

function attachFocusMedia() {
    if (!focusedEmail) return;

    var camPeer = livePeers[focusedEmail + "|camera"];
    var screenPeer = livePeers[focusedEmail + "|screen"];

    var camVideo = document.getElementById("focusCameraVideo");
    var screenVideo = document.getElementById("focusScreenVideo");
    var audio = document.getElementById("focusAudio");
    if (!camVideo || !screenVideo || !audio) return;

    var camStream = camPeer && camPeer.cameraStream ? camPeer.cameraStream : null;
    var screenStream = screenPeer && screenPeer.screenStream ? screenPeer.screenStream : null;
    var audioStream = camPeer && camPeer.audioStream ? camPeer.audioStream : null;

    bindFocusStream(camVideo, camStream);
    bindFocusStream(screenVideo, screenStream);
    bindFocusStream(audio, audioStream);
    startFocusAudioMeter(audioStream);

    setFocusStatus("focusCameraStatus", camStream ? "live" : "waiting");
    setFocusStatus("focusScreenStatus", screenStream ? "live" : "waiting");
    var screenEmpty = document.getElementById("focusScreenEmpty");
    if (screenEmpty) screenEmpty.style.display = screenStream ? "none" : "flex";
    setFocusStatus("focusAudioStatus", audioStream ? "live" : "waiting");
    updateFocusAudioButton();
}

function startFocusAudioMeter(stream) {
    var meter = document.getElementById("focusAudioMeter");
    if (!meter) return;
    if (!stream || !stream.getAudioTracks || stream.getAudioTracks().length === 0) {
        stopFocusAudioMeter();
        meter.setAttribute("aria-valuetext", "No audio detected");
        return;
    }

    if (focusAudioMeter.stream === stream && focusAudioMeter.analyser) {
        if (focusAudioMeter.context && focusAudioMeter.context.state === "suspended") {
            focusAudioMeter.context.resume().catch(function() {});
        }
        return;
    }

    stopFocusAudioMeter();
    var AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) {
        meter.setAttribute("aria-valuetext", "Audio level meter unavailable");
        return;
    }

    try {
        var context = new AudioContextType();
        var source = context.createMediaStreamSource(stream);
        var analyser = context.createAnalyser();
        var silentGain = context.createGain();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        silentGain.gain.value = 0;
        source.connect(analyser);
        analyser.connect(silentGain);
        silentGain.connect(context.destination);

        focusAudioMeter.context = context;
        focusAudioMeter.source = source;
        focusAudioMeter.analyser = analyser;
        focusAudioMeter.silentGain = silentGain;
        focusAudioMeter.stream = stream;

        var samples = new Uint8Array(analyser.fftSize);
        var bars = meter.querySelectorAll("span");
        function updateLevel() {
            if (focusAudioMeter.analyser !== analyser) return;
            analyser.getByteTimeDomainData(samples);

            var peakLevel = 0;
            var bandSize = Math.max(1, Math.floor(samples.length / bars.length));
            for (var i = 0; i < bars.length; i++) {
                var bandPeak = 0;
                var start = i * bandSize;
                var end = i === bars.length - 1 ? samples.length : Math.min(samples.length, start + bandSize);
                for (var j = start; j < end; j++) {
                    bandPeak = Math.max(bandPeak, Math.abs(samples[j] - 128) / 128);
                }
                peakLevel = Math.max(peakLevel, bandPeak);
                bars[i].style.height = Math.round(4 + Math.min(1, bandPeak * 2.4) * 18) + "px";
            }

            var percentage = Math.min(100, Math.round(peakLevel * 100));
            meter.setAttribute("aria-valuenow", String(percentage));
            meter.setAttribute("aria-valuetext", peakLevel > 0.015 ? "Sound detected" : "No sound detected");
            meter.classList.toggle("active", peakLevel > 0.015);
            focusAudioMeter.frame = window.requestAnimationFrame(updateLevel);
        }

        context.resume().catch(function() {});
        focusAudioMeter.frame = window.requestAnimationFrame(updateLevel);
    } catch (err) {
        stopFocusAudioMeter();
        meter.setAttribute("aria-valuetext", "Audio level meter unavailable");
    }
}

function stopFocusAudioMeter() {
    if (focusAudioMeter.frame !== null) {
        window.cancelAnimationFrame(focusAudioMeter.frame);
    }
    if (focusAudioMeter.source) {
        try { focusAudioMeter.source.disconnect(); } catch (err) {}
    }
    if (focusAudioMeter.analyser) {
        try { focusAudioMeter.analyser.disconnect(); } catch (err) {}
    }
    if (focusAudioMeter.silentGain) {
        try { focusAudioMeter.silentGain.disconnect(); } catch (err) {}
    }
    if (focusAudioMeter.context && focusAudioMeter.context.state !== "closed") {
        focusAudioMeter.context.close().catch(function() {});
    }

    focusAudioMeter = {context: null, source: null, analyser: null, silentGain: null, stream: null, frame: null};
    var meter = document.getElementById("focusAudioMeter");
    if (meter) {
        meter.classList.remove("active");
        meter.setAttribute("aria-valuenow", "0");
        meter.setAttribute("aria-valuetext", "No sound detected");
        Array.prototype.forEach.call(meter.querySelectorAll("span"), function(bar) {
            bar.style.height = "4px";
        });
    }
}

function bindFocusStream(el, stream) {
    if (el.srcObject !== (stream || null)) {
        el.srcObject = stream || null;
    }
    if (stream && el.tagName === "VIDEO") {
        el.play().catch(function() {});
    }
}

function setFocusStatus(id, state) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = "proctor-live-status " + state;
    el.textContent = state === "live" ? "\u25CF Live" : state === "offline" ? "\u25CF Offline" : "\u25CF Waiting";
}

function updateFocusAudioButton() {
    var audio = document.getElementById("focusAudio");
    var btn = document.getElementById("focusAudioBtn");
    if (!btn) return;

    if (!audio || !audio.srcObject) {
        btn.textContent = "\uD83D\uDD0A No audio yet";
        btn.disabled = true;
        return;
    }

    btn.disabled = false;
    btn.textContent = audio.paused ? "\u25B6 Play audio" : "\u23F8 Pause audio";
}

function toggleFocusAudio() {
    var audio = document.getElementById("focusAudio");
    if (!audio || !audio.srcObject) return;

    if (audio.paused) {
        audio.muted = false;
        startFocusAudioMeter(audio.srcObject);
        audio.play().then(updateFocusAudioButton).catch(updateFocusAudioButton);
    } else {
        audio.pause();
        updateFocusAudioButton();
    }
}

function focusReconnect() {
    if (focusedEmail) requestLiveReconnect(focusedEmail);
}

function refreshFocusChat() {
    if (!focusedEmail) return;

    var email = focusedEmail;
    fetch("/api/chat/messages/" + encodeURIComponent(email) + "?viewer=admin&markRead=1")
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (focusedEmail !== email) return;
            renderFocusChat(data.messages || []);
        }).catch(function() {});
}

function renderFocusChat(messages) {
    var box = document.getElementById("focusChatMessages");
    if (!box) return;

    var signature = messages.map(function(m) { return m.id + ":" + m.at; }).join("|");
    if (signature === focusChatSignature) return;
    focusChatSignature = signature;

    if (messages.length === 0) {
        box.innerHTML = '<div class="chat-empty">No messages yet. Say hello to the student.</div>';
        return;
    }

    box.innerHTML = messages.map(function(m) {
        var fromStudent = m.from === "student";
        return '<div class="chat-msg ' + (fromStudent ? "chat-msg-student" : "chat-msg-admin") + '">' +
            '<div class="chat-msg-text">' + escHtml(m.message) + '</div>' +
            '<div class="chat-msg-time">' + (fromStudent ? "Student" : "You") + " \u00B7 " +
            new Date(m.at).toLocaleTimeString() + '</div>' +
            '</div>';
    }).join("");

    box.scrollTop = box.scrollHeight;
}

function sendFocusChat() {
    var input = document.getElementById("focusChatInput");
    if (!input || !focusedEmail) return;

    var text = input.value.trim();
    if (!text) return;
    input.value = "";

    var email = focusedEmail;
    fetch("/api/chat/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: email, from: "admin", message: text})
    }).then(function() {
        refreshFocusChat();
        refreshChatThreads();
    }).catch(function() {});
}

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && focusedEmail) closeStudentFocus();
});

function formatProctorAgo(seconds) {
    if (seconds === null || seconds === undefined) return "unknown";
    if (seconds < 5) return "just now";
    if (seconds < 60) return seconds + "s ago";
    return Math.floor(seconds / 60) + "m ago";
}

function clearProctorSession(email) {
    if (!confirm('Remove monitoring data for "' + email + '"?')) return;
    fetch("/api/proctoring/students/" + encodeURIComponent(email), {method: "DELETE"})
        .then(function() {
            if (proctorCards[email]) {
                if (proctorCards[email].parentNode) proctorCards[email].parentNode.removeChild(proctorCards[email]);
                delete proctorCards[email];
            }
            closeEmailLivePeers(email);
            fetchProctoringStudents();
        });
}

/* ========================================= */
/* HELP CHAT (ADMIN)                         */
/* ========================================= */

var chatAdminState = { email: null, threads: [], lastSignature: "" };
var chatPollTimer = null;
var chatBadgeTimer = null;

function initChatPolling() {
    bindChatThreads();
    refreshChatThreads();
    if (chatBadgeTimer) clearInterval(chatBadgeTimer);
    chatBadgeTimer = setInterval(refreshChatThreads, 5000);
}

function isProctoringTabActive() {
    var tab = document.getElementById("tab-proctoring");
    return !!tab && tab.classList.contains("active");
}

function bindChatThreads() {
    var el = document.getElementById("chatThreads");
    if (!el || el.getAttribute("data-bound") === "1") return;
    el.setAttribute("data-bound", "1");
    el.addEventListener("click", function(e) {
        var item = e.target.closest(".chat-thread");
        if (item && item.getAttribute("data-email")) selectChatThread(item.getAttribute("data-email"));
    });
}

function loadChatPanel() {
    bindChatThreads();
    refreshChatThreads();

    if (chatAdminState.email) {
        fetchChatMessages();
    } else if (chatAdminState.threads.length > 0) {
        selectChatThread(chatAdminState.threads[0].email);
    }

    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(function() {
        if (!isProctoringTabActive()) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
            return;
        }
        refreshChatThreads();
        if (chatAdminState.email) fetchChatMessages();
    }, 2000);
}

function refreshChatThreads() {
    fetch("/api/chat/threads").then(function(r) { return r.json(); }).then(function(threads) {
        chatAdminState.threads = Array.isArray(threads) ? threads : [];
        renderChatThreads();
        updateChatTabBadge();

        if (!chatAdminState.email && chatAdminState.threads.length > 0 && isProctoringTabActive()) {
            selectChatThread(chatAdminState.threads[0].email);
        }
    }).catch(function() {});
}

function renderChatThreads() {
    var el = document.getElementById("chatThreads");
    if (!el) return;

    if (chatAdminState.threads.length === 0) {
        el.innerHTML = '<div class="chat-thread-empty">No student messages yet. Students can reach you from the chat button on the test screen.</div>';
        return;
    }

    el.innerHTML = chatAdminState.threads.map(function(t) {
        var active = t.email === chatAdminState.email;
        return '<div class="chat-thread' + (active ? " active" : "") + '" data-email="' + escHtml(t.email) + '">' +
            '<div class="chat-thread-email">' + escHtml(t.email) + '</div>' +
            '<div class="chat-thread-last">' + (t.lastFrom === "admin" ? "You: " : "") + escHtml(t.lastMessage || "") + '</div>' +
            (t.unread > 0 ? '<span class="chat-thread-unread">' + t.unread + '</span>' : '') +
            '</div>';
    }).join("");
}

function selectChatThread(email) {
    chatAdminState.email = email;
    chatAdminState.lastSignature = "";

    var head = document.getElementById("chatConvHead");
    if (head) head.textContent = email;

    var input = document.getElementById("chatAdminInput");
    if (input) {
        input.disabled = false;
        input.placeholder = "Reply to " + email + "...";
    }

    renderChatThreads();
    var box = document.getElementById("chatMessages");
    if (box) box.innerHTML = '<div class="chat-empty">Loading...</div>';
    fetchChatMessages();
}

function fetchChatMessages() {
    var email = chatAdminState.email;
    if (!email) return;

    fetch("/api/chat/messages/" + encodeURIComponent(email) + "?viewer=admin&markRead=1")
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (chatAdminState.email !== email) return;
            renderAdminChatMessages(data.messages || []);
        }).catch(function() {});
}

function renderAdminChatMessages(messages) {
    var box = document.getElementById("chatMessages");
    if (!box) return;

    var signature = messages.map(function(m) { return m.id + ":" + m.at; }).join("|");
    if (signature === chatAdminState.lastSignature) return;
    chatAdminState.lastSignature = signature;

    if (messages.length === 0) {
        box.innerHTML = '<div class="chat-empty">No messages yet. Say hello to the student.</div>';
        return;
    }

    box.innerHTML = messages.map(function(m) {
        var fromStudent = m.from === "student";
        return '<div class="chat-msg ' + (fromStudent ? "chat-msg-student" : "chat-msg-admin") + '">' +
            '<div class="chat-msg-text">' + escHtml(m.message) + '</div>' +
            '<div class="chat-msg-time">' + (fromStudent ? "Student" : "You") + " \u00B7 " +
            new Date(m.at).toLocaleTimeString() + '</div>' +
            '</div>';
    }).join("");

    box.scrollTop = box.scrollHeight;
}

function sendAdminChat() {
    var input = document.getElementById("chatAdminInput");
    if (!input || !chatAdminState.email) return;

    var text = input.value.trim();
    if (!text) return;
    input.value = "";

    fetch("/api/chat/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: chatAdminState.email, from: "admin", message: text})
    }).then(function() {
        fetchChatMessages();
        refreshChatThreads();
    }).catch(function() {});
}

function updateChatTabBadge() {
    var total = chatAdminState.threads.reduce(function(sum, t) { return sum + (t.unread || 0); }, 0);
    var badge = document.getElementById("chatTabBadge");
    if (!badge) return;

    if (total > 0) {
        badge.textContent = total > 9 ? "9+" : String(total);
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
}
