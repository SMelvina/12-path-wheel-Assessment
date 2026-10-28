# Multidimensional Wheel of Life Assessment

A simple, minimal, responsive web application for the 12-Path Wheel of Life Assessment, built strictly to the specifications of the **Product Requirements Document (PRD)** and the **Revised Assessment Question Bank**.

---

## Key Features

1. **12 Life Paths · 5 Core Questions Per Path (60 Questions Total)**
   - Guided sequential assessment, one question at a time.
   - Progress tracking (`Path X of 12`, `Question Y of 5`, and overall progress bar).
   - Responses preserved when navigating backward and forward.
   - Option to mark conditional paths (Path 3: Marriage) as *Not Applicable* without skewing results or penalizing the user.
2. **Confidential Server-Side Scoring**
   - In accordance with PRD 7.3, scores and results are **never computed or exposed on the client** before completion.
   - Submitted responses are validated on the server. Incomplete submissions cannot access the results dashboard.
3. **Approved Scoring Model**
   - 1–10 rating scale with defined verbal anchors.
   - Path Score = Arithmetic mean of valid responses, displayed to one decimal place.
   - Interpretation bands categorized using unrounded float scores:
     - **Needs Attention**: `1.0 – 3.9`
     - **Developing**: `4.0 – 6.9`
     - **Strong Foundation**: `7.0 – 10.0`
   - **No Overall Life Score**: strictly enforced per PRD Section 5.4.
4. **Visualisation & Results Dashboard**
   - **12-Segment Polar Area Wheel** (SVG) extending outward based on individual domain scores (1–10).
   - **Accessible Data Table Alternative** meeting WCAG 2.1 accessibility standards.
   - **Identified Strong Foundations & Focus Opportunities**.
   - **12 Detailed Breakdown Cards** with evidence-informed interpretation descriptions and actionable reflection prompts.
   - **Print / Save as PDF** support with print-optimized styles.
5. **Zero External Dependencies**
   - Built natively with Node.js built-in modules (`http`, `fs`, `path`, `crypto`).
   - Boots in milliseconds, requires no `npm install`, and runs securely offline.

---

## Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or newer recommended).

### Running the Application
From the project root:

```bash
npm start
```
or
```bash
node server/server.js
```

Open your browser at:
```
http://localhost:3000
```

### Running Automated Tests
The automated test suite covers the scoring engine, band classification boundaries, N/A handling, server-side confidentiality, and incomplete submission rejection:

```bash
npm test
```

---

## Architecture & Code Structure

```
├── data/
│   └── questionBank.json        # 12 approved paths, 60 questions, dimensions & scale
├── server/
│   ├── scoring.js               # Pure, independently tested scoring engine
│   └── server.js                # Zero-dependency HTTP server & confidentiality API
├── public/
│   ├── index.html               # Semantic HTML5 accessible markup
│   ├── styles.css               # Calm, minimal design system & responsive layout
│   └── app.js                   # Client state management, nav, and SVG wheel rendering
├── tests/
│   ├── scoring.test.js          # Unit tests for scoring, boundaries, and bands
│   └── server.test.js           # Integration tests for validation & access protection
└── package.json
```

---

## Privacy & Security
* **Anonymous & Session-Scoped**: No account registration, password, or third-party tracking required.
* **Score Confidentiality**: Direct URL access to results without a completed submission returns an error.

