const { loadEnv } = require("../server/config");
loadEnv();
const crypto = require("node:crypto");
const { getDb, initDatabase, createClass, requestJoinClass, approveMembership, saveAssessment, saveSubmission } = require("../server/database");
const { createTenantUser, registerTenantUser } = require("../server/auth-service");

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function seedTenantData(db, config) {
  const { tenantName, adminEmail, teacherEmail, studentEmail, className, testPassword, a1Config, a2Config, submissionConfig } = config;

  // 1. CREATE USERS
  let adminUser;
  try {
    const res = await registerTenantUser({
      tenantName,
      name: "Admin " + tenantName,
      email: adminEmail,
      password: testPassword,
    });
    adminUser = res.user;
    console.log(`[${tenantName}] Created Admin:`, adminUser.email);
  } catch (err) {
    if (err.message === "Email sudah terdaftar") {
      adminUser = await db.get("SELECT * FROM users WHERE email = ?", adminEmail);
      console.log(`[${tenantName}] Admin already exists:`, adminUser.email);
    } else {
      console.error(`[${tenantName}] Error creating admin:`, err);
      return;
    }
  }

  const tenantId = adminUser.tenant_id || adminUser.tenantId;

  let teacher;
  try {
    teacher = await createTenantUser(tenantId, {
      name: "Guru " + tenantName,
      email: teacherEmail,
      password: testPassword,
      role: "teacher"
    });
    console.log(`[${tenantName}] Created Teacher:`, teacher.email);
  } catch (err) {
    if (err.message === "Email sudah terdaftar") {
      teacher = await db.get("SELECT * FROM users WHERE email = ?", teacherEmail);
    }
  }
  teacher.id = teacher.id || teacher.user_id;

  let student;
  try {
    student = await createTenantUser(tenantId, {
      name: "Siswa " + tenantName,
      email: studentEmail,
      password: testPassword,
      role: "student"
    });
    console.log(`[${tenantName}] Created Student:`, student.email);
  } catch (err) {
    if (err.message === "Email sudah terdaftar") {
      student = await db.get("SELECT * FROM users WHERE email = ?", studentEmail);
    }
  }
  student.id = student.id || student.user_id;

  // 2. CREATE CLASSROOM
  let classroom = await db.get("SELECT * FROM classes WHERE tenant_id = ? AND teacher_id = ?", tenantId, teacher.id);
  if (!classroom) {
    classroom = {
      id: uid("class"),
      name: className,
      joinCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
      createdAt: new Date().toISOString()
    };
    await createClass(tenantId, teacher.id, classroom);
    console.log(`[${tenantName}] Created Classroom:`, classroom.name);
  } else {
    classroom.joinCode = classroom.join_code;
    console.log(`[${tenantName}] Classroom already exists:`, classroom.name);
  }

  // 3. CREATE MEMBERSHIP
  let membership = await db.get("SELECT * FROM class_memberships WHERE class_id = ? AND student_id = ?", classroom.id, student.id);
  if (!membership) {
    const memId = uid("member");
    await requestJoinClass(tenantId, student.id, classroom.joinCode, { id: memId, requestedAt: new Date().toISOString() });
    await approveMembership(tenantId, teacher.id, memId);
    console.log(`[${tenantName}] Created and approved Membership for Student`);
  } else {
    console.log(`[${tenantName}] Membership already exists`);
  }

  // 4. CREATE ASSESSMENTS
  const authTeacher = { tenant: { id: tenantId }, user: { id: teacher.id, role: "teacher" } };

  // Assessment 1: Unanswered
  const a1 = {
    id: a1Config.id,
    classId: classroom.id,
    topic: a1Config.topic,
    difficulty: "Pemula",
    status: "published",
    outcomes: a1Config.outcomes,
    rubric: a1Config.rubric,
    timeLimit: 60,
    createdAt: new Date().toISOString(),
    questions: a1Config.questions
  };
  await saveAssessment(authTeacher, a1);
  console.log(`[${tenantName}] Seeded Unanswered Assessment`);

  // Assessment 2: Answered
  const a2 = {
    id: a2Config.id,
    classId: classroom.id,
    topic: a2Config.topic,
    difficulty: "Menengah",
    status: "published",
    outcomes: a2Config.outcomes,
    rubric: a2Config.rubric,
    timeLimit: 0,
    createdAt: new Date().toISOString(),
    questions: a2Config.questions
  };
  await saveAssessment(authTeacher, a2);
  console.log(`[${tenantName}] Seeded Answered Assessment`);

  // 5. CREATE SUBMISSION
  let submission = await db.get("SELECT * FROM submissions WHERE assessment_id = ? AND user_id = ?", a2Config.id, student.id);
  if (!submission) {
    const sub = {
      id: uid("submission"),
      assessmentId: a2Config.id,
      studentName: student.name,
      finalScore: submissionConfig.finalScore,
      submittedAt: new Date().toISOString(),
      questionScores: submissionConfig.questionScores,
      feedback: submissionConfig.feedback
    };
    await saveSubmission(tenantId, student.id, sub);
    console.log(`[${tenantName}] Created Submission`);
  } else {
    console.log(`[${tenantName}] Submission already exists`);
  }
}

