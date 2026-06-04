import { DEFAULT_QUESTION_COUNT } from "./config.js";
import {
  clearDatabase,
  approveJoinRequest,
  createClassroom,
  createUser,
  evaluateAssessmentWithAI,
  generateQuestionsWithAI,
  getCurrentUser,
  improveQuestionsWithAI,
  joinClass,
  listUsers,
  login,
  logout,
  recommendAssessmentConfig,
  registerTenant,
  saveAssessmentToDatabase,
  saveSubmissionToDatabase,
} from "./api.js";
import { createAssessment, createDemoAssessment, createSubmission, readAssessmentForm } from "./assessment-factory.js";
import { getElements, setButtonLoading } from "./dom.js";
import { evaluateFallbackAssessment, generateFallbackQuestions, recommendFallbackConfig } from "./fallback-assessment.js";
import { createRecorder } from "./recorder.js";
import { renderApp, renderMonitoring, renderQuestion, showResult } from "./render.js";
import { createSession } from "./session.js";
import { loadState } from "./storage.js";

export async function initApp() {
  const els = getElements();
  let auth = await getCurrentUser();
  let state = { assessments: [], submissions: [] };
  let users = [];
  let pendingAssessmentConfig = null;
  let pendingQuestions = [];
  let session = createSession(state);
  const recorder = createRecorder(els);

  async function bootstrapAuthenticatedApp(nextAuth = auth) {
    auth = nextAuth;
    state = await loadState();
    session = createSession(state);
    users = auth.user.role === "admin" ? await loadUsers() : [];
    clearAuthForms();
    showApp();
    applyRoleAccess();
    renderCurrentState();
    renderUsers();
  }

  function showAuth() {
    els.authView.classList.remove("hidden");
    els.appShell.classList.add("hidden");
  }

  function showApp() {
    els.authView.classList.add("hidden");
    els.appShell.classList.remove("hidden");
    els.accountName.textContent = auth.user.name;
    els.tenantName.textContent = auth.tenant.name;
    els.accountRole.textContent = roleLabel(auth.user.role);
  }

  function clearAuthForms() {
    els.loginForm.reset();
    els.registerForm.reset();
  }

  function renderCurrentState() {
    session.ensureAssessmentSelected();
    renderApp(els, state, session);
    renderClasses();
    renderQuestionEditor();
    if (auth.user?.role === "student") {
      els.studentName.value = auth.user.name;
      els.studentName.readOnly = true;
    } else {
      els.studentName.readOnly = false;
    }
  }

  async function loadUsers() {
    try {
      return await listUsers();
    } catch (error) {
      alert(`Gagal memuat user tenant: ${error.message}`);
      return [];
    }
  }

  function renderUsers() {
    if (auth.user?.role !== "admin") return;
    const extraUsers = users.filter((user) => user.id !== auth.user.id);
    if (!extraUsers.length) {
      els.userList.className = "list-stack empty-state";
      els.userList.textContent = "Belum ada akun tambahan.";
      return;
    }

    els.userList.className = "list-stack";
    els.userList.innerHTML = extraUsers.map((user) => `
      <article class="submission-item">
        <div>
          <strong>${user.name}</strong>
          <p>${user.email}</p>
        </div>
        <span class="user-role">${roleLabel(user.role)}</span>
      </article>
    `).join("");
  }

  function renderClasses() {
    const isStudent = auth.user?.role === "student";
    els.classForm.classList.toggle("hidden", isStudent);
    els.joinClassForm.classList.toggle("hidden", !isStudent);
    els.pendingJoinList.classList.toggle("hidden", isStudent);

    const usableClasses = state.classes.filter((item) => !isStudent || item.status === "approved");
    els.classSelect.innerHTML = usableClasses.length
      ? usableClasses.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")
      : `<option value="">Belum ada kelas</option>`;

    if (!state.classes.length) {
      els.classList.className = "list-stack empty-state";
      els.classList.textContent = isStudent ? "Belum join kelas." : "Belum ada kelas.";
    } else {
      els.classList.className = "list-stack";
      els.classList.innerHTML = state.classes.map((item) => `
        <article class="submission-item">
          <div>
            <strong>${item.name}</strong>
            <p>Kode: ${item.join_code || item.joinCode || "-"} - ${item.status}</p>
          </div>
        </article>
      `).join("");
    }

    if (isStudent) {
      if (!state.classes.length) {
        els.studentClassList.className = "list-stack empty-state";
        els.studentClassList.textContent = "Belum join kelas.";
      } else {
        els.studentClassList.className = "list-stack";
        els.studentClassList.innerHTML = state.classes.map((item) => `
          <article class="submission-item">
            <div>
              <strong>${item.name}</strong>
              <p>Status: ${item.status}</p>
            </div>
          </article>
        `).join("");
      }
    }

    const pending = state.memberships.filter((item) => item.status === "pending");
    if (!pending.length) {
      els.pendingJoinList.className = "list-stack empty-state";
      els.pendingJoinList.textContent = "Belum ada request join.";
    } else {
      els.pendingJoinList.className = "list-stack";
      els.pendingJoinList.innerHTML = pending.map((item) => `
        <article class="submission-item">
          <div>
            <strong>${item.student_name}</strong>
            <p>${item.student_email} - ${item.class_name}</p>
          </div>
          <button class="secondary-button approve-join" data-id="${item.id}" type="button">Approve</button>
        </article>
      `).join("");
    }
  }

  function applyRoleAccess() {
    const role = auth.user.role;
    setNavVisibility("teacherView", role !== "student");
    setNavVisibility("monitorView", role !== "student");
    els.adminNav.classList.toggle("hidden", role !== "admin");
    els.resetData.classList.toggle("hidden", role === "student");
    els.seedDemo.classList.toggle("hidden", role === "student");

    if (role === "student") {
      switchView("studentView");
    } else {
      switchView("teacherView");
    }
  }

  function setNavVisibility(viewId, visible) {
    const button = [...els.navButtons].find((item) => item.dataset.view === viewId);
    if (button) button.classList.toggle("hidden", !visible);
  }

  function saveCurrentAnswer() {
    session.saveAnswer(els.answerText.value);
  }

  async function handleAssessmentSubmit(event) {
    event.preventDefault();
    const config = readAssessmentForm(els);
    if (!config.classId) {
      alert("Pilih kelas tujuan terlebih dahulu.");
      return;
    }

    setButtonLoading(event.submitter, true, "Menghubungi AI...", "Generate assessment");
    try {
      const questions = await generateQuestionsWithFallback(config);
      pendingAssessmentConfig = config;
      pendingQuestions = questions;
      renderQuestionEditor();
    } finally {
      setButtonLoading(event.submitter, false, "Menghubungi AI...", "Generate assessment");
    }
  }

  async function savePendingQuestionSet() {
    if (!pendingAssessmentConfig) return;
    syncQuestionsFromEditor();
    const assessment = createAssessment(pendingAssessmentConfig, pendingQuestions);
    await saveAssessmentToDatabase(assessment);
    state.assessments.unshift(assessment);
    session.selectAssessment(assessment.id);
    pendingAssessmentConfig = null;
    pendingQuestions = [];
    els.form.reset();
    els.questionCount.value = DEFAULT_QUESTION_COUNT;
    renderCurrentState();
  }

  async function improvePendingQuestionSet() {
    if (!pendingAssessmentConfig) return;
    syncQuestionsFromEditor();
    setButtonLoading(els.improveQuestionSet, true, "Memperbaiki...", "Perbaiki dengan AI");
    try {
      pendingQuestions = await improveQuestionsWithAI(pendingAssessmentConfig, pendingQuestions);
      renderQuestionEditor();
    } catch (error) {
      alert(error.message);
    } finally {
      setButtonLoading(els.improveQuestionSet, false, "Memperbaiki...", "Perbaiki dengan AI");
    }
  }

  function syncQuestionsFromEditor() {
    pendingQuestions = [...els.editableQuestionList.querySelectorAll(".editable-question")].map((item, index) => ({
      id: pendingQuestions[index]?.id || `q-${index}`,
      prompt: item.querySelector("[data-field='prompt']").value.trim(),
      focus: item.querySelector("[data-field='focus']").value.trim(),
      ideal: item.querySelector("[data-field='ideal']").value.trim(),
    }));
  }

  function renderQuestionEditor() {
    if (!pendingAssessmentConfig) {
      els.questionEditor.classList.add("hidden");
      els.editableQuestionList.innerHTML = "";
      return;
    }
    els.questionEditor.classList.remove("hidden");
    els.editableQuestionList.innerHTML = pendingQuestions.map((question, index) => `
      <article class="feedback-card editable-question">
        <strong>Soal ${index + 1}</strong>
        <label>Pertanyaan<textarea data-field="prompt" rows="3">${question.prompt}</textarea></label>
        <label>Fokus<input data-field="focus" value="${question.focus || ""}" /></label>
        <label>Jawaban ideal<textarea data-field="ideal" rows="3">${question.ideal || ""}</textarea></label>
      </article>
    `).join("");
  }

  async function handleRecommendConfig() {
    await fillRecommendedFields("both");
  }

  async function fillRecommendedFields(target) {
    const topic = els.topic.value.trim();
    if (!topic) {
      alert("Isi topik atau materi terlebih dahulu.");
      els.topic.focus();
      return;
    }

    const button = target === "rubric" ? els.recommendRubric : els.recommendOutcomes;
    const defaultText = target === "rubric" ? "Rekomendasikan rubrik" : "Rekomendasikan kompetensi";
    setButtonLoading(button, true, "Membuat rekomendasi...", defaultText);
    try {
      const recommendation = await recommendConfigWithFallback(topic, els.difficulty.value);
      if (target === "outcomes" || target === "both") els.outcomes.value = recommendation.outcomes;
      if (target === "rubric" || target === "both") els.rubric.value = recommendation.rubric;
    } finally {
      setButtonLoading(button, false, "Membuat rekomendasi...", defaultText);
    }
  }

  async function recommendConfigWithFallback(topic, difficulty) {
    try {
      return await recommendAssessmentConfig(topic, difficulty);
    } catch (error) {
      alert(`AI belum tersedia, memakai rekomendasi lokal. Detail: ${error.message}`);
      return recommendFallbackConfig(topic, difficulty);
    }
  }

  async function generateQuestionsWithFallback(config) {
    try {
      return await generateQuestionsWithAI(config);
    } catch (error) {
      alert(`AI belum tersedia, memakai generator lokal. Detail: ${error.message}`);
      return generateFallbackQuestions(config);
    }
  }

  async function handleFinishAssessment() {
    const assessment = session.getCurrentAssessment();
    if (!assessment) return;

    saveCurrentAnswer();
    const studentName = auth.user.role === "student"
      ? auth.user.name
      : els.studentName.value.trim() || "Siswa tanpa nama";
    setButtonLoading(els.finishAssessment, true, "Menilai dengan AI...", "Selesaikan assessment");

    try {
      const submission = await evaluateWithFallback(assessment, studentName);
      await saveSubmissionToDatabase(submission);
      state.submissions.push(submission);
      renderMonitoring(els, state);
      showResult(els, submission);
    } finally {
      setButtonLoading(els.finishAssessment, false, "Menilai dengan AI...", "Selesaikan assessment");
    }
  }

  async function evaluateWithFallback(assessment, studentName) {
    try {
      return await evaluateAssessmentWithAI(assessment, session.currentAnswers, studentName, createSubmission);
    } catch (error) {
      alert(`AI belum tersedia, memakai penilaian lokal. Detail: ${error.message}`);
      return evaluateFallbackAssessment(assessment, session.currentAnswers, studentName, createSubmission);
    }
  }

  function switchView(viewId) {
    if (!canAccessView(viewId)) return;
    els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
    els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  }

  function canAccessView(viewId) {
    if (!auth.user) return false;
    if (auth.user.role === "student") return viewId === "studentView";
    if (viewId === "accountView") return auth.user.role === "admin";
    return true;
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setButtonLoading(event.submitter, true, "Membuat akun...", "Buat akun");
    try {
      const user = await createUser({
        name: els.userName.value,
        email: els.userEmail.value,
        password: els.userPassword.value,
        role: els.userRole.value,
      });
      users.unshift(user);
      els.userForm.reset();
      renderUsers();
    } catch (error) {
      alert(error.message);
    } finally {
      setButtonLoading(event.submitter, false, "Membuat akun...", "Buat akun");
    }
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setButtonLoading(event.submitter, true, "Login...", "Login");
      try {
        const nextAuth = await login({
          email: els.loginEmail.value,
          password: els.loginPassword.value,
        });
        await bootstrapAuthenticatedApp(nextAuth);
      } catch (error) {
        alert(error.message);
      } finally {
        setButtonLoading(event.submitter, false, "Login...", "Login");
      }
    });

    els.registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setButtonLoading(event.submitter, true, "Membuat tenant...", "Buat tenant");
      try {
        const nextAuth = await registerTenant({
          tenantName: els.registerTenant.value,
          name: els.registerName.value,
          email: els.registerEmail.value,
          password: els.registerPassword.value,
        });
        await bootstrapAuthenticatedApp(nextAuth);
      } catch (error) {
        alert(error.message);
      } finally {
        setButtonLoading(event.submitter, false, "Membuat tenant...", "Buat tenant");
      }
    });

    els.logoutButton.addEventListener("click", async () => {
      await logout();
      auth = { authenticated: false };
      state = { assessments: [], submissions: [] };
      users = [];
      session = createSession(state);
      clearAuthForms();
      showAuth();
    });

    els.navButtons.forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    els.form.addEventListener("submit", handleAssessmentSubmit);
    els.saveQuestionSet.addEventListener("click", savePendingQuestionSet);
    els.improveQuestionSet.addEventListener("click", improvePendingQuestionSet);
    els.userForm.addEventListener("submit", handleCreateUser);
    els.recommendOutcomes.addEventListener("click", () => fillRecommendedFields("outcomes"));
    els.recommendRubric.addEventListener("click", () => fillRecommendedFields("rubric"));

    els.classForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = els.classNameInput.value.trim();
      if (!name) return;
      const classroom = await createClassroom(name);
      state.classes.unshift({ ...classroom, status: "teacher" });
      els.classForm.reset();
      renderCurrentState();
    });

    els.joinClassForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = els.joinCode.value.trim();
      if (!code) return;
      await joinClass(code);
      const nextState = await loadState();
      state.classes = nextState.classes;
      state.assessments = nextState.assessments;
      state.memberships = nextState.memberships;
      els.joinClassForm.reset();
      renderCurrentState();
      alert("Request join terkirim. Tunggu approval guru.");
    });

    els.studentJoinClassForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = els.studentJoinCode.value.trim();
      if (!code) return;
      await joinClass(code);
      const nextState = await loadState();
      state.classes = nextState.classes;
      state.assessments = nextState.assessments;
      state.memberships = nextState.memberships;
      els.studentJoinClassForm.reset();
      renderCurrentState();
      alert("Request join terkirim. Tunggu approval guru.");
    });

    els.pendingJoinList.addEventListener("click", async (event) => {
      const button = event.target.closest(".approve-join");
      if (!button) return;
      await approveJoinRequest(button.dataset.id);
      const nextState = await loadState();
      state.classes = nextState.classes;
      state.memberships = nextState.memberships;
      state.assessments = nextState.assessments;
      renderCurrentState();
    });

    els.studentSelect.addEventListener("change", (event) => {
      recorder.stop();
      session.selectAssessment(event.target.value);
      els.resultPanel.classList.add("hidden");
      renderQuestion(els, session.getCurrentAssessment(), session);
      recorder.resetStatus();
    });

    els.recordButton.addEventListener("click", () => {
      recorder.toggle().catch((error) => {
        els.recordStatus.textContent = error.message || "Mikrofon belum bisa digunakan. Ketik jawaban manual.";
        els.recordButton.classList.remove("recording");
        els.recordButton.disabled = false;
      });
    });

    els.prevQuestion.addEventListener("click", () => {
      recorder.stop();
      saveCurrentAnswer();
      session.goPrevious();
      renderQuestion(els, session.getCurrentAssessment(), session);
      recorder.resetStatus();
    });

    els.saveAnswer.addEventListener("click", () => {
      recorder.stop();
      saveCurrentAnswer();
      session.goNext();
      renderQuestion(els, session.getCurrentAssessment(), session);
      recorder.resetStatus();
    });

    els.finishAssessment.addEventListener("click", handleFinishAssessment);

    els.seedDemo.addEventListener("click", () => {
      if (state.assessments.length) return;
      const assessment = createDemoAssessment(generateFallbackQuestions);
      saveAssessmentToDatabase(assessment)
        .then(() => {
          state.assessments.push(assessment);
          renderCurrentState();
        })
        .catch((error) => alert(`Gagal menyimpan contoh data: ${error.message}`));
    });

    els.resetData.addEventListener("click", async () => {
      if (!confirm("Reset semua assessment dan hasil?")) return;
      await clearDatabase();
      state.assessments = [];
      state.submissions = [];
      session.ensureAssessmentSelected();
      renderCurrentState();
    });
  }

  bindEvents();
  if (auth.authenticated) {
    await bootstrapAuthenticatedApp(auth);
  } else {
    showAuth();
  }
}

function roleLabel(role) {
  return {
    admin: "Admin",
    teacher: "Guru",
    student: "Siswa",
  }[role] || role;
}
