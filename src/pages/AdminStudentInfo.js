import React, { useEffect, useState, useMemo, useCallback, useReducer } from 'react';
import { addOrUpdateStudentInfo, fetchAllStudentInfo, deleteStudentInfo, banStudent, fetchAdminInfoByEmail, fetchAllBans, deleteBan } from '../services/api';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const initialState = {
  studentInfo: [],
  editing: null,
  form: { student_email: '', hostel_name: '', parent_email: '', parent_phone: '' },
  loading: false,
  error: '',
  success: '',
  search: '',
  searchQuery: '',
  searchActive: false,
  adminEmail: '',
  adminRole: '',
  uploadMessage: '',
  uploadError: '',
  banModal: { open: false, info: null, from: '', till: '', reason: '' },
  banStatuses: {},
  unbanLoading: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_FORM_FIELD':
      return { ...state, form: { ...state.form, [action.field]: action.value } };
    case 'START_EDIT':
      return { ...state, editing: action.payload.id, form: action.payload.form, success: '', error: '' };
    case 'START_ADD_NEW':
      return { ...state, editing: 'new', form: initialState.form, success: '', error: '' };
    case 'CANCEL_EDIT':
      return { ...state, editing: null, form: initialState.form, success: '', error: '' };
    case 'SAVE_SUCCESS':
      return { ...state, loading: false, success: 'Student info saved!', editing: null, form: initialState.form };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_SUCCESS':
      return { ...state, loading: false, success: action.payload };
    case 'OPEN_BAN_MODAL':
      return { ...state, banModal: { open: true, info: action.payload, from: '', till: '', reason: '' } };
    case 'CLOSE_BAN_MODAL':
      return { ...state, banModal: { open: false, info: null, from: '', till: '', reason: '' } };
    case 'SET_BAN_MODAL_FIELD':
      return { ...state, banModal: { ...state.banModal, [action.field]: action.value } };
    default:
      return state;
  }
}