async function seedTestAccounts() {
  await initDatabase();
  const db = getDb();
  console.log("Seeding multi-tenant demo data...");

  const testPassword = "password123";

  // TENANT 1: Demo School
  await seedTenantData(db, {
    tenantName: "Demo School",
    adminEmail: "admin@lisan.ai",
    teacherEmail: "guru@lisan.ai",
    studentEmail: "siswa@lisan.ai",
    className: "Kelas Bahasa Inggris X-A",
    testPassword,
    a1Config: {
      id: "assess-seed-perkenalan-diri",
      topic: "Perkenalan Diri (Bahasa Inggris)",
      outcomes: "Siswa mampu memperkenalkan diri dalam bahasa Inggris dasar.",
      rubric: "Kejelasan: 50%, Kosa Kata: 50%",
      questions: [
        { id: "q-seed-intro-1", prompt: "What is your name and where do you live?", focus: "identity", ideal: "I am [Name] and I live in [City]." },
        { id: "q-seed-intro-2", prompt: "What are your hobbies?", focus: "hobby", ideal: "My hobbies are [Hobby 1] and [Hobby 2]." }
      ]
    },
    a2Config: {
      id: "assess-seed-pengalaman-liburan",
      topic: "Pengalaman Liburan (Bahasa Inggris)",
      outcomes: "Siswa mampu menceritakan pengalaman masa lalu menggunakan past tense.",
      rubric: "Past Tense: 40%, Kelancaran: 40%, Kosa Kata: 20%",
      questions: [
        { id: "q-seed-holiday-1", prompt: "Where did you go for your last holiday?", focus: "destination", ideal: "I went to [Place]." },
        { id: "q-seed-holiday-2", prompt: "What did you do there?", focus: "activities", ideal: "I visited [Place] and ate [Food]." },
        { id: "q-seed-holiday-3", prompt: "Did you enjoy it? Why?", focus: "feeling", ideal: "Yes, I enjoyed it because it was fun." }
      ]
    },
    submissionConfig: {
      finalScore: 85,
      questionScores: [
        { question: "Where did you go for your last holiday?", answer: "I went to Bali.", score: 90, strengths: ["Correct past tense"], gaps: [] },
        { question: "What did you do there?", answer: "I go to the beach.", score: 70, strengths: ["Clear vocabulary"], gaps: ["Used present tense instead of past tense"] },
        { question: "Did you enjoy it? Why?", answer: "Yes, because the beach is beautiful.", score: 95, strengths: ["Good reasoning"], gaps: [] }
      ],
      feedback: "Pemahaman past tense sudah cukup baik, perlu sedikit latihan pada kata kerja tidak beraturan."
    }
  });

  // TENANT 2: SMA Bina Nusantara
  await seedTenantData(db, {
    tenantName: "SMA Bina Nusantara",
    adminEmail: "admin.binus@lisan.ai",
    teacherEmail: "guru.binus@lisan.ai",
    studentEmail: "siswa.binus@lisan.ai",
    className: "Kelas Bahasa Indonesia XI-IPA",
    testPassword,
    a1Config: {
      id: "assess-seed-pidato",
      topic: "Pembukaan Pidato Persuasif",
      outcomes: "Siswa mampu menyusun dan melafalkan pembukaan pidato dengan intonasi tepat.",
      rubric: "Intonasi: 40%, Diksi: 40%, Artikulasi: 20%",
      questions: [
        { id: "q-seed-pidato-1", prompt: "Sampaikan salam pembuka dan sapaan penghormatan kepada hadirin.", focus: "salam", ideal: "Assalamu'alaikum/Selamat pagi, yang terhormat Bapak/Ibu guru serta teman-teman yang saya cintai." },
        { id: "q-seed-pidato-2", prompt: "Sampaikan kalimat ucapan syukur sebagai pengantar pidato.", focus: "syukur", ideal: "Pertama-tama marilah kita panjatkan puji syukur ke hadirat Tuhan Yang Maha Esa atas rahmat-Nya." }
      ]
    },
    a2Config: {
      id: "assess-seed-argumentasi",
      topic: "Debat: Dampak Sosial Media",
      outcomes: "Siswa mampu memberikan pendapat yang logis dan menyanggah argumen dengan santun.",
      rubric: "Logika: 50%, Kesantunan Berbahasa: 30%, Kosa Kata: 20%",
      questions: [
        { id: "q-seed-debat-1", prompt: "Apa pendapat utama Anda mengenai penggunaan sosial media pada anak di bawah umur?", focus: "opini", ideal: "Menurut saya, penggunaan sosial media pada anak di bawah umur sebaiknya dibatasi." },
        { id: "q-seed-debat-2", prompt: "Bagaimana cara mencegah dampak negatifnya?", focus: "solusi", ideal: "Cara mencegahnya adalah dengan pengawasan orang tua secara langsung." }
      ]
    },
    submissionConfig: {
      finalScore: 92,
      questionScores: [
        { question: "Apa pendapat utama Anda mengenai penggunaan sosial media pada anak di bawah umur?", answer: "Menurut saya sebaiknya dilarang karena banyak konten tidak mendidik.", score: 95, strengths: ["Opini jelas", "Alasan logis"], gaps: [] },
        { question: "Bagaimana cara mencegah dampak negatifnya?", answer: "Orang tua harus mengawasi anak-anaknya terus.", score: 89, strengths: ["Solusi relevan"], gaps: ["Diksi 'terus' bisa diganti 'secara berkala'"] }
      ],
      feedback: "Kemampuan argumentasi sudah sangat bagus. Pemilihan kata cukup baik."
    }
  });

  console.log("Done seeding multi-tenant demo data!");
}

seedTestAccounts();
