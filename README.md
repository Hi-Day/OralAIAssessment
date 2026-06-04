# OralAI Assessment

Platform assessment lisan berbasis AI untuk guru dan siswa dengan multi-tenant, kelas, approval join, speech input, dan evaluasi berbasis rubrik.

## Fitur Utama

- Auth multi-role: admin, guru, siswa
- Multi-tenant: data tenant terpisah
- Guru membuat kelas dengan kode join
- Siswa request join kelas
- Guru approve siswa sebelum assessment terlihat
- Assessment hanya muncul pada kelas yang sesuai
- AI generate soal dari topik, kompetensi, rubrik, dan tingkat kesulitan
- Guru bisa edit question set secara manual sebelum publish
- Guru bisa meminta AI memperbaiki seluruh question set
- Siswa menjawab secara lisan atau mengetik transkripsi manual
- AI mengevaluasi jawaban berdasarkan rubrik
- SQLite lokal untuk data aplikasi

## Setup Lokal

1. Install dependency:

```powershell
npm install
```

2. Buat file `.env` dari template:

```powershell
Copy-Item .env.example .env
```

3. Isi `OPENROUTER_API_KEY` di `.env`.

4. Jalankan server:

```powershell
npm start
```

5. Buka:

```txt
http://127.0.0.1:4173
```

## Akun Test Lokal

Jika database lokal yang sudah dibuat masih ada, akun demo:

```txt
Admin
Email: auth932352@example.com
Password: password123
```

```txt
Guru
Email: guru.demo@oralai.test
Password: password123
```

```txt
Siswa
Email: siswa.demo@oralai.test
Password: password123
```

Jika `data/oralai.db` dihapus, buat tenant baru dari halaman register.

## Data dan Keamanan

- `.env` tidak boleh di-commit.
- Database lokal tersimpan di `data/oralai.db`.
- Session memakai cookie HttpOnly.
- Password disimpan dengan hash `scrypt`.
- API assessment, kelas, user, dan submission diproteksi oleh role.

## Catatan Produksi Berikutnya

- Tambahkan reset password dan email verification.
- Tambahkan CSRF token untuk request state-changing.
- Tambahkan rate limit login dan API AI.
- Tambahkan billing/plan quota per tenant.
- Tambahkan export report CSV/PDF.
- Tambahkan test suite otomatis.
