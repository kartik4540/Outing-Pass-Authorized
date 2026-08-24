import React, { useEffect, useState, useMemo, useCallback, useReducer } from 'react';
import { addOrUpdateStudentInfo, fetchAllStudentInfo, searchStudentInfoWithHostels, deleteStudentInfo, banStudent, fetchAdminInfoByEmail, fetchAllBans, deleteBan, downloadStudentInfoTemplate } from '../services/api';
import { supabase } from '../supabaseClient';
import { getWardenContext } from '../utils/wardenHostels';
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
// Simple sessionStorage cache with TTL and tiny LRU behavior
const CACHE_KEY = 'admin_student_info_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 50;
function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { entries: {} };
    return JSON.parse(raw);
  } catch { return { entries: {} }; }
}
function writeCache(cache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}
function setCacheEntry(query, rows) {
  const cache = readCache();
  const now = Date.now();
  cache.entries = cache.entries || {};
  // Evict oldest if exceeding limit
  const keys = Object.keys(cache.entries);
  if (keys.length >= CACHE_MAX_ENTRIES) {
    let oldestKey = keys[0];
    let oldestTs = cache.entries[oldestKey]?.ts || now;
    for (const k of keys) {
      const ts = cache.entries[k]?.ts || now;
      if (ts < oldestTs) { oldestTs = ts; oldestKey = k; }
    }
    delete cache.entries[oldestKey];
  }
  cache.entries[query] = { ts: now, rows };
  writeCache(cache);
}
function getCacheEntry(query) {
  const cache = readCache();
  const entry = cache.entries?.[query];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.rows || null;
}
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
// Hardcoded list of allowed hostel names
const ALLOWED_HOSTEL_NAMES = [
  'Adhiyaman',
  'Agasthiyar',
  'Avvaiyar',
  'Began',
  'Esq A',
  'Esq B',
  'Esq-A',
  'Esq-B',
  'Esqb',
  'Green Pearl - B (Off Campus)',
  'Ja Block (Off Campus)',
  'Kaari',
  'Kalpana Chawla',
  'Malligai',
  'Manoranjitham',
  'Mblock',
  'Meenakshi',
  'Mullai',
  'N Block',
  'Nelson Mandela',
  'Oori',
  'Paari',
  'Sannasi A',
  'Sannasi C',
  'Senbagam',
  'Thamarai'
];

