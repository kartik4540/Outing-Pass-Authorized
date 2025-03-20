import React from 'react';
import './Schedule.css';

const Schedule = () => {
  return (
    <main>
      <section id="lab-schedules">
        <h2>Lab Schedules</h2>
        <article>
          <h3>Morning Schedule</h3>
          <ul>
            <li>8:00 AM - 9:45 AM: Operating Systems Lab (3rd Year CSE)</li>
            <li>9:45 AM - 11:30 AM: Full Stack Web Development Lab (2nd Year IT)</li>
          </ul>
        </article>

        <article>
          <h3>Afternoon Schedule</h3>
          <ul>
            <li>1:30 PM - 3:10 PM: Data Structures and Algorithms Lab (1st Year CSE)</li>
            <li>3:10 PM - 5:00 PM: Linux Lab (2nd Year ECE)</li>
          </ul>
        </article>

        <article>
          <h3>Specialized Labs Schedule</h3>
          <ul>
            <li>8:00 AM - 9:45 AM: Packet Tracer Lab (3rd Year EEE)</li>
            <li>9:45 AM - 11:30 AM: Advanced Networking Lab (4th Year CSE)</li>
            <li>1:30 PM - 3:10 PM: Machine Learning Lab (3rd Year CSE)</li>
            <li>3:10 PM - 5:00 PM: Cloud Computing Lab (4th Year IT)</li>
          </ul>
        </article>
      </section>
    </main>
  );
};

export default Schedule; 