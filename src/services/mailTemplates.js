// Email templates for parent notifications

export function getStatusUpdateEmail(booking, statusMsg) {
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
        <li><b>Reason:</b> ${booking.reason}</li>
      </ul>
      <p>
  If you have any questions, please contact your ward's respective hostel administration. <br>
  Contact details are available at: <a href="https://www.srmist.edu.in/srm-hostels/">https://www.srmist.edu.in/srm-hostels/</a> <br>
  <b><i>This is an automated message. Please do not reply.</i></b>
</p>
    `
  };
}

export function getStillOutAlertEmail(booking) {
  return {
    subject: 'Alert: Your ward is still out',
    html: `
      <p>
  If you have any questions, please contact your ward's respective hostel administration. <br>
  Contact details are available at: <a href="https://www.srmist.edu.in/srm-hostels/">https://www.srmist.edu.in/srm-hostels/</a> <br>
  <b><i>This is an automated message. Please do not reply.</i></b>
</p>
    `
  };
}

export function getNowOutEmail(booking, wardenEmail) {
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
        <li><b>Reason:</b> ${booking.reason}</li>
      </ul>
  If you have any questions, please contact your ward's respective hostel administration. <br>
  Contact details are available at: <a href="https://www.srmist.edu.in/srm-hostels/">https://www.srmist.edu.in/srm-hostels/</a> <br>
  <b><i>This is an automated message. Please do not reply.</i></b>
</p>
    `
  };
}

export function getReturnedEmail(booking) {
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
        <li><b>Reason:</b> ${booking.reason}</li>
      </ul>
      <p>
  If you have any questions, please contact your ward's respective hostel administration. <br>
  Contact details are available at: <a href="https://www.srmist.edu.in/srm-hostels/">https://www.srmist.edu.in/srm-hostels/</a> <br>
  <b><i>This is an automated message. Please do not reply.</i></b>
</p>

    `
  };
} 
