import React from 'react';
import './Instructors.css';

const Instructors = () => {
  return (
    <main>
      <section id="lab-schedules">
        <h2>Lab Schedules and Faculty</h2>

        <article>
          <h3>Morning Schedule</h3>
          <ul>
            <li>8:00 AM - 9:45 AM: Operating Systems Lab (3rd Year CSE)</li>
            <p>Professor In-Charge: Dr. Anjali Sharma</p>
            <p>Faculty: Prof. Ravi Verma</p>

            <li>9:45 AM - 11:30 AM: Full Stack Web Development Lab (2nd Year IT)</li>
            <p>Professor In-Charge: Dr. Pankaj Gupta</p>
            <p>Faculty: Prof. Meera Singh</p>
          </ul>
        </article>

        <article>
          <h3>Afternoon Schedule</h3>
          <ul>
            <li>1:30 PM - 3:10 PM: Data Structures and Algorithms Lab (1st Year CSE)</li>
            <p>Professor In-Charge: Dr. Rajesh Kumar</p>
            <p>Faculty: Prof. Ankit Patil</p>

            <li>3:10 PM - 5:00 PM: Linux Lab (2nd Year ECE)</li>
            <p>Professor In-Charge: Dr. Kavita Mishra</p>
            <p>Faculty: Prof. Neha Jain</p>
          </ul>
        </article>

        <article>
          <h3>Specialized Labs Schedule</h3>
          <ul>
            <li>8:00 AM - 9:45 AM: Packet Tracer Lab (3rd Year EEE)</li>
            <p>Professor In-Charge: Dr. Alok Mathur</p>
            <p>Faculty: Prof. Shreya Deshmukh</p>

            <li>9:45 AM - 11:30 AM: Advanced Networking Lab (4th Year CSE)</li>
            <p>Professor In-Charge: Dr. Anurag Sharma</p>
            <p>Faculty: Prof. Jyoti Bansal</p>

            <li>1:30 PM - 3:10 PM: Machine Learning Lab (3rd Year CSE)</li>
            <p>Professor In-Charge: Dr. Deepak Kaur</p>
            <p>Faculty: Prof. Vishal Rao</p>

            <li>3:10 PM - 5:00 PM: Cloud Computing Lab (4th Year IT)</li>
            <p>Professor In-Charge: Dr. Ritu Malhotra</p>
            <p>Faculty: Prof. Abhishek Sinha</p>
          </ul>
        </article>
      </section>
    </main>
  );
};

export default Instructors; 