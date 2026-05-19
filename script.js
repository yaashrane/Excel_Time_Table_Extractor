/* =========================================================
   Timetable Extractor Pro - Frontend
   ========================================================= */

(() => {
  "use strict";

  const API_BASE = "/api";
  const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const PERIODS = [
    { type: "slot", key: "08:30", label: "08:30am to 09:30am", aliases: ["08:30"], start: "08:30", end: "09:30" },
    { type: "slot", key: "09:30", label: "09:30am to 10:30am", aliases: ["09:30", "09:00"], start: "09:30", end: "10:30" },
    { type: "break", label: "10:30am to 10:45am", title: "Short Recess" },
    { type: "slot", key: "10:45", label: "10:45am to 11:45am", aliases: ["10:45"], start: "10:45", end: "11:45" },
    { type: "slot", key: "11:45", label: "11:45am to 12:45pm", aliases: ["11:45"], start: "11:45", end: "12:45" },
    { type: "break", label: "12:45pm to 01:30pm", title: "Long Recess / Lunch" },
    { type: "slot", key: "13:30", label: "01:30pm to 02:30pm", aliases: ["13:30", "13:00", "01:30", "1:30"], start: "13:30", end: "14:30" },
    { type: "slot", key: "14:30", label: "02:30pm to 03:30pm", aliases: ["14:30", "14:00", "02:30", "2:30"], start: "14:30", end: "15:30" },
  ];

  const SLOT_PERIODS = PERIODS.filter((period) => period.type === "slot");
  const MERGE_PAIRS = new Set(["0:1", "2:3", "4:5"]);

  /* =========================================================
     PROCESSING MODAL
     ========================================================= */

  const PROCESSING_STEPS = [
    {
      label: "Reading Excel structure...",
      sublabels: ["Parsing workbook sheets", "Indexing row and column headers"],
      duration: 900,
      pct: 8,
    },
    {
      label: "Detecting merged timetable cells...",
      sublabels: ["Scanning cell merge groups", "Mapping spanning boundaries"],
      duration: 1100,
      pct: 22,
    },
    {
      label: "Extracting faculty codes...",
      sublabels: ["Running pattern recognition", "Deduplicating abbreviations"],
      duration: 1000,
      pct: 38,
    },
    {
      label: "Resolving timetable conflicts...",
      sublabels: ["Checking slot collisions", "Validating time boundaries"],
      duration: 1200,
      pct: 54,
    },
    {
      label: "Generating individual schedules...",
      sublabels: ["Building per-faculty matrices", "Applying merge logic"],
      duration: 1000,
      pct: 70,
    },
    {
      label: "Building PDF layouts...",
      sublabels: ["Preparing page geometry", "Rendering formal table format"],
      duration: 900,
      pct: 86,
    },
    {
      label: "Faculty schedules are ready",
      sublabels: ["All timetables processed", "Export available"],
      duration: 600,
      pct: 100,
    },
  ];

  const AI_TIPS = [
    "Optimizing merged lab blocks for two-hour sessions…",
    "Balancing faculty workload distribution across slots…",
    "Validating classroom allocations for conflicts…",
    "Cross-referencing division assignments with time slots…",
    "Aligning tutorial and lecture period patterns…",
    "Normalizing time formats across all sheet variants…",
    "Detecting implicit room assignments from code patterns…",
    "Reconstructing multi-session lab continuity chains…",
    "Verifying Saturday slot coverage for each faculty…",
    "Consolidating batch assignments to division groups…",
  ];

  const ProcessingModal = (() => {
    let overlay = null;
    let cancelled = false;
    let activeTimers = [];
    let currentTipIndex = 0;
    let tipInterval = null;
    let etaInterval = null;
    let etaSeconds = 0;
    let stepNodes = [];

    function clearTimers() {
      activeTimers.forEach(clearTimeout);
      activeTimers = [];
      clearInterval(tipInterval);
      clearInterval(etaInterval);
    }

    function svgCheck() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 14 14");
      svg.setAttribute("fill", "none");
      svg.setAttribute("class", "step-check");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M2.5 7.5L5.5 10.5L11.5 4");
      path.setAttribute("stroke", "#00d4aa");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      return svg;
    }

    function build() {
      overlay = document.createElement("div");
      overlay.className = "processing-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Processing timetable");

      const card = document.createElement("div");
      card.className = "processing-card";

      // Scanline effect
      const scanline = document.createElement("div");
      scanline.className = "proc-scanline";
      card.appendChild(scanline);

      // Header
      const header = document.createElement("div");
      header.className = "proc-header";

      const titleGroup = document.createElement("div");
      titleGroup.className = "proc-title-group";

      const eyebrow = document.createElement("p");
      eyebrow.className = "proc-eyebrow";
      const dot = document.createElement("span");
      dot.className = "proc-eyebrow-dot";
      eyebrow.appendChild(dot);
      eyebrow.appendChild(document.createTextNode(" AI Processing Engine"));
      titleGroup.appendChild(eyebrow);

      const title = document.createElement("h2");
      title.className = "proc-title";
      title.textContent = "Extracting Timetable";
      titleGroup.appendChild(title);

      header.appendChild(titleGroup);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "proc-cancel-btn";
      cancelBtn.type = "button";
      cancelBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        Cancel
      `;
      cancelBtn.addEventListener("click", () => {
        cancelled = true;
        hide();
        UI.setStatus("Processing cancelled.", "error");
        UI.setUploading(false);
      });
      header.appendChild(cancelBtn);
      card.appendChild(header);

      // Progress bar
      const barTrack = document.createElement("div");
      barTrack.className = "proc-bar-track";
      const barFill = document.createElement("div");
      barFill.className = "proc-bar-fill";
      barFill.id = "procBarFill";
      const barPct = document.createElement("span");
      barPct.className = "proc-bar-pct";
      barPct.id = "procBarPct";
      barPct.textContent = "0%";
      barTrack.appendChild(barFill);
      barTrack.appendChild(barPct);
      card.appendChild(barTrack);

      // Steps
      const stepsContainer = document.createElement("div");
      stepsContainer.className = "proc-steps";
      stepNodes = [];

      PROCESSING_STEPS.forEach((step, i) => {
        const stepEl = document.createElement("div");
        stepEl.className = "proc-step";
        stepEl.id = `proc-step-${i}`;

        const iconWrap = document.createElement("div");
        iconWrap.className = "proc-step-icon";
        const waitDot = document.createElement("span");
        waitDot.className = "step-dot";
        iconWrap.appendChild(waitDot);

        const textWrap = document.createElement("div");
        textWrap.className = "proc-step-text";
        const label = document.createElement("div");
        label.className = "proc-step-label";
        label.textContent = step.label;
        const sublabel = document.createElement("div");
        sublabel.className = "proc-step-sublabel";
        sublabel.textContent = step.sublabels[0];
        textWrap.appendChild(label);
        textWrap.appendChild(sublabel);

        stepEl.appendChild(iconWrap);
        stepEl.appendChild(textWrap);
        stepsContainer.appendChild(stepEl);
        stepNodes.push({ el: stepEl, iconWrap, label, sublabel });
      });

      card.appendChild(stepsContainer);

      // Footer
      const footer = document.createElement("div");
      footer.className = "proc-footer";

      const tipBlock = document.createElement("div");
      tipBlock.className = "proc-tip";
      const tipLabel = document.createElement("div");
      tipLabel.className = "proc-tip-label";
      tipLabel.textContent = "Smart Insight";
      const tipText = document.createElement("div");
      tipText.className = "proc-tip-text";
      tipText.id = "procTipText";
      tipText.textContent = AI_TIPS[0];
      tipBlock.appendChild(tipLabel);
      tipBlock.appendChild(tipText);

      const etaBlock = document.createElement("div");
      etaBlock.className = "proc-eta";
      const etaLabel = document.createElement("div");
      etaLabel.className = "proc-eta-label";
      etaLabel.textContent = "Est. Time";
      const etaValue = document.createElement("div");
      etaValue.className = "proc-eta-value";
      etaValue.id = "procEtaValue";
      etaValue.textContent = "~7s";
      etaBlock.appendChild(etaLabel);
      etaBlock.appendChild(etaValue);

      footer.appendChild(tipBlock);
      footer.appendChild(etaBlock);
      card.appendChild(footer);

      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }

    function setProgress(pct) {
      const fill = document.getElementById("procBarFill");
      const label = document.getElementById("procBarPct");
      if (fill) fill.style.width = `${pct}%`;
      if (label) label.textContent = `${pct}%`;
    }

    function activateStep(index) {
      if (!stepNodes[index]) return;
      const { el, iconWrap, sublabel } = stepNodes[index];

      // Deactivate previous
      if (index > 0) {
        const prev = stepNodes[index - 1];
        prev.el.classList.remove("active");
        prev.el.classList.add("done");
        prev.iconWrap.innerHTML = "";
        prev.iconWrap.appendChild(svgCheck());
      }

      // Activate current
      el.classList.remove("revealed");
      el.classList.add("active");
      iconWrap.innerHTML = `<span class="step-spinner"></span>`;

      // Animate sublabel cycling
      const step = PROCESSING_STEPS[index];
      if (step.sublabels.length > 1) {
        let si = 0;
        const t = setInterval(() => {
          si = (si + 1) % step.sublabels.length;
          if (sublabel) sublabel.textContent = step.sublabels[si];
        }, 500);
        activeTimers.push(t);
      }
    }

    function finishLastStep() {
      const last = stepNodes[PROCESSING_STEPS.length - 1];
      if (!last) return;
      last.el.classList.remove("active");
      last.el.classList.add("done", "success-final");
      last.iconWrap.innerHTML = "";
      last.iconWrap.appendChild(svgCheck());
    }

    function rotateTip() {
      const el = document.getElementById("procTipText");
      if (!el) return;
      currentTipIndex = (currentTipIndex + 1) % AI_TIPS.length;
      el.style.opacity = "0";
      el.style.transform = "translateY(4px)";
      el.style.transition = "opacity 200ms, transform 200ms";
      setTimeout(() => {
        el.textContent = AI_TIPS[currentTipIndex];
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, 220);
    }

    function startEtaCountdown(totalMs) {
      let remaining = Math.ceil(totalMs / 1000);
      const el = document.getElementById("procEtaValue");
      if (!el) return;
      el.textContent = `~${remaining}s`;
      etaInterval = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        if (el) el.textContent = remaining > 0 ? `~${remaining}s` : "Almost done…";
        if (remaining === 0) clearInterval(etaInterval);
      }, 1000);
    }

    function show() {
      cancelled = false;
      if (!overlay) build();
      // Reset all steps
      stepNodes.forEach(({ el, iconWrap }) => {
        el.className = "proc-step";
        iconWrap.innerHTML = `<span class="step-dot"></span>`;
      });
      setProgress(0);
      currentTipIndex = 0;
      const tipEl = document.getElementById("procTipText");
      if (tipEl) tipEl.textContent = AI_TIPS[0];

      // Calculate total estimated duration
      const totalDuration = PROCESSING_STEPS.reduce((s, st) => s + st.duration, 0);
      startEtaCountdown(totalDuration);

      // Show overlay
      requestAnimationFrame(() => {
        overlay.classList.add("visible");
      });

      // Reveal all steps immediately (greyed out)
      stepNodes.forEach(({ el }) => {
        el.classList.add("revealed");
      });

      // Rotate tips
      tipInterval = setInterval(rotateTip, 2200);

      // Animate steps in sequence
      let elapsed = 0;
      PROCESSING_STEPS.forEach((step, i) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          activateStep(i);
          setProgress(step.pct);
        }, elapsed);
        activeTimers.push(t);
        elapsed += step.duration;
      });

      // Finish after all steps
      const finishTimer = setTimeout(() => {
        if (cancelled) return;
        finishLastStep();
      }, elapsed);
      activeTimers.push(finishTimer);
    }

    function hide() {
      clearTimers();
      if (!overlay) return;
      overlay.classList.remove("visible");
    }

    function destroy() {
      hide();
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
          overlay = null;
          stepNodes = [];
        }
      }, 400);
    }

    return { show, hide, destroy, get cancelled() { return cancelled; } };
  })();

  /* =========================================================
     API CLIENT
     ========================================================= */

  const APIClient = {
    async extract(file) {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/extract`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      return res.json();
    },
  };

  /* =========================================================
     STATE
     ========================================================= */

  const State = {
    data: null,
    selectedTeacher: null,
  };

  /* =========================================================
     HELPERS
     ========================================================= */

  const $ = (selector) => document.querySelector(selector);

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2), value);
      } else {
        node.setAttribute(key, String(value));
      }
    });

    children.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });

    return node;
  };

  const formatNumber = (value) => new Intl.NumberFormat("en-IN").format(Number(value || 0));

  const titleCase = (value) =>
    String(value || "").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

  const normalizeKind = (kind) => {
    const value = String(kind || "lecture").toLowerCase();
    if (value.includes("lab") || value.includes("workshop") || value.includes("practical")) return "lab";
    if (value.includes("tut")) return "tutorial";
    return "lecture";
  };

  const toMinutes = (time) => {
    const text = String(time || "").trim().toLowerCase();
    const match = text.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suffix = text.match(/\b(am|pm)\b/)?.[1];

    if (suffix === "pm" && hours < 12) hours += 12;
    if (suffix === "am" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const canonicalTimeKey = (time) => {
    const start = String(time || "").split(" - ")[0].trim();
    const minutes = toMinutes(start);

    if (minutes !== null) {
      const found = SLOT_PERIODS.find((period) =>
        period.aliases.some((alias) => toMinutes(alias) === minutes)
      );
      if (found) return found.key;
    }

    return start;
  };

  const slotIndexForKey = (key) => SLOT_PERIODS.findIndex((period) => period.key === key);

  const canMergePeriodIndexes = (fromIndex, toIndex) => MERGE_PAIRS.has(`${fromIndex}:${toIndex}`);

  const maxSpanFrom = (slotIndex) => {
    let span = 1;
    let cursor = slotIndex;
    while (canMergePeriodIndexes(cursor, cursor + 1)) {
      span += 1;
      cursor += 1;
    }
    return span;
  };

  const entrySignature = (entry) => [
    normalizeKind(entry.kind),
    entry.subject || "",
    entry.division || "",
    entry.batch || "",
    entry.room || "",
  ].join("|").toLowerCase();

  const buildEntryLabel = (entry) => {
    const meta = [];
    if (entry.division) meta.push(entry.division);
    if (entry.batch) meta.push(entry.batch);
    if (entry.room) meta.push(entry.room);

    return {
      subject: entry.subject || "Untitled class",
      meta: meta.join(" / "),
    };
  };

  const countKinds = (schedule = []) => {
    const counts = { lecture: 0, lab: 0, tutorial: 0 };
    schedule.forEach((entry) => {
      counts[normalizeKind(entry.kind)] += Number(entry.duration) || 1;
    });
    return counts;
  };

  const dominantKind = (entries) => {
    if (entries.some((entry) => normalizeKind(entry.kind) === "lab")) return "lab";
    if (entries.some((entry) => normalizeKind(entry.kind) === "tutorial")) return "tutorial";
    return "lecture";
  };

  const setThemeButtonState = () => {
    const button = $("#themeToggle");
    if (!button) return;

    const isDark = document.documentElement.dataset.theme === "dark";
    button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    button.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
  };

  /* =========================================================
     TIMETABLE LOGIC
     ========================================================= */

  const Timetable = {
    buildMatrix(schedule = []) {
      const matrix = {};
      DAYS.forEach((day) => (matrix[day] = {}));

      schedule.forEach((entry) => {
        if (!entry.day || !entry.time) return;
        const key = canonicalTimeKey(entry.time);
        if (!matrix[entry.day]) matrix[entry.day] = {};
        (matrix[entry.day][key] = matrix[entry.day][key] || []).push(entry);
      });

      return matrix;
    },

    spanFor(matrix, day, slotIndex, entries) {
      const declaredSpan = Math.max(...entries.map((entry) => Number(entry.duration) || 1));
      if (declaredSpan > 1) return Math.min(declaredSpan, maxSpanFrom(slotIndex));

      const signature = entries.map(entrySignature).sort().join("||");
      let span = 1;

      for (let i = slotIndex + 1; i < SLOT_PERIODS.length; i += 1) {
        if (!canMergePeriodIndexes(i - 1, i)) break;

        const nextEntries = matrix[day]?.[SLOT_PERIODS[i].key] || [];
        const nextSignature = nextEntries.map(entrySignature).sort().join("||");

        if (!nextEntries.length || nextEntries.length !== entries.length || nextSignature !== signature) {
          break;
        }

        span += 1;
      }

      return span;
    },

    loadRows(schedule = []) {
      const grouped = new Map();

      schedule.forEach((entry) => {
        const subject = entry.subject || "Untitled class";
        const className = [entry.division, entry.batch].filter(Boolean).join(" / ") || "-";
        const key = `${subject}|${className}`;

        if (!grouped.has(key)) {
          grouped.set(key, { subject, className, lectures: 0, practicals: 0 });
        }

        const row = grouped.get(key);
        const duration = Number(entry.duration) || 1;
        if (normalizeKind(entry.kind) === "lab") row.practicals += duration;
        else row.lectures += duration;
      });

      const rows = [...grouped.values()].sort((a, b) =>
        a.subject.localeCompare(b.subject) || a.className.localeCompare(b.className)
      );

      while (rows.length < 4) {
        rows.push({ subject: "", className: "", lectures: "", practicals: "" });
      }

      return rows;
    },
  };

  /* =========================================================
     UI
     ========================================================= */

  const UI = {
    showResults() {
      $("#uploadView").hidden = true;
      $("#resultsView").hidden = false;
      $("#newUploadBtn").hidden = false;
    },

    showUpload() {
      $("#uploadView").hidden = false;
      $("#resultsView").hidden = true;
      $("#newUploadBtn").hidden = true;
      $("#teacherSearch").value = "";
      this.setSelectedFile(null);
      this.setUploading(false);
    },

    setSelectedFile(file) {
      const label = $("#selectedFileName");
      if (label) label.textContent = file ? file.name : "No file selected";
    },

    setUploading(isUploading) {
      $("#dropzone").classList.toggle("uploading", isUploading);
      $("#browseBtn").disabled = isUploading;
    },

    setPdfEnabled(enabled) {
      const button = $("#downloadPdfBtn");
      button.disabled = !enabled;
      button.classList.toggle("disabled", !enabled);
    },

    setStatus(message, type = "info") {
      const status = $("#uploadStatus");
      status.hidden = false;
      status.textContent = message;
      status.className = `status ${type}`;
    },

    toast(message) {
      const toast = $("#toast");
      toast.textContent = message;
      toast.hidden = false;
      window.clearTimeout(this._toastTimer);
      this._toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 2800);
    },

    renderWarnings(validation) {
      const box = $("#warnings");
      box.innerHTML = "";

      if (!validation?.warnings?.length) {
        box.hidden = true;
        return;
      }

      box.hidden = false;
      box.appendChild(el("strong", {}, ["Notice: "]));
      box.appendChild(document.createTextNode(validation.warnings.join(" | ")));
    },

    renderTeacherList(teachers, filter = "") {
      const list = $("#teacherList");
      const query = filter.trim().toLowerCase();
      const filtered = teachers.filter((teacher) =>
        teacher.code.toLowerCase().includes(query) || teacher.name.toLowerCase().includes(query)
      );

      $("#teacherCount").textContent = formatNumber(teachers.length);
      list.innerHTML = "";

      if (!filtered.length) {
        list.appendChild(el("li", { class: "teacher-empty" }, ["No faculty match your search."]));
        return;
      }

      filtered.forEach((teacher) => {
        const active = State.selectedTeacher === teacher.code;
        const item = el("li", {
          class: `teacher-item${active ? " active" : ""}`,
          role: "button",
          tabindex: "0",
          "aria-selected": active,
          onclick: () => App.selectTeacher(teacher.code),
        }, [
          el("div", { class: "teacher-info" }, [
            el("div", { class: "teacher-code" }, [teacher.code]),
            el("div", { class: "teacher-name" }, [teacher.name || "Unnamed faculty"]),
          ]),
          el("span", { class: "slot-badge" }, [formatNumber(teacher.hours || teacher.slots)]),
        ]);

        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            App.selectTeacher(teacher.code);
          }
        });

        list.appendChild(item);
      });
    },

    renderSummaryStats(items) {
      const stats = $("#summaryStats");
      stats.innerHTML = "";

      items.forEach((item) => {
        stats.appendChild(el("div", { class: "stat-tile" }, [
          el("p", { class: "stat-value" }, [formatNumber(item.value)]),
          el("p", { class: "stat-label" }, [item.label]),
        ]));
      });

      stats.hidden = false;
    },

    renderWelcome(data) {
      const stats = data.validation?.stats || {};
      const teacherCount = Object.keys(data.teachers || {}).length;

      $("#contentTitle").textContent = "Choose a faculty timetable";
      $("#contentSubtitle").textContent =
        "Select a code from the faculty panel to view the formal timetable.";

      this.renderSummaryStats([
        { label: "Faculty found", value: stats.unique_faculty || teacherCount },
        { label: "Class slots", value: stats.total_slots || 0 },
        { label: "Divisions", value: (data.divisions || []).length },
        { label: "Warnings", value: data.validation?.warnings?.length || 0 },
      ]);

      const container = $("#timetableContainer");
      container.innerHTML = "";
      container.appendChild(el("div", { class: "welcome-panel" }, [
        el("div", { class: "welcome-mark", "aria-hidden": "true" }),
        el("h3", {}, ["Faculty schedules are ready"]),
        el("p", {}, ["Click a faculty code to generate the individual timetable format."]),
      ]));

      this.setPdfEnabled(false);
    },

    renderTeacherSchedule(code, teacherData) {
      const schedule = teacherData.schedule || [];
      const counts = countKinds(schedule);
      const title = $("#contentTitle");
      const totalHours = teacherData.total_hours || schedule.reduce((sum, entry) => sum + (Number(entry.duration) || 1), 0);

      title.textContent = "";
      title.appendChild(document.createTextNode(teacherData.name || "Faculty timetable"));
      title.appendChild(el("span", { class: "code-pill" }, [code]));

      $("#contentSubtitle").textContent =
        "Formal individual timetable with merged two-hour lab blocks, short recess, and lunch.";

      this.renderSummaryStats([
        { label: "Hours per week", value: totalHours },
        { label: "Lectures", value: counts.lecture },
        { label: "Labs", value: counts.lab },
        { label: "Tutorials", value: counts.tutorial },
      ]);

      const container = $("#timetableContainer");
      container.innerHTML = "";
      container.appendChild(this.buildFacultySheet(code, teacherData));
      this.setPdfEnabled(true);
    },

    buildFacultySheet(code, teacherData) {
      return el("div", { class: "faculty-sheet" }, [
        this.buildFormalTimetable(code, teacherData),
        this.buildLoadTable(teacherData.schedule || []),
      ]);
    },

    buildFormalTimetable(code, teacherData) {
      const schedule = teacherData.schedule || [];
      const matrix = Timetable.buildMatrix(schedule);
      const skipped = Object.fromEntries(DAYS.map((day) => [day, 0]));
      const table = el("table", { class: "formal-tt", "aria-label": "Individual faculty timetable" });
      const tbody = el("tbody");

      tbody.appendChild(el("tr", { class: "sheet-meta-row" }, [
        el("th", { colspan: "2" }, ["A.Y. 2025-26"]),
        el("th", { colspan: "2" }, ["Semester : 2"]),
        el("th", { colspan: "2" }, [`Faculty: ${teacherData.name || code}`]),
        el("th", { colspan: "1" }, [`Code: ${code}`]),
      ]));

      const headerCells = [
        el("th", { class: "day-time-head" }, [
          el("span", { class: "time-label" }, ["Time"]),
          el("span", { class: "day-label" }, ["Day"]),
        ]),
        ...DAYS.map((d) => el("th", { class: "tt-day-head" }, [d])),
      ];
      tbody.appendChild(el("tr", { class: "sheet-day-row" }, headerCells));

      PERIODS.forEach((period) => {
        if (period.type === "break") {
          tbody.appendChild(el("tr", { class: "recess-row" }, [
            el("td", { class: "period-time" }, [period.label]),
            el("td", { class: "recess-cell", colspan: String(DAYS.length) }, [period.title]),
          ]));
          return;
        }

        const slotIndex = slotIndexForKey(period.key);
        const row = el("tr", { class: "period-row" });
        row.appendChild(el("td", { class: "period-time" }, [period.label]));

        DAYS.forEach((day) => {
          if (skipped[day] > 0) {
            skipped[day] -= 1;
            return;
          }

          const entries = matrix[day]?.[period.key] || [];
          if (!entries.length) {
            row.appendChild(el("td", { class: "formal-slot empty" }));
            return;
          }

          const span = Timetable.spanFor(matrix, day, slotIndex, entries);
          const kind = dominantKind(entries);
          const cell = el("td", { class: `formal-slot ${kind}`, rowspan: span > 1 ? String(span) : undefined });

          entries.forEach((entry) => {
            const label = buildEntryLabel(entry);
            const entryDiv = el("div", { class: "formal-entry" }, [
              el("div", { class: "formal-subject" }, [label.subject]),
              label.meta ? el("div", { class: "formal-meta" }, [label.meta]) : false,
              span > 1 ? el("span", { class: "formal-duration" }, [`${span}h`]) : false,
            ]);
            cell.appendChild(entryDiv);
          });

          row.appendChild(cell);
          if (span > 1) skipped[day] = span - 1;
        });

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      return el("div", { class: "formal-tt-scroll" }, [table]);
    },

    buildLoadTable(schedule) {
      const rows = Timetable.loadRows(schedule);
      const table = el("table", { class: "load-table", "aria-label": "Teaching load summary" });
      const tbody = el("tbody");

      tbody.appendChild(el("tr", { class: "load-head-main" }, [
        el("th", { colspan: "2" }, ["Subject"]),
        el("th", { colspan: "2" }, ["Allotted"]),
        el("th", { colspan: "2" }, ["Engaged"]),
        el("th", {}, ["Total"]),
      ]));

      tbody.appendChild(el("tr", { class: "load-head-sub" }, [
        el("th", {}, ["Subject Name"]),
        el("th", {}, ["Class"]),
        el("th", {}, ["L"]),
        el("th", {}, ["P"]),
        el("th", {}, ["L"]),
        el("th", {}, ["P"]),
        el("th", {}, ["Total"]),
      ]));

      rows.forEach((row) => {
        tbody.appendChild(el("tr", {}, [
          el("td", {}, [row.subject]),
          el("td", {}, [row.className]),
          el("td", {}, [String(row.lectures)]),
          el("td", {}, [String(row.practicals)]),
          el("td", {}, [String(row.lectures)]),
          el("td", {}, [String(row.practicals)]),
          el("td", {}, [row.subject ? String(Number(row.lectures) + Number(row.practicals)) : ""]),
        ]));
      });

      table.appendChild(tbody);
      return el("div", { class: "load-table-scroll" }, [table]);
    },
  };

  /* =========================================================
     PDF EXPORTER
     ========================================================= */

  const PDFExporter = {
    exportIndividual(code, teacherData) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const schedule = teacherData.schedule || [];
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();

      doc.setFontSize(11);
      doc.setFont("times", "bold");
      doc.setTextColor(162, 13, 84);

      const headers = ["A.Y. 2025-26", "Semester: 2", `Faculty: ${teacherData.name || code}`, `Code: ${code}`];
      const sectionW = width / headers.length;
      headers.forEach((text, i) => {
        doc.text(text, sectionW * i + sectionW / 2, 14, { align: "center" });
      });

      const { body } = this.buildPdfTimetableBody(schedule);
      const dayHeaders = DAYS;

      doc.autoTable({
        startY: 18,
        head: [["Time / Day", ...dayHeaders]],
        body,
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
          overflow: "linebreak",
          lineWidth: 0.15,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [236, 239, 220],
          textColor: [162, 13, 84],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 36, fontStyle: "bold" },
        },
        didParseCell(data) {
          if (data.section === "body" && data.row.raw) {
            const rawCell = data.row.raw[data.column.index];
            if (rawCell && typeof rawCell === "object" && rawCell.styles?.fillColor) {
              data.cell.styles.fillColor = rawCell.styles.fillColor;
            }
          }
        },
      });

      const loadRows = this.buildPdfLoadRows(schedule);

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 6,
        head: [
          [
            { content: "Subject Name", rowSpan: 2 },
            { content: "Class", rowSpan: 2 },
            { content: "Allotted", colSpan: 2 },
            { content: "Engaged", colSpan: 2 },
            { content: "Total", rowSpan: 2 },
          ],
          ["L", "P", "L", "P"],
        ],
        body: loadRows,
        styles: {
          fontSize: 8,
          cellPadding: 1.8,
          lineWidth: 0.15,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [162, 13, 13],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { halign: "left" },
          1: { halign: "left" },
        },
      });

      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text("Generated by Extractify", width / 2, height - 6, { align: "center" });

      const safeName = String(teacherData.name || "Faculty").replace(/[^\w]+/g, "_");
      doc.save(`Timetable_${code}_${safeName}.pdf`);
    },

    buildPdfTimetableBody(schedule) {
      const matrix = Timetable.buildMatrix(schedule);
      const skipped = Object.fromEntries(DAYS.map((day) => [day, 0]));
      const body = [];

      PERIODS.forEach((period) => {
        if (period.type === "break") {
          body.push([
            { content: period.label, styles: { fontStyle: "bold" } },
            {
              content: period.title,
              colSpan: DAYS.length,
              styles: { fillColor: [217, 217, 217], fontStyle: "bold", halign: "center" },
            },
          ]);
          return;
        }

        const row = [{ content: period.label, styles: { fontStyle: "bold" } }];
        const slotIndex = slotIndexForKey(period.key);

        DAYS.forEach((day) => {
          if (skipped[day] > 0) {
            skipped[day] -= 1;
            return;
          }

          const entries = matrix[day]?.[period.key] || [];
          if (!entries.length) {
            row.push("");
            return;
          }

          const span = Timetable.spanFor(matrix, day, slotIndex, entries);
          const kind = dominantKind(entries);
          const fillColor = kind === "lab"
            ? [230, 245, 239]
            : kind === "tutorial"
              ? [241, 235, 251]
              : [255, 247, 236];
          const content = entries.map((entry) => {
            const label = buildEntryLabel(entry);
            return [label.subject, label.meta].filter(Boolean).join("\n");
          }).join("\n----\n");

          row.push({
            content,
            rowSpan: span > 1 ? span : undefined,
            styles: { fillColor, fontStyle: "bold" },
          });

          if (span > 1) skipped[day] = span - 1;
        });

        body.push(row);
      });

      return { body };
    },

    buildPdfLoadRows(schedule) {
      return Timetable.loadRows(schedule).map((item) => {
        if (item.subject === "") return ["", "", "", "", "", "", ""];

        const lectures = String(item.lectures);
        const practicals = String(item.practicals);
        const total = String(Number(item.lectures) + Number(item.practicals));
        return [item.subject, item.className, lectures, practicals, lectures, practicals, total];
      });
    },
  };

  /* =========================================================
     APP
     ========================================================= */

  const App = {
    init() {
      this.bindUpload();
      this.bindTheme();
      this.bindSearch();
      this.bindPDF();
      this.bindNewUpload();
    },

    bindUpload() {
      const dropzone = $("#dropzone");
      const input = $("#fileInput");

      $("#browseBtn").addEventListener("click", (event) => {
        event.stopPropagation();
        input.click();
      });

      dropzone.addEventListener("click", () => input.click());
      dropzone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.click();
        }
      });

      dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });

      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

      dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
        if (event.dataTransfer.files[0]) this.handleFile(event.dataTransfer.files[0]);
      });

      input.addEventListener("change", (event) => {
        if (event.target.files[0]) this.handleFile(event.target.files[0]);
      });
    },

    bindTheme() {
      const saved = localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") {
        document.documentElement.dataset.theme = saved;
      }
      setThemeButtonState();

      $("#themeToggle").addEventListener("click", () => {
        const current = document.documentElement.dataset.theme;
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("theme", next);
        setThemeButtonState();
      });
    },

    bindSearch() {
      $("#teacherSearch").addEventListener("input", (event) => {
        if (!State.data) return;
        UI.renderTeacherList(this.buildTeacherList(), event.target.value);
      });
    },

    bindPDF() {
      $("#downloadPdfBtn").addEventListener("click", () => {
        if (!State.data || !State.selectedTeacher) {
          UI.toast("Select a faculty code first.");
          return;
        }

        const teacherData = State.data.teachers[State.selectedTeacher];
        PDFExporter.exportIndividual(State.selectedTeacher, teacherData);
        UI.toast(`Downloaded timetable for ${teacherData.name || State.selectedTeacher}.`);
      });
    },

    bindNewUpload() {
      $("#newUploadBtn").addEventListener("click", () => {
        State.data = null;
        State.selectedTeacher = null;
        $("#fileInput").value = "";
        $("#uploadStatus").hidden = true;
        $("#teacherList").innerHTML = "";
        $("#summaryStats").hidden = true;
        $("#warnings").hidden = true;
        UI.showUpload();
      });
    },

    buildTeacherList() {
      return Object.entries(State.data?.teachers || {})
        .map(([code, teacher]) => ({
          code,
          name: teacher.name || "Unnamed faculty",
          slots: teacher.total_classes || teacher.schedule?.length || 0,
          hours: teacher.total_hours || 0,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    },

    async handleFile(file) {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        UI.setSelectedFile(file);
        UI.setStatus("Only .xlsx or .xls files are supported.", "error");
        return;
      }

      UI.setSelectedFile(file);
      UI.setUploading(true);

      // Show the premium processing modal
      ProcessingModal.show();

      try {
        const data = await APIClient.extract(file);

        // Small delay so the animation completes gracefully before transition
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (ProcessingModal.cancelled) return;

        ProcessingModal.hide();
        await new Promise((resolve) => setTimeout(resolve, 380));

        State.data = data;
        State.selectedTeacher = null;

        const teachers = this.buildTeacherList();
        UI.showResults();
        UI.renderWarnings(data.validation);
        UI.renderTeacherList(teachers);
        UI.renderWelcome(data);
        UI.setStatus("Extraction complete.", "success");
        UI.toast(`Found ${teachers.length} faculty members.`);
      } catch (err) {
        console.error(err);
        ProcessingModal.hide();
        UI.setStatus(err.message, "error");
      } finally {
        UI.setUploading(false);
      }
    },

    selectTeacher(code) {
      State.selectedTeacher = code;
      UI.renderTeacherList(this.buildTeacherList(), $("#teacherSearch").value);
      UI.renderTeacherSchedule(code, State.data.teachers[code]);
    },
  };

  document.addEventListener("DOMContentLoaded", () => App.init());
  window.App = App;
  window.TimetableExtractorUI = { App, UI, Timetable, PERIODS, DAYS, State, ProcessingModal };
})();
