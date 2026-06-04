async function postJson(url, payload, fallbackMessage) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gagal memeriksa session");
  return data;
}

export async function login(payload) {
  return postJson("/api/auth/login", payload, "Login gagal");
}

export async function registerTenant(payload) {
  return postJson("/api/auth/register", payload, "Registrasi gagal");
}

export async function logout() {
  return postJson("/api/auth/logout", {}, "Logout gagal");
}

export async function listUsers() {
  const response = await fetch("/api/users");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gagal memuat user");
  return data.users;
}

export async function createUser(payload) {
  const data = await postJson("/api/users", payload, "Gagal membuat user");
  return data.user;
}

export async function loadStateFromDatabase() {
  const response = await fetch("/api/state");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gagal memuat data dari database");
  return {
    assessments: Array.isArray(data.assessments) ? data.assessments : [],
    submissions: Array.isArray(data.submissions) ? data.submissions : [],
    classes: Array.isArray(data.classes) ? data.classes : [],
    memberships: Array.isArray(data.memberships) ? data.memberships : [],
  };
}

export async function saveAssessmentToDatabase(assessment) {
  await postJson("/api/assessments", assessment, "Gagal menyimpan assessment");
}

export async function saveSubmissionToDatabase(submission) {
  await postJson("/api/submissions", submission, "Gagal menyimpan submission");
}

export async function clearDatabase() {
  const response = await fetch("/api/data", { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gagal reset database");
}

export async function generateQuestionsWithAI(config) {
  const data = await postJson(
    "/api/generate-questions",
    config,
    "Gagal generate soal dengan AI"
  );
  return data.questions;
}

export async function improveQuestionsWithAI(config, questions) {
  const data = await postJson(
    "/api/improve-questions",
    { config, questions },
    "Gagal memperbaiki question set"
  );
  return data.questions;
}

export async function createClassroom(name) {
  const data = await postJson("/api/classes", { name }, "Gagal membuat kelas");
  return data.class;
}

export async function joinClass(joinCode) {
  const data = await postJson("/api/classes/join", { joinCode }, "Gagal join kelas");
  return data.class;
}

export async function approveJoinRequest(membershipId) {
  return postJson("/api/classes/approve", { membershipId }, "Gagal approve siswa");
}

export async function recommendAssessmentConfig(topic, difficulty) {
  const data = await postJson(
    "/api/recommend-assessment-config",
    { topic, difficulty },
    "Gagal membuat rekomendasi kompetensi dan rubrik"
  );
  return data.recommendation;
}

export async function evaluateAssessmentWithAI(assessment, answers, studentName, makeSubmission) {
  const data = await postJson(
    "/api/evaluate",
    { assessment, answers, studentName },
    "Gagal menilai jawaban dengan AI"
  );

  return makeSubmission({
    assessment,
    studentName,
    finalScore: data.evaluation.finalScore,
    questionScores: data.evaluation.questionScores,
    feedback: data.evaluation.feedback,
  });
}
