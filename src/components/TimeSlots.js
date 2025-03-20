import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const TimeSlots = ({ selectedDate, selectedLab, onSlotSelect }) => {
  const [availableSlots, setAvailableSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const timeSlots = [
    "08:00-08:50",
    "08:50-09:40",
    "09:45-10:35",
    "10:40-11:30",
    "11:35-12:25",
    "12:30-01:20",
    "01:25-02:15",
    "02:20-03:10",
    "03:10-04:00",
    "04:00-04:50"
  ];

  useEffect(() => {
    if (selectedDate && selectedLab) {
      fetchAvailableSlots();
    }
  }, [selectedDate, selectedLab]);

  const fetchAvailableSlots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/available-seats?date=${selectedDate}&lab=${selectedLab}`);
      const data = await response.json();
      setAvailableSlots(data);
    } catch (error) {
      console.error('Error fetching available slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSlotClick = (slot) => {
    if (availableSlots[slot] === true) {
      setSelectedSlot(slot);
      onSlotSelect(slot);
    }
  };

  const getSlotColor = (slot) => {
    if (loading) return '#f0f0f0';
    if (availableSlots[slot] === false) return '#ffcdd2';
    if (slot === selectedSlot) return '#c8e6c9';
    return '#ffffff';
  };

  return (
    <div className="time-slots-container">
      <table className="time-slots-table">
        <thead>
          <tr>
            <th>Time Slot</th>
            <th>Available Seats</th>
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr
              key={slot}
              onClick={() => handleSlotClick(slot)}
              style={{ backgroundColor: getSlotColor(slot) }}
              className={`slot-row ${availableSlots[slot] === false ? 'disabled' : ''}`}
            >
              <td>{slot}</td>
              <td>{loading ? '...' : availableSlots[slot] === true ? 'Available' : 'Booked'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .time-slots-container {
          margin: 20px 0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .time-slots-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }
        .time-slots-table th {
          background: #1a73e8;
          color: white;
          padding: 12px;
          text-align: left;
        }
        .time-slots-table td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }
        .slot-row {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .slot-row:hover:not(.disabled) {
          background-color: #f5f5f5 !important;
        }
        .slot-row.disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        @media (max-width: 600px) {
          .time-slots-table {
            font-size: 14px;
          }
          .time-slots-table td,
          .time-slots-table th {
            padding: 8px;
          }
        }
      `}</style>
    </div>
  );
};

export default TimeSlots; 