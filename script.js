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

  const State = {
    data: null,
    selectedTeacher: null,
  };

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
        el("th", { colspan: "3" }, [`Faculty: ${teacherData.name || "Faculty"} (${code})`]),
      ]));

      tbody.appendChild(el("tr", { class: "sheet-day-row" }, [
        el("th", { class: "day-time-head" }, [
          el("span", { class: "day-label" }, ["Day"]),
          el("span", { class: "time-label" }, ["Time"]),
        ]),
        ...DAYS.map((day) => el("th", {}, [titleCase(day)])),
      ]));

      PERIODS.forEach((period) => {
        const row = el("tr", { class: period.type === "break" ? "recess-row" : "period-row" });
        row.appendChild(el("td", { class: "period-time" }, [period.label]));

        if (period.type === "break") {
          row.appendChild(el("td", { class: "recess-cell", colspan: String(DAYS.length) }, [period.title]));
          tbody.appendChild(row);
          return;
        }

        const slotIndex = slotIndexForKey(period.key);

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
          const cell = el("td", {
            class: `formal-slot ${kind}`,
            rowspan: span > 1 ? String(span) : null,
          });

          entries.forEach((entry) => {
            const label = buildEntryLabel(entry);
            cell.appendChild(el("div", { class: "formal-entry" }, [
              el("div", { class: "formal-subject" }, [label.subject]),
              label.meta ? el("div", { class: "formal-meta" }, [label.meta]) : null,
            ]));
          });

          if (span > 1) {
            skipped[day] = span - 1;
            cell.appendChild(el("div", { class: "formal-duration" }, [`${span} hrs`]));
          }

          row.appendChild(cell);
        });

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      return el("div", { class: "formal-tt-scroll" }, [table]);
    },

    buildLoadTable(schedule) {
      const rows = Timetable.loadRows(schedule);
      const table = el("table", { class: "load-table", "aria-label": "Faculty load summary" });
      const tbody = el("tbody");

      tbody.appendChild(el("tr", { class: "load-head-main" }, [
        el("th", { rowspan: "2" }, ["Name of Subject"]),
        el("th", { rowspan: "2" }, ["Class"]),
        el("th", { colspan: "2" }, ["Load"]),
        el("th", { colspan: "2" }, ["Sub Total Load"]),
        el("th", { rowspan: "2" }, ["Total"]),
      ]));

      tbody.appendChild(el("tr", { class: "load-head-sub" }, [
        el("th", {}, ["Lectures"]),
        el("th", {}, ["Practical"]),
        el("th", {}, ["Lectures"]),
        el("th", {}, ["Practical"]),
      ]));

      rows.forEach((item) => {
        const lectures = item.lectures === "" ? "" : String(item.lectures);
        const practicals = item.practicals === "" ? "" : String(item.practicals);
        const total = item.lectures === "" ? "" : String(Number(item.lectures) + Number(item.practicals));

        tbody.appendChild(el("tr", {}, [
          el("td", {}, [item.subject]),
          el("td", {}, [item.className]),
          el("td", {}, [lectures]),
          el("td", {}, [practicals]),
          el("td", {}, [lectures]),
          el("td", {}, [practicals]),
          el("td", {}, [total]),
        ]));
      });

      table.appendChild(tbody);
      return el("div", { class: "load-table-scroll" }, [table]);
    },
  };

  const PDFExporter = {
    exportIndividual(code, teacherData) {
      if (!window.jspdf?.jsPDF) {
        UI.toast("PDF tools are still loading. Try again in a moment.");
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      if (typeof doc.autoTable !== "function") {
        UI.toast("PDF table tools are still loading. Try again in a moment.");
        return;
      }

      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const schedule = teacherData.schedule || [];

      doc.setFont("times", "normal");
      doc.setTextColor(17, 17, 17);
      doc.setFontSize(11);
      doc.text("Individual Faculty Timetable", 14, 12);

      const timetable = this.buildPdfTimetableBody(schedule);
      doc.autoTable({
        head: [
          [
            { content: "A.Y. 2025-26", colSpan: 2 },
            { content: "Semester : 2", colSpan: 2 },
            { content: `Faculty: ${teacherData.name || "Faculty"} (${code})`, colSpan: 3 },
          ],
          ["Day / Time", ...DAYS.map(titleCase)],
        ],
        body: timetable.body,
        startY: 18,
        theme: "grid",
        styles: {
          font: "times",
          fontSize: 8,
          cellPadding: 1.5,
          halign: "center",
          valign: "middle",
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [236, 239, 220],
          textColor: [162, 13, 84],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 34, fontStyle: "bold" },
        },
      });

      doc.autoTable({
        head: [
          [
            { content: "Name of Subject", rowSpan: 2 },
            { content: "Class", rowSpan: 2 },
            { content: "Load", colSpan: 2 },
            { content: "Sub Total Load", colSpan: 2 },
            { content: "Total", rowSpan: 2 },
          ],
          ["Lectures", "Practical", "Lectures", "Practical"],
        ],
        body: this.buildPdfLoadRows(schedule),
        startY: doc.lastAutoTable.finalY + 8,
        theme: "grid",
        styles: {
          font: "times",
          fontSize: 8,
          cellPadding: 1.5,
          halign: "center",
          lineColor: [0, 0, 0],
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
      doc.text("Generated by Timetable Extractor Pro", width / 2, height - 6, { align: "center" });

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
      UI.setStatus(`Extracting ${file.name}...`);

      try {
        const data = await APIClient.extract(file);
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
  window.TimetableExtractorUI = { App, UI, Timetable, PERIODS, DAYS, State };
})();
