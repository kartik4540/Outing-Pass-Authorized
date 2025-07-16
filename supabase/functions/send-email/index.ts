// @ts-ignore
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
// @ts-ignore
const BREVO_SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL');

// Email template functions (inline, matching src/services/mailTemplates.js)
function getStatusUpdateEmail(booking, statusMsg) {
  return {
    subject: `Outing Request ${statusMsg}`,
    html: `
      <p>Dear Parent,</p>
      <p>
        This is to inform you that your child <b>${booking.name}</b> (<a href="mailto:${booking.email}">${booking.email}</a>) from <b>${booking.hostel_name}</b> has had their outing request <b>${statusMsg}</b> by the hostel administration.
      </p>
      <ul>
        <li><b>Out Date:</b> ${booking.out_date}</li>
        <li><b>Out Time:</b> ${booking.out_time}</li>
        <li><b>In Date:</b> ${booking.in_date}</li>
        <li><b>In Time:</b> ${booking.in_time}</li>
      </ul>
      <p>
        If you have any questions, please contact the hostel administration.<br>
        <i>This is an automated message. Please do not reply.</i>
      </p>
    `
  };
}

function getStillOutAlertEmail(booking) {
  return {
    subject: 'Alert: Your ward is still out',
    html: `
      <p>Dear Parent,</p>
      <p>Your ward <b>${booking.name}</b> (${booking.email}) from <b>${booking.hostel_name}</b> has not returned by the expected time.</p>
      <p>Please contact the hostel administration for more information.</p>
      <p><i>This is an automated alert.</i></p>
    `
  };
}

function getNowOutEmail(booking, wardenEmail) {
  return {
    subject: 'Outing Update: Student is now out',
    html: `
      <p>Dear Parent,</p>
      <p>Your child <b>${booking.name}</b> (<a href="mailto:${booking.email}">${booking.email}</a>) from <b>${booking.hostel_name}</b> has been <b>let out</b> for an outing by the hostel warden.</p>
      <ul>
        <li><b>Out Date:</b> ${booking.out_date}</li>
        <li><b>Out Time:</b> ${booking.out_time}</li>
        <li><b>In Date:</b> ${booking.in_date}</li>
        <li><b>In Time:</b> ${booking.in_time}</li>
      </ul>
      <p>
        <b>Warden:</b> ${wardenEmail || 'Hostel Warden'}<br>
        If you have any questions, please contact the hostel administration.<br>
        <i>This is an automated message. Please do not reply.</i>
      </p>
    `
  };
}

function getReturnedEmail(booking) {
  return {
    subject: 'Outing Update: Student has returned',
    html: `
      <p>Dear Parent,</p>
      <p>Your child <b>${booking.name}</b> (<a href="mailto:${booking.email}">${booking.email}</a>) from <b>${booking.hostel_name}</b> has <b>returned</b> to the hostel after their outing.</p>
      <ul>
        <li><b>Out Date:</b> ${booking.out_date}</li>
        <li><b>Out Time:</b> ${booking.out_time}</li>
        <li><b>In Date:</b> ${booking.in_date}</li>
        <li><b>In Time:</b> ${booking.in_time}</li>
      </ul>
      <p>
        If you have any questions, please contact the hostel administration.<br>
        <i>This is an automated message. Please do not reply.</i>
      </p>
    `
  };
}

const handler = async (request: Request): Promise<Response> => {
  const urlPath = new URL(request.url).pathname;
  if (urlPath.endsWith("/health")) {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

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

  let to, subject, html, template, booking, statusMsg, wardenEmail;
  try {
    const body = await request.json();
    to = body.to;
    subject = body.subject;
    html = body.html;
    template = body.template;
    booking = body.booking;
    statusMsg = body.statusMsg;
    wardenEmail = body.wardenEmail;
    // If using a template, generate subject/html
    if (template && booking) {
      let tpl;
      switch (template) {
        case 'now_out':
          tpl = getNowOutEmail(booking, wardenEmail);
          break;
        case 'returned':
          tpl = getReturnedEmail(booking);
          break;
        case 'status_update':
          tpl = getStatusUpdateEmail(booking, statusMsg || 'updated');
          break;
        case 'still_out':
          tpl = getStillOutAlertEmail(booking);
          break;
        default:
          return new Response(JSON.stringify({ error: "Unknown template" }), {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
      }
      subject = tpl.subject;
      html = tpl.html;
    }
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

  // Debug logging for env vars
  console.log('BREVO_API_KEY defined:', !!BREVO_API_KEY);
  console.log('BREVO_SENDER_EMAIL:', BREVO_SENDER_EMAIL);

  // Brevo API endpoint
  const url = "https://api.brevo.com/v3/smtp/email";

  const payload = {
    sender: { email: BREVO_SENDER_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY!,
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log('Brevo API status:', res.status);
    console.log('Brevo API response:', text);
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

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