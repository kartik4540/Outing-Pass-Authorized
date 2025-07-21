import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import debounce from 'lodash.debounce';
import { 
    addOrUpdateStudentInfo, 
    fetchAllStudentInfo, 
    deleteStudentInfo, 
    banStudent, 
    fetchAdminInfoByEmail, 
    fetchAllBans, 
    deleteBan,
    checkAndAutoUnban
} from '../services/api';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { FixedSizeList as List } from 'react-window';

const initialFormState = {
  id: null, student_name: '', student_email: '', student_phone: '', parent_name: '', parent_phone: '', hostel_name: '', room_no: ''
};

const initialState = {
  showForm: false,
  editing: false,
  formInput: initialFormState,
  banModal: { open: false, info: null, from: '', till: '', reason: '' },
};

function uiReducer(state, action) {
  switch (action.type) {
    case 'OPEN_ADD_FORM':
      return { ...state, showForm: true, editing: false, formInput: initialFormState };
    case 'OPEN_EDIT_FORM':
      return { ...state, showForm: true, editing: true, formInput: action.payload };
    case 'CLOSE_FORM':
      return { ...state, showForm: false, editing: false, formInput: initialFormState };
    case 'UPDATE_FORM_INPUT':
      return { ...state, formInput: { ...state.formInput, [action.payload.name]: action.payload.value } };
    case 'OPEN_BAN_MODAL':
      return { ...state, banModal: { ...initialState.banModal, open: true, info: action.payload } };
    case 'CLOSE_BAN_MODAL':
      return { ...state, banModal: initialState.banModal };
    case 'UPDATE_BAN_MODAL_INPUT':
       return { ...state, banModal: { ...state.banModal, [action.payload.name]: action.payload.value } };
    default:
      return state;
  }
}


