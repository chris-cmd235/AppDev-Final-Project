const api = path => `/api${path}`;
let authToken = localStorage.getItem('authToken');
let currentUser = null;

function $id(id) { return document.getElementById(id); }
function getAuthHeaders() { return { 'Authorization': `Bearer ${authToken}` }; }

// ==================== PAGE ROUTING & SECURITY ====================

async function initPage() {
  // ROBUST FIX: Check body class to know exactly which page we are on
  const isLoginPage = document.body.classList.contains('page-login');
  const isAdminPage = document.body.classList.contains('page-admin');
  
  // 1. If we have no token
  if (!authToken) {
    if (isLoginPage) {
      setupLoginUI(); // Only run this if we are actually on login.html
    } else {
      window.location.href = 'login.html'; // Redirect all other pages to login
    }
    return;
  }

  // 2. If we DO have a token, verify it
  if (authToken) {
    const valid = await verifyAuth();
    
    if (!valid) {
      logout(); 
      return;
    }

    // 3. Logged in user trying to access login page? Go to Hub
    if (isLoginPage) {
      window.location.href = 'index.html';
      return;
    }

    // 4. Regular user trying to access Admin page? Kick them out
    if (isAdminPage && currentUser.role !== 'admin') {
      alert('Access Denied: Administrator privileges required.');
      window.location.href = 'index.html';
      return;
    }

    // 5. Initialize Page Specific Logic
    setupUI();
  }
}

