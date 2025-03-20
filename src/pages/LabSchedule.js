import React from 'react';
import './LabSchedule.css';

const LabSchedule = () => {
  const scheduleData = [
    { dayOrder: 1, morning: 'Morning Session', afternoon: 'Afternoon Session' },
    { dayOrder: 2, morning: 'Morning Session', afternoon: 'Afternoon Session' },
    { dayOrder: 3, morning: 'Morning Session', afternoon: 'Afternoon Session' },
    { dayOrder: 4, morning: 'Morning Session', afternoon: 'Afternoon Session' },
    { dayOrder: 5, morning: 'Morning Session', afternoon: 'Afternoon Session' },
  ];

  return (
    <div className="lab-schedule">
      <h2>Lab Schedule</h2>
      <div className="schedule-table">
        <table>
          <thead>
            <tr>
              <th>Day Order</th>
              <th>Morning Session (9:00 AM - 12:00 PM)</th>
              <th>Afternoon Session (2:00 PM - 5:00 PM)</th>
            </tr>
          </thead>
          <tbody>
            {scheduleData.map((day) => (
              <tr key={day.dayOrder}>
                <td>{day.dayOrder}</td>
                <td>{day.morning}</td>
                <td>{day.afternoon}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LabSchedule; 