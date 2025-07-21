import React, { useReducer, useState, useEffect, useMemo, useCallback } from 'react';
import { addOrUpdateStudentInfo, fetchAllStudentInfo, deleteStudentInfo, banStudent, fetchAdminInfoByEmail, fetchAllBans, deleteBan } from '../services/api';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

// Define initial state and reducer
const initialState = {
  form: { student_email: '', hostel_name: '', parent_email: '', parent_phone: '' },
  loading: false,
  error: '',
  success: '',
  uploadMessage: '',
  uploadError: '',
  banModal: { open: false, info: null, from: '', till: '', reason: '' },
  unbanLoading: {},
};
function reducer(state, action) {
  switch (action.type) {
    case 'SET_FORM':
      return { ...state, form: { ...state.form, ...action.payload } };
    case 'RESET_FORM':
      return { ...state, form: { ...initialState.form, ...action.payload } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_SUCCESS':
      return { ...state, success: action.payload };
    case 'SET_UPLOAD_MESSAGE':
      return { ...state, uploadMessage: action.payload };
    case 'SET_UPLOAD_ERROR':
      return { ...state, uploadError: action.payload };
    case 'SET_BAN_MODAL':
      return { ...state, banModal: { ...state.banModal, ...action.payload } };
    case 'SET_UNBAN_LOADING':
      return { ...state, unbanLoading: { ...state.unbanLoading, ...action.payload } };
    default:
      return state;
  }
}

const AdminStudentInfo = () => {
  const [studentInfo, setStudentInfo] = useState([]);
  const [editing, setEditing] = useState(null); // id or null
  const [search, setSearch] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [banStatuses, setBanStatuses] = useState({}); // { student_email: banObject or null }

  const [state, dispatch] = useReducer(reducer, initialState);
  const { form, loading, error, success, uploadMessage, uploadError, banModal, unbanLoading } = state;

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

  const fetchBans = useCallback(async () => {
    const allBans = await fetchAllBans();
    const statuses = {};
    for (const ban of allBans) {
      if (!statuses[ban.student_email]) {
        statuses[ban.student_email] = ban;
      }
    }
    setBanStatuses(statuses);
  }, []);

  const loadStudentInfo = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    try {
      const data = await fetchAllStudentInfo();
      console.log('Fetched student info:', data); // DEBUG LOG
      setStudentInfo(data || []);
      await fetchBans(); // Call fetchBans after loading student info
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to fetch student info' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleEdit = useCallback((info) => {
    setEditing(info.id);
    dispatch({ type: 'SET_FORM', payload: { student_email: info.student_email, hostel_name: info.hostel_name, parent_email: info.parent_email, parent_phone: info.parent_phone || '' } });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    dispatch({ type: 'SET_ERROR', payload: '' });
  }, []);

  const handleAddNew = useCallback(() => {
    setEditing('new');
    dispatch({ type: 'RESET_FORM', payload: { student_email: '', hostel_name: '', parent_email: '', parent_phone: '' } });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    dispatch({ type: 'SET_ERROR', payload: '' });
  }, []);

  const handleCancel = useCallback(() => {
    setEditing(null);
    dispatch({ type: 'RESET_FORM', payload: { student_email: '', hostel_name: '', parent_email: '', parent_phone: '' } });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    dispatch({ type: 'SET_ERROR', payload: '' });
  }, []);

  const handleChange = useCallback((e) => {
    dispatch({ type: 'SET_FORM', payload: { [e.target.name]: e.target.value } });
  }, []);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    try {
      const upsertResult = await addOrUpdateStudentInfo(form, adminEmail);
      console.log('Upsert result:', upsertResult); // DEBUG LOG
      dispatch({ type: 'SET_SUCCESS', payload: 'Student info saved!' });
      setEditing(null);
      dispatch({ type: 'RESET_FORM', payload: { student_email: '', hostel_name: '', parent_email: '', parent_phone: '' } });
      await loadStudentInfo();
      await fetchBans(); // Call fetchBans after saving
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to save student info' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [form, adminEmail]);

  // Add delete handler
  const handleDelete = useCallback(async (info) => {
    if (!window.confirm(`Are you sure you want to delete info for ${info.student_email}?`)) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    try {
      await deleteStudentInfo(info.student_email); // You need to implement this in your API
      dispatch({ type: 'SET_SUCCESS', payload: 'Student info deleted!' });
      await loadStudentInfo();
      await fetchBans(); // Call fetchBans after deleting
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to delete student info' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Add this handler inside the component
  const handleExcelUpload = async (event) => {
    dispatch({ type: 'SET_UPLOAD_MESSAGE', payload: '' });
    dispatch({ type: 'SET_UPLOAD_ERROR', payload: '' });
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
    if (successCount > 0) dispatch({ type: 'SET_UPLOAD_MESSAGE', payload: `${successCount} row(s) added/updated successfully.` });
    if (errorCount > 0) dispatch({ type: 'SET_UPLOAD_ERROR', payload: `${errorCount} row(s) failed to add/update.` });
  };

  // Add ban handler
  const handleBanSubmit = async () => {
    if (!banModal.from || !banModal.till) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select both From and Till dates' });
      return;
    }

    if (new Date(banModal.from) > new Date(banModal.till)) {
      dispatch({ type: 'SET_ERROR', payload: 'From date cannot be after Till date' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });

    try {
      const banData = {
        student_email: banModal.info.student_email,
        from_date: banModal.from,
        till_date: banModal.till,
        reason: banModal.reason || null,
        banned_by: adminEmail
      };

      await banStudent(banData);
      dispatch({ type: 'SET_SUCCESS', payload: `Student ${banModal.info.student_email} has been banned from ${banModal.from} to ${banModal.till}` });
      dispatch({ type: 'SET_BAN_MODAL', payload: { open: false, info: null, from: '', till: '', reason: '' } });
      await fetchBans(); // Call fetchBans after banning
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to ban student' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleUnban = useCallback(async (student_email) => {
    if (!banStatuses[student_email]) return;
    dispatch({ type: 'SET_UNBAN_LOADING', payload: { [student_email]: true } });
    try {
      await deleteBan(banStatuses[student_email].id);
      await fetchBans(); // Call fetchBans after unbanning
      dispatch({ type: 'SET_SUCCESS', payload: 'Student unbanned successfully!' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to unban student' });
    } finally {
      dispatch({ type: 'SET_UNBAN_LOADING', payload: { [student_email]: false } });
    }
  }, [banStatuses, fetchBans]);

  const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];

  // Filtered list based on search and warden hostel
  const filteredInfo = useMemo(() => studentInfo.filter(info => {
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
  }), [studentInfo, search, wardenLoggedIn, wardenHostels]);

  console.log('banStatuses:', banStatuses); // DEBUG LOG

  // Memoize all handlers
  const handleEditCb = useCallback((info) => () => handleEdit(info), [handleEdit]);
  const handleDeleteCb = useCallback((info) => () => handleDelete(info), [handleDelete]);
  const handleAddNewCb = useCallback(() => handleAddNew(), [handleAddNew]);
  const handleCancelCb = useCallback(() => handleCancel(), [handleCancel]);
  const handleChangeCb = useCallback((e) => handleChange(e), [handleChange]);
  const handleSaveCb = useCallback((e) => handleSave(e), [handleSave]);
  const handleUnbanCb = useCallback((email) => () => handleUnban(email), [handleUnban]);
  const setBanModalCb = useCallback((info) => () => dispatch({ type: 'SET_BAN_MODAL', payload: { open: true, info, from: '', till: '', reason: '' } }), [dispatch]);

  return (
    <div className="admin-student-info-page" style={{ maxWidth: '100%', marginLeft: 0, padding: 24 }}>
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
        <button onClick={handleAddNewCb} style={{ marginBottom: 16 }}>Add New Student Info</button>
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
      <div style={{ width: '100%', overflowX: 'auto', marginBottom: 24, textAlign: 'left' }}>
        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
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
                <input name="student_email" value={form.student_email} onChange={handleChangeCb} placeholder="Student Email" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="hostel_name" value={form.hostel_name} onChange={handleChangeCb} placeholder="Hostel Name" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="parent_email" value={form.parent_email} onChange={handleChangeCb} placeholder="Parent Email" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <input name="parent_phone" value={form.parent_phone} onChange={handleChangeCb} placeholder="Parent Phone" />
              </td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}></td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <button onClick={handleSaveCb} disabled={loading}>Save</button>
                <button onClick={handleCancelCb} style={{ marginLeft: 8 }}>Cancel</button>
              </td>
            </tr>
          )}
          {filteredInfo.map((info) => (
            adminRole === 'superadmin' && !wardenLoggedIn && editing === info.id ? (
              <tr key={info.id}>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="student_email" value={form.student_email} onChange={handleChangeCb} disabled />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="hostel_name" value={form.hostel_name} onChange={handleChangeCb} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="parent_email" value={form.parent_email} onChange={handleChangeCb} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <input name="parent_phone" value={form.parent_phone} onChange={handleChangeCb} />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{info.updated_by || info.created_by || ''}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <button onClick={handleSaveCb} disabled={loading}>Save</button>
                  <button onClick={handleCancelCb} style={{ marginLeft: 8 }}>Cancel</button>
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
                <td style={{ border: '1px solid #ccc', padding: 8, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={handleEditCb(info)} style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}>Edit</button>
                    <button onClick={handleDeleteCb(info)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Delete</button>
                    <button onClick={setBanModalCb(info)} style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Ban</button>
                    {banStatuses[info.student_email] && (
                      <>
                        <span style={{ background: '#dc3545', color: 'white', borderRadius: 4, padding: '4px 10px', fontWeight: 600, marginLeft: 4 }}>BANNED</span>
                        <button onClick={handleUnbanCb(info.student_email)} style={{ background: '#388e3c', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }} disabled={unbanLoading[info.student_email]}>
                          {unbanLoading[info.student_email] ? 'Unbanning...' : 'Unban'}
                        </button>
                      </>
                  )}
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
        <input type="date" value={banModal.from} onChange={e => dispatch({ type: 'SET_BAN_MODAL', payload: { ...banModal, from: e.target.value } })} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Till:</label><br />
        <input type="date" value={banModal.till} onChange={e => dispatch({ type: 'SET_BAN_MODAL', payload: { ...banModal, till: e.target.value } })} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Reason (Optional):</label><br />
        <textarea 
          value={banModal.reason} 
          onChange={e => dispatch({ type: 'SET_BAN_MODAL', payload: { ...banModal, reason: e.target.value } })} 
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
          onClick={() => dispatch({ type: 'SET_BAN_MODAL', payload: { ...banModal, open: false, from: '', till: '', reason: '' } })}
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