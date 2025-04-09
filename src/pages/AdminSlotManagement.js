import React, { useState, useEffect } from 'react';
import { fetchLockedSlots, lockSlot, unlockSlot } from '../services/api';
import './AdminSlotManagement.css';

const AdminSlotManagement = () => {
  const [selectedLab, setSelectedLab] = useState('');
  const [selectedDayOrder, setSelectedDayOrder] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [lockedSlots, setLockedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedLab && selectedDayOrder) {
      fetchLockedSlotsForLab();
    }
  }, [selectedLab, selectedDayOrder]);

  const fetchLockedSlotsForLab = async () => {
    try {
      setLoading(true);
      const slots = await fetchLockedSlots(selectedLab, selectedDayOrder);
      setLockedSlots(slots);
    } catch (error) {
      console.error('Error fetching locked slots:', error);
      setError('Failed to fetch locked slots. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleLockSlot = async () => {
    try {
      setLoading(true);
      await lockSlot({
        lab: selectedLab,
        timeSlot: selectedTimeSlot,
        dayOrder: selectedDayOrder,
        reason: lockReason
      }, 'admin@example.com'); // Replace with actual admin email

      setSuccess('Slot locked successfully');
      setSelectedTimeSlot('');
      setLockReason('');
      await fetchLockedSlotsForLab();
    } catch (error) {
      console.error('Error locking slot:', error);
      setError('Failed to lock slot. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockSlot = async (slotId) => {
    try {
      setLoading(true);
      await unlockSlot(slotId);
      setSuccess('Slot unlocked successfully');
      await fetchLockedSlotsForLab();
    } catch (error) {
      console.error('Error unlocking slot:', error);
      setError('Failed to unlock slot. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-slot-management">
      <h2>Manage Locked Slots</h2>
      <div className="controls">
        <select 
          value={selectedLab} 
          onChange={(e) => setSelectedLab(e.target.value)}
        >
          <option value="">Select Lab</option>
          <option value="LAB A">LAB A</option>
          <option value="LAB B">LAB B</option>
          <option value="LAB C">LAB C</option>
          <option value="LAB D">LAB D</option>
        </select>

        <select 
          value={selectedDayOrder} 
          onChange={(e) => setSelectedDayOrder(e.target.value)}
        >
          <option value="">Select Day Order</option>
          <option value="1">Day 1</option>
          <option value="2">Day 2</option>
          <option value="3">Day 3</option>
          <option value="4">Day 4</option>
          <option value="5">Day 5</option>
        </select>

        <button 
          onClick={() => setSelectedTimeSlot('')}
          disabled={!selectedLab || !selectedDayOrder}
        >
          Lock New Slot
        </button>
      </div>

      {lockedSlots.length > 0 && (
        <div className="locked-slots-list">
          <h4>Locked Slots</h4>
          {lockedSlots.map(slot => (
            <div key={slot.id} className="locked-slot-item">
              <div className="locked-slot-info">
                <span>Time: {slot.time_slot}</span>
                <span>Locked by: {slot.locked_by}</span>
                {slot.reason && <span>Reason: {slot.reason}</span>}
              </div>
              <button 
                onClick={() => handleUnlockSlot(slot.id)}
              >
                Unlock
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedTimeSlot && (
        <div className="lock-slot-modal">
          <h3>Lock Time Slot</h3>
          <select 
            value={selectedTimeSlot} 
            onChange={(e) => setSelectedTimeSlot(e.target.value)}
          >
            <option value="">Select Time Slot</option>
            <option value="08:00-08:50">8:00 AM - 8:50 AM</option>
            <option value="08:50-09:40">8:50 AM - 9:40 AM</option>
            <option value="09:45-10:35">9:45 AM - 10:35 AM</option>
            <option value="10:40-11:30">10:40 AM - 11:30 AM</option>
            <option value="11:35-12:25">11:35 AM - 12:25 PM</option>
            <option value="12:30-01:20">12:30 PM - 1:20 PM</option>
            <option value="01:25-02:15">1:25 PM - 2:15 PM</option>
            <option value="02:20-03:10">2:20 PM - 3:10 PM</option>
            <option value="03:10-04:00">3:10 PM - 4:00 PM</option>
            <option value="04:00-04:50">4:00 PM - 4:50 PM</option>
          </select>
          <textarea
            placeholder="Reason for locking (optional)"
            value={lockReason}
            onChange={(e) => setLockReason(e.target.value)}
          />
          <button 
            onClick={handleLockSlot}
            disabled={!selectedTimeSlot}
          >
            Confirm Lock
          </button>
        </div>
      )}

      {loading && <div>Loading...</div>}
      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default AdminSlotManagement; 