// Cloudflare Worker example: validates Turnstile server-side, then forwards email payload.
// Replace forward section with your provider (Resend, Mailgun, custom API, etc.).

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_content_type" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const body = await request.json();
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
      return new Response(JSON.stringify({ ok: false, error: "bot_detected" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    if (!nombre || !email || !turnstileToken) {
      return new Response(JSON.stringify({ ok: false, error: "missing_fields" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "";
    const turnstileForm = new FormData();
    turnstileForm.append("secret", env.TURNSTILE_SECRET_KEY);
    turnstileForm.append("response", turnstileToken);
    if (ip) {
      turnstileForm.append("remoteip", ip);
    }

    const verifyResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: turnstileForm
    });

    const verifyJson = await verifyResp.json();
    if (!verifyJson.success) {
      return new Response(JSON.stringify({ ok: false, error: "turnstile_failed", details: verifyJson["error-codes"] || [] }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    // TODO: Forward payload to your mail provider.
    // Example placeholder response:
    const acceptedPayload = { nombre, email, telefono, horario, message };

    return new Response(JSON.stringify({ ok: true, accepted: acceptedPayload }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
};
