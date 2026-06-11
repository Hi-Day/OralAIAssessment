const {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  deleteSession,
  getSessionUser,
  loginUser,
  registerTenantUser,
} = require("../server/auth-service");
const { initDatabase } = require("../server/database");
const { parseCookies, readJson, sendJson, setCookie } = require("../server/http-utils");

let isDbInitialized = false;

module.exports = async (req, res) => {
  try {
    if (!isDbInitialized) {
      await initDatabase();
      isDbInitialized = true;
    }

    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const action = url.searchParams.get("action");
      if (action === "me") {
        const auth = await getSessionUser(parseCookies(req)[SESSION_COOKIE]);
        return sendJson(res, 200, { authenticated: Boolean(auth), tenant: auth?.tenant || null, user: auth?.user || null });
      }
      return sendJson(res, 404, { error: "Action not found" });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const { action, payload } = body;

      if (action === "register") {
        const auth = await registerTenantUser(payload);
        const session = await createSession(auth.user.id);
        setSessionCookie(res, session.token);
        return sendJson(res, 201, { authenticated: true, tenant: auth.tenant, user: auth.user });
      }

      if (action === "login") {
        const auth = await loginUser(payload);
        const session = await createSession(auth.user.id);
        setSessionCookie(res, session.token);
        return sendJson(res, 200, { authenticated: true, tenant: auth.tenant, user: auth.user });
      }

      if (action === "logout") {
        const token = parseCookies(req)[SESSION_COOKIE];
        if (token) await deleteSession(token);
        setCookie(res, SESSION_COOKIE, "", { maxAge: 0, sameSite: "Lax" });
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: "Action not found" });
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
};

function setSessionCookie(res, token) {
  setCookie(res, SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: "Lax",
  });
}
