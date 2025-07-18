import React, { useEffect, useState } from 'react';
import { fetchAllStudentInfo, addOrUpdateStudentInfo, fetchAdminInfoByEmail, deleteStudentInfo } from '../services/api';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const AdminStudentInfo = () => {
  const [studentInfo, setStudentInfo] = useState([]);
  const [editing, setEditing] = useState(null); // id or null
  const [form, setForm] = useState({ student_email: '', hostel_name: '', parent_email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');

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
    });
    setSuccess('');
    setError('');
  };

  const handleAddNew = () => {
    setEditing('new');
    setForm({ student_email: '', hostel_name: '', parent_email: '' });
    setSuccess('');
    setError('');
  };

  const handleCancel = () => {
    setEditing(null);
    setForm({ student_email: '', hostel_name: '', parent_email: '' });
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
      setForm({ student_email: '', hostel_name: '', parent_email: '' });
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
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    <button onClick={() => handleEdit(info)}>Edit</button>
                    <button onClick={() => handleDelete(info)} style={{ marginLeft: 8, color: 'red' }}>Delete</button>
                  </td>
                  )}
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminStudentInfo; 