async function verifyAuth() {
  try {
    const res = await fetch(api('/auth/verify'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      return true;
    }
    return false;
  } catch (err) { return false; }
}

function logout() {
  localStorage.removeItem('authToken');
  window.location.href = 'login.html';
}

function setupUI() {
  // Common Navbar Logic
  const navUsername = $id('navUsername');
  const navRole = $id('navRole');
  const navAdminBtn = $id('navAdminBtn');
  
  if (navUsername) navUsername.textContent = currentUser.username;
  if (navRole) {
    navRole.textContent = currentUser.role.toUpperCase();
    navRole.className = `role-badge ${currentUser.role}`;
  }
  
  // Show admin button if admin
  if (navAdminBtn && currentUser.role === 'admin') {
    navAdminBtn.classList.remove('hidden');
  }

  // Logout Listeners
  const logoutBtns = document.querySelectorAll('.btn-logout');
  logoutBtns.forEach(btn => btn.addEventListener('click', logout));

  // Determine which page we are on and load data
  if (document.querySelector('.page-dashboard')) initDashboard();
  if (document.querySelector('.page-admin')) initAdmin();
}

// ==================== LOGIN PAGE LOGIC ====================

function setupLoginUI() {
  $id('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Authenticating...';
    btn.disabled = true;

    const username = $id('loginUsername').value.trim();
    const password = $id('loginPassword').value;
    const loginError = $id('loginError');

    try {
      const res = await fetch(api('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('authToken', data.token);
        window.location.href = 'index.html'; // Redirect to Hub
      } else {
        const data = await res.json();
        loginError.textContent = data.error || 'Invalid credentials';
        loginError.classList.remove('hidden');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    } catch (err) {
      loginError.textContent = 'Server unreachable';
      loginError.classList.remove('hidden');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

// ==================== DASHBOARD LOGIC ====================

function initDashboard() {
  loadContacts();
  
  $id('search').addEventListener('input', (e) => loadContacts(e.target.value.trim()));
  
  $id('newBtn').addEventListener('click', () => openForm(null));
  $id('emptyAddBtn').addEventListener('click', () => openForm(null));
  $id('closeFormBtn').addEventListener('click', closeForm);
  $id('cancelFormBtn').addEventListener('click', closeForm);

  $id('contactForm').addEventListener('submit', handleContactSubmit);
}

async function loadContacts(q = '') {
  try {
    const url = api(`/contacts${q ? `?search=${encodeURIComponent(q)}` : ''}`);
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const contacts = await res.json();
    renderContacts(contacts);
  } catch (err) { console.error(err); }
}

function renderContacts(contacts) {
  const list = $id('contacts');
  const empty = $id('emptyState');
  list.innerHTML = '';
  
  if (contacts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  contacts.forEach(c => {
    // ... (Use existing render logic, simplified here for brevity)
    const li = document.createElement('li');
    li.className = 'contact-item';
    li.innerHTML = `
      <div class="contact-avatar">${c.icon ? `<img src="${c.icon}">` : c.name[0]}</div>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-details">
          ${c.email ? `<span>📧 ${escapeHtml(c.email)}</span>` : ''}
          ${c.phone ? `<span>📱 ${escapeHtml(c.phone)}</span>` : ''}
        </div>
      </div>
      <div class="contact-actions">
        <button class="btn-icon-text btn-edit">✏️</button>
        <button class="btn-icon-text btn-delete">🗑️</button>
      </div>
    `;
    li.querySelector('.btn-edit').onclick = () => openForm(c);
    li.querySelector('.btn-delete').onclick = () => deleteContact(c);
    list.appendChild(li);
  });
}

// ... Form handling and Delete logic remains similar to original ...
// Included essential helper:
function openForm(contact) {
  $id('formWrap').classList.remove('hidden'); // This is now a modal
  $id('formTitle').textContent = contact ? 'Edit Contact' : 'New Contact';
  $id('contactId').value = contact?.id || '';
  $id('name').value = contact?.name || '';
  $id('email').value = contact?.email || '';
  $id('phone').value = contact?.phone || '';
  $id('notes').value = contact?.notes || '';
}

function closeForm() { $id('formWrap').classList.add('hidden'); }

async function handleContactSubmit(e) {
  e.preventDefault();
  
  const id = $id('contactId').value;
  const name = $id('name').value.trim();
  const email = $id('email').value.trim();
  const phone = $id('phone').value.trim();
  const notes = $id('notes').value.trim();
  const iconInput = $id('icon');
  
  if (!name) {
    alert('Name is required');
    return;
  }

  // Use FormData to handle text + file upload
  const formData = new FormData();
  formData.append('name', name);
  if (email) formData.append('email', email);
  if (phone) formData.append('phone', phone);
  if (notes) formData.append('notes', notes);
  if (iconInput.files[0]) formData.append('icon', iconInput.files[0]);

  // Determine if we are Creating (POST) or Updating (PUT)
  const method = id ? 'PUT' : 'POST';
  const url = id ? api(`/contacts/${id}`) : api('/contacts');

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${authToken}`
        // NOTE: Do NOT set 'Content-Type': 'application/json' here.
        // The browser automatically sets the correct multipart boundary for FormData.
      },
      body: formData
    });

    if (res.ok) {
      closeForm();
      loadContacts(); // Refresh the grid
      e.target.reset(); // Clear the inputs
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to save contact'));
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to server');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteContact(c) {
  if(confirm('Delete ' + c.name + '?')) {
    await fetch(api(`/contacts/${c.id}`), { method: 'DELETE', headers: getAuthHeaders() });
    loadContacts();
  }
}

// ==================== ADMIN LOGIC ====================

function initAdmin() {
  loadUsers();
  $id('refreshUsersBtn').addEventListener('click', loadUsers);
  $id('registerForm').addEventListener('submit', handleRegister);
}

async function loadUsers() {
  const res = await fetch(api('/users'), { headers: getAuthHeaders() });
  const users = await res.json();
  renderUsers(users);
  updateStats(users);
}

function renderUsers(users) {
  const tbody = $id('usersTableBody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar small">${u.username[0].toUpperCase()}</div>
          <span>${escapeHtml(u.username)}</span>
        </div>
      </td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>${u.id !== currentUser.id ? `<button onclick="deleteUser('${u.id}')" class="btn-delete-user">🗑️</button>` : 'You'}</td>
    </tr>
  `).join('');
}

function updateStats(users) {
  $id('statTotalUsers').textContent = users.length;
  $id('statRegularUsers').textContent = users.filter(u => u.role === 'user').length;
  $id('statAdmins').textContent = users.filter(u => u.role === 'admin').length;
}

// ... Register and Delete User logic remains same ...

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// START THE ENGINE
document.addEventListener('DOMContentLoaded', initPage);

// ==================== USER MANAGEMENT LOGIC ====================

async function handleRegister(e) {
  e.preventDefault();
  
  const username = $id('regUsername').value.trim();
  const password = $id('regPassword').value;
  const role = $id('regRole').value;
  const btn = e.target.querySelector('button');
  
  // Basic validation
  if (!username || !password) {
    alert('Please fill in all fields');
    return;
  }

  // UI Feedback
  const originalText = btn.textContent;
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    const res = await fetch(api('/auth/register'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders() // Include the Admin Token
      },
      body: JSON.stringify({ username, password, role })
    });

    const data = await res.json();

    if (res.ok) {
      alert('User created successfully!');
      e.target.reset(); // Clear the form
      loadUsers(); // Refresh the table
    } else {
      alert('Error: ' + (data.error || 'Failed to create user'));
    }
  } catch (err) {
    console.error(err);
    alert('Network error. Check console.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;

  try {
    const res = await fetch(api(`/users/${userId}`), {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      loadUsers(); // Refresh the table
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to delete user'));
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to server');
  }
}