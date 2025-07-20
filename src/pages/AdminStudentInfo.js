import React, { useEffect, useState } from 'react';
import { addOrUpdateStudentInfo, fetchAllStudentInfo, deleteStudentInfo, banStudent, fetchAdminInfoByEmail } from '../services/api';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const AdminStudentInfo = () => {
  const [studentInfo, setStudentInfo] = useState([]);
  const [editing, setEditing] = useState(null); // id or null
  const [form, setForm] = useState({ student_email: '', hostel_name: '', parent_email: '', parent_phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [banModal, setBanModal] = useState({ open: false, info: null, from: '', till: '', reason: '' });

  useEffect(() => {
    loadStudentInfo();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setAdminEmail(user?.email || '');
      if (user?.email) {
        const adminInfo = await fetchAdminInfoByEmail(user.email);
        setAdminRole(adminInfo?.role || '');
      }
    });
  }, []);

  const loadStudentInfo = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllStudentInfo();
      setStudentInfo(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch student info');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (info) => {
    setEditing(info.id);
    setForm({
      student_email: info.student_email,
      hostel_name: info.hostel_name,
      parent_email: info.parent_email,
      parent_phone: info.parent_phone || ''
    });
    setSuccess('');
    setError('');
  };

  const handleAddNew = () => {
    setEditing('new');
    setForm({ student_email: '', hostel_name: '', parent_email: '', parent_phone: '' });
    setSuccess('');
    setError('');
  };

  const handleCancel = () => {
    setEditing(null);
    setForm({ student_email: '', hostel_name: '', parent_email: '', parent_phone: '' });
    setSuccess('');
    setError('');
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await addOrUpdateStudentInfo(form, adminEmail);
      setSuccess('Student info saved!');
      setEditing(null);
      setForm({ student_email: '', hostel_name: '', parent_email: '', parent_phone: '' });
      await loadStudentInfo();
    } catch (err) {
      setError(err.message || 'Failed to save student info');
    } finally {
      setLoading(false);
    }
  };

  // Add delete handler
  const handleDelete = async (info) => {
    if (!window.confirm(`Are you sure you want to delete info for ${info.student_email}?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await deleteStudentInfo(info.student_email); // You need to implement this in your API
      setSuccess('Student info deleted!');
      await loadStudentInfo();
    } catch (err) {
      setError(err.message || 'Failed to delete student info');
    } finally {
      setLoading(false);
    }
  };

  // Add this handler inside the component
  const handleExcelUpload = async (event) => {
    setUploadMessage('');
    setUploadError('');
    const file = event.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    let successCount = 0;
    let errorCount = 0;
    for (const row of rows) {
      const info = {
        student_email: row.student_email || row["Student Email"],
        hostel_name: row.hostel_name || row["Hostel Name"],
        parent_email: row.parent_email || row["Parent Email"],
        parent_phone: row.parent_phone || row["Parent Phone"],
      };
      if (info.student_email && info.hostel_name && info.parent_email) {
        try {
          await addOrUpdateStudentInfo(info); // Should update if exists
          successCount++;
        } catch (e) {
          errorCount++;
        }
      } else {
        errorCount++;
      }
    }
    loadStudentInfo();
    if (successCount > 0) setUploadMessage(`${successCount} row(s) added/updated successfully.`);
    if (errorCount > 0) setUploadError(`${errorCount} row(s) failed to add/update.`);
  };

  // Add ban handler
  const handleBanSubmit = async () => {
    if (!banModal.from || !banModal.till) {
      setError('Please select both From and Till dates');
      return;
    }

    if (new Date(banModal.from) > new Date(banModal.till)) {
      setError('From date cannot be after Till date');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const banData = {
        student_email: banModal.info.student_email,
        from_date: banModal.from,
        till_date: banModal.till,
        reason: banModal.reason || null,
        banned_by: adminEmail
      };

      await banStudent(banData);
      setSuccess(`Student ${banModal.info.student_email} has been banned from ${banModal.from} to ${banModal.till}`);
      setBanModal({ open: false, info: null, from: '', till: '', reason: '' });
    } catch (err) {
      setError(err.message || 'Failed to ban student');
    } finally {
      setLoading(false);
    }
  };

  const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];

  // Filtered list based on search and warden hostel
  const filteredInfo = studentInfo.filter(info => {
    const q = search.toLowerCase();
    const matchesSearch =
      info.student_email.toLowerCase().includes(q) ||
      info.hostel_name.toLowerCase().includes(q) ||
      (info.parent_email && info.parent_email.toLowerCase().includes(q));
    if (wardenLoggedIn && wardenHostels.length > 0) {
      // Only show students from the warden's hostel(s)
      return matchesSearch && wardenHostels.map(h => h.trim().toLowerCase()).includes((info.hostel_name || '').trim().toLowerCase());
    }
    return matchesSearch;
  });

  return (
    <div className="admin-student-info-page" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h2>{wardenLoggedIn ? 'Warden: Student Info (View Only)' : 'Admin: Student Info Management'}</h2>
      <input
        type="text"
        placeholder="Search by email, hostel, or parent email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, width: '100%', padding: 8, fontSize: 16 }}
      />
      {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {uploadMessage && <div style={{ color: 'green', marginBottom: 8 }}>{uploadMessage}</div>}
      {uploadError && <div style={{ color: 'red', marginBottom: 8 }}>{uploadError}</div>}
      {adminRole !== 'superadmin' && !wardenLoggedIn && (
        <div style={{ color: 'orange', marginBottom: 16, fontWeight: 'bold' }}>
          Only the super warden can add or edit student data.
        </div>
      )}
      {/* Only superadmin and not warden can add/upload */}
      {adminRole === 'superadmin' && !wardenLoggedIn && (
        <button onClick={handleAddNew} style={{ marginBottom: 16 }}>Add New Student Info</button>
      )}
      {adminRole === 'superadmin' && !wardenLoggedIn && (
      <div style={{ marginBottom: 16 }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
        <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
          Upload Excel/CSV with columns: Student Email, Hostel Name, Parent Email, Parent Phone
        </span>
      </div>
      )}
      {/* Responsive table wrapper */}
      <div style={{ width: '100%', overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Student Email</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Hostel Name</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Parent Email</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Parent Phone</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Last Edited By</th>
              {/* Only show Actions column for superadmin and not warden */}
              {adminRole === 'superadmin' && !wardenLoggedIn && (
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {adminRole === 'superadmin' && !wardenLoggedIn && editing === 'new' && (
            <tr>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="student_email" value={form.student_email} onChange={handleChange} placeholder="Student Email" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="hostel_name" value={form.hostel_name} onChange={handleChange} placeholder="Hostel Name" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="parent_email" value={form.parent_email} onChange={handleChange} placeholder="Parent Email" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="parent_phone" value={form.parent_phone} onChange={handleChange} placeholder="Parent Phone" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}></td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <button onClick={handleSave} disabled={loading}>Save</button>
                <button onClick={handleCancel} style={{ marginLeft: 8 }}>Cancel</button>
              </td>
            </tr>
          )}
          {filteredInfo.map((info) => (
            adminRole === 'superadmin' && !wardenLoggedIn && editing === info.id ? (
              <tr key={info.id}>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="student_email" value={form.student_email} onChange={handleChange} disabled />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="hostel_name" value={form.hostel_name} onChange={handleChange} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="parent_email" value={form.parent_email} onChange={handleChange} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="parent_phone" value={form.parent_phone} onChange={handleChange} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.updated_by || info.created_by || ''}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <button onClick={handleSave} disabled={loading}>Save</button>
                  <button onClick={handleCancel} style={{ marginLeft: 8 }}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={info.id}>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.student_email}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.hostel_name}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.parent_email}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.parent_phone || 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.updated_by || info.created_by || ''}</td>
                {/* Only show Actions column for superadmin and not warden */}
                {adminRole === 'superadmin' && !wardenLoggedIn && (
                <td style={{ border: '1px solid #ccc', padding: 8, display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(info)} style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}>Edit</button>
                    <button onClick={() => handleDelete(info)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Delete</button>
                    <button onClick={() => setBanModal({ open: true, info, from: '', till: '', reason: '' })} style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Ban</button>
                  </td>
                  )}
              </tr>
            )
          ))}
        </tbody>
      </table>
      </div>
      {banModal.open && (
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
    <div style={{ background: 'white', borderRadius: 10, padding: 32, minWidth: 320, boxShadow: '0 4px 24px #0002', position: 'relative' }}>
      <h3 style={{ marginBottom: 18 }}>Ban Student</h3>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>From:</label><br />
        <input type="date" value={banModal.from} onChange={e => setBanModal(modal => ({ ...modal, from: e.target.value }))} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Till:</label><br />
        <input type="date" value={banModal.till} onChange={e => setBanModal(modal => ({ ...modal, till: e.target.value }))} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Reason (Optional):</label><br />
        <textarea 
          value={banModal.reason} 
          onChange={e => setBanModal(modal => ({ ...modal, reason: e.target.value }))} 
          placeholder="Enter reason for ban..."
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%', minHeight: 60, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button 
          style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }} 
          onClick={handleBanSubmit}
          disabled={loading}
        >
          {loading ? 'Banning...' : 'Ban'}
        </button>
        <button 
          style={{ background: '#888', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }} 
          onClick={() => setBanModal({ open: false, info: null, from: '', till: '', reason: '' })}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default AdminStudentInfo; 