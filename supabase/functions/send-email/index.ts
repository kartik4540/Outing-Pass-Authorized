// @ts-ignore
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
// @ts-ignore
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');

const handler = async (request: Request): Promise<Response> => {
  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  let to, subject, html;
  try {
    const body = await request.json();
    to = body.to;
    subject = body.subject;
    html = body.html;
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid or missing JSON body" }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Mailgun API endpoint
  const url = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;
  const basicAuth = "Basic " + btoa(`api:${MAILGUN_API_KEY}`);

  const formData = new URLSearchParams();
  formData.append("from", `Your App <mailgun@${MAILGUN_DOMAIN}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", html);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": basicAuth,
        "Content-Type": "application/x-www-form-urlencoded",
        "Access-Control-Allow-Origin": "*",
      },
      body: formData.toString(),
    });

    const data = await res.json();

    // Log the response for debugging
    console.log("Mailgun API response:", data);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || "Failed to send email", details: data }), {
        status: 500,
    headers: {
      'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
}
};

// @ts-ignore
Deno.serve(handler);