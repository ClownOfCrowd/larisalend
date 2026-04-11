// Cloudflare Worker endpoint template.
// 1) Validates Turnstile server-side.
// 2) Blocks honeypot and invalid payloads.
// 3) Forwards accepted leads to FormSubmit (or replace with your provider).

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, request);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ ok: false, error: "missing_turnstile_secret" }, 500, request);
    }

    const body = await parseRequestBody(request);
    if (!body) {
      return json({ ok: false, error: "invalid_body" }, 400, request);
    }

    const {
      nombre,
      email,
      telefono,
      horario,
      message,
      turnstileToken,
      honeypot
    } = body || {};

    if (honeypot) {
      return json({ ok: false, error: "bot_detected" }, 400, request);
    }

    const cleanName = String(nombre || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanToken = String(turnstileToken || "").trim();
    const cleanPhone = String(telefono || "").trim();
    const cleanTime = String(horario || "").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanName || !cleanEmail || !cleanToken) {
      return json({ ok: false, error: "missing_fields" }, 400, request);
    }

    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!isEmailValid) {
      return json({ ok: false, error: "invalid_email" }, 400, request);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "";
    const turnstileForm = new FormData();
    turnstileForm.append("secret", env.TURNSTILE_SECRET_KEY);
    turnstileForm.append("response", cleanToken);
    if (ip) {
      turnstileForm.append("remoteip", ip);
    }

    const verifyResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: turnstileForm
    });

    const verifyJson = await verifyResp.json();
    if (!verifyJson.success) {
      return json({ ok: false, error: "turnstile_failed", details: verifyJson["error-codes"] || [] }, 403, request);
    }

    const targetEmail = String(env.FORM_TARGET_EMAIL || "info@inmolarisa.com").trim();
    const classicForwardUrl = `https://formsubmit.co/${targetEmail}`;
    const ajaxForwardUrl = `https://formsubmit.co/ajax/${targetEmail}`;

    const lead = {
      nombre: cleanName,
      email: cleanEmail,
      telefono: cleanPhone,
      horario: cleanTime,
      message: cleanMessage,
      source: String(body.site || "").trim() || "riudecanyesvilla.com",
      lang: String(body.lang || "").trim() || "es"
    };

    const forwardPayload = new URLSearchParams();
    forwardPayload.set("nombre", lead.nombre);
    forwardPayload.set("email", lead.email);
    forwardPayload.set("telefono", lead.telefono);
    forwardPayload.set("horario", lead.horario);
    forwardPayload.set("message", lead.message);
    forwardPayload.set("site", lead.source);
    forwardPayload.set("lang", lead.lang);
    forwardPayload.set("_subject", "Nueva solicitud desde riudecanyesvilla.com (Worker)");
    forwardPayload.set("_template", "table");
    forwardPayload.set("_captcha", "false");
    forwardPayload.set("_next", "https://www.riudecanyesvilla.com/");

    let forwardResp = await fetch(classicForwardUrl, {
      method: "POST",
      body: forwardPayload.toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      }
    });

    if (!forwardResp.ok) {
      const fallbackResp = await fetch(ajaxForwardUrl, {
        method: "POST",
        body: JSON.stringify({
          nombre: lead.nombre,
          email: lead.email,
          telefono: lead.telefono,
          horario: lead.horario,
          message: lead.message,
          site: lead.source,
          lang: lead.lang,
          _subject: "Nueva solicitud desde riudecanyesvilla.com (Worker)",
          _template: "table",
          _captcha: "false"
        }),
        headers: {
          "content-type": "application/json",
          Accept: "application/json"
        }
      });

      if (!fallbackResp.ok) {
        const upstreamBodyPrimary = await safeText(forwardResp);
        const upstreamBodyFallback = await safeText(fallbackResp);
        return json({
          ok: false,
          error: "forwarding_failed",
          status: fallbackResp.status,
          upstreamPrimaryStatus: forwardResp.status,
          upstreamPrimary: upstreamBodyPrimary,
          upstreamFallback: upstreamBodyFallback
        }, 502, request);
      }

      forwardResp = fallbackResp;
    }

    return json({ ok: true }, 200, request);
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin"
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request)
  });
}

async function parseRequestBody(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      return await request.json();
    }

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      return Object.fromEntries(form.entries());
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function safeText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}