const AdminStudentInfo = ({ isWarden, wardenHostels: propWardenHostels }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    studentInfo, editing, form, loading, error, success, search, searchQuery, searchActive, adminEmail,
    adminRole, uploadMessage, uploadError, banModal, banStatuses, unbanLoading
  } = state;
  // Resolve warden context (props take priority over sessionStorage)
  const { wardenLoggedIn, wardenHostels } = getWardenContext(propWardenHostels);
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
  const searchStudentInfo = useCallback(async (searchQuery) => {
    if (searchQuery.length < 6) {
      dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: [] });
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
    try {
      // Determine allowed hostels for server-side filtering (use resolved wardenLoggedIn)
      const allowedHostels = ((wardenLoggedIn || isWarden) && wardenHostels && wardenHostels.length > 0) 
        ? wardenHostels 
        : undefined;
      // Auto-append domain for fast, precise search when first 6 chars are entered
      let term = (searchQuery || '').trim();
      if (term.length >= 6 && !term.includes('@')) {
        term = `${term}@srmist.edu.in`;
      }
      // Cache-first: show cached result immediately if fresh
      const cached = getCacheEntry(term);
      if (cached) {
        dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: cached });
      }
      // Reflect the effective query in UI
      dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: term });
      // Use server-side search with hostel filtering
      const result = await searchStudentInfoWithHostels(term, allowedHostels, { page: 1, pageSize: 25, minimal: true, includeCount: false });
      const rows = Array.isArray(result) ? result : (result?.rows || []);
      dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: rows });
      setCacheEntry(term, rows);
      await fetchBans();
    } catch (err) {
      const msg = String(err.message || 'Failed to search student info');
      const hint = msg.includes('statement timeout') ? ' Tip: refine the email (e.g., full address) to reduce results.' : '';
      dispatch({ type: 'SET_ERROR', payload: msg + hint });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [fetchBans, isWarden, wardenHostels]);
  useEffect(() => {
    // Only initialize admin info, don't load student data
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      dispatch({ type: 'SET_FIELD', field: 'adminEmail', value: user?.email || '' });
      if (user?.email) {
        const adminInfo = await fetchAdminInfoByEmail(user.email);
        dispatch({ type: 'SET_FIELD', field: 'adminRole', value: adminInfo?.role || '' });
      }
    });
  }, []);
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
  // Download template handler
  const handleDownloadTemplate = useCallback(async () => {
    try {
      dispatch({ type: 'SET_FIELD', field: 'error', value: '' });
      await downloadStudentInfoTemplate();
      dispatch({ type: 'SET_SUCCESS', payload: 'Template downloaded successfully!' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to download template' });
    }
  }, []);
  // Search handlers
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    dispatch({ type: 'SET_FIELD', field: 'searchQuery', value });
    // Clear results if less than 6 characters
    if (value.length < 6) {
      dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: false });
    }
    // Debounce search
    if (window.__asi_search_timer) clearTimeout(window.__asi_search_timer);
    window.__asi_search_timer = setTimeout(() => {
      if (value.trim().length >= 6) {
        dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
        searchStudentInfo(value.trim());
      }
    }, 300);
  }, []);
  const handleSearchKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && searchQuery.trim().length >= 6) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
      searchStudentInfo(searchQuery.trim());
    }
  }, [searchQuery, searchStudentInfo]);
  const handleSearchClick = useCallback(() => {
    if (searchQuery.trim().length >= 6) {
      dispatch({ type: 'SET_FIELD', field: 'searchActive', value: true });
      searchStudentInfo(searchQuery.trim());
    }
  }, [searchQuery, searchStudentInfo]);
  const handleClearSearch = useCallback(() => {
    dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'searchActive', value: false });
    dispatch({ type: 'SET_FIELD', field: 'studentInfo', value: [] });
  }, []);
  // wardenLoggedIn is resolved via getWardenContext earlier
  const filteredInfo = useMemo(() => {
    // No client-side filtering needed - server handles everything
    let filtered = studentInfo;
    // Apply search filter if search is active - only search through student email
    if (searchActive && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(info => 
        info.student_email && info.student_email.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [studentInfo, searchQuery, searchActive]);
  return (
    <div className="admin-student-info-page" style={{ 
      maxWidth: '100%', 
      marginLeft: 0, 
      padding: 24,
      overflowX: 'hidden' // Prevent horizontal overflow
    }}>
      <h2>{wardenLoggedIn ? 'Warden: Student Info (View Only)' : 'Admin: Student Info Management'}</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by student email (minimum 6 characters)..."
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyPress={handleSearchKeyPress}
          style={{ marginBottom: 16, width: '100%', padding: 8, fontSize: 16 }}
        />
        <button 
          onClick={handleSearchClick}
          disabled={searchQuery.trim().length < 6}
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
      {!searchActive && (
        <div className="info-notice">
          <p>Enter at least 6 characters in the search box to find student information.</p>
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
        <div style={{ 
          display: 'flex', 
          gap: 16, 
          alignItems: 'center', 
          marginBottom: 8,
          flexWrap: 'wrap' // Allow wrapping on mobile
        }}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
          <button 
            onClick={handleDownloadTemplate}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: 4, 
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap' // Prevent button text wrapping
            }}
          >
            📥 Download Template
          </button>
        </div>
        <span style={{ fontSize: 12, color: '#888' }}>
          Upload Excel/CSV with columns: Student Email, Hostel Name, Parent Email, Parent Phone
        </span>
        
        {/* Hostel Names Reference */}
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffc107',
          borderRadius: 6,
          fontSize: 13
        }}>
          <strong style={{ color: '#856404', display: 'block', marginBottom: 8 }}>
            ⚠️ IMPORTANT: Use exact hostel names from this list:
          </strong>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: '8px',
            color: '#856404',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '8px',
            backgroundColor: '#fff',
            borderRadius: '4px'
          }}>
            <span>✓ Adhiyaman</span>
            <span>✓ Agasthiyar</span>
            <span>✓ Avvaiyar</span>
            <span>✓ Began</span>
            <span>✓ Esq A</span>
            <span>✓ Esq B</span>
            <span>✓ Esq-A</span>
            <span>✓ Esq-B</span>
            <span>✓ Esqb</span>
            <span>✓ Green Pearl - B (Off Campus)</span>
            <span>✓ Ja Block (Off Campus)</span>
            <span>✓ Kaari</span>
            <span>✓ Kalpana Chawla</span>
            <span>✓ Malligai</span>
            <span>✓ Manoranjitham</span>
            <span>✓ Mblock</span>
            <span>✓ Meenakshi</span>
            <span>✓ Mullai</span>
            <span>✓ N Block</span>
            <span>✓ Nelson Mandela</span>
            <span>✓ Oori</span>
            <span>✓ Paari</span>
            <span>✓ Sannasi A</span>
            <span>✓ Sannasi C</span>
            <span>✓ Senbagam</span>
            <span>✓ Thamarai</span>
          </div>
          <small style={{ display: 'block', marginTop: 8, color: '#856404', fontStyle: 'italic' }}>
            Copy-paste these names exactly (case-sensitive) when filling the Excel template.
          </small>
        </div>
      </div>
      )}
      <div style={{ 
        width: '100%', 
        marginBottom: 24, 
        textAlign: 'left',
        overflowX: 'auto', // Allow horizontal scroll only if needed
        WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          textAlign: 'left',
          tableLayout: 'fixed',
          minWidth: window.innerWidth <= 768 ? '100%' : 'auto' // Responsive width
        }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: 8, width: '20%', wordWrap: 'break-word' }}>Student Email</th>
            <th style={{ border: '1px solid #ccc', padding: 8, width: '15%', wordWrap: 'break-word' }}>Hostel Name</th>
            <th style={{ border: '1px solid #ccc', padding: 8, width: '20%', wordWrap: 'break-word' }}>Parent Email</th>
            <th style={{ border: '1px solid #ccc', padding: 8, width: '15%', wordWrap: 'break-word' }}>Parent Phone</th>
            <th style={{ border: '1px solid #ccc', padding: 8, width: '15%', wordWrap: 'break-word' }}>Last Edited By</th>
              {adminRole === 'superadmin' && !wardenLoggedIn && (
            <th style={{ border: '1px solid #ccc', padding: 8, width: '15%', wordWrap: 'break-word' }}>Actions</th>
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
                  <select name="hostel_name" value={form.hostel_name} onChange={handleChange}>
                    <option value="">Select hostel...</option>
                    {ALLOWED_HOSTEL_NAMES.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
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
                  <select name="hostel_name" value={form.hostel_name} onChange={handleChange}>
                    <option value="">Select hostel...</option>
                    {ALLOWED_HOSTEL_NAMES.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
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
                <td style={{ border: '1px solid #ccc', padding: 8, wordWrap: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.student_email}</td>
                <td style={{ border: '1px solid #ccc', padding: 8, wordWrap: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.hostel_name}</td>
                <td style={{ border: '1px solid #ccc', padding: 8, wordWrap: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.parent_email}</td>
                <td style={{ border: '1px solid #ccc', padding: 8, wordWrap: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.parent_phone || 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: 8, wordWrap: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.updated_by || info.created_by || ''}</td>
                {adminRole === 'superadmin' && !wardenLoggedIn && (
                <td style={{ border: '1px solid #ccc', padding: 8, display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleEditFactory(info)} style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s', fontSize: '12px' }}>Edit</button>
                    <button onClick={handleDeleteFactory(info)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s', fontSize: '12px' }}>Delete</button>
                    {(adminRole === 'superadmin' || isWarden || wardenLoggedIn) && (
                      <button onClick={handleBanModalFactory(info)} style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s', fontSize: '12px' }}>Ban</button>
                    )}
                    {banStatuses[info.student_email] && (
                      <>
                        <span style={{ background: '#dc3545', color: 'white', borderRadius: 4, padding: '2px 6px', fontWeight: 600, marginLeft: 4, fontSize: '10px' }}>BANNED</span>
                        {(adminRole === 'superadmin' || isWarden || wardenLoggedIn) && (
                        <button onClick={handleUnbanFactory(info.student_email)} style={{ background: '#388e3c', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', fontWeight: 500, cursor: 'pointer', marginLeft: 4, transition: 'background 0.2s', fontSize: '12px' }} disabled={unbanLoading[info.student_email]}>
                          {unbanLoading[info.student_email] ? 'Unbanning...' : 'Unban'}
                        </button>
                        )}
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
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} className="modal-overlay">
    <div className="ban-modal-content" style={{ borderRadius: 10, padding: 32, minWidth: 320, position: 'relative' }}>
      <h3 style={{ marginBottom: 18 }}>Ban Student</h3>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>From:</label><br />
        <input type="date" value={banModal.from} onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'from', value: e.target.value })} style={{ padding: 8, borderRadius: 4, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Till:</label><br />
        <input type="date" value={banModal.till} onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'till', value: e.target.value })} style={{ padding: 8, borderRadius: 4, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 500 }}>Reason (Optional):</label><br />
        <textarea 
          value={banModal.reason} 
          onChange={e => dispatch({ type: 'SET_BAN_MODAL_FIELD', field: 'reason', value: e.target.value })}
          placeholder="Enter reason for ban..."
          style={{ padding: 8, borderRadius: 4, width: '100%', minHeight: 60, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button 
          className="btn-ban"
          style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }} 
          onClick={handleBanSubmit}
          disabled={loading}
        >
          {loading ? 'Banning...' : 'Ban'}
        </button>
        <button 
          className="btn-cancel"
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