const AdminStudentInfo = () => {
    const [studentInfo, setStudentInfo] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showUpload, setShowUpload] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [adminRole, setAdminRole] = useState('');
    const [adminHostels, setAdminHostels] = useState([]);
    const [banStatuses, setBanStatuses] = useState({});
    const [unbanLoading, setUnbanLoading] = useState({});
    const [adminEmail, setAdminEmail] = useState('');
    const [toast, setToast] = useState({ message: '', type: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 50; // Or make this configurable

    const [uiState, dispatch] = useReducer(uiReducer, initialState);

    const [filter, setFilter] = useState('');

    const debouncedSetSearchTerm = useCallback(
        debounce((value) => {
            setFilter(value);
        }, 300), // 300ms delay
        []
    );

    const handleSearchChange = (e) => {
        const { value } = e.target;
        setSearchTerm(value);
        debouncedSetSearchTerm(value);
    };


    const fetchInfo = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, count } = await fetchAllStudentInfo(currentPage, pageSize);
            console.log('Fetched student info:', data); // DEBUG LOG
            setStudentInfo(data || []);
            setTotalPages(Math.ceil(count / pageSize));
        } catch (err) {
            setError(err.message || 'Failed to fetch student info');
        } finally {
            setLoading(false);
        }
    }, [currentPage, pageSize]);

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

    useEffect(() => {
        const fetchRoleAndEmail = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                setAdminEmail(user.email);
                const adminInfo = await fetchAdminInfoByEmail(user.email);
                setAdminRole(adminInfo?.role || '');
                setAdminHostels(adminInfo?.hostels || []);
            }
        };
        fetchInfo();
        fetchBans();
        fetchRoleAndEmail();
    }, [fetchInfo, fetchBans]);

    useEffect(() => {
      Object.keys(banStatuses).forEach(email => {
        const isBanned = banStatuses[email];
        if (isBanned) {
          checkAndAutoUnban(email).then(wasUnbanned => {
            if (wasUnbanned) {
              console.log(`Auto-unbanned student: ${email}`);
              fetchBans(); 
            }
          });
        }
      });
    }, [banStatuses, fetchBans]);

    const handleAddNew = useCallback(() => {
        dispatch({ type: 'OPEN_ADD_FORM' });
    }, []);

    const handleEdit = useCallback((info) => {
        dispatch({ type: 'OPEN_EDIT_FORM', payload: info });
    }, []);

    const handleCancel = useCallback(() => {
        dispatch({ type: 'CLOSE_FORM' });
    }, []);

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        dispatch({ type: 'UPDATE_FORM_INPUT', payload: { name, value } });
    }, []);

    const handleSave = useCallback(async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            console.log("Upserting student info:", uiState.formInput);
            const result = await addOrUpdateStudentInfo(uiState.formInput);
            console.log("Upsert result:", result);
            if (result) {
                dispatch({ type: 'CLOSE_FORM' });
                setToast({ message: 'Student info saved successfully!', type: 'success' });
                fetchInfo(); // Refresh student list
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [uiState.formInput, fetchInfo]);

    const handleDelete = useCallback(async (info) => {
        if (!window.confirm(`Are you sure you want to delete info for ${info.student_email}?`)) return;
        setLoading(true);
        setError(null);
        try {
            await deleteStudentInfo(info.student_email); // You need to implement this in your API
            fetchInfo(); // Refresh student list
            fetchBans(); // Call fetchBans after deleting
        } catch (err) {
            setError(err.message || 'Failed to delete student info');
        } finally {
            setLoading(false);
        }
    }, [fetchInfo, fetchBans]);

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
        fetchInfo();
        if (successCount > 0) setToast({ message: `${successCount} row(s) added/updated successfully.`, type: 'success' });
        if (errorCount > 0) setToast({ message: `${errorCount} row(s) failed to add/update.`, type: 'error' });
    };

    const handleBanSubmit = useCallback(async () => {
        if (!uiState.banModal.from || !uiState.banModal.till) {
            setError('Please select both From and Till dates');
            return;
        }

        if (new Date(uiState.banModal.from) > new Date(uiState.banModal.till)) {
            setError('From date cannot be after Till date');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await banStudent({
                student_email: uiState.banModal.info.student_email,
                from_date: uiState.banModal.from,
                till_date: uiState.banModal.till,
                reason: uiState.banModal.reason,
                banned_by: adminEmail,
            });
            dispatch({ type: 'CLOSE_BAN_MODAL' });
            setToast({ message: 'Student banned successfully!', type: 'success' });
            fetchBans(); // Call fetchBans after banning
        } catch (err) {
            setError(err.message || 'Failed to ban student');
        } finally {
            setLoading(false);
        }
    }, [uiState.banModal, fetchBans, adminEmail]);

    const handleUnban = useCallback(async (student_email) => {
        if (!banStatuses[student_email]) return;
        setUnbanLoading(l => ({ ...l, [student_email]: true }));
        try {
          await deleteBan(banStatuses[student_email].id);
          await fetchBans(); // Call fetchBans after unbanning
          setSuccess('Student unbanned successfully!');
        } catch (err) {
          setError(err.message || 'Failed to unban student');
        } finally {
          setUnbanLoading(l => ({ ...l, [student_email]: false }));
        }
    }, [banStatuses, fetchBans]);

    // Add handler factories at the top of the component
    const handleEditFactory = useCallback((info) => () => handleEdit(info), [handleEdit]);
    const handleDeleteFactory = useCallback((info) => () => handleDelete(info), [handleDelete]);
    const handleBanModalFactory = useCallback((info) => () => dispatch({ type: 'OPEN_BAN_MODAL', payload: info }), []);
    const handleUnbanFactory = useCallback((email) => () => handleUnban(email), [handleUnban]);

    const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';

    const filteredInfo = useMemo(() => {
        return studentInfo.filter(info => {
            const studentName = (info.student_name || '').toLowerCase();
            const studentEmail = (info.student_email || '').toLowerCase();
            const hostelName = (info.hostel_name || '').toLowerCase();
            const search = filter.toLowerCase(); // Use the debounced filter state

            // Warden hostel filter
            if (wardenLoggedIn && Array.isArray(adminHostels) && adminHostels.length > 0) {
                if (!adminHostels.map(h => h.toLowerCase()).includes(hostelName)) {
                    return false;
                }
            }
            
            return studentName.includes(search) || studentEmail.includes(search) || hostelName.includes(search);
        });
    }, [studentInfo, filter, wardenLoggedIn, adminHostels]); // Depend on debounced filter

    console.log('banStatuses:', banStatuses); // DEBUG LOG

    const handleShowUpload = useCallback(() => {
        setShowUpload(prev => !prev);
    }, []);

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const Row = ({ index, style }) => {
        const info = filteredInfo[index];
        const isBanned = banStatuses[info.student_email];

        return (
            <div style={style}>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
                    <div style={{ padding: 8, width: '150px', flexShrink: 0 }}>{info.student_name}</div>
                    <div style={{ padding: 8, width: '200px', flexShrink: 0 }}>{info.student_email}</div>
                    <div style={{ padding: 8, width: '120px', flexShrink: 0 }}>{info.student_phone}</div>
                    <div style={{ padding: 8, width: '150px', flexShrink: 0 }}>{info.parent_name}</div>
                    <div style={{ padding: 8, width: '120px', flexShrink: 0 }}>{info.parent_phone}</div>
                    <div style={{ padding: 8, width: '100px', flexShrink: 0 }}>{info.hostel_name}</div>
                    <div style={{ padding: 8, width: '80px', flexShrink: 0 }}>{info.room_no}</div>
                    {adminRole === 'superadmin' && !wardenLoggedIn && (
                        <div style={{ padding: 8, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button onClick={handleEditFactory(info)} style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>Edit</button>
                            <button onClick={handleDeleteFactory(info)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>Delete</button>
                            <button onClick={handleBanModalFactory(info)} style={{ background: '#ff9800', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>Ban</button>
                            {isBanned && (
                                <>
                                    <span style={{ background: '#dc3545', color: 'white', borderRadius: 4, padding: '4px 10px' }}>BANNED</span>
                                    <button onClick={handleUnbanFactory(info.student_email)} style={{ background: '#388e3c', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }} disabled={unbanLoading[info.student_email]}>
                                        {unbanLoading[info.student_email] ? 'Unbanning...' : 'Unban'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Student Information</h1>
            
            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
            
            {toast.message && <div className={`toast ${toast.type}`}>{toast.message}</div>}

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search by name, email, or hostel..."
                    value={searchTerm}
                    onChange={handleSearchChange} // Use the new handler
                    style={{ padding: '0.5rem', width: '300px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <div>
                    {!wardenLoggedIn && (
                        <>
                            <button onClick={handleAddNew} style={{ padding: '0.5rem 1rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>Add New Student</button>
                            <button onClick={handleShowUpload} style={{ padding: '0.5rem 1rem', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                {showUpload ? 'Close Upload' : 'Upload CSV'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showUpload && (
                <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <h3>Upload Student Info CSV</h3>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                      Upload Excel/CSV with columns: Student Email, Hostel Name, Parent Email, Parent Phone
                    </span>
                </div>
            )}

            {uiState.showForm && (
                <div style={{ margin: '2rem 0', padding: '2rem', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <h2>{uiState.editing ? 'Edit Student' : 'Add New Student'}</h2>
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <input type="text" name="student_name" value={uiState.formInput.student_name} onChange={handleChange} placeholder="Student Name" required style={{ padding: '0.5rem' }} />
                            <input type="email" name="student_email" value={uiState.formInput.student_email} onChange={handleChange} placeholder="Student Email" required style={{ padding: '0.5rem' }} />
                            <input type="text" name="student_phone" value={uiState.formInput.student_phone} onChange={handleChange} placeholder="Student Phone" required style={{ padding: '0.5rem' }} />
                            <input type="text" name="parent_name" value={uiState.formInput.parent_name} onChange={handleChange} placeholder="Parent Name" required style={{ padding: '0.5rem' }} />
                            <input type="text" name="parent_phone" value={uiState.formInput.parent_phone} onChange={handleChange} placeholder="Parent Phone" required style={{ padding: '0.5rem' }} />
                            <input type="text" name="hostel_name" value={uiState.formInput.hostel_name} onChange={handleChange} placeholder="Hostel Name" required style={{ padding: '0.5rem' }} />
                            <input type="text" name="room_no" value={uiState.formInput.room_no} onChange={handleChange} placeholder="Room No" required style={{ padding: '0.5rem' }} />
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
                                {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button type="button" onClick={handleCancel} style={{ padding: '0.5rem 1rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ border: '1px solid #ccc' }}>
                {/* Header */}
                <div style={{ display: 'flex', fontWeight: 'bold', background: '#f2f2f2', borderBottom: '1px solid #ccc' }}>
                    <div style={{ padding: 8, width: '150px', flexShrink: 0 }}>Student Name</div>
                    <div style={{ padding: 8, width: '200px', flexShrink: 0 }}>Email</div>
                    <div style={{ padding: 8, width: '120px', flexShrink: 0 }}>Phone</div>
                    <div style={{ padding: 8, width: '150px', flexShrink: 0 }}>Parent Name</div>
                    <div style={{ padding: 8, width: '120px', flexShrink: 0 }}>Parent Phone</div>
                    <div style={{ padding: 8, width: '100px', flexShrink: 0 }}>Hostel</div>
                    <div style={{ padding: 8, width: '80px', flexShrink: 0 }}>Room</div>
                    {adminRole === 'superadmin' && !wardenLoggedIn && <div style={{ padding: 8, flexGrow: 1 }}>Actions</div>}
                </div>
                {/* Virtualized List */}
                <List
                    height={400} // Adjust height as needed
                    itemCount={filteredInfo.length}
                    itemSize={65} // Adjust itemSize to match your row height
                    width={'100%'}
                >
                    {Row}
                </List>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                    Previous
                </button>
                <span style={{ margin: '0 1rem' }}>
                    Page {currentPage} of {totalPages}
                </span>
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                    Next
                </button>
            </div>

            {uiState.banModal.open && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: 'white', borderRadius: 10, padding: 32, minWidth: 320, boxShadow: '0 4px 24px #0002', position: 'relative' }}>
                        <h3 style={{ marginBottom: 18 }}>Ban Student</h3>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontWeight: 500 }}>From:</label><br />
                            <input type="date" name="from" value={uiState.banModal.from} onChange={e => dispatch({ type: 'UPDATE_BAN_MODAL_INPUT', payload: { name: 'from', value: e.target.value }})} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontWeight: 500 }}>Till:</label><br />
                            <input type="date" name="till" value={uiState.banModal.till} onChange={e => dispatch({ type: 'UPDATE_BAN_MODAL_INPUT', payload: { name: 'till', value: e.target.value }})} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontWeight: 500 }}>Reason (Optional):</label><br />
                            <textarea
                                name="reason"
                                value={uiState.banModal.reason}
                                onChange={e => dispatch({ type: 'UPDATE_BAN_MODAL_INPUT', payload: { name: 'reason', value: e.target.value }})}
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