const AdminStudentInfo = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    studentInfo, editing, form, loading, error, success, search, searchQuery, searchActive, adminEmail,
    adminRole, uploadMessage, uploadError, banModal, banStatuses, unbanLoading
  } = state;

  const fetchBans = useCallback(async () => {
    const allBans = await fetchAllBans();
    const statuses = {};
    for (const ban of allBans) {
      if (!statuses[ban.student_email]) {
        statuses[ban.student_email] = ban;
      }
    }
    dispatch({ type: 'SET_FIELD', field: 'banStatuses', value: statuses });
  }, []);

  const loadStudentInfo = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
    try {
      const data = await fetchAllStudentInfo();
      dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: data || [] });
      await fetchBans();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to fetch student info' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [fetchBans]);

  useEffect(() => {
    loadStudentInfo();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      dispatch({ type: 'SET_FIELD', field: 'adminEmail', value: user?.email || '' });
      if (user?.email) {
        const adminInfo = await fetchAdminInfoByEmail(user.email);
        dispatch({ type: 'SET_FIELD', field: 'adminRole', value: adminInfo?.role || '' });
      }
    });
  }, [loadStudentInfo]);

  const handleEdit = useCallback((info) => {
    dispatch({
      type: 'START_EDIT',
      payload: {
        id: info.id,
        form: {
          student_email: info.student_email,
          hostel_name: info.hostel_name,
          parent_email: info.parent_email,
          parent_phone: info.parent_phone || ''
        }
      }
    });
  }, []);

  const handleAddNew = useCallback(() => {
    dispatch({ type: 'START_ADD_NEW' });
  }, []);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, []);

  const handleChange = useCallback((e) => {
    dispatch({ type: 'SET_FORM_FIELD', field: e.target.name, value: e.target.value });
  }, []);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'success', value: '' });
    try {
      await addOrUpdateStudentInfo(form, adminEmail);
      dispatch({ type: 'SAVE_SUCCESS' });
      await loadStudentInfo();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to save student info' });
    }
  }, [form, adminEmail, loadStudentInfo]);

  const handleDelete = useCallback(async (info) => {
    if (!window.confirm(`Are you sure you want to delete info for ${info.student_email}?`)) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'success', value: '' });
    try {
      await deleteStudentInfo(info.student_email);
      dispatch({ type: 'SET_SUCCESS', payload: 'Student info deleted!' });
      await loadStudentInfo();
    } catch (err)
      {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to delete student info' });
    }
  }, [loadStudentInfo]);

  const handleExcelUpload = async (event) => {
    dispatch({ type: 'SET_FIELD', field: 'uploadMessage', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'uploadError', value: '' });
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
          await addOrUpdateStudentInfo(info);
          successCount++;
        } catch (e) {
          errorCount++;
        }
      } else {
        errorCount++;
      }
    }
    loadStudentInfo();
    if (successCount > 0) dispatch({ type: 'SET_FIELD', field: 'uploadMessage', value: `${successCount} row(s) added/updated successfully.` });
    if (errorCount > 0) dispatch({ type: 'SET_FIELD', field: 'uploadError', value: `${errorCount} row(s) failed to add/update.` });
  };

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
    dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'success', value: '' });
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
      dispatch({ type: 'CLOSE_BAN_MODAL' });
      await fetchBans();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to ban student' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleUnban = useCallback(async (student_email) => {
    if (!banStatuses[student_email]) return;
    dispatch({ type: 'SET_FIELD', field: 'unbanLoading', value: { ...unbanLoading, [student_email]: true } });
    try {
      await deleteBan(banStatuses[student_email].id);
      await fetchBans();
      dispatch({ type: 'SET_SUCCESS', payload: 'Student unbanned successfully!' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to unban student' });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'unbanLoading', value: { ...unbanLoading, [student_email]: false } });
    }
  }, [banStatuses, fetchBans, unbanLoading]);

  const handleEditFactory = useCallback((info) => () => handleEdit(info), [handleEdit]);
  const handleDeleteFactory = useCallback((info) => () => handleDelete(info), [handleDelete]);
  const handleBanModalFactory = useCallback((info) => () => dispatch({ type: 'OPEN_BAN_MODAL', payload: info }), []);
  const handleUnbanFactory = useCallback((email) => () => handleUnban(email), [handleUnban]);

  // Search handlers
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    dispatch({ type: 'SET_FIELD', field: 'searchQuery', value });
    // Auto-activate search if 4+ characters
    if (value.length >= 4) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
    } else if (value.length === 0) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: false });
    }
  }, []);

  const handleSearchKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
    }
  }, [searchQuery]);

  const handleSearchClick = useCallback(() => {
    if (searchQuery.trim()) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
    }
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'searchActive', value: false });
  }, []);

  const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];

  const filteredInfo = useMemo(() => {
    let filtered = studentInfo.filter(info => {
      if (wardenLoggedIn && wardenHostels.length > 0) {
        return wardenHostels.map(h => h.trim().toLowerCase()).includes((info.hostel_name || '').trim().toLowerCase());
      }
      return true;
    });

    // Apply search filter if search is active - only search through student email
    if (searchActive && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(info => 
        info.student_email && info.student_email.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [studentInfo, searchQuery, searchActive, wardenLoggedIn, wardenHostels]);

  return (
    <div className="admin-student-info-page" style={{ maxWidth: '100%', marginLeft: 0, padding: 24 }}>
      <h2>{wardenLoggedIn ? 'Warden: Student Info (View Only)' : 'Admin: Student Info Management'}</h2>
      
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by student email..."
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyPress={handleSearchKeyPress}
          style={{ marginBottom: 16, width: '100%', padding: 8, fontSize: 16 }}
        />
        <button 
          onClick={handleSearchClick}
          disabled={!searchQuery.trim()}
          style={{ marginRight: 8, padding: '8px 16px' }}
        >
          Search
        </button>
        {searchActive && (
          <button 
            onClick={handleClearSearch}
            style={{ padding: '8px 16px' }}
          >
            Clear
          </button>
        )}
      </div>
      
      {searchActive && (
        <div style={{ marginBottom: 16, padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
          <span>Searching for email: "{searchQuery}" ({filteredInfo.length} results)</span>
        </div>
      )}
      
      {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {uploadMessage && <div style={{ color: 'green', marginBottom: 8 }}>{uploadMessage}</div>}
      {uploadError && <div style={{ color: 'red', marginBottom: 8 }}>{uploadError}</div>}
      {adminRole !== 'superadmin' && !wardenLoggedIn && (
        <div style={{ color: 'orange', marginBottom: 16, fontWeight: 'bold' }}>
          Only the super warden can add or edit student data.
        </div>
      )}
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
      <div style={{ width: '100%', overflowX: 'auto', marginBottom: 24, textAlign: 'left' }}>
        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: 8 }}>Student Email</th>
            <th style={{ border: '1px solid #ccc', padding: 8 }}>Hostel Name</th>
            <th style={{ border: '1px solid #ccc', padding: 8 }}>Parent Email</th>
            <th style={{ border: '1px solid #ccc', padding: 8 }}>Parent Phone</th>
            <th style={{ border: '1px solid #ccc', padding: 8 }}>Last Edited By</th>
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
                {adminRole === 'superadmin' && !wardenLoggedIn && (
                <td style={{ border: '1px solid #ccc', padding: 8, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={handleEditFactory(info)} style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}>Edit</button>
                    <button onClick={handleDeleteFactory(info)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Delete</button>
                    <button onClick={handleBanModalFactory(info)} style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }}>Ban</button>
                    {banStatuses[info.student_email] && (
                      <>
                        <span style={{ background: '#dc3545', color: 'white', borderRadius: 4, padding: '4px 10px', fontWeight: 600, marginLeft: 4 }}>BANNED</span>
                        <button onClick={handleUnbanFactory(info.student_email)} style={{ background: '#388e3c', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s' }} disabled={unbanLoading[info.student_email]}>
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
        <input type="date" value={banModal.from} onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'from', value: e.target.value })} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Till:</label><br />
        <input type="date" value={banModal.till} onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'till', value: e.target.value })} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Reason (Optional):</label><br />
        <textarea 
          value={banModal.reason} 
          onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'reason', value: e.target.value })}
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
          onClick={() => dispatch({ type: 'CLOSE_BAN_MODAL' })}
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